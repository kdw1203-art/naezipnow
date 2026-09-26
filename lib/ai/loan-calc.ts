/**
 * [1008 · 리뷰 A-3] 수익률 계산 도구의 대출 계산 — 원리금균등 상환(순수 함수 · 테스트 대상).
 *
 * 리뷰: "매수가·대출·임대료를 넣으면 수익률을 계산해요"라고 했지만 결과 화면 어디서도 입력(대출 비율·금리·
 * 기간)을 읽지 않았고, 임대료 입력은 아예 없었다. 입력으로 **확실히** 계산되는 것만 낸다 —
 * 대출액·월 상환액·총 이자·보유 기간 동안 낸 이자·금리 +1%p 때 월 상환액, 보유 기간을 넣으면 시세 예측과 같은
 * 시나리오 가격에 판다고 가정한 연 수익률(scenarioYields). 세금·중개비·보유세·임대료는 넣지 않는다
 * (화면이 그 사실을 적는다). 상환 기간을 비우면 30년으로 계산하고 그렇게 적는다.
 */

export interface LoanCalc {
  /** [1008] 보유 기간 뒤 시나리오 가격에 판다고 가정한 수익률(보유 기간·지역 흐름이 있을 때만) — verdict 가 채운다 */
  yields?: ScenarioYield[] | null;
  priceKrw: number;
  priceKind: "input" | "recent";
  ltvPct: number;
  ratePct: number;
  termYears: number;
  /** 상환 기간을 비워 30년으로 계산했나 */
  termAssumed: boolean;
  holdingYears: number | null;
  loanKrw: number;
  equityKrw: number;
  monthlyKrw: number;
  totalInterestKrw: number;
  /** 보유 기간 동안 낸 이자(원) — 보유 기간이 있을 때만 */
  holdingInterestKrw: number | null;
  /** 금리 +1%p 일 때 월 상환액 */
  monthlyPlus1ppKrw: number;
}

export const LOAN_DEFAULT_TERM_YEARS = 30;

/** 원리금균등 월 상환액(원) — 연이율 %, 기간 개월 */
export function monthlyPayment(principalKrw: number, annualRatePct: number, months: number): number {
  if (principalKrw <= 0 || months <= 0) return 0;
  const r = annualRatePct / 100 / 12;
  if (r === 0) return principalKrw / months;
  return (principalKrw * r) / (1 - (1 + r) ** -months);
}

/** 처음 k개월 동안 낸 이자 합(원) — 원리금균등 */
export function interestPaid(principalKrw: number, annualRatePct: number, months: number, k: number): number {
  const pay = monthlyPayment(principalKrw, annualRatePct, months);
  const r = annualRatePct / 100 / 12;
  let bal = principalKrw;
  let sum = 0;
  for (let i = 0; i < Math.min(k, months); i++) {
    const it = bal * r;
    sum += it;
    bal -= pay - it;
  }
  return sum;
}

const num = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};

/** 가격·대출 비율·금리가 있어야 계산한다(하나라도 없으면 null — 지어내지 않는다) */
export function loanCalc(params: {
  priceKrw: number | null | undefined;
  priceKind: "input" | "recent";
  ltvPct: unknown;
  ratePct: unknown;
  termYears?: unknown;
  holdingYears?: unknown;
}): LoanCalc | null {
  const price = num(params.priceKrw);
  const ltv = num(params.ltvPct);
  const rate = num(params.ratePct);
  if (price == null || price <= 0 || ltv == null || ltv <= 0 || ltv > 100 || rate == null || rate < 0 || rate > 30) return null;
  const termIn = num(params.termYears);
  const termAssumed = !(termIn != null && termIn >= 1 && termIn <= 50);
  const termYears = termAssumed ? LOAN_DEFAULT_TERM_YEARS : Math.round(termIn as number);
  const holdIn = num(params.holdingYears);
  const holdingYears = holdIn != null && holdIn > 0 && holdIn <= 50 ? holdIn : null;
  const months = termYears * 12;
  const loanKrw = Math.round(price * (ltv / 100));
  const monthly = monthlyPayment(loanKrw, rate, months);
  return {
    priceKrw: Math.round(price),
    priceKind: params.priceKind,
    ltvPct: ltv,
    ratePct: rate,
    termYears,
    termAssumed,
    holdingYears,
    loanKrw,
    equityKrw: Math.round(price) - loanKrw,
    monthlyKrw: Math.round(monthly),
    totalInterestKrw: Math.round(monthly * months - loanKrw),
    holdingInterestKrw: holdingYears != null ? Math.round(interestPaid(loanKrw, rate, months, Math.round(holdingYears * 12))) : null,
    monthlyPlus1ppKrw: Math.round(monthlyPayment(loanKrw, rate + 1, months)),
  };
}

