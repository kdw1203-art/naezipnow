import { TOOL_PERSONAS, personaVars } from "@/lib/ai/tool-persona";
import { PageShell } from "@/app/components/PageShell";
import { getAllRegionSnapshots } from "@/lib/market/store";
import {
  getRegionRentYieldMap,
  rentYieldPct,
  type RegionRentYieldMap,
} from "@/lib/market/rent-yield";
import { buildPageMetadata } from "@/lib/seo/page-metadata";
import { logger } from "@/lib/log";
import { ErrorState } from "@/app/components/ui";
import { Bars } from "@/app/components/viz/Bars";
import { RankBars } from "@/app/components/viz/RankBars";
import { faqJsonLd, jsonLdScript } from "@/lib/seo/jsonld";
import { Explain } from "@/app/components/explain/Explain";
import { RankTable, type Row } from "./RankTable";



/* [3차 · AI 분석 확충] 전세가율·갭 스크리너.
 *
 * 데이터: market_region_price 전 지역 스냅샷(REB/KB 공표 통계 — 이미 매일 적재됨).
 * 화면: 전세가율 상·하위 지역 랭킹과 "추정 갭"(평균 매매가 − 평균 매매가×전세가율).
 * 원칙: 산술 사실만 서술한다. 전세가율이 높다 = 갭이 작다는 산술이지 "사도 된다"가
 * 아니며, 그 동전의 뒷면(역전세·보증금 위험)을 같은 화면에서 함께 말한다.
 * 지역 평균은 단지·면적별 편차를 가리므로 각 행이 지역 허브로 연결된다. */

export const metadata = buildPageMetadata({
  title: "전세가율·갭 스크리너 — 지역별 랭킹",
  description:
    "전국 시군구 전세가율 상·하위 랭킹과 평균 매매가 기준 추정 갭. 한국부동산원·KB 공표 통계 기반.",
  path: "/analysis/gap",
  og: { badge: "AI 분석", sub: "전세가율 랭킹 · 추정 갭 — 공표 통계 기반" },
});

/* [1010] 1h → 1일. 이 화면의 원천은 하루 1회 적재되는 국토부 실거래·집계이고,
   적재 직후 lib/cache/invalidate.ts SOURCE_MAP.molit(+reb)이 이 경로를 이미 비운다 —
   시간 TTL 은 안전망일 뿐이다. 실측(2026-09-20~22) 이 축의 분석 화면은 하루 수천 회
   렌더되는데 사람 방문은 7일 합계 ~120건이고, 크롤러 재방문 간격은 ≈2.2일이라
   1시간 눈금은 방문마다 재렌더를 뜻했다. */
export const revalidate = 86_400;

