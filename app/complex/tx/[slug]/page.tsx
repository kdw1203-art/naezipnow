/* [1012 · 규칙 8] font-extrabold(800) → font-bold(700) — 굵기 3단(400·500·700). 이 파일의 모든 자리에 적용. */
import { cache } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageShell } from "../../../components/PageShell";
import { ComplexReviews } from "../../ComplexReviews";
import {
  parseComplexTxSlug,
  findComplexTxRegionById,
  regionDisplayName,
  listComplexTransactions,
  summarizeAreaBands,
  summarizeMonthly,
  findApartmentComplexByName,
  type ComplexTransactionRecord,
} from "@/lib/market/complex-transactions";
import { encodeComplexId } from "@/lib/complex/complex-store";
import { getPublicRecordsForComplex } from "@/lib/market/public-records";
import { seoAlternates } from "@/lib/seo/alternates";
import { formatKrwShort } from "@/lib/market/format";

/* ============================================================
   단지 실거래 상세 — /complex/tx/[slug]
   slug = encodeURIComponent(단지명) + "--" + regionId
   국토부 실거래가(market_transactions) 기반 — 매물 호가 아님.
   비로그인 열람 허용(index 대상) · ISR 1시간.
   ============================================================ */

/* [B001 1단계] 1h → 24h. 이 페이지의 원천(국토부 실거래)은 하루 1번 적재라
   더 자주 재렌더할 이유가 없다 — 26k 페이지 크롤 재렌더가 DB 를 밀던 문제의 반쪽. */
/* [1010] 24h → 7일. 위 진단("원천은 하루 1번 적재")이 맞는데도 24시간이 남아 있던 이유는
   시간이 유일한 안전망이었기 때문이다. 크롤러 재방문이 ≈2.2일이라 24시간 TTL 은 사실상
   "올 때마다 재렌더"였다. 이제 적재 크론이 **그 실행이 실제로 적재한 단지의**
   `/complex/tx/{slug}` 만 비운다(app/api/cron/molit-transactions-ingest →
   buildComplexTxSlug + invalidatePathList). 그러니 시간은 안전망으로만 남긴다.
   이 화면의 나머지(거주민 후기)는 클라이언트가 /api/complex-reviews 로 직접 받으므로
   ISR HTML 에 실리지 않는다 — 후기 작성이 캐시에 갇히지 않는다. */
export const revalidate = 604_800;
/* 빈 배열 = "빌드 때 미리 만들 경로는 없다". 이 export 가 있어야 Next 가 이
   라우트를 ISR 로 분류한다 — 없으면 `revalidate` 를 적어 둬도 요청마다 서버
   렌더로 돌면서 Next 가 `private, no-cache, no-store` 를 실어 보내고, CDN 은
   한 벌도 재사용하지 못한다(2026-07-28 함수 호출 소진 사고. 자세한 내용은
   app/complex/[id]/page.tsx 의 같은 자리 주석). dynamicParams 기본값이 true 라
   실제 요청이 오면 그때 만들어 캐시한다. */
export function generateStaticParams(): { slug: string }[] {
  return [];
}


/* ---------- 포맷 헬퍼 ---------- */

/* [967 · 31] 여기 있던 formatKrwShort 사본은 lib/market/format 의 공통 함수로 대체 — 출력 동일 */

/** "202607" → "2026.07" */
function formatYm(ym: string): string {
  return ym.length === 6 ? `${ym.slice(0, 4)}.${ym.slice(4)}` : ym;
}

/** "202607" + 15 → "2026.07.15" */
function formatYmd(ym: string, day: number | null): string {
  return day ? `${formatYm(ym)}.${String(day).padStart(2, "0")}` : formatYm(ym);
}

/** "202607" → "26.07" */
function shortYm(ym: string): string {
  return ym.length === 6 ? `${ym.slice(2, 4)}.${ym.slice(4)}` : ym;
}

