import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageShell } from "../../components/PageShell";
import { ReportButton } from "../../components/ReportButton";
import { RefreshButton } from "./RefreshButton";
import { ListingViewPing } from "./ViewPing";
import { InquiryForm } from "./InquiryForm";
import { ListingSaveButton } from "@/components/ListingSaveButton";
import { Explain } from "@/app/components/explain/Explain";
import { NaverMap } from "@/components/map/NaverMapLazy";
import { safeAuth } from "@/lib/safe-auth";
import { isBookmarked } from "@/lib/bookmarks/store";
import {
  getListingById,
  isListingStale,
  LISTING_TYPE_LABEL,
  LISTING_SOURCE_LABEL,
  type ListingDetail,
} from "@/lib/listings/store-db";
import {
  SEOUL_BROWSE_REGIONS,
  buildComplexTxSlug,
} from "@/lib/market/complex-transactions";
import {
  comparePriceToMarket,
  getComparableTransactions,
} from "@/lib/listings/price-compare";
import { realEstateListingJsonLd, jsonLdScript } from "@/lib/seo/jsonld";
import { JsonLd } from "@/app/components/JsonLd";
import { RoadviewButton } from "@/components/map/RoadviewButton";
import { formatKrwShort } from "@/lib/market/format";
import { krwText, listingPriceLine, marketCompare } from "../price-text";
import { FactTable } from "@/app/components/compact/FactTable";
import { Fineprint } from "@/app/components/Fineprint";

/* [1063 · 행동] 이 화면의 채움 파랑 하나 — 클래스를 상수로 둬 분기마다 리터럴이 늘지 않게 한다
   (파일당 btn-primary 1개 규칙 · scripts/check-ai-look.mjs 6a). 폰 40px · 데스크톱 36px 하한. */
const CONTACT_ACTION_CLASS =
  "btn-primary inline-flex min-h-[40px] w-full items-center justify-center px-4 t-body md:min-h-9 md:w-fit";

/** undefined 값을 가진 키를 제거한다(JSON-LD 직렬화 전 정리용). */
function pruneUndefined<T extends Record<string, unknown>>(obj: T): T {
  return Object.fromEntries(
    Object.entries(obj).filter(([, val]) => val !== undefined),
  ) as T;
}

/* ============================================================
   매물 상세 — /listings/[id]
   승인(approved)만 공개. 소유주는 본인 검수중 매물도 열람 가능.
   ============================================================ */

export const dynamic = "force-dynamic";

/** 매물별 동적 메타데이터 — 동적 OG 카드(/api/og/listing) 이미지 포함. */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  /* [970 · C-25] 제목 접미 통일 `| 내집나우`(폴백·정상 경로 둘 다) */
  const base: Metadata = {
    title: "매물 상세 | 내집나우",
    description:
      "집주인 직접·중개사 등록 매물의 상세 정보. 실거래가와 비교하며 확인하세요.",
  };
  const listing = await getListingById(id).catch(() => null);
  // 미존재/숨김 매물은 OG 카드를 노출하지 않는다.
  if (!listing || listing.isHidden) return base;

  const price =
    listing.listingType === "monthly"
      ? `${formatKrwShort(listing.depositKrw)}/${formatKrwShort(listing.monthlyKrw)}`
      : formatKrwShort(listing.listingType === "sale" ? listing.priceKrw : listing.depositKrw);
  const area = listing.areaM2 !== null ? `전용 ${listing.areaM2}㎡` : "";
  const ogUrl =
    `/api/og/listing?title=${encodeURIComponent(listing.complexName)}` +
    `&price=${encodeURIComponent(price)}` +
    `&region=${encodeURIComponent(listing.regionName ?? "")}` +
    `&area=${encodeURIComponent(area)}` +
    `&type=${encodeURIComponent(LISTING_TYPE_LABEL[listing.listingType])}`;

  const title = `${listing.complexName} · ${priceLine(listing)} | 내집나우`;
  const description =
    `${listing.regionName ? `${listing.regionName} · ` : ""}${LISTING_TYPE_LABEL[listing.listingType]} 매물 — 실거래가와 비교하며 확인하세요.`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      images: [{ url: ogUrl, width: 1200, height: 630 }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [ogUrl],
    },
  };
}

