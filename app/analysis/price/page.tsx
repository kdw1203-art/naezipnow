/* [1012 · 규칙 8] font-extrabold(800) → font-bold(700) — 굵기 3단(400·500·700). 이 파일의 모든 자리에 적용. */
import Link from "next/link";
import { TOOL_PERSONAS, personaVars } from "@/lib/ai/tool-persona";
import { PageShell } from "../../components/PageShell";
import { AnalysisCrossLinks } from "../AnalysisCrossLinks";
import { Bars } from "@/app/components/viz/Bars";
import { RankBars } from "@/app/components/viz/RankBars";
import { findTemperatureRegionIdByName } from "@/lib/market/temperature";
import { buildPageMetadata } from "@/lib/seo/page-metadata";
import {
  listTxRegions,
  listBandComplexes,
  type BandCell,
  type BandComplex,
} from "@/lib/market/tx-bands";
import { RegionSelect } from "./RegionSelect";
import { complexHrefFromNames } from "@/lib/seo/complex-slug";
import { pickRegionByAnyName } from "@/lib/regions/param";
import { findCatalogRegionById } from "@/lib/region/catalog";
import { formatKrwWon } from "@/lib/format/krw";
import { Explain } from "@/app/components/explain/Explain";
import { BandTable, PYEONG_HOW, manPerPyeong } from "./BandTable";
/* [v4] 네이비 ToolHero(아이콘 타일·성격 배지·하는 일 문장·KPI 4칸·중복 막대)를 쓰지 않는다 — 흰 바탕 머리 + 주인공 숫자 하나 */

/* 면적대별 **실거래** 시세 분석 — 예전엔 이 경로가 손으로 적은 "적정가 산정 예시"
   (수치 전부 하드코딩)였다. 이제 tx_band_landing/complex 뷰(국토교통부 실거래)
   위에서 지역×면적대 평단가·중앙값·건수·단지수를 읽고, 같은 면적대의 지역 분위와
   면적 프리미엄(소형/대형 평단가 역전)을 계산한다. /tx 지역 랜딩과 색인 경쟁을
   피하려 noIndex 는 유지 — 여긴 SEO 페이지가 아니라 상호작용 분석 도구다. */
export const metadata = buildPageMetadata({
  title: "면적대별 실거래 시세 분석",
  description:
    "국토교통부 실거래가로 지역·면적대별 평단가와 지역 분위를 비교하고, 소형·대형 평단가 역전(면적 프리미엄)까지 한눈에 봅니다.",
  path: "/analysis/price",
  noIndex: true,
});

/* [1010] 1h → 1일. 이 화면의 원천은 하루 1회 적재되는 국토부 실거래·집계이고,
   적재 직후 lib/cache/invalidate.ts SOURCE_MAP.molit(+reb)이 이 경로를 이미 비운다 —
   시간 TTL 은 안전망일 뿐이다. 실측(2026-09-20~22) 이 축의 분석 화면은 하루 수천 회
   렌더되는데 사람 방문은 7일 합계 ~120건이고, 크롤러 재방문 간격은 ≈2.2일이라
   1시간 눈금은 방문마다 재렌더를 뜻했다. */
export const revalidate = 86_400;

/** [970 · B-31] 원 → "8.5억"(0.1 단위) — 같은 화면의 지역 카드가 "short"(28.8억)인데 여기만
    "eok"(8.51억·3.58억)라 소수 자릿수가 섞였다. lib/format/krw.ts "short" 로 통일. */
function eok(won: number): string {
  return formatKrwWon(won, { style: "short" });
}

/** "202607" → "2026.07" */
function ymLabel(ym: string | null): string {
  if (!ym || ym.length < 6) return "";
  return `${ym.slice(0, 4)}.${ym.slice(4, 6)}`;
}

