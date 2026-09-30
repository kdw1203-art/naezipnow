/**
 * [1026b · 시나리오·비교] 시장·대출 시나리오(/analysis/scenario)에 "1025 표준"을 씌우는 문장 규칙 — 순수 함수만
 * (클라이언트·테스트 공용 · tests/unit/scenario-compare-1026b.test.ts).
 *
 * 전 캡처(before1026b/{d,m}_scenario)의 문제: 조건 입력이 긴 열로 먼저 서고, 결과 카드 여러 장이 같은 무게라 결론이 없고,
 * 다음 행동은 "이어서 분석" 칩뿐이었다. 여기서 만드는 것은 세 가지뿐이다:
 *   ① 절차 한 줄(StepLine — 조건 → 시나리오 → 결과 → 다음 행동)
 *   ② 결론 한 줄(t-title) + 판정 칩 하나 + 근거 한 줄
 *   ③ 다음 행동(채움 파랑 "살까, 빌릴까 계산" + 텍스트 링크 3)
 * **새 계산은 없다.** 숫자는 computeScenario(lib/market/scenario-calc — 화면이 원래 하던 계산) 결과를 문장으로 옮길 뿐이고,
 * 판정 칩의 경계도 새로 만들지 않는다 — burdenLabel(lib/finance/calc-summary · 대출 계산기와 같은 30 · 40).
 */
import { burdenLabel } from "@/lib/finance/calc-summary";
import { formatEokMan } from "@/lib/format/eok-man";
import type { ActionLink, Conclusion, StepPlan, VerdictTone } from "./region-conclusion";
import type { ScenarioCalc } from "./scenario-calc";

/** 원 → "164만원" · "3억 483만원" — 화면의 계산 결과 표준 표기(예전 ScenarioClient wonText 그대로). 0 이하는 "0원" */
export function scenarioWon(won: number): string {
  return won > 0 ? formatEokMan(won / 10_000, { unit: "만원" }) : "0원";
}

export type BurdenWord = "적정" | "주의" | "위험";

/** 소득 대비 부담 판정 — 비율(0.28) → burdenLabel(28) 그대로. 값을 못 내면 "위험"(예전 dsrTone 규칙 그대로) */
export function burdenOf(ratio: number): BurdenWord {
  return burdenLabel(ratio * 100) ?? "위험";
}

/** 판정 칩 톤 — 적정 good · 주의·위험 caution(칩 토큰은 3색뿐 — 빨강 칩을 새로 만들지 않는다) */
export function burdenTone(word: BurdenWord): VerdictTone {
  return word === "적정" ? "good" : "caution";
}

/** 금리 시나리오 칩 말 — 0 이면 "금리 기준", 아니면 "금리 +1.0%p"(칩 라벨과 같은 자리수) */
export function rateOffsetText(offset: number): string {
  if (offset === 0) return "금리 기준";
  return `금리 ${offset > 0 ? "+" : ""}${offset.toFixed(1)}%p`;
}

/** 시세 시나리오 칩 말 — 0 이면 "보합" */
export function priceScenarioText(pct: number): string {
  return pct === 0 ? "보합" : `시세 ${pct > 0 ? "+" : ""}${pct}%`;
}

/** 절차 — 조건(지난 단계 · 대상 · 대출 비율) → 시나리오(지난 단계 · 금리 · 시세 · 보유 기간) → 결과(현재 · 월 상환) → 다음 행동 */
export function scenarioSteps(i: {
  target: string;
  ltvPct: number;
  rateOffset: number;
  pricePct: number;
  period: string;
  pay: number;
}): StepPlan {
  return {
    steps: [
      { label: `조건 · ${i.target} · 대출 ${i.ltvPct}%` },
      { label: `시나리오 · ${[rateOffsetText(i.rateOffset), priceScenarioText(i.pricePct), i.period].join(" · ")}` },
      { label: "결과", note: `월 ${scenarioWon(i.pay)}` },
      { label: "다음 행동" },
    ],
    current: 2,
  };
}

/**
 * 결론 — "월 상환 164만원 · 금리 +1%p 시 184만원". 칩 = "소득 대비 28% 적정"(burdenLabel 그대로 · 적정 초록 · 주의·위험 주황).
 * 근거 = 지금 대비 늘어나는 월 상환 · N년 보유 이자 · 잔여 원금 · (시세 시나리오를 골랐을 때) 그 시세의 LTV.
 * 전부 결과 카드 세 장 · 보유 카드가 이미 보이던 값이다.
 */
export function scenarioConclusion(
  c: Pick<ScenarioCalc, "pay" | "payStress" | "dsr" | "holdYears" | "holdInterest" | "holdBalance" | "ltvAfter">,
  pricePct: number,
): Conclusion {
  const word = burdenOf(c.dsr);
  const title = `월 상환 ${scenarioWon(c.pay)} · 금리 +1%p 시 ${scenarioWon(c.payStress)}`;
  const sub = [
    `지금 대비 +${scenarioWon(c.payStress - c.pay)}`,
    `${c.holdYears}년 보유 이자 ${scenarioWon(c.holdInterest)}`,
    `잔여 원금 ${scenarioWon(c.holdBalance)}`,
    pricePct !== 0 ? `${priceScenarioText(pricePct)} 시 LTV ${c.ltvAfter.toFixed(0)}%` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  return { title, chip: { label: `소득 대비 ${(c.dsr * 100).toFixed(0)}% ${word}`, tone: burdenTone(word) }, sub };
}

/** 폰 접이식 손잡이의 요약 줄 — 지금 넣은 값 그대로 */
export function scenarioConditionLine(i: { ltvPct: number; incomeManwon: number; baseRate: number }): string {
  return `대출 ${i.ltvPct}% · 연 소득 ${i.incomeManwon.toLocaleString("ko-KR")}만원 · 금리 ${i.baseRate.toFixed(2)}%`;
}

/* ── 다음 행동 ─────────────────────────────────────────────────────────── */

/** 채움 파랑 — 살까, 빌릴까 계산기(이미 있는 경로 · 새 기능 없음) */
export const SCENARIO_PRIMARY = { href: "/calculator/rent-vs-buy", label: "살까, 빌릴까 계산" } as const;

/**
 * 텍스트 링크 3개 — 결정 카드 · 이 지역 알림(기존 알림함) · 지도(?region= 은 지도가 이미 읽는 지역명 — 이어서 분석 칩과 같은 값).
 * 지역을 모르면(예시 시세) 파라미터 없이 보내고 알림 링크도 "알림 받기"로 적는다(모르는 값을 지어 보내지 않는다).
 */
export function scenarioActionLinks(mapRegion: string | null | undefined): ActionLink[] {
  const m = (mapRegion ?? "").trim();
  return [
    { href: "/decide", label: "결정 카드" },
    { href: "/notifications", label: m ? "이 지역 알림" : "알림 받기" },
    { href: m ? `/map?region=${encodeURIComponent(m)}` : "/map", label: "지도에서 보기" },
  ];
}
