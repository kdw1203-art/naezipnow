/**
 * [1026b · 시나리오·비교] 시장·대출 시나리오(/analysis/scenario)의 계산 — ScenarioClient.tsx 안에 있던 useMemo 본문을 **그대로** 옮긴 순수 함수.
 * 옮긴 이유: 화면을 결론 카드(첫 묶음) · 조건 손잡이 · 세부 결과(지연 조각)로 나누면서 세 곳이 같은 계산 결과를 봐야 한다.
 * 식·경계·반올림은 한 글자도 바꾸지 않았다(30년 원리금균등 · 스트레스 곡선 −1.0%p ~ +3.0%p 0.25%p 간격 · 보유 기간 잔여 원금 식).
 * tests/unit/scenario-compare-1026b.test.ts 가 전 캡처(before1026b/d_scenario — 8.4억 · 40% · 7,000만 · 4.19%)의 숫자로 잠근다.
 */

/** 소득 대비 부담 "위험" 경계(40%) — burdenLabel(계산기)과 같은 값. 곡선의 "넘는 첫 금리"가 쓴다 */
export const BURDEN_LIMIT = 0.4;

export const LOAN_MONTHS = 360; // 30년 원리금균등

/** 예시 기본값(데모) — 특정 단지명 없음 · 8.4억 */
export const EXAMPLE_PRICE_WON = 840_000_000;

export function monthlyPayment(principalWon: number, annualRatePct: number): number {
  const r = annualRatePct / 100 / 12;
  if (r <= 0) return principalWon / LOAN_MONTHS;
  const pow = Math.pow(1 + r, LOAN_MONTHS);
  return (principalWon * r * pow) / (pow - 1);
}

export type ScenarioInput = {
  loanWon: number;
  priceWon: number;
  rateOffset: number;
  pricePct: number;
  incomeWon: number;
  baseRate: number;
  /** "3년" | "5년" | "10년" */
  period: string;
};

export type ScenarioBar = { label: string; pay: number; color: string };

export type ScenarioCalc = {
  rate: number;
  pay: number;
  payStress: number;
  dsr: number;
  dsrStress: number;
  priceDeltaWon: number;
  ltvAfter: number;
  bars: ScenarioBar[];
  maxPay: number;
  holdYears: number;
  holdBalance: number;
  holdInterest: number;
  holdPrincipal: number;
  curve: { rate: number; pay: number }[];
  breachRate: number | null;
};

export function computeScenario({ loanWon, priceWon, rateOffset, pricePct, incomeWon, baseRate, period }: ScenarioInput): ScenarioCalc {
  const rate = Math.max(0.1, baseRate) + rateOffset;
  const pay = monthlyPayment(loanWon, rate);
  const payStress = monthlyPayment(loanWon, rate + 1);
  const dsr = (pay * 12) / incomeWon;
  const dsrStress = (payStress * 12) / incomeWon;
  const priceDeltaWon = (priceWon * pricePct) / 100;
  const newPrice = priceWon + priceDeltaWon;
  const ltvAfter = newPrice > 0 ? (loanWon / newPrice) * 100 : 0;
  const bars: ScenarioBar[] = [
    /* [975] 막대 위에는 흰 글씨가 얹힌다 — 그래서 **채움 전용 토큰**만 쓴다.
       본문용 --primary/--danger 는 다크에서 밝은 색으로 뒤집히고,
       --ai-accent 는 애초에 어두운 패널용이라 밝은 카드 위 흰 글씨가
       2.27:1 이었다(실측). 색의 뜻도 이제 맞다: 붉음=부담 증가, 초록=감소. */
    { label: `기준 ${rate.toFixed(2)}%`, pay, color: "var(--primary-fill)" },
    { label: "+1.0%p", pay: payStress, color: "var(--danger-fill)" },
    { label: "-0.5%p", pay: monthlyPayment(loanWon, Math.max(0.5, rate - 0.5)), color: "var(--success-fill)" },
  ];
  const maxPay = Math.max(...bars.map((b) => b.pay));

  /* 보유기간 배선 — 예전엔 3·5·10년 칩이 어느 계산에도 연결돼 있지 않았다.
     k개월 후 잔여 원금 B = P·((1+r)^n − (1+r)^k)/((1+r)^n − 1) (원리금균등). */
  const years = parseInt(period, 10) || 5;
  const k = Math.min(LOAN_MONTHS, years * 12);
  const r = rate / 100 / 12;
  const pow = Math.pow(1 + r, LOAN_MONTHS);
  const balance = r <= 0 ? loanWon * (1 - k / LOAN_MONTHS) : (loanWon * (pow - Math.pow(1 + r, k))) / (pow - 1);
  const paidTotal = pay * k;
  const principalPaid = loanWon - balance;
  const interestPaid = Math.max(0, paidTotal - principalPaid);

  /* 금리 스트레스 곡선 — 막대 3개(기준·+1%p·-0.5%p)로는 "어디서부터
     버거워지는가"가 안 보인다. -1.0%p ~ +3.0%p 를 0.25%p 간격으로 훑어
     월 상환액이 어떻게 휘는지를 선으로 그린다. */
  const curve: { rate: number; pay: number }[] = [];
  for (let d = -1; d <= 3.0001; d += 0.25) {
    const rr = Math.max(0.5, rate + d);
    curve.push({ rate: Math.round(rr * 100) / 100, pay: monthlyPayment(loanWon, rr) });
  }
  /* 소득 대비 40%(통상 부담 한계 — 계산기와 같은 "위험" 경계)를 넘는 첫 금리 — 없으면 null */
  const breachRate = curve.find((c) => (c.pay * 12) / incomeWon > BURDEN_LIMIT)?.rate ?? null;

  return {
    rate, pay, payStress, dsr, dsrStress, priceDeltaWon, ltvAfter, bars, maxPay,
    holdYears: years, holdBalance: balance, holdInterest: interestPaid, holdPrincipal: principalPaid,
    curve, breachRate,
  };
}
