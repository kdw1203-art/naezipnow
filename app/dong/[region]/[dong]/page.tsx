/* [1083] 법정동 실거래 — /dong/[region]/[dong] ("서울-송파구" / "잠실동").
   "잠실동 아파트 실거래가" 같은 동 단위 검색어를 받는 화면. 원천은 전부 이미 있는 집계(lib/dong/landing.ts 헤더).
   얇은 페이지 금지: 단지 3곳 · 최근 6개월 30건 미만은 noindex,follow(페이지는 있다 — 단지 상세의 동 칩이 여기로 온다).
   지역 슬러그는 /tx 와 같은 규칙(공백 → 하이픈)이라 /tx/<지역> ↔ /dong/<지역>/<동> 이 1:1 로 이어진다. */
import type { Metadata } from "next";
import { cache } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AdZone } from "@/app/components/ads/AdZone";
import { CitationBlock } from "@/app/components/CitationBlock";
import { Fineprint } from "@/app/components/Fineprint";
import { HScroll } from "@/app/components/HScroll";
import { MiniBar } from "@/app/components/compact/MiniBar";
import { PageShell } from "@/app/components/PageShell";
import { QaBlock } from "@/app/components/QaBlock";
import { complexCanonicalPathFromNames } from "@/lib/complex/complex-store";
import { loadDongComplexes, loadDongSiblings, loadDongStats, type DongWindowStats } from "@/lib/dong/landing";
import {
  buildDongFaq,
  dongCitation,
  dongDescription,
  dongFromParam,
  dongIndexable,
  dongPath,
  dongTitle,
  regionFromSlug,
  regionSlugOf,
  ymDot,
  ymKo,
} from "@/lib/dong/format";
import { formatKrwShort } from "@/lib/market/format";
import { findTxRegionBySlug } from "@/lib/market/tx-bands";
import { catalogIdForTxRegionName } from "@/lib/region/changed-region-paths";
import { seoAlternates } from "@/lib/seo/alternates";
import { breadcrumbJsonLd, datasetJsonLd, jsonLdScript } from "@/lib/seo/jsonld";
import { DEFAULT_OG_IMAGES } from "@/lib/seo/page-metadata";
import { logger } from "@/lib/log";
import { map3dPath, map3dSupported } from "@/lib/map3d/geo";

/* 7일 ISR — 원천(국토부 실거래)은 하루 1회 적재. /tx·/region 과 같은 눈금. 빈 배열 = 요청이 오면 그때 만들어 캐시(ISR 분류) */
export const revalidate = 604_800;
export function generateStaticParams(): { region: string; dong: string }[] {
  return [];
}

type Params = { region: string; dong: string };

/* generateMetadata 와 본문이 같은 조회를 쓴다 — React cache 로 한 요청 안에서는 한 번 */
const loadComplexesCached = cache((region: string, dong: string) => loadDongComplexes(region, dong));
const loadStatsCached = cache((region: string, dong: string) => loadDongStats(region, dong));

/** 주소 → (지역, 동). 꼴이 아니면 null(→ 404 · 임의 문자열로 빈 페이지를 만들지 않는다) */
function parseParams(p: Params): { region: string; dong: string } | null {
  const region = regionFromSlug(p.region);
  const dong = dongFromParam(p.dong);
  return region && dong ? { region, dong } : null;
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const parsed = parseParams(await params);
  if (!parsed) return { title: "동 실거래 | 내집나우", robots: { index: false, follow: false } };
  const complexes = await loadComplexesCached(parsed.region, parsed.dong);
  if (complexes.length === 0) return { title: "동 실거래 | 내집나우", robots: { index: false, follow: false } };
  const label = `${parsed.region} ${parsed.dong}`;
  const recent = complexes.reduce((s, c) => s + c.recentTradeCount, 0);
  /* 설명문의 월 중앙값은 본문과 같은 조회(서비스 키가 있을 때만) — 실패해도 메타는 낸다 */
  const stats = await loadStatsCached(parsed.region, parsed.dong).catch(() => null);
  const title = dongTitle(label, complexes.length, recent);
  const description = dongDescription(label, complexes.length, recent, complexes[0] ?? null, stats?.months ?? []);
  const path = dongPath(parsed.region, parsed.dong);
  return {
    title,
    description,
    alternates: seoAlternates(path),
    openGraph: { title, description, url: `https://naezipnow.com${path}`, type: "website", images: DEFAULT_OG_IMAGES },
    ...(dongIndexable(complexes.length, recent) ? {} : { robots: { index: false, follow: true } }),
  };
}