/* [1009 · T] 호가 한 건은 정밀 표기("매매 12억 4,500만") — ../price-text 한 곳. 중위가(요약값)만 짧은 표기로 "중위가"라고 적는다. */
function priceLine(l: ListingDetail): string {
  return listingPriceLine(l);
}

/** "202606" → "2026.06" */
function formatYm(ym: string): string {
  return ym.length === 6 ? `${ym.slice(0, 4)}.${ym.slice(4)}` : ym;
}

function txCompareHref(l: ListingDetail): string | null {
  if (!l.regionName) return null;
  const region = SEOUL_BROWSE_REGIONS.find((r) => r.name === l.regionName);
  if (!region) return null;
  return `/complex/tx/${buildComplexTxSlug(l.complexName, region.id)}`;
}

/** 설명 앞의 [유형] 태그를 분리 (건물 유형 별도 컬럼 대체) */
function splitCategory(description: string | null): { category: string | null; body: string } {
  const raw = description ?? "";
  const m = raw.match(/^\[([^\]]{1,10})\]\s*/);
  if (m) return { category: m[1], body: raw.slice(m[0].length) };
  return { category: null, body: raw };
}

function isBoostActive(boostUntil: string | null): boolean {
  if (!boostUntil) return false;
  const t = Date.parse(boostUntil);
  return Number.isFinite(t) && t > Date.now();
}

