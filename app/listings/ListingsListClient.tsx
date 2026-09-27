"use client";
/* [1012 · 규칙 8] font-extrabold(800) → font-bold(700) — 굵기 3단(400·500·700). 이 파일의 모든 자리에 적용. */

/* 실매물 목록 + 필터 (2026-08-10 ISR 전환, /town/news·/dev-deals 레시피)
   서버가 ?type/gu/complex 를 읽어 필터별로 DB 를 다시 질의하던 것을, 전체
   (승인 매물 ≤200건)를 한 번 받아 여기서 exact 일치로 거른다 — 서버의
   .eq(listing_type/region_name/complex_name) 과 같은 의미다.
   useSearchParams 금지(프리렌더 HTML 에서 카드가 사라진다) — SSR 은 전체를
   그리고, 필터는 마운트 후 location.search + popstate 로 적용한다. */

import Link from "next/link";
import { useEffect, useState } from "react";
// store-db 는 server-only(supabase service) 를 끌고 와 클라이언트에서 import 불가.
// 타입은 type-only import(컴파일 시 소거)로 가져오고, 라벨 상수 2개만 여기 복제한다.
// 원본: lib/listings/store-db.ts 의 LISTING_TYPE_LABEL·LISTING_SOURCE_LABEL.
import type { PublicListing } from "@/lib/listings/store-db";

const LISTING_TYPE_LABEL: Record<string, string> = {
  sale: "매매",
  jeonse: "전세",
  monthly: "월세",
};
const LISTING_SOURCE_LABEL: Record<string, string> = {
  owner: "집주인 직접",
  agent: "중개사",
};
import { ListingCompareToggle } from "@/components/ListingCompareToggle";
import type { CompareListing } from "@/components/listing-compare-store";
/* [1012 · 규칙 7] 카드의 시점("9.25 끌어올림")은 ./price-text 의 listingUpdatedLabel — 순수 함수(단위검증) */
import { listingPriceLine, listingUpdatedLabel } from "./price-text";
import { LISTING_COMPARE_ENTRY_OPEN } from "./compare-entry";

const TYPE_FILTERS = [
  { key: "", label: "전체" },
  { key: "sale", label: "매매" },
  { key: "jeonse", label: "전세" },
  { key: "monthly", label: "월세" },
];
const TYPE_KEYS = ["sale", "jeonse", "monthly"];

/* [1009 · T] 호가는 한 건의 가격이라 정밀 표기("매매 12억 4,500만") — ./price-text 한 곳(목록·상세·비교함·비교 표 공통).
   예전 formatKrwShort("28.6억")는 28억 6,000만과 28억 5,500만을 같은 숫자로 보여 줬다. */
const priceLine = listingPriceLine;

function toCompareListing(l: PublicListing): CompareListing {
  return {
    id: l.id,
    complexName: l.complexName,
    regionName: l.regionName,
    listingType: l.listingType,
    priceKrw: l.priceKrw,
    depositKrw: l.depositKrw,
    monthlyKrw: l.monthlyKrw,
    areaM2: l.areaM2,
    floor: l.floor,
    createdAt: l.createdAt,
    refreshedAt: l.refreshedAt,
    source: l.source,
    ownerVerified: l.ownerVerified,
  };
}

type Filter = { type: string; gu: string; complex: string };

function pushFilterUrl(next: Filter) {
  const url = new URL(window.location.href);
  const sp = url.searchParams;
  if (next.type) sp.set("type", next.type);
  else sp.delete("type");
  if (next.gu) sp.set("gu", next.gu);
  else sp.delete("gu");
  if (next.complex) sp.set("complex", next.complex);
  else sp.delete("complex");
  window.history.pushState(null, "", url);
}