export default async function GapScreenerPage() {
  let rows: Row[] = [];
  let loadFailed = false;
  try {
    const map = await getAllRegionSnapshots();
    for (const [regionId, s] of map) {
      if (s.jeonseRatio === undefined || !Number.isFinite(s.jeonseRatio)) continue;
      if (s.jeonseRatio <= 0 || s.jeonseRatio >= 100) continue; // 자료 오류 방어
      const avgSale = s.avgSale && s.avgSale > 0 ? s.avgSale : undefined;
      rows.push({
        regionId,
        name: s.regionName,
        ratio: s.jeonseRatio,
        avgSale,
        gap: avgSale !== undefined ? Math.round(avgSale * (1 - s.jeonseRatio / 100)) : undefined,
        period: s.period,
        source: s.source,
        saleChange:
          s.saleChangeMonthly !== undefined && Number.isFinite(s.saleChangeMonthly)
            ? s.saleChangeMonthly
            : undefined,
        group: regionId.startsWith("incheon-")
          ? "인천"
          : /^[^\s]+구$/.test(s.regionName.trim())
            ? "서울"
            : "경기",
      });
    }
  } catch (e) {
    logger.error("[analysis/gap] 스냅샷 로드 실패", e);
    loadFailed = true;
  }

  /* [#94 잔여] 월세 환산 수익률 — RPC 1회로 전 지역 중앙값을 받아 행에 붙인다.
     실패는 열 결측("—")일 뿐 페이지 실패가 아니다 — 본문(전세가율)은 그대로 산다. */
  let yieldFailed = false;
  if (!loadFailed && rows.length > 0) {
    let yieldMap: RegionRentYieldMap | null = null;
    try {
      yieldMap = await getRegionRentYieldMap();
    } catch (e) {
      /* 표본이 없어서 빈 칸인 것과 조회가 실패해서 빈 칸인 것은 전혀 다른
         사실이다. 예전엔 로그만 남기고 화면에는 "—" 만 나갔다. */
      logger.error("[analysis/gap] 월세 수익률 RPC 실패 — 열 없이 렌더", e);
      yieldFailed = true;
    }
    if (yieldMap) {
      for (const r of rows) {
        const yr = yieldMap.get(r.name);
        const y = rentYieldPct(r.avgSale, yr);
        if (y !== null) r.rentYield = Math.round(y * 10) / 10;
        /* [AI-28] 전월세 신고 실측 갭 — 추정(비율 환산)을 실측으로 대체 */
        if (
          yr &&
          yr.jeonseCount >= 30 &&
          yr.jeonseMedianDepositKrw &&
          r.avgSale &&
          r.avgSale > yr.jeonseMedianDepositKrw
        ) {
          r.measuredGap = Math.round(r.avgSale - yr.jeonseMedianDepositKrw);
          r.jeonseSample = yr.jeonseCount;
        }
      }
    }
  }

  rows = rows.sort((a, b) => b.ratio - a.ratio);
  const top = rows.slice(0, 15);
  const bottom = [...rows].reverse().slice(0, 10);
  const median =
    rows.length > 0 ? rows[Math.floor(rows.length / 2)].ratio : null;
  const maxRatio = rows.length > 0 ? rows[0].ratio : 0;

  /* 분포 히스토그램 — 표만 보면 "내 지역이 높은 편인가"를 알 수 없다.
     5%p 구간으로 세어 전국이 어디 몰려 있는지를 먼저 보인다. */
  const BIN = 5;
  const binned = new Map<number, number>();
  for (const r of rows) {
    const b = Math.floor(r.ratio / BIN) * BIN;
    binned.set(b, (binned.get(b) ?? 0) + 1);
  }
  const binKeys = [...binned.keys()].sort((a, b) => a - b);
  const histValues = binKeys.map((k) => binned.get(k) ?? 0);
  const histLabels = binKeys.map((k) => `${k}%`);

  const measured = rows.filter((r) => r.measuredGap !== undefined).length;
  /* [v4 · 규칙 1] 머리 사실 한 줄 — 지역 수 · 실측 갭 지역 수 · 출처(숫자·출처만) */
  const headFact = [
    ...(rows.length > 0 ? [`수도권 ${rows.length}곳`] : []),
    ...(measured > 0 ? [`실측 갭 ${measured}곳`] : []),
    "한국부동산원·KB 공표 통계",
  ].join(" · ");
  const JEONSE_HOW = "공표 지역 통계(한국부동산원·KB)의 매매가 대비 전세가 비율 — 집계 지역을 줄 세운 가운데 값이에요.";

  /* [#55] FAQ — 화면에 보이는 문답과 같은 배열로만 JSON-LD 생성 (허위 표기 금지 규칙) */
  const faq = [
    {
      q: "전세가율이란 무엇인가요?",
      a: "매매가 대비 전세가의 비율입니다. 예를 들어 매매가 10억 원, 전세가 7억 원이면 전세가율은 70%입니다. 비율이 높을수록 매매가와 전세가의 차이(갭)가 작습니다.",
    },
    {
      q: "추정 갭은 어떻게 계산하나요?",
      a: "평균 매매가 × (1 − 전세가율)로 계산합니다. 지역 평균 기준이므로 단지·면적에 따라 실제 갭은 크게 다를 수 있습니다.",
    },
    {
      q: "전세가율이 높으면 안전한 지역인가요?",
      a: "아닙니다. 전세가율이 높다는 것은 갭이 작다는 산술일 뿐이며, 전세가 하락 시 보증금 반환 부담(역전세)과 매매가·전세가 역전 위험도 함께 커집니다.",
    },
    {
      q: "월세 환산 수익률은 어떻게 계산하나요?",
      a: "최근 3개월 그 지역 월세 신고의 중앙값을 써서, (월세 중앙값 × 12) ÷ (평균 매매가 − 월세 보증금 중앙값)으로 계산한 연 수익률입니다. 지역 평균 매매가와 단지가 뒤섞인 중앙값의 결합이라 참고 지표이며, 표본이 30건 미만인 지역은 표시하지 않습니다. 세금·수리비·공실은 반영되지 않습니다.",
    },
  ];

  return (
    <PageShell breadcrumb="AI 분석 › 전세가율·갭" toolScope={personaVars(TOOL_PERSONAS["market:gap"])}>
      {/* [v4 · 한 화면 한 가지] 머리(제목 + 사실 한 줄) → 주인공(전세가율 중앙값) + 분포 막대 → 상위·하위 순위 막대 →
          시·도 전체 표(스크리너 — 7열이라 표 그대로, 칸 안 가로 스크롤) → 면책 한 줄 → 맨 끝 접힘 "자주 묻는 질문".
          지운 것: 네이비 히어로·아이콘 타일·"성격" 배지·하는 일 문장·lead·KPI 5칸(→ 주인공 + 사실 줄),
          설명 문단(여섯 줄 → 캡션 한 줄), 상위·하위 절의 중복 표(막대와 같은 순위 — 세부는 시·도 표에 한 번),
          카드 FAQ 4장(→ 접힘 하나). */}
      <div className="mx-auto flex w-full max-w-[760px] flex-col gap-8">
        <div className="flex flex-col gap-4">
          <header className="flex flex-col gap-0.5">
            <h1 className="t-title text-ink">전세가율·갭 스크리너</h1>
            <p className="t-sub text-text-3">{headFact}</p>
          </header>
          {/* [v4 · 규칙 2] 주인공 — 전세가율 중앙값 하나 + 양 끝 지역 한 줄 */}
          {rows.length > 0 && median !== null && (
            <section aria-label="전세가율 요약" className="flex flex-col gap-0.5">
              <p className="m-0 inline-flex items-center gap-0.5 t-caption text-text-3">
                전세가율 중앙값
                <Explain term="jeonse-garyul" how={JEONSE_HOW} size={12} />
              </p>
              <p className="m-0 t-display t-num text-ink">{median.toFixed(1)}%</p>
              <p className="m-0 t-sub text-text-2">
                최고 {rows[0].name} <b className="t-num text-ink">{rows[0].ratio.toFixed(1)}%</b> · 최저{" "}
                {rows[rows.length - 1].name} <b className="t-num text-ink">{rows[rows.length - 1].ratio.toFixed(1)}%</b>
              </p>
            </section>
          )}
          {histValues.length > 1 && (
            <div className="card rounded-lg px-3 pb-1 pt-2 text-success">
              <span className="block px-1 pb-1 t-caption text-text-3">전세가율 분포 · {BIN}%p 구간별 지역 수</span>
              <Bars values={histValues} labels={histLabels} height={78} valueSuffix="곳" ariaLabel="전세가율 분포 히스토그램" />
            </div>
          )}
        </div>

        {loadFailed ? (
          <ErrorState
            title="지역 시세를 지금 불러오지 못했어요"
            desc="조회 실패 · 전세가율 데이터 없음이 아님 · 잠시 후 다시 열기"
          />
        ) : rows.length === 0 ? (
          <ErrorState
            title="전세가율 데이터가 아직 없어요"
            desc="공표 통계 적재(매일) 뒤 표시"
            action={{ href: "/analysis", label: "다른 분석 도구 보기" }}
          />
        ) : (
          <>
            {yieldFailed && (
              <p className="rounded-lg border border-warning-border bg-warning-soft px-3.5 py-2.5 t-sub text-warning">
                월세 환산·실측 갭 조회 실패 — 빈 칸은 표본 없음이 아님 · 전세가율은 그대로 실측
              </p>
            )}
            <section className="flex flex-col gap-2" data-reveal="">
              <h2 className="flex items-baseline gap-1.5 t-section text-ink">
                전세가율 상위 <span className="t-num text-text-3">{top.length}</span>
                <span className="t-sub font-medium text-text-3">갭이 작은 곳</span>
              </h2>
              <div className="card rounded-lg p-3 text-success">
                <RankBars
                  rows={top.map((r) => ({
                    key: r.regionId,
                    label: r.name,
                    value: r.ratio,
                    href: `/region/${r.regionId}`,
                  }))}
                  suffix="%"
                  max={maxRatio}
                />
              </div>
              {/* 위험 고지 — 문단 → 사실 한 줄(갭이 작다 ≠ 안전하다) */}
              <p className="t-caption text-text-3">전세가율 높음 = 갭 작음 · 역전세·보증금 반환 위험도 큼 — 안전하다는 뜻 아님</p>
            </section>

            <section className="flex flex-col gap-2" data-reveal="">
              <h2 className="flex items-baseline gap-1.5 t-section text-ink">
                전세가율 하위 <span className="t-num text-text-3">{bottom.length}</span>
                <span className="t-sub font-medium text-text-3">갭이 큰 곳</span>
              </h2>
              <div className="card rounded-lg p-3 text-warning">
                <RankBars
                  rows={bottom.map((r) => ({
                    key: r.regionId,
                    label: r.name,
                    value: r.ratio,
                    href: `/region/${r.regionId}`,
                  }))}
                  suffix="%"
                  max={maxRatio}
                />
              </div>
            </section>

            {/* [#78 v2] 시도별 전체 표 — 앵커 점프로 필터를 대신한다(파라미터 없는 ISR 유지). [v4] 칩 한 줄 */}
            <section className="flex flex-col gap-3">
              <div className="flex items-baseline justify-between gap-3">
                <h2 className="t-section text-ink">시·도 전체</h2>
                <div className="flex gap-1.5 overflow-x-auto [scrollbar-width:none]" data-reveal="">
                  {(["서울", "경기", "인천"] as const).map((g) => (
                    <a
                      key={g}
                      href={`#sido-${g}`}
                      className="chip press inline-flex min-h-[32px] shrink-0 items-center border border-line bg-surface px-3 t-sub font-bold text-text-2 no-underline"
                    >
                      {g} {rows.filter((r) => r.group === g).length}
                    </a>
                  ))}
                </div>
              </div>
              {/* 갭 식 — 설명 문단(여섯 줄) → 캡션 한 줄. 세부 식은 표 머리 ⓘ */}
              <p className="t-caption text-text-3">
                갭 = 평균 매매가 − 전세 신고 중앙값(최근 3개월, 30건 이상 실측) · 그 밖은 비율 환산 추정 · 단지·면적별로 크게 다름
              </p>
              {(["서울", "경기", "인천"] as const).map((g) => {
                const groupRows = rows.filter((r) => r.group === g);
                if (groupRows.length === 0) return null;
                return (
                  <div key={g} id={`sido-${g}`} className="flex scroll-mt-20 flex-col gap-2">
                    <h3 className="flex items-baseline gap-1.5 t-sub font-bold text-text-2">
                      {g} <span className="t-num text-text-3">{groupRows.length}</span>
                    </h3>
                    <RankTable rows={groupRows} tone="high" maxRatio={maxRatio} yieldFailed={yieldFailed} />
                  </div>
                );
              })}
            </section>
          </>
        )}

        {/* 면책 한 줄 — 늘 보이게(접힘 밖) */}
        <p className="t-caption text-text-3">
          공표 통계의 산술 정리이며 투자 권유가 아닙니다 · 판단과 책임은 이용자에게 있습니다 · 기준 시점은 지역마다 다름(표의 기준 열)
        </p>

        {/* [v4 · 규칙 3] 맨 끝 접힘 하나 — FAQ(FAQPage JSON-LD 는 같은 배열) */}
        <details className="group border-t border-line pt-1">
          <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-2 t-body font-bold text-ink [&::-webkit-details-marker]:hidden">
            자주 묻는 질문
            <span aria-hidden="true" className="t-body text-text-3 transition-transform group-open:rotate-90">
              ›
            </span>
          </summary>
          <dl className="flex flex-col gap-3 pb-3 pt-1">
            {faq.map((f) => (
              <div key={f.q}>
                <dt className="t-sub font-bold text-ink">{f.q}</dt>
                <dd className="mt-0.5 t-sub text-text-2">{f.a}</dd>
              </div>
            ))}
          </dl>
          <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript([faqJsonLd(faq)]) }} />
        </details>
      </div>
    </PageShell>
  );
}