function EmptyState({ msg }: { msg: string }) {
  /* [v4 · 규칙 8] 빈 상태 한 줄 + 링크 하나(가운데 정렬은 빈 화면에서만) */
  return (
    <div className="mx-auto mt-8 flex max-w-[560px] flex-col items-center gap-2 text-center">
      <p className="t-body font-bold text-ink">실거래 시세를 불러오지 못했어요 · {msg}</p>
      <Link href="/tx" className="tap-line t-sub font-bold text-primary no-underline">
        지역별 실거래 보기 ›
      </Link>
    </div>
  );
}

export default async function PricePage({
  searchParams,
}: {
  searchParams: Promise<{ region?: string }>;
}) {
  const sp = await searchParams;
  let regions;
  try {
    regions = await listTxRegions();
  } catch {
    return (
      <PageShell breadcrumb="AI 분석 · 면적대별 시세">
        <EmptyState msg="잠시 후 다시 열기" />
      </PageShell>
    );
  }

  // 면적대 셀이 있는 지역만(가격대만 있는 지역 제외)
  const areaRegions = regions.filter((r) => r.areaCells.length > 0);
  if (areaRegions.length === 0) {
    return (
      <PageShell breadcrumb="AI 분석 · 면적대별 시세" toolScope={personaVars(TOOL_PERSONAS["market:price"])}>
        <EmptyState msg="면적대별로 정리된 실거래 없음" />
      </PageShell>
    );
  }

  /* [D62] `?region=` 은 화면마다 다른 말로 온다 — 지도는 "서울 강남구",
     타이밍·시나리오는 "gangnam", 여기 목록은 "서울-강남구". 예전에는 정확히
     일치할 때만 찾고 **아니면 조용히 첫 지역으로** 갔다: 사용자는 자기가 고른
     줄 알았던 다른 동네의 숫자를 봤다. 이제 어느 말로 와도 찾고, 정말 없으면
     못 찾았다고 화면에 적는다. */
  const wanted = (sp.region ?? "").trim();
  /* 카탈로그 id("gangnam")로 오는 경우가 있다 — 타이밍·시나리오가 쓰는 말이다.
     이 목록에는 id 칸이 없으므로(실거래 집계는 슬러그·한글명뿐), 먼저 id 를
     한글 지역명으로 옮긴 뒤 같은 매칭을 한 번 더 돌린다. 서버 전용 import 라
     클라이언트 번들에는 영향이 없다. */
  const wantedAsName = wanted ? (findCatalogRegionById(wanted)?.name ?? null) : null;
  const matched =
    (wanted ? pickRegionByAnyName(wanted, areaRegions) : null) ??
    (wantedAsName ? pickRegionByAnyName(wantedAsName, areaRegions) : null);
  const target = matched ?? areaRegions[0];
  const regionMissed = Boolean(wanted) && !matched;

  // 지역 분위 — 같은 면적대의 평단가를 수록 지역끼리 줄 세운다
  const perByBand = new Map<string, number[]>();
  for (const r of areaRegions) {
    for (const c of r.areaCells) {
      if (c.avgPerPyeongKrw && c.avgPerPyeongKrw > 0) {
        const arr = perByBand.get(c.bandSlug) ?? [];
        arr.push(c.avgPerPyeongKrw);
        perByBand.set(c.bandSlug, arr);
      }
    }
  }
  for (const arr of perByBand.values()) arr.sort((a, b) => a - b);

  /** 이 면적대·평단가가 수록 지역 중 상위 몇 %인가 (표본 8곳 미만이면 null). */
  function topPercentOf(bandSlug: string, v: number): number | null {
    const arr = perByBand.get(bandSlug);
    if (!arr || arr.length < 8) return null;
    const below = arr.filter((x) => x <= v).length;
    return Math.max(1, 100 - Math.round((below / arr.length) * 100));
  }

  const cells = target.areaCells; // 면적 순서(좁은 → 넓은)로 이미 정렬됨

  // 가장 거래 많은 면적대 → 대표 단지
  const busiest = [...cells].sort((a, b) => b.txCount - a.txCount)[0] ?? null;
  let topComplexes: BandComplex[] = [];
  if (busiest) {
    topComplexes = await listBandComplexes(target.name, "area", busiest.bandSlug, 8).catch(() => []);
  }

  // 면적 프리미엄 — 평단가 최고/최저 면적대
  const withPer = cells.filter((c): c is BandCell & { avgPerPyeongKrw: number } =>
    Boolean(c.avgPerPyeongKrw && c.avgPerPyeongKrw > 0),
  );
  const hiBand = withPer.length
    ? withPer.reduce((a, b) => (b.avgPerPyeongKrw > a.avgPerPyeongKrw ? b : a))
    : null;
  const loBand = withPer.length
    ? withPer.reduce((a, b) => (b.avgPerPyeongKrw < a.avgPerPyeongKrw ? b : a))
    : null;
  const premiumRatio =
    hiBand && loBand && loBand.avgPerPyeongKrw > 0
      ? hiBand.avgPerPyeongKrw / loBand.avgPerPyeongKrw
      : null;
  // 최고 평단가 면적대가 작은 평형이면 '소형 프리미엄', 큰 평형이면 '대형 프리미엄'
  const smallSlugs = new Set(["under-60", "60-85"]);
  const premiumKind = hiBand
    ? smallSlugs.has(hiBand.bandSlug)
      ? "소형"
      : "대형"
    : null;

  /* 평단가 막대 — 값이 없으면 그리지 않는다(만원/평) */
  const perValues = cells.map((c) => Math.round((c.avgPerPyeongKrw ?? 0) / 10_000));

  const selectRegions = areaRegions.map((r) => ({
    slug: r.slug,
    name: r.name,
    txCount: r.txCount,
  }));
  const timingId = findTemperatureRegionIdByName(target.name);

  return (
    <PageShell breadcrumb="AI 분석 · 면적대별 실거래 시세">
      {/* [v4 · 한 화면 한 가지] 머리(제목 + 지역 선택 + 사실 한 줄) → 주인공(거래 최다 면적대 중앙값) + 프리미엄 한 줄 →
          면적대 구분선 행(오른쪽 평단가) → 평단가 막대 → 상위 단지 막대 → 이어서 분석 행.
          지운 것: 네이비 히어로·아이콘 타일·"성격" 배지·하는 일 문장·lead 문장·KPI 4칸(→ 주인공 + 사실 줄),
          히어로 안의 같은 막대(평단가 곡선과 중복), 오른쪽 인사이트 카드 3장(해석 문장 → 사실 한 줄, 링크 → 한 줄),
          표의 "평단가 최고" 배지. 데스크톱 2열(본문 + 340px 사이드) → 가운데 한 줄. */}
      <div className="mx-auto flex w-full max-w-[760px] flex-col gap-8">
        <div className="flex flex-col gap-4">
          {/* [D62] 넘겨받은 지역을 못 찾았으면 **그 사실을 말한다.** — 조용히 첫 지역으로 갈아타지 않는다 */}
          {regionMissed && (
            <p className="rounded-lg border border-warning-border bg-warning-soft px-3.5 py-2.5 t-sub text-warning">
              “{wanted}” 실거래 집계 없음 — 대신 <b>{target.name}</b>
            </p>
          )}
          <header className="flex flex-col gap-1">
            <div className="flex items-center justify-between gap-3">
              <h1 className="t-title text-ink">면적대별 실거래 시세</h1>
              <RegionSelect regions={selectRegions} current={target.slug} />
            </div>
            <p className="t-sub text-text-3">
              {target.name} · {target.txCount.toLocaleString("ko-KR")}건 · 단지 {target.complexCount.toLocaleString("ko-KR")}곳 ·{" "}
              {ymLabel(target.firstYm)}~{ymLabel(target.latestYm)} 국토교통부 신고
            </p>
          </header>

          {/* [v4 · 규칙 2] 주인공 — 거래가 가장 많은 면적대의 중앙값 하나 */}
          {busiest && (
            <section aria-label="대표 면적대" className="flex flex-col gap-0.5">
              <p className="m-0 t-caption text-text-3">
                거래 최다 {busiest.bandLabel} · {busiest.txCount.toLocaleString("ko-KR")}건 · 중앙값
              </p>
              <p className="m-0 t-display t-num text-ink">{eok(busiest.medianKrw)}</p>
              {/* 면적 프리미엄 — 해석 문장 없이 사실 한 줄(평단가 최고 ÷ 최저) */}
              {hiBand && premiumKind && premiumRatio && loBand && loBand.bandSlug !== hiBand.bandSlug && (
                <p className="m-0 inline-flex flex-wrap items-center gap-0.5 t-sub text-text-2">
                  평단가 최고 {hiBand.bandLabel} {manPerPyeong(hiBand.avgPerPyeongKrw)} · {loBand.bandLabel} 대비{" "}
                  <b className="t-num text-ink">{premiumRatio.toFixed(2)}배</b> · {premiumKind} 프리미엄
                  <Explain term="pyeongdanga" how={PYEONG_HOW} size={12} />
                </p>
              )}
            </section>
          )}
        </div>

        {/* 면적대 목록 — 행 오른쪽 평단가 */}
        <BandTable
          cells={cells}
          topByBand={Object.fromEntries(
            cells.map((c) => [c.bandSlug, c.avgPerPyeongKrw ? topPercentOf(c.bandSlug, c.avgPerPyeongKrw) : null]),
          )}
        />

        {/* 평단가 막대 — 차트는 그대로(예전 히어로 안의 같은 막대는 뺐다) */}
        {perValues.some((v) => v > 0) && (
          <section className="flex flex-col gap-2 text-success" data-reveal="">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="t-section text-ink">면적대별 평단가</h2>
              <span className="t-caption text-text-3">만원/평</span>
            </div>
            <div className="card rounded-lg px-3 py-3">
              <Bars
                values={perValues}
                labels={cells.map((c) => c.bandLabel)}
                height={150}
                valueSuffix="만"
                ariaLabel="면적대별 평단가"
              />
            </div>
          </section>
        )}

        {/* 대표 단지 — 거래 많은 순 막대(단지 링크) + 이 지역 실거래 상세 링크 */}
        {busiest && topComplexes.length > 0 && (
          <section className="flex flex-col gap-2 text-primary" data-reveal="">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="t-section text-ink">{busiest.bandLabel} 상위 단지</h2>
              <span className="t-caption text-text-3">거래 많은 순</span>
            </div>
            <div className="card rounded-lg px-4 py-3">
              <RankBars
                rows={topComplexes.map((c, i) => ({
                  key: `${c.name}-${i}`,
                  label: c.name,
                  value: c.txCount,
                  href: complexHrefFromNames(target.name, c.name),
                }))}
                suffix="건"
              />
            </div>
            <p className="t-caption text-text-3">
              평균 {topComplexes.slice(0, 3).map((c) => `${c.name} ${eok(c.avgKrw)}`).join(" · ")}
            </p>
            <Link href={`/tx/${encodeURIComponent(target.slug)}`} className="tap-line w-fit t-sub font-bold text-primary no-underline">
              {target.name} 전체 실거래·단지 보기 ›
            </Link>
          </section>
        )}

        {/* #411 — 도구 간 이어가기: 보던 지역 그대로 타이밍·시나리오·지도로 */}
        <AnalysisCrossLinks
          current="price"
          regionLabel={target.name}
          regionFor={{
            map: target.name,
            ...(timingId ? { timing: timingId, scenario: timingId } : {}),
          }}
          note={{
            label: "이 지역 노트 쓰기",
            href: `/notes/new?region=${encodeURIComponent(target.name)}`,
          }}
        />
      </div>
    </PageShell>
  );
}
