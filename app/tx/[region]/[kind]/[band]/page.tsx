import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageShell } from "../../../../components/PageShell";
import { AdZone } from "@/app/components/ads/AdZone";
import {
  findTxRegionBySlug,
  listBandComplexes,
  type BandCell,
  type BandComplex,
  type TxRegionSummary,
} from "@/lib/market/tx-bands";
import { BAND_KIND_LABEL, isBandKind, type BandKind } from "@/lib/market/bands";
import { formatKrwShort, formatYm, formatYmRange, m2ToPyeong } from "@/lib/market/format";
import { breadcrumbJsonLd, jsonLdScript } from "@/lib/seo/jsonld";
import { seoAlternates } from "@/lib/seo/alternates";
import { logger } from "@/lib/log";
import { complexHrefFromNames } from "@/lib/seo/complex-slug";
import { DEFAULT_OG_IMAGES } from "@/lib/seo/page-metadata";

/* ============================================================
   지역 × 구간 실거래 랜딩 — /tx/[region]/[kind]/[band]
   kind = "area" | "price" · band = lib/market/bands.ts 의 슬러그
   집계는 Postgres 뷰(tx_band_landing_source / tx_band_complex_source)에서 오고,
   거래 10건 미만 셀은 페이지를 만들지 않는다(404) — 표본이 작은 평균은
   숫자처럼 보이지만 사실상 잡음이라, 사실이 아닌 것을 사실처럼 내보내게 된다.
   ============================================================ */

/* [B001 1단계] 1h → 24h. 이 페이지의 원천(국토부 실거래)은 하루 1번 적재라
   더 자주 재렌더할 이유가 없다 — 26k 페이지 크롤 재렌더가 DB 를 밀던 문제의 반쪽. */
/* [1010] 24h → 7일. 실측(2026-09-20~22) 이 라우트만 하루 2,092 렌더 — 이 축에서 가장
   비싼 자리다. 셀은 1,403개인데 하루에 값이 바뀌는 셀은 그날 적재된 시군구의 것뿐이다.
   그래서 라우트 전체 비움이 아니라 **바뀐 셀만** 비운다
   (lib/region/changed-region-paths.ts txPathsForChangedCells — 라우트 전체 비움이
   왜 더 비싼지도 그 주석에 적어 두었다). 안 바뀐 셀은 7일 내내 HIT. */
export const revalidate = 604_800;
/* 빈 배열 = "빌드 때 미리 만들 경로는 없다". 이 export 가 있어야 Next 가 이
   라우트를 ISR 로 분류한다 — 없으면 `revalidate` 를 적어 둬도 요청마다 서버
   렌더로 돌면서 Next 가 `private, no-cache, no-store` 를 실어 보내고, CDN 은
   한 벌도 재사용하지 못한다(2026-07-28 함수 호출 소진 사고. 자세한 내용은
   app/complex/[id]/page.tsx 의 같은 자리 주석). dynamicParams 기본값이 true 라
   실제 요청이 오면 그때 만들어 캐시한다. */
export function generateStaticParams(): Params[] {
  return [];
}


type Params = { region: string; kind: string; band: string };

type Loaded = {
  region: TxRegionSummary;
  kind: BandKind;
  cell: BandCell;
  siblings: BandCell[];
  crossCells: BandCell[];
};

/**
 * null 은 오직 "그런 구간이 없다"(→ 404)일 때만 돌려준다.
 *
 * 예전엔 `findTxRegionBySlug(...).catch(() => null)` 이었다. 그러면 DB 조회 실패가
 * 404 로 둔갑한다 — 크롤러에게 404 는 "이 URL 은 없어졌다" 라는 확정 신호라
 * 색인에서 빠지지만, 5xx 는 "나중에 다시 오라" 다. 일시적 장애를 영구 삭제로
 * 신고하는 셈이었다. 그래서 조회 실패는 그대로 던진다(ISR 이 직전 정상 페이지를
 * 계속 서빙하고 다음 요청에 재시도한다).
 */
async function load(params: Params): Promise<Loaded | null> {
  if (!isBandKind(params.kind)) return null;
  const kind = params.kind;
  const region = await findTxRegionBySlug(params.region);
  if (!region) return null;
  const cells = kind === "area" ? region.areaCells : region.priceCells;
  const cell = cells.find((c) => c.bandSlug === params.band);
  if (!cell) return null;
  return {
    region,
    kind,
    cell,
    siblings: cells.filter((c) => c.bandSlug !== cell.bandSlug),
    crossCells: kind === "area" ? region.priceCells : region.areaCells,
  };
}