/** k개월 상환 뒤 남은 대출 잔액(원) — 원리금균등 */
export function remainingBalance(principalKrw: number, annualRatePct: number, months: number, k: number): number {
  const pay = monthlyPayment(principalKrw, annualRatePct, months);
  const r = annualRatePct / 100 / 12;
  const n = Math.min(k, months);
  if (r === 0) return Math.max(0, principalKrw - pay * n);
  return Math.max(0, principalKrw * (1 + r) ** n - (pay * ((1 + r) ** n - 1)) / r);
}

export interface ScenarioYield {
  key: "opt" | "base" | "pess";
  /** 연 가격 변동 가정(%) — 시세 예측과 같은 시나리오 규칙(lib/ai/price-scenarios.ts) */
  annualPricePct: number;
  salePriceKrw: number;
  /** 넣은 돈 = 계약 때 내 돈 + 보유 기간 동안 낸 원리금 */
  cashOutKrw: number;
  /** 받는 돈 = 판 값 − 남은 대출 */
  cashInKrw: number;
  profitKrw: number;
  /** 넣은 돈 대비 연 수익률(%) — 세금·중개비·보유세·임대료 제외 */
  annualPct: number;
}

/**
 * [1008 · 리뷰 A-3] 보유 기간 뒤 시나리오 가격에 판다고 **가정**한 수익률 — 도구 이름("수익률 계산")이 약속하는 것.
 * 가격 가정은 시세 예측과 같은 낙관·기본·비관 연 변동률, 돈의 흐름은 원리금균등 상환 그대로다.
 * 넣은 돈(계약 때 내 돈 + 보유 기간 원리금)과 받는 돈(판 값 − 남은 대출)만 센다 — 세금·중개비·보유세·임대료는 뺀다.
 */
export function scenarioYields(
  loan: LoanCalc,
  annual: { opt: number; base: number; pess: number } | null | undefined,
): ScenarioYield[] | null {
  if (!annual || loan.holdingYears == null) return null;
  const months = loan.termYears * 12;
  const k = Math.min(months, Math.round(loan.holdingYears * 12));
  const years = k / 12;
  if (years <= 0) return null;
  const paid = loan.monthlyKrw * k;
  const balance = remainingBalance(loan.loanKrw, loan.ratePct, months, k);
  const cashOut = loan.equityKrw + paid;
  return (["opt", "base", "pess"] as const).map((key) => {
    const sale = loan.priceKrw * (1 + annual[key] / 100) ** years;
    const cashIn = sale - balance;
    const ratio = cashOut > 0 ? cashIn / cashOut : 0;
    return {
      key,
      annualPricePct: annual[key],
      salePriceKrw: Math.round(sale),
      cashOutKrw: Math.round(cashOut),
      cashInKrw: Math.round(cashIn),
      profitKrw: Math.round(cashIn - cashOut),
      annualPct: ratio > 0 ? Math.round(((ratio ** (1 / years)) - 1) * 1000) / 10 : -100,
    };
  });
}