/**
 * generateMetadata 와 본문이 같은 렌더에서 한 번만 조회하도록 묶는다
 * (/complex/compare/[slug] 와 같은 방식).
 *
 * null 은 오직 **없다**는 뜻이다 — 슬러그가 깨졌거나, 모르는 지역이거나,
 * 이 단지의 신고된 거래가 정말 0건일 때. 못 읽은 경우는 여기서 던지고
 * 5xx 가 된다.
 */
const loadPageData = cache(
  async (
    slug: string,
  ): Promise<{
    complexName: string;
    region: NonNullable<ReturnType<typeof findComplexTxRegionById>>;
    transactions: ComplexTransactionRecord[];
  } | null> => {
    const parsed = parseComplexTxSlug(slug);
    if (!parsed) return null;
    const region = findComplexTxRegionById(parsed.regionId);
    if (!region) return null;
    /* 예전에는 여기 .catch(() => []) 가 있었다. 그러면 조회 실패가 아래 0건
       가드로 흘러 notFound() + robots:noindex,nofollow 가 됐다 — 잠깐 못 읽은
       것을 크롤러에게 "이 페이지는 없어졌다"고 확정 신고한 셈이다. 이제 실패는
       그대로 던져 5xx("나중에 다시 오라")가 되고, 404 는 진짜 0건일 때만 난다. */
    const transactions = await listComplexTransactions(parsed.complexName, region, 30);
    if (transactions.length === 0) return null;
    return { complexName: parsed.complexName, region, transactions };
  },
);

/* ---------- 메타데이터 ---------- */

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const data = await loadPageData(slug);
  if (!data) {
    return { title: "단지 실거래 | 내집나우", robots: { index: false, follow: false } };
  }
  const { complexName, region, transactions } = data;
  const latest = transactions[0];
  const regionLabel = regionDisplayName(region);
  const title = `${complexName} 실거래가 — 최근 ${formatKrwShort(latest.dealAmountKrw)} | 내집나우`;
  const description = `${regionLabel} ${complexName} 아파트 실거래 — 최근 거래 ${formatKrwShort(
    latest.dealAmountKrw,
  )} (${formatYmd(latest.contractYm, latest.contractDay)}). 국토교통부 실거래가 기반 거래 이력·면적대별 시세·월별 거래량을 확인하세요. 매물 호가가 아닙니다.`;
  /* 항목 42 — 같은 단지를 렌더하는 색인 가능 URL 이 둘(/complex/{id} 와 이
     페이지)이라 서로 잠식했다. 사이트맵이 내는 /complex/{id} 를 정본으로
     선언한다. id 는 최근 거래 행의 실제 region_name 으로 조립 — 추측 없음.
     region_name 이 비어 있는 예외에는 기존 자기 canonical 을 유지한다. */
  const canonicalPath = latest.regionName
    ? `/complex/${encodeComplexId(latest.regionName, complexName)}`
    : `/complex/tx/${encodeURIComponent(complexName)}--${region.id}`;
  return {
    title,
    description,
    robots: { index: true, follow: true },
    alternates: seoAlternates(canonicalPath),
    openGraph: {
      title,
      description,
      siteName: "내집나우",
      locale: "ko_KR",
      type: "website",
    },
  };
}

/* ---------- 페이지 ---------- */

