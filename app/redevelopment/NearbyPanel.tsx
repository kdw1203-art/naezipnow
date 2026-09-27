"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
/* [1012] 규칙 8 — 굵기 3단(400/500/700): 이 파일의 font-extrabold(800) 를 전부 font-bold(700) 로 내렸다. */

/**
 * 선택한 정비사업 구역의 인근 매물 + 최근 실거래 패널.
 * /api/redevelopment/nearby?id= 를 호출한다. (매물=좌표 bbox, 실거래=시군구 단위)
 */

type NearbyTransaction = {
  complexName: string;
  areaM2: number | null;
  floor: number | null;
  priceLabel: string;
  contractYmd: string;
};
type NearbyListing = {
  id: string;
  listingType: string;
  complexName: string | null;
  priceLabel: string;
};
type NearbyResp = {
  regionLabel: string;
  transactions: NearbyTransaction[];
  listings: NearbyListing[];
};

const TYPE_LABEL: Record<string, string> = {
  sale: "매매",
  jeonse: "전세",
  monthly: "월세",
};

function pyeong(areaM2: number | null): string {
  if (areaM2 == null || !Number.isFinite(areaM2) || areaM2 <= 0) return "";
  return `${Math.round(areaM2)}㎡(${Math.round(areaM2 / 3.3058)}평)`;
}

export function NearbyPanel({
  projectId,
  projectName,
}: {
  projectId: string;
  projectName: string;
}) {
  const [data, setData] = useState<NearbyResp | null>(null);
  const [loading, setLoading] = useState(true);
  /* 조회 실패와 "정말 0건"은 화면에서 똑같이 보인다 — 둘 다 목록이 비어 있다.
     예전에는 `r.ok ? r.json() : null` 로 실패를 data=null 에 합쳐 버려서,
     서버가 죽어 있어도 사용자는 "최근 실거래 정보가 없어요 / 등록된 인근
     매물이 없어요" 를 읽었다. 장애가 사실로 둔갑하는 자리다. */
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setData(null);
    setFailed(false);
    fetch(`/api/redevelopment/nearby?id=${encodeURIComponent(projectId)}`, {
      signal: controller.signal,
    })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((json: NearbyResp | null) => {
        if (controller.signal.aborted) return;
        if (json) setData(json);
        else setFailed(true);
      })
      .catch((e) => {
        if (controller.signal.aborted || (e as Error)?.name === "AbortError") return;
        setFailed(true);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [projectId]);

  /* 실패했을 때 두 칸에 공통으로 쓰는 문구. "없어요" 라고 말하지 않는다. [v4] 빈 상자 → 한 줄 */
  const failureNote = <p className="py-2 t-sub text-text-3">지금 불러오지 못했어요 — 없다는 뜻은 아니에요</p>;

  return (
    /* [v4] 카드(아이콘 + 두 칸 격자 + 빈 상자) → 섹션 하나: 최근 실거래 행 → 인근 매물 행 → 캡션 한 줄 */
    <section className="flex flex-col gap-4 border-t border-line pt-4" aria-label={`${projectName} 인근 매물 · 최근 실거래`}>
      <h3 className="t-section text-ink">「{projectName}」 인근 매물 · 최근 실거래</h3>

      {loading ? (
        <p className="t-sub text-text-3">인근 정보를 불러오는 중…</p>
      ) : (
        <>
          {/* 최근 실거래 */}
          <div>
            <h4 className="t-sub font-bold text-text-2">
              최근 실거래{data?.regionLabel ? ` · ${data.regionLabel}` : ""}
            </h4>
            {data && data.transactions.length > 0 ? (
              <ul data-tone="blue" className="divide-y divide-line">
                {data.transactions.map((t, i) => (
                  <li key={`${t.complexName}-${i}`} className="flex min-h-12 items-center justify-between gap-3 py-2">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate t-body font-bold text-ink">{t.complexName}</span>
                      <span className="mt-0.5 block truncate t-sub text-text-3">
                        {[pyeong(t.areaM2), t.floor ? `${t.floor}층` : "", t.contractYmd].filter(Boolean).join(" · ")}
                      </span>
                    </span>
                    <span className="delta-up shrink-0 t-body t-num">{t.priceLabel}</span>
                  </li>
                ))}
              </ul>
            ) : failed ? (
              failureNote
            ) : (
              /* [1012] 규칙 6 — 어디서(지역)·출처 */
              <p className="py-2 t-sub text-text-3">
                {data?.regionLabel ? `${data.regionLabel} ` : ""}최근 실거래 신고분 없음 · 국토교통부
              </p>
            )}
          </div>

          {/* 인근 매물 */}
          <div>
            <div className="flex items-baseline justify-between gap-3">
              <h4 className="t-sub font-bold text-text-2">인근 매물 · 약 2km</h4>
              <Link href="/listings/new" className="tap-line shrink-0 t-sub font-bold text-primary no-underline">
                매물 등록 ›
              </Link>
            </div>
            {data && data.listings.length > 0 ? (
              <ul data-tone="mint" className="divide-y divide-line">
                {data.listings.map((l) => (
                  <li key={l.id}>
                    <Link
                      href={`/listings/${l.id}`}
                      className="flex min-h-12 items-center justify-between gap-3 py-2 no-underline"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate t-body font-bold text-ink">{l.complexName || "매물"}</span>
                        <span className="mt-0.5 block t-sub text-text-3">{TYPE_LABEL[l.listingType] ?? "매물"}</span>
                      </span>
                      <span className="shrink-0 t-body t-num font-bold text-ink">{l.priceLabel}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : failed ? (
              failureNote
            ) : (
              <p className="py-2 t-sub text-text-3">「{projectName}」 2km 안 등록 매물 없음</p>
            )}
          </div>
        </>
      )}

      <p className="t-caption text-text-3">
        실거래 = 시군구 단위 최근 매매(국토교통부) · 매물 = 반경 약 2km 등록 매물 — 구역 경계와 다를 수 있음
      </p>
    </section>
  );
}