function pageTitle(region: TxRegionSummary, kind: BandKind, cell: BandCell): string {
  return kind === "area"
    ? `${region.name} ${cell.bandLabel} 아파트 실거래`
    : `${region.name} ${cell.bandLabel} 아파트 실거래`;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const p = await params;
  const data = await load(p);
  if (!data) {
    return { title: "실거래 구간 | 내집나우", robots: { index: false, follow: false } };
  }
  const { region, kind, cell } = data;
  const range = formatYmRange(cell.firstYm, cell.latestYm);
  const title = `${pageTitle(region, kind, cell)} — 중앙값 ${formatKrwShort(cell.medianKrw)} | 내집나우`;
  const description = `${region.name} ${cell.bandLabel} 아파트 매매 실거래 ${cell.txCount.toLocaleString(
    "ko-KR",
  )}건 (${range} 신고 기준) · 중앙값 ${formatKrwShort(cell.medianKrw)} · 평균 ${formatKrwShort(
    cell.avgKrw,
  )} · 범위 ${formatKrwShort(cell.minKrw)}~${formatKrwShort(cell.maxKrw)}. 단지 ${cell.complexCount.toLocaleString(
    "ko-KR",
  )}곳의 국토교통부 실거래가입니다. 매물 호가가 아닙니다.`;
  const path = `/tx/${encodeURIComponent(region.slug)}/${kind}/${cell.bandSlug}`;
  return {
    title,
    description,
    alternates: seoAlternates(path),
    openGraph: { title, description, url: `https://naezipnow.com${path}`, type: "website", images: DEFAULT_OG_IMAGES },
  };
}

