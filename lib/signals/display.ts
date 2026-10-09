/**
 * [1048] 다요인 분석 표시 낱말 — 판(SignalBoard)이 클라이언트 화면(AI 분석 결과)에도 놓이므로
 * 엔진 전체를 싣지 않게 표시에 필요한 두 함수만 따로 둔다(첫 로드 JS 예산).
 */

/** "202608" → "2026.08" · "2026-08-01" → "2026.08" · 날짜(10자)는 그대로 점 표기 */
export function ymLabel(s: string | null | undefined): string | null {
  const t = String(s ?? "").trim();
  if (/^\d{6}$/.test(t)) return `${t.slice(0, 4)}.${t.slice(4, 6)}`;
  const d = /^(\d{4})-(\d{2})-(\d{2})/.exec(t);
  if (d) return `${d[1]}.${d[2]}.${d[3]}`;
  const m = /^(\d{4})-(\d{2})/.exec(t);
  return m ? `${m[1]}.${m[2]}` : null;
}

/** 점수 → 막대 방향 낱말(화면 · 프롬프트 공용) */
export function scoreWord(score: number | null): string {
  if (score === null) return "미반영";
  if (score >= 1) return "오름 쪽 강함";
  if (score >= 0.3) return "오름 쪽";
  if (score > -0.3) return "중립";
  if (score > -1) return "내림 쪽";
  return "내림 쪽 강함";
}
