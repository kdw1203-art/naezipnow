/* [1012 · 규칙 8] font-extrabold(800) → font-bold(700) — 굵기 3단(400·500·700). 이 파일의 모든 자리에 적용. */
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageShell } from "../../../../components/PageShell";
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
    openGraph: { title, description, url: `https://naezipnow.com${path}`, type: "website" },
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

  /* [v4 · 규칙 2·5] 주인공 = 중앙값 하나(t-display). 나머지 수치는 구분선 행(왼쪽 이름 / 오른쪽 값).
     거래 건수·단지 수는 머리 사실 줄에 한 번만(같은 사실 한 번) */
  const stats: Array<{ label: string; value: string; hint?: string }> = [
    { label: "평균", value: formatKrwShort(cell.avgKrw) },
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
  const CHIP =
    "chip inline-flex min-h-[32px] shrink-0 items-center border border-line bg-surface px-3 t-sub font-bold text-ink no-underline hover:border-primary";
  const otherKind: BandKind = kind === "area" ? "price" : "area";

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
    <PageShell breadcrumb={`홈 › 지역별 실거래 구간 › ${region.name} › ${BAND_KIND_LABEL[kind]} ${cell.bandLabel}`}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript(crumbs) }}
      />

      {/* [v4 · 한 화면 한 가지] 제목 + 사실 한 줄 → 주인공(중앙값) + 수치 행 → 단지 구분선 행(오른쪽 평균) + 출처 한 줄 →
          다른 구간 칩 한 줄 × 2 → 링크 한 줄. 지운 것: 소개 문단(→ 사실 줄), 요약 격자 7칸(→ 주인공 + 행 4개),
          단지 표(가로 스크롤 520px → 행), 여러 줄 칩 구름(→ 한 줄 가로 스크롤), 맨 끝 설명 문단(/tx 읽는 법과 같은 말). */}
      <div className="mx-auto flex max-w-[760px] flex-col gap-8">
        <div className="flex flex-col gap-4">
          <header className="flex flex-col gap-0.5">
            <h1 className="rise-in t-title text-ink">{pageTitle(region, kind, cell)}</h1>
            <p className="t-sub text-text-3">
              {cell.txCount.toLocaleString("ko-KR")}건 · 단지 {cell.complexCount.toLocaleString("ko-KR")}곳
              {range ? ` · ${range} 신고` : ""} · 호가 아님
            </p>
          </header>
          <section aria-label={`${cell.bandLabel} 요약`} className="flex flex-col gap-3">
            <div>
              <p className="m-0 t-caption text-text-3">
                중앙값 · {kind === "area" ? "전용면적 기준" : "거래금액 기준"}
              </p>
              <p className="m-0 t-display t-num text-ink">{formatKrwShort(cell.medianKrw)}</p>
            </div>
            <dl data-tone="mint" className="card m-0 flex flex-col divide-y divide-line rounded-lg px-4">
              {stats.map((s) => (
                <div key={s.label} className="flex min-h-12 items-center justify-between gap-3 py-2.5">
                  <dt className="t-body text-text-2">
                    {s.label}
                    {s.hint && <span className="ml-1.5 t-sub text-text-3">{s.hint}</span>}
                  </dt>
                  <dd className="m-0 shrink-0 t-body t-num text-ink">{s.value}</dd>
                </div>
              ))}
            </dl>
          </section>
        </div>

        {/* 단지 목록 — [v4 · 규칙 5] 표 → 구분선 행(왼쪽 단지 + 보조 한 줄 / 오른쪽 평균) */}
        <section className="flex flex-col gap-2">
          <h2 className="flex items-baseline gap-1.5 t-section text-ink">
            거래된 단지 <span className="t-num text-text-3">{Math.min(complexes.length, 40)}</span>
            <span className="t-sub font-medium text-text-3">거래 많은 순</span>
          </h2>
          {complexesFailed ? (
            <p className="card rounded-lg px-4 py-6 text-center t-body text-text-3">단지별 내역을 불러오지 못했어요 · 잠시 후 다시 열기</p>
          ) : complexes.length === 0 ? (
            <p className="card rounded-lg px-4 py-6 text-center t-body text-text-3">단지별 내역 아직 없음</p>
          ) : (
            <>
              <ul data-tone="blue" className="card flex flex-col divide-y divide-line rounded-lg px-4">
                {complexes.map((c) => (
                  <li key={c.name}>
                    <Link
                      href={complexHrefFromNames(region.name, c.name)}
                      className="press flex min-h-14 items-center justify-between gap-x-3 py-3 no-underline"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate t-body font-bold text-ink">{c.name}</span>
                        <span className="mt-0.5 block truncate t-sub tabular-nums text-text-3">
                          {[
                            c.avgAreaM2 !== null ? `${c.avgAreaM2.toFixed(0)}㎡` : null,
                            `${c.txCount}건`,
                            `${formatKrwShort(c.minKrw)}~${formatKrwShort(c.maxKrw)}`,
                            `최근 ${formatYm(c.latestYm)}`,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                      </span>
                      <span className="flex shrink-0 items-center gap-1.5">
                        <span className="t-body t-num text-ink">{formatKrwShort(c.avgKrw)}</span>
                        <span aria-hidden="true" className="t-body text-text-3">
                          ›
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
              <p className="t-caption text-text-3">
                오른쪽 = 평균 · 국토교통부 실거래 신고{range ? ` · ${range} 신고분` : ""} · 해제 신고 제외
              </p>
            </>
          )}
        </section>

        {/* 같은 지역 다른 구간 · 다른 기준 구간 — 내부 링크. [v4] 칩 구름 → 한 줄 가로 스크롤 */}
        {(siblings.length > 0 || crossCells.length > 0) && (
          <section className="flex flex-col gap-3">
            {siblings.length > 0 && (
              <div className="flex flex-col gap-2">
                <h2 className="t-section text-ink">
                  다른 {BAND_KIND_LABEL[kind]}
                </h2>
                <div className="-mx-3.5 flex gap-2 overflow-x-auto px-3.5 [scrollbar-width:none] md:mx-0 md:px-0">
                  {siblings.map((s) => (
                    <Link key={s.bandSlug} href={`${regionHref}/${kind}/${s.bandSlug}`} className={CHIP}>
                      {s.bandLabel}
                      <span className="ml-1 font-medium text-text-3">{s.txCount.toLocaleString("ko-KR")}건</span>
                    </Link>
                  ))}
                </div>
              </div>
            )}
            {crossCells.length > 0 && (
              <div className="flex flex-col gap-2">
                <h2 className="t-section text-ink">
                  {BAND_KIND_LABEL[otherKind]}별로 보기
                </h2>
                <div className="-mx-3.5 flex gap-2 overflow-x-auto px-3.5 [scrollbar-width:none] md:mx-0 md:px-0">
                  {crossCells.map((s) => (
                    <Link key={s.bandSlug} href={`${regionHref}/${otherKind}/${s.bandSlug}`} className={CHIP}>
                      {s.bandLabel}
                      <span className="ml-1 font-medium text-text-3">{s.txCount.toLocaleString("ko-KR")}건</span>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </section>
        )}

        {/* [1012 · 규칙 5] 링크는 동사 + 대상. [v4] 설명 문단은 지우고 링크 한 줄만 */}
        <p className="t-sub text-text-3">
          <Link href={regionHref} className="tap-line font-bold text-primary no-underline">
            {region.name} 구간 전체 보기
          </Link>
          {" · "}
          <Link href="/tx" className="tap-line font-bold text-primary no-underline">
            지역별 실거래 구간 목록
          </Link>
        </p>
      </div>
    </PageShell>
  );
}