export default async function TxBandPage({ params }: { params: Promise<Params> }) {
  const p = await params;
  const data = await load(p);
  if (!data) notFound();

  const { region, kind, cell, siblings, crossCells } = data;
  // 단지 목록은 이 페이지의 부속 정보다(핵심 통계는 이미 cell 에 있다). 그래서
  // 실패해도 페이지 전체를 죽이지 않지만, "못 읽었다" 와 "없다" 는 구분해서 적는다.
  // 이 셀은 정의상 거래 10건 이상이므로 정상 조회에서 빈 목록이 나올 수는 없다.
  let complexes: BandComplex[] = [];
  let complexesFailed = false;
  try {
    complexes = await listBandComplexes(region.name, kind, cell.bandSlug, 40);
  } catch (e) {
    complexesFailed = true;
    logger.error(
      `[/tx/${region.slug}/${kind}/${cell.bandSlug}] 단지 목록 조회 실패:`,
      e instanceof Error ? e.message : String(e),
    );
  }
  const range = formatYmRange(cell.firstYm, cell.latestYm);
  const regionHref = `/tx/${encodeURIComponent(region.slug)}`;
  const pyeong = m2ToPyeong(cell.avgAreaM2);

  /* [1015 · 규칙 M] 직방 계산기·네이버 실거래의 "큰 숫자 + 항목 표" — 중앙값은 머리에 크게, 나머지는 행 목록 */
  const stats: Array<{ label: string; value: string; hint?: string }> = [
    { label: "평균", value: formatKrwShort(cell.avgKrw) },
    { label: "거래 건수", value: `${cell.txCount.toLocaleString("ko-KR")}건`, hint: range },
    { label: "거래된 단지", value: `${cell.complexCount.toLocaleString("ko-KR")}곳` },
    {
      label: "최저 ~ 최고",
      value: `${formatKrwShort(cell.minKrw)} ~ ${formatKrwShort(cell.maxKrw)}`,
    },
    ...(cell.avgAreaM2 !== null
      ? [
          {
            label: "평균 전용면적",
            value: `${cell.avgAreaM2.toFixed(1)}㎡`,
            hint: pyeong ? `약 ${pyeong}평` : undefined,
          },
        ]
      : []),
    ...(cell.avgPerPyeongKrw !== null && cell.avgPerPyeongKrw > 0
      ? [
          {
            label: "평당 평균",
            value: formatKrwShort(cell.avgPerPyeongKrw),
            hint: "전용면적 기준",
          },
        ]
      : []),
  ];

  const crumbs = breadcrumbJsonLd([
    { name: "홈", url: "/" },
    { name: "지역별 실거래 구간", url: "/tx" },
    { name: region.name, url: regionHref },
    {
      name: `${BAND_KIND_LABEL[kind]} ${cell.bandLabel}`,
      url: `${regionHref}/${kind}/${cell.bandSlug}`,
    },
  ]);

  return (
    <PageShell
      breadcrumb={`홈 › 지역별 실거래 구간 › ${region.name} › ${BAND_KIND_LABEL[kind]} ${cell.bandLabel}`}
      title={pageTitle(region, kind, cell)}
    >
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript(crumbs) }}
      />

      {/* [1015 · 규칙 B] 사실 한 줄 */}
      <p className="rise-in mb-4 t-sub text-text-2 max-md:mb-3">
        <strong className="text-ink">{cell.txCount.toLocaleString("ko-KR")}건</strong>
        {range && ` · ${range} 신고 기준`} · 단지 {cell.complexCount.toLocaleString("ko-KR")}곳 · 국토교통부 실거래 · 매물 호가 아님
      </p>

      {/* [1015 · 규칙 F·G] 데스크톱 2단 — 본문(요약·단지 표) + 340px 레일(구간 칩 · 관련 화면 · 데이터 출처 · 광고 1). 폰은 한 열, 광고는 끝 1. */}
      <div className="grid grid-cols-1 gap-4 max-md:gap-3 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-5">
      <div className="min-w-0">
      {/* 구간 요약 — [1015 · 규칙 M] 직방 계산기·네이버 실거래의 "큰 숫자 + 항목 표": 중앙값 크게, 나머지는 행 목록(lq-panel) */}
      <section className="rise-in-1 card mb-4 p-[var(--pad-card)] max-md:mb-3">
        <h2 className="t-section text-ink">{cell.bandLabel} 요약</h2>
        <p className="mt-0.5 t-caption text-text-3">{kind === "area" ? "전용면적 기준" : "거래금액 기준"}</p>
        <div className="mt-2 flex flex-wrap items-baseline gap-x-2">
          <span className="t-sub text-text-3">중앙값</span>
          <span className="t-display t-num text-ink">{formatKrwShort(cell.medianKrw)}</span>
          <span className="t-caption text-text-3">절반은 이 금액보다 낮게 거래</span>
        </div>
        <dl data-tone="blue" className="lq-panel m-0 mt-3 flex flex-col divide-y max-md:mt-2">
          {stats.map((s) => (
            <div key={s.label} className="flex min-h-[40px] items-center justify-between gap-3 py-2">
              <dt className="t-sub text-text-2">
                {s.label}
                {s.hint && <span className="ml-1.5 t-caption text-text-3">{s.hint}</span>}
              </dt>
              <dd className="m-0 t-num t-body font-bold text-ink">{s.value}</dd>
            </div>
          ))}
        </dl>
      </section>

      {/* 단지 목록 — [1015 · 규칙 M] 네이버부동산 실거래 표 순서(단지 · 면적 · 가격 · 거래일)로 열을 재배치, 껍데기 lq-panel */}
      <section className="rise-in-2 card mb-4 p-[var(--pad-card)] max-md:mb-3">
        <h2 className="t-section text-ink">이 구간에서 거래된 단지</h2>
        <p className="mt-0.5 t-caption text-text-3">거래 많은 순 · 상위 {Math.min(complexes.length, 40)}곳</p>
        {complexesFailed ? (
          <p className="py-6 text-center t-body text-text-3 max-md:py-4">
            단지별 내역을 불러오지 못했습니다. 잠시 후 다시 확인해 주세요.
          </p>
        ) : complexes.length === 0 ? (
          <p className="py-6 text-center t-body text-text-3 max-md:py-4">
            이 구간에서 거래된 단지 내역이 아직 정리되지 않았습니다.
          </p>
        ) : (
          <div data-tone="blue" className="lq-panel mt-3 overflow-x-auto max-md:mt-2">
            <table className="w-full min-w-[520px] text-left t-body">
              <thead>
                <tr className="border-b border-border t-sub text-text-3">
                  <th className="py-2 font-medium">단지</th>
                  <th className="py-2 text-right font-medium">전용</th>
                  <th className="py-2 text-right font-medium">평균</th>
                  <th className="py-2 text-right font-medium">최저~최고</th>
                  <th className="py-2 text-right font-medium">거래</th>
                  <th className="py-2 text-right font-medium">최근</th>
                </tr>
              </thead>
              <tbody>
                {complexes.map((c) => (
                  <tr key={c.name} className="border-b border-border last:border-b-0">
                    <td className="py-2.5">
                      <Link
                        href={complexHrefFromNames(region.name, c.name)}
                        className="font-bold text-primary underline"
                      >
                        {c.name}
                      </Link>
                    </td>
                    <td className="py-2.5 text-right t-sub tabular-nums text-text-3">
                      {c.avgAreaM2 !== null ? `${c.avgAreaM2.toFixed(0)}㎡` : "—"}
                    </td>
                    <td className="py-2.5 text-right t-num font-bold text-ink">
                      {formatKrwShort(c.avgKrw)}
                    </td>
                    <td className="py-2.5 text-right t-sub tabular-nums text-text-2">
                      {formatKrwShort(c.minKrw)}~{formatKrwShort(c.maxKrw)}
                    </td>
                    <td className="py-2.5 text-right tabular-nums text-text-2">{c.txCount}건</td>
                    <td className="py-2.5 text-right t-sub tabular-nums text-text-3">
                      {formatYm(c.latestYm)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <p className="mb-2 t-caption text-text-3">
        평균·중앙값은 이 구간에 신고된 거래만의 값 · 특정 단지의 현재 가격이 아님 · 전용면적 기준 · 최근 달 건수는 신고 시차로 더 늘 수 있음
      </p>
      {/* [1015 · 규칙 G] 페이지 끝 광고 1 */}
      <AdZone placement="page_bottom" seed={6} plan={null} className="mt-6 max-md:mt-4" />
      </div>

      <aside className="flex flex-col gap-3 lg:sticky lg:top-[76px] lg:self-start">
        {/* 같은 지역 다른 구간 — [1015 · 규칙 M] 네이버부동산의 면적·가격 필터 칩 한 줄처럼, 구간 칩을 레일에 모은다 */}
        {siblings.length > 0 && (
          <section className="card rounded-2xl px-4 py-3">
            <h2 className="t-sub font-bold text-ink">{region.name} 다른 {BAND_KIND_LABEL[kind]}</h2>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {siblings.map((s) => (
                <Link
                  key={s.bandSlug}
                  href={`${regionHref}/${kind}/${s.bandSlug}`}
                  className="tile rounded-full border border-border px-3 py-1.5 t-sub font-bold text-ink"
                >
                  {s.bandLabel}
                  <span className="ml-1 font-medium text-text-3">{s.txCount.toLocaleString("ko-KR")}건</span>
                </Link>
              ))}
            </div>
          </section>
        )}
        {crossCells.length > 0 && (
          <section className="card rounded-2xl px-4 py-3">
            <h2 className="t-sub font-bold text-ink">{region.name} {BAND_KIND_LABEL[kind === "area" ? "price" : "area"]}별</h2>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {crossCells.map((s) => (
                <Link
                  key={s.bandSlug}
                  href={`${regionHref}/${kind === "area" ? "price" : "area"}/${s.bandSlug}`}
                  className="tile rounded-full border border-border px-3 py-1.5 t-sub font-bold text-ink"
                >
                  {s.bandLabel}
                  <span className="ml-1 font-medium text-text-3">{s.txCount.toLocaleString("ko-KR")}건</span>
                </Link>
              ))}
            </div>
          </section>
        )}
        <nav aria-label="관련 화면" data-tone="blue" className="lq-panel flex flex-col divide-y">
          <Link href={regionHref} className="flex min-h-[40px] items-center justify-between gap-2 py-2 t-sub font-bold text-ink no-underline">
            {region.name} 구간 전체 <span aria-hidden="true" className="text-text-3">›</span>
          </Link>
          <Link href="/tx" className="flex min-h-[40px] items-center justify-between gap-2 py-2 t-sub font-bold text-ink no-underline">
            다른 지역 <span aria-hidden="true" className="text-text-3">›</span>
          </Link>
        </nav>
        <p className="px-1 t-caption leading-[1.6] text-text-3">
          데이터 출처: 국토교통부 실거래가 공개시스템 신고분(해제 신고분 제외){range ? ` · ${range}` : ""}
        </p>
        <AdZone placement="sidebar" seed={2} plan={null} className="hidden lg:block" />
      </aside>
      </div>
    </PageShell>
  );
}
