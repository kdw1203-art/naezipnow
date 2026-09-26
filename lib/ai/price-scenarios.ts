/**
 * [1008 · W] 시세 예측 — 낙관·기본·비관 세 시나리오(1~5년). **예측이 아니라 가정 계산**이다.
 *
 * 왜: 소유자 지시("데이터가 숫자나 그래프로 보여지지도 않아…") + 도구 설명("1~5년 매매 시나리오 —
 * 베이스·낙관·비관")이 약속한 것을 화면이 한 번도 그리지 않았다(대표 수치는 3개월 외삽 한 개).
 *
 * 규칙(공개 — 화면의 "가정" 줄이 그대로 말한다):
 *  · 출발점 = 이 단지 최근 실거래가(가장 많이 거래된 평형의 최근 거래 평균) 또는 사용자가 넣은 기준 가격.
 *  · 기준 속도 g = 지역 매매지수 1년 변화(한국부동산원). 없으면 최근 한 달 변화 × 12.
 *  · 기본 = g 의 절반 속도가 매년 이어진다(연 ±4% 이내로 자른다 — 지난 1년이 이례적일 수 있다).
 *  · 낙관·비관 = 기본에서 연 3%p 위·아래.
 *  · 연 복리로 0~5년 점을 만든다. 재료(출발점·g)가 없으면 null — 선을 지어내지 않는다.
 *
 * 3개월 공개 규칙(lib/ai/backtest.ts, /analysis/accuracy 적중률)과는 다른 계산이라 화면에서 섞지
 * 않는다 — 3개월 값은 verdict 의 "3개월 뒤(공개 규칙)" 숫자로 따로 둔다.
 */

export const SCENARIO_RULE = {
  /** 기본 = 지난 1년 속도 × 0.5 */
  baseShare: 0.5,
  /** 기본 속도 상한(연 %) */
  baseCapPct: 4,
  /** 낙관·비관 = 기본 ± 연 %p */
  spreadPct: 3,
  /** 그리는 최대 기간(년) */
  maxYears: 5,
} as const;

export type ScenarioKey = "opt" | "base" | "pess";

export interface PriceScenario {
  startKrw: number;
  /** 출발 시점 yyyymm (없으면 null) */
  startYm: string | null;
  /** 출발점이 무엇인가 */
  startKind: "recent" | "input";
  /** 기준 속도(연 %) 와 그 출처 */
  anchorPct: number;
  anchorKind: "yoy" | "mom12";
  /** 시나리오별 연 변동률(%) */
  annual: Record<ScenarioKey, number>;
  /** 사용자가 고른 기간(1·3·5년) */
  years: number;
  /** 0~years 년 점(원) */
  path: { year: number; opt: number; base: number; pess: number }[];
}

const r1 = (n: number) => Math.round(n * 10) / 10;

export function clampYears(horizonMonths: number | null | undefined): number {
  const m = Number(horizonMonths);
  if (!Number.isFinite(m) || m <= 0) return 1;
  return Math.max(1, Math.min(SCENARIO_RULE.maxYears, Math.round(m / 12)));
}

export function buildPriceScenario(input: {
  startKrw: number | null | undefined;
  startYm?: string | null;
  startKind?: "recent" | "input";
  yoyPct?: number | null;
  momPct?: number | null;
  horizonMonths?: number | null;
}): PriceScenario | null {
  const start = Number(input.startKrw);
  if (!Number.isFinite(start) || start <= 0) return null;
  let anchor: number | null = null;
  let anchorKind: PriceScenario["anchorKind"] = "yoy";
  if (input.yoyPct != null && Number.isFinite(input.yoyPct)) anchor = input.yoyPct;
  else if (input.momPct != null && Number.isFinite(input.momPct)) {
    anchor = input.momPct * 12;
    anchorKind = "mom12";
  }
  if (anchor == null) return null;

  const cap = SCENARIO_RULE.baseCapPct;
  const base = r1(Math.max(-cap, Math.min(cap, anchor * SCENARIO_RULE.baseShare)));
  const annual = {
    opt: r1(base + SCENARIO_RULE.spreadPct),
    base,
    pess: r1(base - SCENARIO_RULE.spreadPct),
  };
  const years = clampYears(input.horizonMonths);
  const path: PriceScenario["path"] = [];
  for (let y = 0; y <= years; y++) {
    path.push({
      year: y,
      opt: Math.round(start * (1 + annual.opt / 100) ** y),
      base: Math.round(start * (1 + annual.base / 100) ** y),
      pess: Math.round(start * (1 + annual.pess / 100) ** y),
    });
  }
  return {
    startKrw: Math.round(start),
    startYm: input.startYm ?? null,
    startKind: input.startKind ?? "recent",
    anchorPct: r1(anchor),
    anchorKind,
    annual,
    years,
    path,
  };
}

/** "+4%" · "−1.5%" · "0%" — 부호를 늘 붙인다(변동률 표기). digits = 소수 최대 자리 */
export function signedPct(n: number, digits = 1): string {
  const f = 10 ** digits;
  const r = Math.round(n * f) / f;
  if (r === 0) return "0%";
  const v = Math.abs(r).toLocaleString("ko-KR", { maximumFractionDigits: digits });
  return `${r > 0 ? "+" : "−"}${v}%`;
}

/** 화면의 "가정" 한 줄 — 규칙을 숫자와 함께 그대로 말한다 */
export function scenarioAssumptionLine(s: PriceScenario): string {
  const anchor =
    s.anchorKind === "yoy"
      ? `지역 매매지수 지난 1년 ${signedPct(s.anchorPct)}`
      : `지역 매매지수 최근 한 달 변화×12 ${signedPct(s.anchorPct)}`;
  return `기본은 ${anchor}의 절반 속도(연 ±${SCENARIO_RULE.baseCapPct}% 이내)가 이어진다는 가정, 낙관·비관은 기본에서 연 ${SCENARIO_RULE.spreadPct}%p 위·아래예요. 예측이 아니라 가정 계산이에요.`;
}
