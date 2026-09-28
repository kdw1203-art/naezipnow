/**
 * [1022 · 단지 분석 고도화] 시세 예측 부채꼴 위 "비용 포함 손익분기" 선 — 순수 함수.
 *
 * 지시 3: "부채꼴 위에 목표가/손익분기 선: 내 조건(TuningForm)에 있는 입력(기준 가격·대출 비율·금리·기간)으로
 * lib/ai/loan-calc 가 계산하는 총 비용이 있으면 '비용 포함 손익분기' 수평선".
 *
 * 새 계산은 없다 — 기존 loanCalc(원리금균등)가 내는 **보유 기간 동안 낸 이자(holdingInterestKrw)** 를
 * 출발 가격에 더한 값이 선이다(보유 기간 = 시나리오가 내다보는 기간). 세금·중개보수·보유세는 loan-calc 와
 * 같이 넣지 않는다(화면이 그 사실을 적는다). 재료(대출 비율·금리)가 없으면 null — 선을 지어내지 않는다.
 */
import { loanCalc, type LoanCalc } from "@/lib/ai/loan-calc";

export interface ScenarioBreakEven {
  /** 손익분기 가격(원) = 출발 가격 + 보유 기간 이자 */
  krw: number;
  /** 보유 기간(=시나리오 기간) 동안 낸 이자(원) */
  interestKrw: number;
  years: number;
  loan: LoanCalc;
}

export function scenarioBreakEven(params: {
  startKrw: number | null | undefined;
  years: number | null | undefined;
  ltvPct: unknown;
  ratePct: unknown;
  termYears?: unknown;
}): ScenarioBreakEven | null {
  const years = Number(params.years);
  if (!Number.isFinite(years) || years <= 0) return null;
  const loan = loanCalc({
    priceKrw: params.startKrw,
    priceKind: "input",
    ltvPct: params.ltvPct,
    ratePct: params.ratePct,
    termYears: params.termYears,
    holdingYears: years,
  });
  if (!loan || loan.holdingInterestKrw == null) return null;
  return { krw: loan.priceKrw + loan.holdingInterestKrw, interestKrw: loan.holdingInterestKrw, years, loan };
}
