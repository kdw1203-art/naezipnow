/* [1008 · W] 워크벤치 ↔ 결과 청크(ResultView) 공용 타입 — 타입만 있다(런타임 0바이트).
   /api/ai/context · /api/ai/analysis 응답 모양. 수치는 서버가 만들고 화면은 그리기만 한다. */
import type { Verdict } from "@/lib/ai/verdict";
import type { RiskCheck } from "@/lib/ai/insight-blocks";
import type { ComplexTradeSeries } from "@/lib/ai/result-series";
import type { RegionTrend } from "@/lib/ai/region-trend";

export type Ctx = {
  /** [1008 · 리뷰 A-9] 이번에 조회가 실패한 축("실거래가"·"지역 가격 흐름") */
  unavailable?: string[];
  complex: {
    id: string;
    name: string;
    region: string;
    price: {
      priceKrw: number;
      /** "전용 37㎡"(평형) · "60~85㎡"(면적대) */
      bandLabel: string;
      bandSlug?: string;
      unitM2?: number | null;
      basis?: "unit" | "band";
      latestYm: string;
      sample?: number | null;
    } | null;
  } | null;
  region: {
    name: string;
    snapshot: {
      avgSale: number | null;
      jeonseRatio: number | null;
      saleChangeMonthly: number | null;
      tradeCount: number | null;
      period: string;
    } | null;
    trend?: RegionTrend | null;
    demographics: { unsoldUnits: number | null; period: string } | null;
  } | null;
  rent: { wolseSharePct: number | null; medianMonthlyKrw: number | null; sample?: number | null } | null;
  supply: { upcomingHouseholds: number; upcomingComplexes: number; items?: { aptName: string | null; moveInYm: string; households: number | null }[] } | null;
  news: { items: { id: string; title: string; at: string }[] } | null;
  notes: { count: number; avgScore: number | null; latest: { id: string; title: string } | null } | null;
  macro: { baseRatePct: number | null } | null;
};

export type Footnote = {
  n: number;
  label: string;
  source: string;
  asOf: string | null;
  sample: number | null;
  href: string | null;
  ageDays: number | null;
};

export type Insight = {
  radar: { key: string; label: string; score: number | null; basis: string }[];
  flags: { key: string; level: "warn" | "info"; title: string; detail: string }[];
  signals: { key: string; label: string; state: "green" | "yellow" | "red" | "na"; basis: string }[];
  counters: string[];
  checks?: RiskCheck[];
};

export type Similar = { id: string; name: string; txCount: number };

export type ReadyState = {
  phase: "ready";
  /** 이 응답이 어느 단지 것인가(단지를 바꾸면 옛 응답을 버린다) */
  key: string;
  ctx: Ctx;
  footnotes: Footnote[];
  insight: Insight;
  similar: Similar[];
  verdict: Verdict | null;
  series: ComplexTradeSeries | null;
};

export type RunResult = {
  ok: boolean;
  source: string;
  degraded: boolean;
  reasonCode: string | null;
  markdown: string;
  structuredSummary?: { headline: string; bullets: string[] } | null;
  /** [993] 판단 카드 — 실행 입력(보정값)까지 반영한 서버 조립 결과 */
  verdict?: Verdict | null;
  runId?: string | null;
  usage?: { used: number; limit: number | null; lifetime?: true } | null;
  error?: string;
  code?: string;
  /** [1008] 어느 단지로 실행했나 — 단지를 바꾸면 옛 실행 결과를 보이지 않는다 */
  forKey?: string;
  /** [1008] 실행 시각(ms) — "내 조건 반영 · 14:32" */
  at?: number;
  /** [1008] AI 해설을 요청했나 */
  askedLlm?: boolean;
  /** [1008 · 리뷰 A-3] 결과 숫자가 쓰는 입력(calc)이 이번 실행에 들어갔나 — "내 조건 반영"은 이때만 */
  appliedCalc?: boolean;
};

export type PickedLite = { id: string; name: string; region: string };

/** [1008 · 리뷰 A-3] 관심 단지 한 줄(내 자산 구성 진단) — lastPrice* 는 가격 알림 크론이 세운 기준가(면적대 최근 6건 평균) */
export type PortfolioItem = {
  complexId: string;
  complexName: string;
  lastPriceKrw: number | null;
  lastPriceBand: string | null;
};