export function ListingsListClient({
  items,
  seoulGus,
}: {
  items: PublicListing[];
  seoulGus: readonly string[];
}) {
  const [filter, setFilter] = useState<Filter>({ type: "", gu: "", complex: "" });
  useEffect(() => {
    const read = () => {
      const p = new URLSearchParams(window.location.search);
      const t = (p.get("type") ?? "").trim();
      setFilter({
        type: TYPE_KEYS.includes(t) ? t : "",
        gu: (p.get("gu") ?? "").trim(),
        complex: (p.get("complex") ?? "").trim(),
      });
    };
    read();
    window.addEventListener("popstate", read);
    return () => window.removeEventListener("popstate", read);
  }, []);

  const set = (patch: Partial<Filter>) => {
    const next = { ...filter, ...patch };
    setFilter(next);
    pushFilterUrl(next);
  };

  const list = items.filter(
    (l) =>
      (!filter.type || l.listingType === filter.type) &&
      (!filter.gu || l.regionName === filter.gu) &&
      (!filter.complex || l.complexName === filter.complex),
  );
  /* [970 · C-39] 빈 상태 분기의 근거 — 어떤 필터든 걸려 있는가 */
  const filtersActive = Boolean(filter.type || filter.gu || filter.complex);

  return (
    <>
      {filter.complex && (
        <div className="rise-in mb-3 flex items-center gap-2 text-[13px] text-text-2">
          <span>
            단지 <b className="text-ink">{filter.complex}</b> 매물만 보는 중
          </span>
          <button
            type="button"
            onClick={() => set({ complex: "" })}
            className="font-bold text-primary underline"
          >
            전체 보기
          </button>
        </div>
      )}

      {/* 유형 필터 */}
      <div className="rise-in mb-2 flex gap-1.5 overflow-x-auto text-[13px]">
        {TYPE_FILTERS.map((f) => (
          <button
            key={f.key || "all"}
            type="button"
            onClick={() => set({ type: f.key })}
            aria-pressed={filter.type === f.key}
            className={`chip press px-3.5 py-2 ${
              filter.type === f.key ? "chip-active" : "bg-[var(--glass-bg)] text-text-2"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* 서울 구 필터 */}
      <div className="rise-in-1 mb-5 flex gap-1.5 overflow-x-auto pb-1 text-[12px]">
        <button
          type="button"
          onClick={() => set({ gu: "" })}
          aria-pressed={!filter.gu}
          className={`chip press shrink-0 px-3 py-1.5 ${
            !filter.gu ? "chip-active" : "bg-[var(--glass-bg)] text-text-2"
          }`}
        >
          서울 전체
        </button>
        {seoulGus.map((g) => (
          <button
            key={g}
            type="button"
            onClick={() => set({ gu: g })}
            aria-pressed={filter.gu === g}
            className={`chip press shrink-0 px-3 py-1.5 ${
              filter.gu === g ? "chip-active" : "bg-[var(--glass-bg)] text-text-2"
            }`}
          >
            {g}
          </button>
        ))}
      </div>

      {list.length === 0 ? (
        /* [970 · C-39] 필터 때문에 0건인지, 등록 매물 자체가 0건인지를 가른다.
           [v4 · 규칙 8·10] 가운데 정렬 빈 카드 → 한 줄 사실 + 버튼(테두리 — 채움 파랑은 머리의 "내 매물 등록하기" 하나) */
        <div className="rise-in-1 flex flex-col items-start gap-2 border-y border-line py-4">
          <p className="t-body font-bold text-ink">
            {filtersActive ? "이 조건에 맞는 매물 없음" : "검수를 통과한 매물 없음"}
          </p>
          <p className="t-sub text-text-3">
            {filtersActive
              ? `유형·지역 조건 변경 또는 필터 초기화 · 전체 ${items.length}건`
              : /* [1012 · 규칙 6] 사실(누가·무엇을) */ "집주인은 소유 확인 뒤 직접 등록 · 중개사무소는 제휴 · 검수 통과 매물만 표시"}
          </p>
          {filtersActive ? (
            <button type="button" onClick={() => set({ type: "", gu: "", complex: "" })} className="btn-outline btn-md">
              필터 초기화
            </button>
          ) : (
            <Link href="/listings/new" className="btn-outline btn-md">
              내 매물 등록하기
            </Link>
          )}
        </div>
      ) : (
        /* [v4 · 규칙 10 · 부품 "썸네일 행"] 사진 있는 카드·없는 카드가 높이가 달라 엇갈리던 3열 격자 →
           같은 높이의 행(72px 정사각 썸네일 + 단지명 한 줄 + 가격 + 메타 한 줄). 사진이 없으면 회색 칸. */
        <ul data-tone="mint" className="rise-in-1 divide-y divide-line">
          {list.map((l) => (
            <li key={l.id}>
              <Link href={`/listings/${l.id}`} className="press flex items-start gap-3 py-3 no-underline">
                <span className="relative h-[72px] w-[72px] shrink-0 overflow-hidden rounded-lg bg-divider">
                  {l.thumbnailUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={l.thumbnailUrl}
                      alt={`${l.complexName} 사진`}
                      className="absolute inset-0 h-full w-full object-cover"
                      loading="lazy"
                    />
                  )}
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="flex min-w-0 items-center gap-1.5">
                    <span className="min-w-0 truncate t-body font-bold text-ink">{l.complexName}</span>
                    {/* [1012 · 규칙 9] 배지 = 검증 사실 명사만 — "집주인 확인"(기준 사이트 표기) 하나만 남긴다.
                        등록 주체·유형은 아래 메타 글자로. "부스트"(홍보 상태)는 정렬(끌어올림)에만 쓴다. */}
                    {l.ownerVerified && (
                      <span className="shrink-0 rounded-sm bg-success-soft chip-pad t-caption font-medium text-success">
                        집주인 확인
                      </span>
                    )}
                  </span>
                  {/* [1012 · 규칙 7] 가격이 행에서 가장 크고 굵다 */}
                  <span className="t-num t-body font-bold text-ink">{priceLine(l)}</span>
                  {/* [1012 · 규칙 7] 숫자 — 면적 · 층 + 시점(끌어올림/등록일) · 등록 주체 · 유형 · 지역 */}
                  <span className="truncate t-sub tabular-nums text-text-3">
                    {[
                      LISTING_SOURCE_LABEL[l.source],
                      LISTING_TYPE_LABEL[l.listingType],
                      l.regionName || null,
                      l.areaM2 !== null ? `${l.areaM2}㎡` : null,
                      l.floor !== null ? `${l.floor}층` : null,
                      l.authorLabel,
                      listingUpdatedLabel(l),
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </span>
              </Link>
              {/* [1009 · T 리뷰 MED-10] 비교 담기는 보관 경로(/listings/compare)의 입구라 소유자 결정 전까지 끈다(./compare-entry).
                  켜면 행 링크 밖(아래)에 둔다 — 링크 안에 단추가 들어가는 중첩 조작을 만들지 않는다. */}
              {LISTING_COMPARE_ENTRY_OPEN && (
                <div className="pb-2">
                  <ListingCompareToggle item={toCompareListing(l)} />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

export default ListingsListClient;
