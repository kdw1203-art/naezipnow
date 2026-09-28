/* [1022 · 단지 분석 고도화] 시세 예측의 "내 조건"에 대출 비율·금리·상환 기간 세 칸 — 지시 3 ①
   "내 조건(TuningForm)에 있는 입력(기준 가격·대출 비율·금리·기간)으로 loan-calc 가 계산하는 총 비용이 있으면 손익분기 선".
   규칙(lib/ai/tool-tuning.ts ①): **엔진이 읽지 않는 입력은 만들지 않는다** — analysis-engine.ts buildDataSnapshot 의
   "ai-diagnosis | ai-prediction" 가지(599~608행)가 in_.ltvPct · in_.mortgageRatePct · in_.loanTermYears 를 실제로 읽는다
   (mortgageRateSensitivity). 화면은 같은 값으로 lib/ai/scenario-breakeven(loanCalc)의 손익분기 선을 그린다 → calc: true.
   lib/ai/tool-tuning-fields.ts(서버 목록)는 이번 판에서 손대지 않고(담당 범위 밖) page.tsx 가 이 목록을 뒤에 붙인다.
   라벨·자리 표시·힌트는 수익률 계산 도구의 같은 칸과 같다. */
import type { TuningField } from "@/lib/ai/tool-tuning";

export const PREDICTION_COST_FIELDS: readonly TuningField[] = [
  { kind: "number", key: "ltvPct", label: "대출 비율", unit: "%", placeholder: "예: 60", hint: "가격의 몇 %를 빌리는지 — 넣으면 손익분기 선", calc: true },
  { kind: "number", key: "mortgageRatePct", label: "금리", unit: "%", placeholder: "예: 4.2", calc: true },
  { kind: "number", key: "loanTermYears", label: "상환 기간", unit: "년", placeholder: "비우면 30년", calc: true },
];
