/**
 * [1052] 기록 점수 구간 — 홈 공개 임장노트 배지(75점 이상 파란 배지 · Explain 문구)와 노트 표 막대가 같은 경계를 쓴다.
 * 예전 표 막대는 50점 미만을 bg-down(시세 '하락' 색)으로 칠했다 — 하락 색은 가격 방향 전용이라 점수에는 중립 회색.
 */
export const NOTE_SCORE_HIGH = 75;
export const NOTE_SCORE_LOW = 50;

export type NoteScoreBand = "high" | "mid" | "low";

export function noteScoreBand(score: number): NoteScoreBand {
  if (score >= NOTE_SCORE_HIGH) return "high";
  if (score < NOTE_SCORE_LOW) return "low";
  return "mid";
}

/** 막대 색 — 높음 = 주색 · 보통 = 주색 옅게 · 낮음 = 중립 회색(방향 색 아님) */
export function noteScoreBarClass(score: number): string {
  const b = noteScoreBand(score);
  return b === "high" ? "bg-primary" : b === "mid" ? "bg-primary/60" : "bg-line-strong";
}