const n = (v: number) => v.toLocaleString("ko-KR");

export default async function DongLandingPage({ params }: { params: Promise<Params> }) {
  const parsed = parseParams(await params);
  if (!parsed) notFound();
  const { region, dong } = parsed;
  const label = `${region} ${dong}`;
  const regionSlug = regionSlugOf(region);

  /* 뼈대 — 0곳이면 404("없다"). 조회 실패는 던진다(5xx · 크롤러가 다시 온다) */
  const complexes = await loadComplexesCached(region, dong);
  if (complexes.length === 0) notFound();
  const recent = complexes.reduce((s, c) => s + c.recentTradeCount, 0);
  const top = complexes[0] ?? null;

  /* 곁다리 — 실패해도 페이지를 막지 않는다. 서비스 키가 없으면(로컬) stats 는 null(그 조각을 뺀다) */
  let stats: DongWindowStats | null = null;
  let statsFailed = false;
  try {
    stats = await loadStatsCached(region, dong);
  } catch (e) {
    statsFailed = true;
    logger.error(`[dong] ${label} 거래 창 조회 실패`, e);
  }
  const [siblings, txRegion] = await Promise.all([loadDongSiblings(region), findTxRegionBySlug(regionSlug).catch(() => null)]);
  const others = siblings.filter((s) => s.dong !== dong).slice(0, 14);
  const regionHubId = catalogIdForTxRegionName(region);

  const months = stats?.months ?? [];
  const last12 = months.slice(-12);
  const older12 = months.slice(0, -12).reduce((s, m) => s + m.count, 0);
  const bands = stats?.bands ?? [];
  const deals = stats?.deals ?? [];
  const faq = buildDongFaq({ label, complexCount: complexes.length, recentTradeCount: recent, top, bands, months });
  const path = dongPath(region, dong);
  const firstYm = months[0]?.ym ?? null;
  const lastYm = months[months.length - 1]?.ym ?? null;

  const crumbs = breadcrumbJsonLd([
    { name: "홈", url: "/" },
    { name: "동별 실거래", url: "/dong" },
    { name: region, url: txRegion ? `/tx/${encodeURIComponent(regionSlug)}` : "/dong" },
    { name: dong, url: path },
  ]);
  const dataset = datasetJsonLd({
    path,
    name: `${label} 아파트 매매 실거래 집계`,
    description: `${label} 아파트 단지 ${n(complexes.length)}곳의 매매 실거래 — 최근 6개월 ${n(recent)}건 · 월별 추이 · 면적대별 중앙값 · 단지별 거래. 해제 신고분 제외.`,
    keywords: [dong, region, "아파트", "실거래가", "매매"],
    temporalCoverage: firstYm && lastYm ? `${firstYm.slice(0, 4)}-${firstYm.slice(4, 6)}/${lastYm.slice(0, 4)}-${lastYm.slice(4, 6)}` : null,
    variableMeasured: ["매매 신고 건수", "거래금액 중앙값", "거래금액 평균"],
    spatialCoverage: label,
  });

  const shown = complexes.slice(0, 30);
  const rest = complexes.slice(30);

  return (
    <PageShell breadcrumb={`홈 › 동별 실거래 › ${region} › ${dong}`} title={`${label} 아파트 실거래`}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript([crumbs, dataset]) }} />

      {/* 사실 한 줄 */}
      <p className="rise-in mb-4 t-sub text-text-2 max-md:mb-3">
        단지 <strong className="text-ink">{n(complexes.length)}곳</strong> · 최근 6개월 매매 신고{" "}
        <strong className="text-ink">{n(recent)}건</strong> · 국토교통부 실거래 · 매물 호가 아님
      </p>
      {/* [1086 · 서울 3D] 서울 동은 3D 동네 지도로 — 건물 높이(OpenStreetMap) 위에 이 동 단지(평당 평균 단계)·역·학교 */}
      {map3dSupported(region) && (
        <p className="rise-in -mt-2 mb-4 t-sub max-md:-mt-1 max-md:mb-3">
          <Link href={map3dPath(region, dong)} prefetch={false} className="tap-line font-bold text-primary">
            {dong} 3D로 보기 ›
          </Link>
          <span className="ml-1.5 t-caption text-text-3">단지 · 역 · 학교 · 건물 높이</span>
        </p>
      )}

      <div className="grid grid-cols-1 gap-4 max-md:gap-3 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-5">
        <div className="min-w-0">
          {/* 월별 추이 — 신고가 끝난 달과 들어오는 중인 달을 가른다(reporting-window). 서비스 키 없음 · 실패면 그 조각을 뺀다 */}
          {last12.length > 0 && (
            <section className="rise-in-1 card mb-4 p-[var(--pad-card)] max-md:mb-3">
              <h2 className="t-section text-ink">월별 매매 신고</h2>
              <p className="mt-0.5 t-caption text-text-3">
                최근 12개월 · 계약월 기준 · 중앙값은 그 달 거래금액{older12 > 0 ? ` · 그 앞 12개월 ${n(older12)}건` : ""}
              </p>
              <MiniBar
                className="mt-3"
                label="월별 매매 신고 건수"
                unit="건"
                rows={last12.map((m) => ({
                  label: `${ymDot(m.ym)}${m.open ? " 집계 중" : ""}`,
                  value: m.count,
                  note: m.medianKrw ? `중앙값 ${formatKrwShort(m.medianKrw)}` : undefined,
                }))}
              />
            </section>
          )}
          {statsFailed && (
            <p className="mb-4 rounded-xl bg-bg px-4 py-3 t-sub text-text-3 max-md:mb-3">월별 추이 불러오기 실패 · 잠시 후 다시</p>
          )}

          {/* 면적대별 — 최근 12개월 · 거래 0 구간은 없음 */}
          {bands.length > 0 && (
            <section className="rise-in-1 card mb-4 p-[var(--pad-card)] max-md:mb-3">
              <h2 className="t-section text-ink">면적대별 거래금액</h2>
              <p className="mt-0.5 t-caption text-text-3">최근 12개월 · 전용면적 기준 · {bands.length}구간</p>
              <div data-tone="blue">
                <HScroll className="lq-panel mt-3 max-md:mt-2">
                  <table className="w-full whitespace-nowrap text-left t-body">
                    <thead>
                      <tr className="border-b border-border t-sub text-text-3">
                        <th className="py-2 font-medium">전용면적</th>
                        <th className="py-2 pl-3 text-right font-medium">중앙값</th>
                        <th className="py-2 pl-3 text-right font-medium">평균</th>
                        <th className="py-2 pl-3 text-right font-medium">거래</th>
                      </tr>
                    </thead>
                    <tbody>
                      {bands.map((b) => (
                        <tr key={b.slug} className="border-b border-border last:border-b-0">
                          <td className="py-2.5 font-bold text-ink">
                            {txRegion ? (
                              <Link
                                href={`/tx/${encodeURIComponent(regionSlug)}/area/${b.slug}`}
                                className="tap-line text-primary no-underline"
                              >
                                {b.label}
                              </Link>
                            ) : (
                              b.label
                            )}
                          </td>
                          <td className="py-2.5 pl-3 text-right t-num font-bold text-ink">{formatKrwShort(b.medianKrw)}</td>
                          <td className="py-2.5 pl-3 text-right tabular-nums text-text-2">{formatKrwShort(b.avgKrw)}</td>
                          <td className="py-2.5 pl-3 text-right tabular-nums text-text-2">{n(b.count)}건</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </HScroll>
              </div>
            </section>
          )}

          {/* 단지 표 — 거래 많은 순 · 30곳 + 접힌 나머지(네이티브 details · JS 0) */}
          <section className="rise-in-2 card mb-4 p-[var(--pad-card)] max-md:mb-3">
            <h2 className="t-section text-ink">단지별 거래</h2>
            <p className="mt-0.5 t-caption text-text-3">최근 6개월 거래 많은 순 · 거래 평균은 전 기간 매매 평균</p>
            <div data-tone="blue">
              <HScroll className="lq-panel mt-3 max-md:mt-2">
                <table className="w-full whitespace-nowrap text-left t-body">
                  <thead>
                    <tr className="border-b border-border t-sub text-text-3">
                      <th className="py-2 font-medium">단지</th>
                      <th className="py-2 pl-3 text-right font-medium">준공</th>
                      <th className="py-2 pl-3 text-right font-medium">세대</th>
                      <th className="py-2 pl-3 text-right font-medium">6개월</th>
                      <th className="py-2 pl-3 text-right font-medium">전 기간</th>
                      <th className="py-2 pl-3 text-right font-medium">거래 평균</th>
                      <th className="py-2 pl-3 text-right font-medium">평균 면적</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shown.map((c) => (
                      <ComplexRow key={c.id} c={c} />
                    ))}
                  </tbody>
                </table>
              </HScroll>
            </div>
            {rest.length > 0 && (
              <details className="mt-2">
                <summary className="cursor-pointer t-sub font-bold text-primary">나머지 {n(rest.length)}곳 보기</summary>
                <div data-tone="blue">
                  <HScroll className="lq-panel mt-2">
                    <table className="w-full whitespace-nowrap text-left t-body">
                      <tbody>
                        {rest.map((c) => (
                          <ComplexRow key={c.id} c={c} />
                        ))}
                      </tbody>
                    </table>
                  </HScroll>
                </div>
              </details>
            )}
          </section>

          {/* 최근 실거래 — 계약일 순 20건 */}
          {deals.length > 0 && (
            <section className="rise-in-2 card mb-4 p-[var(--pad-card)] max-md:mb-3">
              <h2 className="t-section text-ink">최근 실거래</h2>
              <p className="mt-0.5 t-caption text-text-3">계약일 순 {n(deals.length)}건 · 신고가 들어오는 중인 달 포함</p>
              <div data-tone="blue">
                <HScroll className="lq-panel mt-3 max-md:mt-2">
                  <table className="w-full whitespace-nowrap text-left t-body">
                    <thead>
                      <tr className="border-b border-border t-sub text-text-3">
                        <th className="py-2 font-medium">계약</th>
                        <th className="py-2 pl-3 font-medium">단지</th>
                        <th className="py-2 pl-3 text-right font-medium">전용</th>
                        <th className="py-2 pl-3 text-right font-medium">층</th>
                        <th className="py-2 pl-3 text-right font-medium">금액</th>
                      </tr>
                    </thead>
                    <tbody>
                      {deals.map((d, i) => (
                        <tr key={`${d.ym}-${d.day ?? 0}-${d.complexName}-${i}`} className="border-b border-border last:border-b-0">
                          <td className="py-2.5 tabular-nums text-text-2">
                            {ymDot(d.ym)}
                            {d.day ? `.${String(d.day).padStart(2, "0")}` : ""}
                          </td>
                          <td className="py-2.5 pl-3 font-bold text-ink">
                            <Link href={complexCanonicalPathFromNames(region, d.complexName)} className="tap-line text-ink no-underline hover:text-primary">
                              {d.complexName}
                            </Link>
                          </td>
                          <td className="py-2.5 pl-3 text-right tabular-nums text-text-2">{d.areaM2 ? `${Math.round(d.areaM2)}㎡` : "—"}</td>
                          <td className="py-2.5 pl-3 text-right tabular-nums text-text-2">{d.floor ?? "—"}</td>
                          <td className="py-2.5 pl-3 text-right t-num font-bold text-ink">{formatKrwShort(d.priceKrw)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </HScroll>
              </div>
            </section>
          )}

          <QaBlock title={`${dong} 실거래 Q&A`} items={faq} />
          <CitationBlock sentence={dongCitation(label, complexes.length, recent, months)} />

          <Fineprint className="mb-2">
            국토교통부 실거래가 공개시스템 신고분(해제 신고분 제외) · 계약월 기준 · 최근 6개월 건수는 단지 집계(search_complex_mv)와 같은 값 · 계약 후 신고까지 30일
            시차가 있어 {lastYm ? `${ymKo(lastYm)} 등 ` : ""}최근 달 건수는 이후 늘 수 있음 · 동은 지번 주소의 읍·면·동 토큰으로 가른 값(도로명만 있는 신고는 제외) · 집계 내집나우(naezipnow.com)
          </Fineprint>
          <AdZone placement="page_bottom" seed={3} plan={null} className="mt-6 max-md:mt-4" />
        </div>

        <aside className="flex flex-col gap-3 lg:sticky lg:top-[76px] lg:self-start">
          {others.length > 0 && (
            <section className="card rounded-2xl px-4 py-3">
              <h2 className="t-sub font-bold text-ink">{region}의 다른 동</h2>
              <p className="t-caption text-text-3">최근 6개월 거래 많은 순</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {others.map((s) => (
                  <Link
                    key={s.dong}
                    prefetch={false}
                    href={dongPath(region, s.dong)}
                    className="chip border border-line bg-bg px-3 py-1.5 t-sub font-bold text-text-2 no-underline transition-colors hover:border-primary hover:text-primary"
                  >
                    {s.dong} <span className="font-medium text-text-3">{n(s.recentTradeCount)}</span>
                  </Link>
                ))}
              </div>
            </section>
          )}
          <nav aria-label="관련 화면" data-tone="blue" className="lq-panel flex flex-col divide-y">
            {regionHubId && (
              <Link href={`/region/${encodeURIComponent(regionHubId)}`} className="flex min-h-[40px] items-center justify-between gap-2 py-2 t-sub font-bold text-ink no-underline">
                {region} 지역 실거래 · 지수 <span aria-hidden="true" className="text-text-3">›</span>
              </Link>
            )}
            {txRegion && (
              <Link href={`/tx/${encodeURIComponent(regionSlug)}`} className="flex min-h-[40px] items-center justify-between gap-2 py-2 t-sub font-bold text-ink no-underline">
                {region} 면적대·가격대 실거래 <span aria-hidden="true" className="text-text-3">›</span>
              </Link>
            )}
            {txRegion && (
              <Link href={`/imjang/${encodeURIComponent(regionSlug)}`} className="flex min-h-[40px] items-center justify-between gap-2 py-2 t-sub font-bold text-ink no-underline">
                {region} 임장 가이드 <span aria-hidden="true" className="text-text-3">›</span>
              </Link>
            )}
            <Link href="/dong" className="flex min-h-[40px] items-center justify-between gap-2 py-2 t-sub font-bold text-ink no-underline">
              다른 동 <span aria-hidden="true" className="text-text-3">›</span>
            </Link>
          </nav>
          <p className="px-1 t-caption leading-[1.6] text-text-3">
            데이터 출처: 국토교통부 실거래가 공개시스템 신고분(해제 신고분 제외){firstYm && lastYm ? ` · ${ymDot(firstYm)}~${ymDot(lastYm)}` : ""}
          </p>
          <AdZone placement="sidebar" seed={4} plan={null} className="hidden lg:block" />
        </aside>
      </div>
    </PageShell>
  );
}

function ComplexRow({ c }: { c: { id: string; name: string; region: string; buildYear: number | null; households: number | null; recentTradeCount: number; tradeCount: number; avgPriceManwon: number | null; avgAreaM2: number | null } }) {
  return (
    <tr className="border-b border-border last:border-b-0">
      <td className="py-2.5 font-bold text-ink">
        <Link href={complexCanonicalPathFromNames(c.region, c.name)} className="tap-line text-primary no-underline">
          {c.name}
        </Link>
      </td>
      <td className="py-2.5 pl-3 text-right tabular-nums text-text-2">{c.buildYear ?? "—"}</td>
      <td className="py-2.5 pl-3 text-right tabular-nums text-text-2">{c.households ? n(c.households) : "—"}</td>
      <td className="py-2.5 pl-3 text-right t-num font-bold text-ink">{n(c.recentTradeCount)}건</td>
      <td className="py-2.5 pl-3 text-right tabular-nums text-text-2">{n(c.tradeCount)}건</td>
      <td className="py-2.5 pl-3 text-right tabular-nums text-text-2">{c.avgPriceManwon ? formatKrwShort(c.avgPriceManwon * 10_000) : "—"}</td>
      <td className="py-2.5 pl-3 text-right tabular-nums text-text-2">{c.avgAreaM2 ? `${Math.round(c.avgAreaM2)}㎡` : "—"}</td>
    </tr>
  );
}
