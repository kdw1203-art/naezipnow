/* [1012 · 규칙 8] font-extrabold(800) → font-bold(700) — 굵기 3단(400·500·700). 이 파일의 모든 자리에 적용. */
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageShell } from "../../components/PageShell";
import { ReportButton } from "../../components/ReportButton";
import { RefreshButton } from "./RefreshButton";
import { InquiryForm } from "./InquiryForm";
import { ListingSaveButton } from "@/components/ListingSaveButton";
import { Explain } from "@/app/components/explain/Explain";
import { NaverMap } from "@/components/map/NaverMapLazy";
import { safeAuth } from "@/lib/safe-auth";
import { isBookmarked } from "@/lib/bookmarks/store";
import {
  getListingById,
  incrementView,
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

  // 조회수 +1 — 공개(승인) 매물이며 본인 조회가 아닐 때만 (best-effort)
  if (listing.status === "approved" && !isOwner) {
    await incrementView(id);
  }

  // #1 관심 저장 초기 상태 · #6 신선도("확인 필요") 판정
  const savedInitial = viewerEmail
    ? await isBookmarked(viewerEmail, "listing", listing.id).catch(() => false)
    : false;
  const stale = isListingStale(listing);

  const { category, body } = splitCategory(listing.description);
  const txHref = txCompareHref(listing);
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

  /* [v4 · 한 화면 한 가지] 가운데 한 줄(760px) — 2열(본문 + 지도·연락 사이드) → 한 줄:
       제목 한 줄 + 사실 한 줄 → 주인공(호가 숫자 하나) → 관심·끌어올리기 → 사진 → 매물 정보 1px 선 행 → 상세 설명 →
       실거래 비교 → 지도·거리뷰 → 연락처 → 문의 → 신고 → 끝 캡션(법적 고지).
     지운 것: 설명 배지(등록 주체·유형·분류 → 사실 줄 글자) · 카드 면(실거래 비교·연락처·문의) · 회색 상자(주소 → 행).
     "집주인 확인"(검증 사실)·"확인 필요"(갱신 경과 사실)는 남긴다. PageShell 브레드크럼(글자뿐)은 본문 줄과 어긋나 뺐다. */
  const specRows: Array<{ label: string; value: string }> = [
    ...(listing.areaM2 !== null ? [{ label: "전용면적", value: `${listing.areaM2}㎡` }] : []),
    ...(listing.floor !== null ? [{ label: "층", value: `${listing.floor}층` }] : []),
    ...(listing.regionName ? [{ label: "지역", value: listing.regionName }] : []),
    ...(listing.address ? [{ label: "주소", value: listing.address }] : []),
    { label: "조회", value: listing.viewCount.toLocaleString("ko-KR") },
    { label: "등록자", value: listing.authorLabel },
  ];
  const headFact = [LISTING_SOURCE_LABEL[listing.source], LISTING_TYPE_LABEL[listing.listingType], category || null]
    .filter(Boolean)
    .join(" · ");

  return (
    <PageShell>
      {/* JSON-LD(RealEstateListing) — SEO 구조화 데이터 */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript(listingJsonLd) }}
      />
      {/* JSON-LD(항목 H37) — Product/Offer 구조화 데이터 */}
      {productJsonLd && <JsonLd data={productJsonLd} />}
      <div className="mx-auto flex w-full max-w-[760px] flex-col gap-6">
        {/* 상태 안내 (소유주가 검수중/반려 매물을 볼 때) — [v4] 연파랑 상자 → 한 줄 */}
        {listing.status !== "approved" && (
          <p className="rise-in border-y border-line py-2.5 t-sub font-bold text-text-2">
            {listing.status === "pending" && "검수 중 · 승인 전까지 나에게만 보임"}
            {listing.status === "rejected" && <>반려됨{listing.rejectReason ? ` · 사유: ${listing.rejectReason}` : ""}</>}
            {listing.status === "closed" && "마감 처리됨"}
          </p>
        )}

        {/* 머리 — 제목 한 줄 + 사실 한 줄 · 주인공(호가) */}
        <header className="flex flex-col gap-1">
          <h1 className="t-title text-ink">{listing.complexName}</h1>
          <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 t-sub text-text-3">
            <span>{headFact}</span>
            {/* [1012 · 규칙 9] 배지 = 검증 사실 명사만 — "집주인 확인"(기준 사이트 표기) · "확인 필요"(갱신 경과 사실) */}
            {listing.ownerVerified && (
              <span className="rounded-sm bg-success-soft chip-pad t-caption font-medium text-success">집주인 확인</span>
            )}
            {stale && (
              <span className="rounded-sm bg-warning-soft chip-pad t-caption font-medium text-warning">확인 필요</span>
            )}
          </p>
          {/* [1012 · 규칙 7] 가격이 가장 크고 굵다 */}
          <div className="mt-3 flex flex-wrap items-baseline gap-2">
            <span className="t-display t-num text-ink">{priceLine(listing)}</span>
            {compareBadge && (
              <span className={compareBadge.badgeClass}>
                {compareBadge.dir === "flat" ? compareBadge.label : `실거래 대비 ${compareBadge.label}`}
              </span>
            )}
          </div>
        </header>

        {/* 관심 저장(#1) · 소유주 끌어올리기(#6) */}
        <div className="-mt-2 flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <ListingSaveButton listingId={listing.id} label={listing.complexName} initialSaved={savedInitial} />
            {isOwner && stale && <RefreshButton listingId={listing.id} />}
          </div>
          {stale && (
            <p className="t-caption text-text-3">
              마지막 갱신 뒤 시간이 지난 매물 · 유효 여부는 등록자에게 확인
              {isOwner ? " · 끌어올리기를 누르면 최신 매물로 다시 노출" : ""}
            </p>
          )}
        </div>

        {/* 사진 */}
        {photos.length > 0 ? (
          <div className="grid grid-cols-2 gap-2">
            {/* 고도화 4 — 대표 사진은 이 페이지의 LCP 요소다. 첫 장만 eager+높은 우선순위, 나머지 갤러리는 lazy 유지. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={photos[0]}
              alt={`${listing.complexName} 대표 사진`}
              className="col-span-2 h-[280px] w-full rounded-lg object-cover"
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
                className="h-[140px] w-full rounded-lg object-cover"
                loading="lazy"
              />
            ))}
          </div>
        ) : (
          <p className="t-sub text-text-3">등록된 사진 없음</p>
        )}

        {/* 매물 정보 — [v4 · 규칙 5] 흩어진 스펙 글자 + 회색 주소 상자 → 1px 선 항목·값 행 */}
        <section aria-labelledby="listing-spec-h" className="flex flex-col">
          <h2 id="listing-spec-h" className="t-section text-ink">
            매물 정보
          </h2>
          <dl data-tone="mint" className="divide-y divide-line">
            {specRows.map((r) => (
              <div key={r.label} className="flex items-baseline justify-between gap-3 py-2.5">
                <dt className="shrink-0 t-sub text-text-3">{r.label}</dt>
                <dd className="min-w-0 break-words text-right t-body font-bold text-ink tabular-nums">{r.value}</dd>
              </div>
            ))}
          </dl>
        </section>

        {/* 설명 */}
        {body.trim() && (
          <section aria-labelledby="listing-body-h" className="flex flex-col gap-1.5">
            <h2 id="listing-body-h" className="t-section text-ink">
              상세 설명
            </h2>
            <p className="whitespace-pre-wrap t-body leading-[1.75] text-text-2">{body.trim()}</p>
          </section>
        )}

        {/* 실거래 비교 — 같은 단지·면적대 최근 실거래 중위가 대비(데이터 있을 때만).
            [1009 · T] 결론 한 줄(문장) → 근거(중위가·표본·최근 거래) → 다음 행동. [v4] 카드 → 섹션 */}
        {priceCompare && compareBadge ? (
          <section aria-labelledby="listing-cmp-h" className="flex flex-col gap-2">
            <div className="flex items-baseline justify-between gap-2">
              <h2 id="listing-cmp-h" className="flex items-center gap-0.5 t-section text-ink">
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
            <p className="t-body font-bold text-ink">{compareBadge.sentence}</p>
            <p className="t-sub text-text-2">
              최근 실거래 중위가 <b className="t-num font-bold text-ink">{formatKrwShort(priceCompare.medianKrw)}</b> · 표본{" "}
              {priceCompare.sampleCount}건
              {listing.areaM2 !== null ? ` · 전용 ${listing.areaM2}㎡ 안팎` : ""}
            </p>
            {comparableTx.length > 0 && (
              <ul data-tone="blue" className="flex flex-col divide-y divide-line border-y border-line">
                {comparableTx.slice(0, 4).map((t, i) => (
                  <li key={i} className="flex items-center justify-between gap-3 py-2">
                    <span className="t-num text-[12px] text-text-3">
                      {formatYm(t.contractYm)}
                      {t.contractDay ? `.${String(t.contractDay).padStart(2, "0")}` : ""}
                      {t.areaM2 !== null ? ` · ${t.areaM2.toFixed(1)}㎡` : ""}
                      {t.floor !== null ? ` · ${t.floor}층` : ""}
                    </span>
                    <span className="t-num text-[13px] font-bold text-ink">{krwText(t.dealAmountKrw)}</span>
                  </li>
                ))}
              </ul>
            )}
            <p className="t-caption text-text-3">국토교통부 실거래가 · 같은 단지·면적대 최근 거래 기준 · 호가는 등록자가 적은 값</p>
            <Link
              href={txHref ?? "/complex/browse"}
              className="inline-flex min-h-[24px] w-fit items-center text-[13px] font-bold text-primary"
            >
              이 단지 실거래 전체 →
            </Link>
          </section>
        ) : (
          <Link
            /* [970 · B-18] /complex/tx 인덱스는 리다이렉트만 있다 — 목적지로 바로 보낸다 */
            href={txHref ?? "/complex/browse"}
            className="inline-flex min-h-[24px] w-fit items-center text-[13px] font-bold text-primary underline"
          >
            실거래가 비교 →
          </Link>
        )}

        {/* 지도 · 거리뷰 — 좌표가 있을 때만 */}
        {hasCoord && (
          <div className="flex flex-col gap-2">
            <div className="h-[240px] w-full overflow-hidden rounded-lg">
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
            {/* 거리뷰(항목 A5) — 없으면 컴포넌트가 자동 숨김 */}
            <RoadviewButton lat={listing.lat as number} lng={listing.lng as number} label={listing.complexName} />
          </div>
        )}

        {/* 연락처 — 로그인 시 노출. [v4] 카드 → 섹션 */}
        <section aria-labelledby="listing-contact-h" className="flex flex-col gap-2">
          <h2 id="listing-contact-h" className="t-section text-ink">
            연락처
          </h2>
          {viewerEmail ? (
            listing.contact ? (
              <p className="break-all t-body font-bold text-ink">{listing.contact}</p>
            ) : (
              <p className="t-sub text-text-3">등록된 연락처 없음 · 등록자에게 직접 문의가 어려울 수 있음</p>
            )
          ) : (
            /* [1012 · 규칙 5·9] 화면당 채움 파랑 1개(비교 섹션 링크는 글자 링크) — 동사 + 대상 */
            <Link href={`/login?callbackUrl=/listings/${listing.id}`} className="btn-primary btn-md w-fit">
              로그인하고 연락처 보기
            </Link>
          )}
        </section>

        {/* 문의 남기기 — 승인 매물 + 등록자 본인이 아닐 때만 */}
        {listing.status === "approved" && !isOwner && (
          <section aria-labelledby="listing-inq-h" className="flex flex-col gap-2">
            <div className="flex flex-col gap-0.5">
              <h2 id="listing-inq-h" className="t-section text-ink">
                문의하기
              </h2>
              <p className="t-sub text-text-3">전화 대신 문의 · 등록자가 확인 후 남긴 연락처로 회신</p>
            </div>
            <InquiryForm listingId={listing.id} loggedIn={viewerEmail !== null} />
          </section>
        )}

        {/* 신고 */}
        <div className="flex items-center gap-3">
          <span className="text-[12px] text-text-3">이 매물에 문제가 있나요?</span>
          <ReportButton postId={listing.id} />
        </div>

        {/* 법적 고지 — [v4 · 규칙 3] 회색 상자 → 끝 캡션(문장은 법적 고지라 격식체 유지) */}
        <p className="border-t border-line pt-3 text-[12px] leading-[1.7] text-text-3">
          내집나우는 광고 매체이며 중개하지 않습니다. 매물 정보의 정확성과 권리관계에 대한 책임은
          등록자에게 있으며, 내집나우의 검수는 형식 요건 확인일 뿐 진위를 보증하지 않습니다. 중개
          행위는 해당 매물을 등록한 개업공인중개사가 수행합니다.
        </p>
      </div>
    </PageShell>
  );
}