export default async function ComplexTxPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const data = await loadPageData(slug);
  if (!data) notFound();
  const { complexName, region, transactions } = data;

  const aptMatch = await findApartmentComplexByName(complexName, region).catch(() => null);
  const publicRecords = await getPublicRecordsForComplex(complexName, 40).catch(
    () => [],
  );
  const quoteRecords = publicRecords.filter(
    (r) => r.dataset === "kb_price_quote" && (r.priceLowKrw || r.priceHighKrw),
  );

  const latest = transactions[0];
  const address =
    transactions.find((t) => t.address)?.address ?? aptMatch?.address ?? null;
  const buildYear = transactions.find((t) => t.buildYear !== null)?.buildYear ?? null;
  const regionLabel = regionDisplayName(region);

  const bands = summarizeAreaBands(transactions);
  const monthly = summarizeMonthly(transactions);
  const maxMonthlyCount = Math.max(1, ...monthly.map((m) => m.count));
  const count12m = monthly.reduce((s, m) => s + m.count, 0);

  /* [v4 · 규칙 1] 머리 사실 한 줄 — 지역 · 준공 · 최근 12개월 거래(숫자·장소만) */
  const headFact = [
    regionLabel,
    ...(buildYear ? [`${buildYear}년 준공`] : []),
    `최근 12개월 ${count12m}건`,
    "호가 아님",
  ].join(" · ");
  /* 주인공 아래 한 줄 — 최근 거래의 계약일 · 면적 · 층(있는 값만) */
  const latestMeta = [
    `${formatYmd(latest.contractYm, latest.contractDay)} 계약`,
    ...(latest.areaM2 !== null ? [`${latest.areaM2.toFixed(1)}㎡`] : []),
    ...(latest.floor !== null ? [`${latest.floor}층`] : []),
  ].join(" · ");
  const LINK = "tap-line font-bold text-primary no-underline";

  return (
    <PageShell breadcrumb={`홈 › 단지 실거래 › ${regionLabel} › ${complexName}`}>
      {/* [v4 · 한 화면 한 가지] 제목 + 사실 한 줄 → 주인공(최근 실거래 t-display) + 채움 파랑 1개(임장노트 쓰기) →
          면적대별 행 → 월별 거래 막대 → 거래 이력 행 → 후기 → KB 시세 행 → 링크 한 줄 → 맨 끝 접힘 "데이터 출처".
          지운 것: 소개 문단(→ 사실 줄), 단지 개요 카드(지역·건축년도·거래 수·최근가 = 머리와 같은 사실 → 주소만 접힘으로),
          표 두 개(가로 스크롤 420px → 구분선 행), 섹션마다의 출처 문장(→ 접힘 하나), 카드 타일 CTA 3개(→ 링크 한 줄). */}
      <div className="mx-auto flex max-w-[760px] flex-col gap-8">
        <div className="flex flex-col gap-4">
          <header className="flex flex-col gap-0.5">
            <h1 className="rise-in t-title text-ink">{complexName} 실거래가</h1>
            <p className="t-sub text-text-3">{headFact}</p>
          </header>
          <section aria-label="최근 실거래" className="flex flex-col gap-0.5">
            <p className="m-0 t-caption text-text-3">최근 실거래</p>
            <p className="m-0 t-display t-num text-ink">{formatKrwShort(latest.dealAmountKrw)}</p>
            <p className="m-0 t-sub text-text-3">{latestMeta}</p>
          </section>
          <div className="flex flex-col gap-2">
            {/* [1012 · 규칙 5] 동사 + 구체 대상. [v4 · 규칙 2] 채움 파랑은 이 화면에 이것 하나 */}
            <Link href="/notes/new" className="btn-primary flex min-h-12 items-center justify-center rounded-lg px-4 t-body no-underline">
              {complexName} 임장노트 쓰기
            </Link>
            {/* 실매물 연결 — 집주인 직접·중개사 등록 (검수 통과분만) */}
            <Link href={`/listings?complex=${encodeURIComponent(complexName)}`} className={`${LINK} t-sub w-fit`}>
              이 단지 매물 보기 ›
            </Link>
          </div>
        </div>

        {/* 면적대별 — [1012 · 규칙 7] "시세" → "실거래". [v4 · 규칙 5] 표 → 구분선 행(오른쪽 최근가) */}
        {bands.length > 0 && (
          <section className="flex flex-col gap-2">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="flex items-baseline gap-1.5 t-section text-ink">
                면적대별 실거래 <span className="t-num text-text-3">{bands.length}</span>
              </h2>
              <span className="t-caption text-text-3">최근가</span>
            </div>
            <ul data-tone="blue" className="card flex flex-col divide-y divide-line rounded-lg px-4">
              {bands.map((b) => (
                <li key={b.label} className="flex min-h-14 items-center justify-between gap-3 py-3">
                  <span className="min-w-0 flex-1">
                    <span className="block t-body font-bold text-ink">{b.label}</span>
                    <span className="mt-0.5 block truncate t-sub tabular-nums text-text-3">
                      {b.count}건 · 평균 {formatKrwShort(b.avgAmountKrw)} · 최근 {shortYm(b.latestYm)}
                    </span>
                  </span>
                  <span className="shrink-0 t-body t-num text-ink">{formatKrwShort(b.latestAmountKrw)}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* 12개월 월별 거래량·평균가 미니 차트 — 차트는 그대로(같은 높이 막대) */}
        <section className="flex flex-col gap-2">
          <h2 className="flex items-baseline gap-1.5 t-section text-ink">
            월별 거래 <span className="t-sub font-medium text-text-3">최근 12개월 · 거래량·평균가</span>
          </h2>
          {count12m === 0 ? (
            <p className="card rounded-lg px-4 py-6 text-center t-body text-text-3">최근 12개월 거래 없음 · 과거 거래는 아래 이력</p>
          ) : (
            <div className="card rounded-lg px-4 py-3">
              <div className="flex h-[110px] items-end gap-[6px]">
                {monthly.map((m) => (
                  <div
                    key={m.ym}
                    className="flex min-w-0 flex-1 flex-col items-center gap-1"
                    title={`${formatYm(m.ym)} · ${m.count}건${
                      m.avgAmountKrw !== null ? ` · 평균 ${formatKrwShort(m.avgAmountKrw)}` : ""
                    }`}
                  >
                    <span className="t-caption font-bold text-text-3">
                      {m.avgAmountKrw !== null ? formatKrwShort(m.avgAmountKrw) : ""}
                    </span>
                    <div
                      className="w-full rounded-t-sm"
                      style={{
                        height: `${m.count > 0 ? 12 + Math.round((m.count / maxMonthlyCount) * 84) : 3}px`,
                        background: m.count > 0 ? "var(--primary)" : "var(--border)",
                        opacity: m.count > 0 ? 0.55 + 0.45 * (m.count / maxMonthlyCount) : 1,
                      }}
                    />
                  </div>
                ))}
              </div>
              <div className="mt-1 flex justify-between t-caption text-text-3">
                <span>{shortYm(monthly[0].ym)}</span>
                <span>{shortYm(monthly[monthly.length - 1].ym)}</span>
              </div>
            </div>
          )}
        </section>

        {/* 거래 이력 — [v4 · 규칙 5] 표 → 구분선 행(왼쪽 계약일 + 면적·층 / 오른쪽 거래금액) */}
        <section className="flex flex-col gap-2">
          <h2 className="flex items-baseline gap-1.5 t-section text-ink">
            거래 이력 <span className="t-num text-text-3">{transactions.length}</span>
          </h2>
          <ul data-tone="mint" className="card flex flex-col divide-y divide-line rounded-lg px-4">
            {transactions.map((t, i) => (
              <li
                key={`${t.contractYm}-${t.contractDay ?? 0}-${t.areaM2 ?? 0}-${i}`}
                className="flex min-h-12 items-center justify-between gap-3 py-2.5"
              >
                <span className="min-w-0 flex-1">
                  <span className="block t-body font-bold tabular-nums text-ink">{formatYmd(t.contractYm, t.contractDay)}</span>
                  <span className="block truncate t-sub tabular-nums text-text-3">
                    {t.areaM2 !== null ? `${t.areaM2.toFixed(1)}㎡` : "면적 —"} · {t.floor !== null ? `${t.floor}층` : "층 —"}
                  </span>
                </span>
                <span className="shrink-0 t-body t-num text-ink">{formatKrwShort(t.dealAmountKrw)}</span>
              </li>
            ))}
          </ul>
        </section>

        {/* 거주민 후기 — 단지명+지역 기준 키 (apartment_complexes 매칭 시 그 id 공유) */}
        <section>
          <ComplexReviews
            complexId={aptMatch?.id ? `apt:${aptMatch.id}` : `tx:${region.id}:${complexName}`}
            complexName={complexName}
          />
        </section>

        {/* KB 시세정보 (CODEF 연동 시 노출) — 실제 시세 자료라 "시세" 표기 유지 */}
        {quoteRecords.length > 0 && (
          <section className="flex flex-col gap-2">
            <h2 className="flex items-baseline gap-1.5 t-section text-ink">
              KB 시세 <span className="t-sub font-medium text-text-3">면적별 매매 상·하한 평균가</span>
            </h2>
            <ul data-tone="blue" className="card flex flex-col divide-y divide-line rounded-lg px-4">
              {quoteRecords.slice(0, 8).map((r) => (
                <li key={r.id} className="flex min-h-14 items-center justify-between gap-3 py-3">
                  <span className="min-w-0">
                    <span className="block t-body font-bold text-ink">{r.areaM2 ? `${r.areaM2}㎡` : "면적 미상"}</span>
                    <span className="mt-0.5 block truncate t-sub text-text-3">{r.recordDate ?? r.period ?? ""} 기준</span>
                  </span>
                  <span className="shrink-0 text-right t-body t-num text-ink">
                    {r.priceLowKrw ? formatKrwShort(r.priceLowKrw) : "—"}
                    {" ~ "}
                    {r.priceHighKrw ? formatKrwShort(r.priceHighKrw) : "—"}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* [1012 · 규칙 5] 동사 + 구체 대상(구 이름) · 지도는 이 구로 여는 딥링크. [v4] 카드 타일 3개 → 링크 한 줄 */}
        <p className="t-sub text-text-3">
          <Link href={`/region/${region.id}`} className={LINK}>
            {region.name} 시세 허브 보기
          </Link>
          {" · "}
          <Link href={`/map?region=${encodeURIComponent(regionLabel)}`} className={LINK}>
            {region.name} 지도에서 보기
          </Link>
          {" · "}
          <Link href={`/complex/browse?district=${encodeURIComponent(regionLabel)}`} className={LINK}>
            {region.name} 다른 단지 보기
          </Link>
        </p>

        {/* [v4 · 규칙 3] 맨 끝 접힘 하나 — 주소 · 단지 자료 병합 · 출처(섹션마다 있던 출처 문장을 한곳에) */}
        <details className="group border-t border-line pt-1">
          <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-2 t-body font-bold text-ink [&::-webkit-details-marker]:hidden">
            데이터 출처
            <span aria-hidden="true" className="t-body text-text-3 transition-transform group-open:rotate-90">
              ›
            </span>
          </summary>
          <ul className="flex list-none flex-col gap-0.5 p-0 pb-3">
            {address && <li className="t-caption text-text-3">주소 {address}</li>}
            {aptMatch && <li className="t-caption text-text-3">단지 정보: 공동주택 단지 데이터({aptMatch.name}) 병합</li>}
            <li className="t-caption text-text-3">
              국토교통부 실거래가 공개시스템 신고 자료 · 최근 {transactions.length}건 · 해제 신고 제외 · 매물 호가와 다를 수 있음
            </li>
            {quoteRecords.length > 0 && (
              <li className="t-caption text-text-3">KB부동산 시세(공개 자료) · 원 환산 표기 · 참고용, 실거래·계약 조건에 따라 다를 수 있음</li>
            )}
          </ul>
        </details>
      </div>
    </PageShell>
  );
}