export default async function ListingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const listing = await getListingById(id);
  if (!listing) notFound();

  const session = await safeAuth();
  const viewerEmail = session?.user?.email ?? null;
  const isOwner = viewerEmail !== null && viewerEmail === listing.authorEmail;

  // 숨김(신고 누적 등) 매물은 공개 열람 불가 — 소유주 본인만 열람 가능
  if (listing.isHidden && !isOwner) notFound();

  // 승인 전 매물은 소유주 본인만 열람 가능
  if (listing.status !== "approved" && !isOwner) notFound();

  /* 조회수 +1 — 공개(승인) 매물이며 본인 조회가 아닐 때만 (best-effort)
     [1080] 렌더 중 DB 쓰기(force-dynamic 이라 크롤러·미리보기·새로고침까지 전부)를 떼고 클라이언트 핑(ListingViewPing →
     /api/listings/<id>/view → KV 버퍼 → 시간 단위 반영)으로. JS 없는 열람은 이제 세지 않는다 — 사람 조회에 가까운 수. */
  const countView = listing.status === "approved" && !isOwner;

  // #1 관심 저장 초기 상태 · #6 신선도("확인 필요") 판정
  const savedInitial = viewerEmail
    ? await isBookmarked(viewerEmail, "listing", listing.id).catch(() => false)
    : false;
  const stale = isListingStale(listing);

  const { category, body } = splitCategory(listing.description);
  /* [1063 · 행동] 머리 사실에 "갱신 시점" — 끌어올린 적이 있으면 그 날, 없으면 등록일(신선도 판정과 같은 기준: listingStaleStage) */
  const updatedAtIso = listing.refreshedAt ?? listing.createdAt;
  const updatedLabel = /^\d{4}-\d{2}-\d{2}/.test(updatedAtIso)
    ? updatedAtIso.slice(0, 10).replace(/-/g, ".")
    : null;
  /* 문의 폼이 실제로 그려지는 경우만 "문의 남기기"(앵커)를 낸다 — 없는 자리로 보내지 않는다 */
  const canInquire = listing.status === "approved" && !isOwner;
  const txHref = txCompareHref(listing);
  const boostOn = isBoostActive(listing.boostUntil);
  const hasCoord = listing.lat !== null && listing.lng !== null;
  const photos = listing.photos.length > 0
    ? listing.photos
    : listing.thumbnailUrl
      ? [listing.thumbnailUrl]
      : [];

  // 시세 비교 (매매 매물 + 같은 단지/면적대 실거래 존재 시에만) — graceful
  const priceCompare = await comparePriceToMarket({
    complexName: listing.complexName,
    regionName: listing.regionName,
    areaM2: listing.areaM2,
    listingType: listing.listingType,
    priceKrw: listing.priceKrw,
    depositKrw: listing.depositKrw,
  }).catch(() => null);
  const comparableTx = priceCompare
    ? await getComparableTransactions({
        complexName: listing.complexName,
        regionName: listing.regionName,
        areaM2: listing.areaM2,
      }).catch(() => [])
    : [];
  /* [1009 · T] 호가 ↔ 최근 실거래 중위가 — 등락 토큰 배지(▲ 빨강 · ▼ 파랑 · ±3% 안 "실거래 수준")와 결론 한 줄.
     예전 배지는 primary(테마색)·danger(오류색)로 칠했고 "시세 대비"라고 불렀다(비교 기준은 실거래 중위가). */
  const compareBadge = priceCompare ? marketCompare(priceCompare.deltaPct) : null;

  // JSON-LD (RealEstateListing) — 실데이터 매물, 존재 필드만
  const listingJsonLd = realEstateListingJsonLd({
    id: listing.id,
    name: listing.complexName,
    description: body.trim() || null,
    priceKrw: listing.listingType === "sale" ? listing.priceKrw : listing.depositKrw,
    offerLabel: LISTING_TYPE_LABEL[listing.listingType],
    areaM2: listing.areaM2,
    address: listing.address,
    regionName: listing.regionName,
    images: photos,
  });

  // JSON-LD(항목 H37) — Product/Offer. 이미 가진 페이지 데이터만 사용, undefined 정리.
  const productName = listing.complexName || listing.regionName || undefined;
  const productJsonLd = productName
    ? pruneUndefined({
        "@context": "https://schema.org",
        "@type": "Product",
        name: productName,
        category: LISTING_TYPE_LABEL[listing.listingType],
        offers: pruneUndefined({
          "@type": "Offer",
          price: listing.priceKrw ?? undefined,
          priceCurrency: "KRW",
          availability: "https://schema.org/InStock",
        }),
      })
    : null;

  return (
    <PageShell breadcrumb="홈 › 실매물 › 상세">
      {countView && <ListingViewPing listingId={listing.id} />}
      {/* JSON-LD(RealEstateListing) — SEO 구조화 데이터 */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript(listingJsonLd) }}
      />
      {/* JSON-LD(항목 H37) — Product/Offer 구조화 데이터 */}
      {productJsonLd && <JsonLd data={productJsonLd} />}
      {/* 상태 안내 (소유주가 검수중/반려 매물을 볼 때) */}
      {listing.status !== "approved" && (
        <div className="rise-in mb-4 rounded-xl bg-[rgba(29,79,216,.06)] px-4 py-3 t-body leading-[1.7] text-text-2">
          {listing.status === "pending" && "이 매물은 검수 중이에요. 승인 전까지는 나에게만 보여요."}
          {listing.status === "rejected" && (
            <>
              이 매물은 반려됐어요.
              {listing.rejectReason ? ` 사유: ${listing.rejectReason}` : ""}
            </>
          )}
          {listing.status === "closed" && "이 매물은 마감 처리됐어요."}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.4fr_1fr]">
        {/* 좌: 본문 */}
        <div className="flex flex-col gap-5">
          {/* 사진 */}
          {photos.length > 0 ? (
            <div className="grid grid-cols-2 gap-2">
              {/* 고도화 4 — 대표 사진은 이 페이지의 LCP 요소다. lazy 로 두면
                  뷰포트 판정을 기다렸다 받기 시작해 LCP 가 늦어진다. 첫 장만
                  eager+높은 우선순위, 나머지 갤러리는 lazy 유지. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={photos[0]}
                alt={`${listing.complexName} 대표 사진`}
                className="col-span-2 h-[280px] w-full rounded-2xl object-cover"
                loading="eager"
                fetchPriority="high"
                decoding="async"
              />
              {photos.slice(1, 5).map((p, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={i}
                  src={p}
                  alt={`${listing.complexName} 사진 ${i + 2}`}
                  className="h-[140px] w-full rounded-xl object-cover"
                  loading="lazy"
                />
              ))}
            </div>
          ) : (
            <div className="flex h-[200px] w-full items-center justify-center rounded-2xl bg-[rgba(0,0,0,.03)] t-body text-text-3">
등록된 사진 없음
            </div>
          )}

          {/* 배지 */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span
              className={`rounded-md chip-pad t-sub font-bold ${
                listing.source === "owner"
                  ? "bg-[rgba(29,79,216,.08)] text-primary"
                  : "bg-warning-soft text-warning"
              }`}
            >
              {LISTING_SOURCE_LABEL[listing.source]}
            </span>
            <span className="rounded-md bg-bg chip-pad t-sub font-bold text-text-2">
              {LISTING_TYPE_LABEL[listing.listingType]}
            </span>
            {category && (
              <span className="rounded-md bg-bg chip-pad t-sub font-bold text-text-2">
                {category}
              </span>
            )}
            {listing.ownerVerified && (
              <span className="rounded-md bg-success-soft chip-pad t-sub font-bold text-success">
                소유확인
              </span>
            )}
            {boostOn && (
              <span className="rounded-md bg-[rgba(245,158,11,.14)] chip-pad t-sub font-bold text-warning">
                부스트
              </span>
            )}
            {stale && (
              <span
                className="rounded-md chip-pad t-sub font-bold"
                style={{ background: "var(--warning-soft)", color: "var(--warning)" }}
              >
                확인 필요
              </span>
            )}
          </div>

          {/* 가격 · 제목 — [1015 · 규칙 M · 직방] 가격이 가장 크게 먼저, 단지명은 그 아래(h1 은 그대로 단지명) */}
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="t-num t-display font-bold leading-[1.3] text-ink">{priceLine(listing)}</span>
              {compareBadge && (
                <span className={compareBadge.badgeClass}>
                  {compareBadge.dir === "flat" ? compareBadge.label : `실거래 대비 ${compareBadge.label}`}
                </span>
              )}
            </div>
            <h1 className="mt-1 t-title font-bold leading-[1.3] text-ink">
              {listing.complexName}
            </h1>
          </div>

          {/* 스펙 — [1015 · 규칙 M · 직방] 면적·층·방/욕실·주차를 칸으로(있는 값만) · 실거래·가격 = blue 톤 판
              [1063 · 행동] 가격 → 사실 → 행동 순서로 올렸다(예전엔 저장 단추가 사실보다 먼저였다). 갱신 시점 칸 추가. */}
          <dl className="lq-panel grid grid-cols-3 gap-y-3 py-3 t-body sm:grid-cols-5" data-tone="blue">
            {(
              [
                listing.areaM2 !== null ? ["전용면적", `${listing.areaM2}㎡`] : null,
                listing.floor !== null ? ["층", `${listing.floor}층`] : null,
                listing.rooms !== null || listing.bathrooms !== null
                  ? ["방 · 욕실", `${listing.rooms ?? "—"} · ${listing.bathrooms ?? "—"}`]
                  : null,
                listing.parkingSpaces !== null ? ["주차", `${listing.parkingSpaces}대`] : null,
                listing.regionName ? ["지역", listing.regionName] : null,
                updatedLabel ? [listing.refreshedAt ? "갱신" : "등록", updatedLabel] : null,
                ["조회", listing.viewCount.toLocaleString("ko-KR")],
              ] as ([string, string] | null)[]
            )
              .filter((x): x is [string, string] => x !== null)
              .map(([k, v]) => (
                <div key={k} className="flex flex-col gap-0.5">
                  <dt className="t-caption text-text-3">{k}</dt>
                  <dd className="t-num font-bold text-ink">{v}</dd>
                </div>
              ))}
          </dl>
          {stale && (
            /* [1063] 배지("확인 필요")가 말한 뒤의 설명 문장 — 접기 뒤로(문장은 그대로) */
            <Fineprint label="확인 필요">
              마지막 갱신 이후 시간이 지난 매물입니다. 정보가 유효한지 등록자에게 확인해 주세요.
            </Fineprint>
          )}

          {/* [1063 · 행동] 연락 — 이 화면에서 할 일 하나를 머리 사실 바로 아래에 둔다.
              예전에는 지도·거리뷰 뒤 오른쪽 칸에 있어 390px 에서 화면 두 장 아래였다(보려면 되돌아 내려가야 했다).
              문구(연락처 정책)·저장·끌어올리기·신고 흐름은 글자 그대로 옮겼을 뿐이다. */}
          <section id="contact" className="card card-pad-sm flex flex-col gap-2.5" aria-label="연락처">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <h2 className="m-0 t-body font-bold text-ink">연락처</h2>
              <span className="t-sub text-text-3">등록자 · {listing.authorLabel}</span>
            </div>
            {viewerEmail ? (
              listing.contact ? (
                <div className="t-section font-bold text-ink break-all">{listing.contact}</div>
              ) : (
                <div className="t-body text-text-3">
등록된 연락처 없음 · 등록자에게 직접 문의가 어려울 수 있어요.
                </div>
              )
            ) : (
              <Link
                href={`/login?callbackUrl=/listings/${listing.id}`}
                className={CONTACT_ACTION_CLASS}
              >
                로그인 후 연락처 확인
              </Link>
            )}
            {/* 관심 저장(#1) · 소유주 끌어올리기(#6) · 문의 폼으로(같은 화면 안) — 전부 보조 */}
            <div className="flex flex-wrap items-center gap-2">
              <ListingSaveButton
                listingId={listing.id}
                label={listing.complexName}
                initialSaved={savedInitial}
              />
              {isOwner && stale && <RefreshButton listingId={listing.id} />}
              {canInquire && (
                <a
                  href="#inquiry"
                  className="inline-flex min-h-[40px] items-center t-sub font-bold text-primary underline md:min-h-6"
                >
                  문의 남기기
                </a>
              )}
            </div>
          </section>

          {/* 주소 */}
          {listing.address && (
            <FactTable dense rows={[{ label: "주소", value: listing.address }]} />
          )}

          {/* 설명 */}
          {body.trim() && (
            <div>
              <div className="mb-1.5 t-body font-bold text-ink">상세 설명</div>
              <p className="whitespace-pre-wrap t-body leading-[1.75] text-text-2">
                {body.trim()}
              </p>
            </div>
          )}

          {/* 실거래 비교 — 같은 단지·면적대 최근 실거래 중위가 대비(데이터 있을 때만).
              [1009 · T] 결론 한 줄(문장) → 근거(중위가·표본·최근 거래) → 다음 행동. 거래 한 건은 정밀 표기, 중위가는 요약값. */}
          {priceCompare && compareBadge ? (
            <section className="card card-pad-sm flex flex-col gap-3">
              <div className="flex items-baseline justify-between gap-2">
                <h2 className="flex items-center gap-0.5 t-section font-bold text-ink">
                  실거래 비교
                  <Explain
                    title="실거래 대비"
                    body="이 매물의 호가(부르는 값)를 같은 단지·비슷한 면적 아파트의 최근 실거래 가격과 견준 값이에요."
                    how={[
                      "기준 = 같은 단지 국토부 실거래(매매) 가운데 이 매물 면적 ±10%(최소 ±3㎡) 거래의 최근 12개월 최신 12건 중위가",
                      "그 면적대 거래가 없으면 단지 전체로, 12개월 안에 없으면 가장 최근 거래로 봐요.",
                      "차이(%) = (호가 − 중위가) ÷ 중위가 × 100, 정수로 반올림",
                      "±3% 안은 ‘실거래 수준’으로 적어요.",
                    ]}
                    source="국토교통부 실거래가 공개시스템"
                    size={12}
                  />
                </h2>
                <span className={`shrink-0 ${compareBadge.badgeClass}`}>{compareBadge.label}</span>
              </div>
              <p className="t-section font-bold text-ink">{compareBadge.sentence}</p>
              {/* [1063] 근거 한 줄(중위가 · 표본 · 면적)을 "항목 | 사실" 표로 — 값·단위는 그대로 */}
              <FactTable
                dense
                rows={[
                  {
                    label: "최근 실거래 중위가",
                    value: (
                      <b className="t-num font-bold text-ink">{formatKrwShort(priceCompare.medianKrw)}</b>
                    ),
                  },
                  { label: "표본", value: `${priceCompare.sampleCount}건` },
                  ...(listing.areaM2 !== null
                    ? [{ label: "전용", value: `${listing.areaM2}㎡ 안팎` }]
                    : []),
                ]}
              />
              {comparableTx.length > 0 && (
                <ul className="flex flex-col">
                  {comparableTx.slice(0, 4).map((t, i) => (
                    <li
                      key={i}
                      className="flex items-center justify-between gap-3 border-b border-line py-2 last:border-0"
                    >
                      <span className="t-num t-sub text-text-3">
                        {formatYm(t.contractYm)}
                        {t.contractDay ? `.${String(t.contractDay).padStart(2, "0")}` : ""}
                        {t.areaM2 !== null ? ` · ${t.areaM2.toFixed(1)}㎡` : ""}
                        {t.floor !== null ? ` · ${t.floor}층` : ""}
                      </span>
                      <span className="t-num t-body font-bold text-ink">{krwText(t.dealAmountKrw)}</span>
                    </li>
                  ))}
                </ul>
              )}
              <Fineprint>국토교통부 실거래가 · 같은 단지·면적대 최근 거래 기준 · 호가는 등록자가 적은 값</Fineprint>
              <Link
                href={txHref ?? "/complex/browse"}
                className="inline-flex min-h-[24px] w-fit items-center t-body font-bold text-primary"
              >
                이 단지 실거래 전체 →
              </Link>
            </section>
          ) : (
            <Link
              /* [970 · B-18] /complex/tx 인덱스는 리다이렉트만 있다 — 목적지로 바로 보낸다 */
              href={txHref ?? "/complex/browse"}
              className="inline-flex min-h-[24px] w-fit items-center t-body font-bold text-primary underline"
            >
              실거래가 비교 →
            </Link>
          )}

          {/* 신고 */}
          <div className="flex items-center gap-3">
            <span className="t-sub text-text-3">매물 신고</span>
            <ReportButton postId={listing.id} />
          </div>
        </div>

        {/* 우: 지도 + 거리뷰 + 문의 (연락처는 [1063] 에서 왼쪽 머리 사실 아래로) */}
        <div className="flex flex-col gap-4">
          {hasCoord && (
            <div className="h-[240px] w-full overflow-hidden rounded-2xl">
              <NaverMap
                center={{ lat: listing.lat as number, lng: listing.lng as number }}
                level={4}
                markers={[
                  {
                    id: listing.id,
                    lat: listing.lat as number,
                    lng: listing.lng as number,
                    label: listing.complexName,
                    infoHtml: "",
                  },
                ]}
                className="h-full w-full"
              />
            </div>
          )}

          {/* 거리뷰(항목 A5) — 좌표가 있을 때만 (없으면 컴포넌트가 자동 숨김) */}
          {hasCoord && (
            <RoadviewButton
              lat={listing.lat as number}
              lng={listing.lng as number}
              label={listing.complexName}
            />
          )}

          {/* 문의 남기기 — 승인 매물 + 등록자 본인이 아닐 때만
              [1063] 연락처 카드는 왼쪽 머리 사실 아래로 옮겼다(폰 도달 거리) — 이 칸은 지도·거리뷰·문의 폼 */}
          {canInquire && (
            <div id="inquiry" className="card card-pad-sm flex scroll-mt-[72px] flex-col gap-2.5">
              <div className="t-body font-bold text-ink">문의하기</div>
              {/* [1015 · 규칙 B] 사용법 문장 제거 — 폼 자체가 말한다 */}
              <InquiryForm listingId={listing.id} loggedIn={viewerEmail !== null} />
            </div>
          )}
        </div>
      </div>

      {/* 법적 고지 — 접지 않는다(광고 매체·책임 고지는 눌러야 보이면 안 된다). 글자만 램프로. */}
      <div className="mt-8 rounded-xl bg-[rgba(0,0,0,.03)] px-4 py-3 t-sub leading-[1.7] text-text-3">
        내집나우는 광고 매체이며 중개하지 않습니다. 매물 정보의 정확성과 권리관계에 대한 책임은
        등록자에게 있으며, 내집나우의 검수는 형식 요건 확인일 뿐 진위를 보증하지 않습니다. 중개
        행위는 해당 매물을 등록한 개업공인중개사가 수행합니다.
      </div>
    </PageShell>
  );
}
