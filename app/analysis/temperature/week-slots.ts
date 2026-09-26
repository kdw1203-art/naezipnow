/**
 * [1009 · A] 주간 기록 → 달력 주 칸 — 순수 함수(테스트 대상).
 *
 * 온도 기록은 주마다 한 행이고, 수집이 멈춘 주는 행 자체가 없다(이 페이지 Q&A: "앞뒤 값으로 보간하지 않습니다").
 * 행만 이어 그리면 빠진 주를 선이 건너 **이어 붙여** 보간한 것처럼 보인다. 그래서 첫 주~마지막 주를 7일 간격
 * 칸으로 펴고, 행이 없는 주는 null — 훑는 선(ScrubLine)이 그 자리를 점선으로 끊는다.
 */
export function weekSlots<T extends { weekStart: string }>(history: readonly T[], max = 60): { weekStart: string; row: T | null }[] {
  if (history.length === 0) return [];
  const byWeek = new Map(history.map((h) => [h.weekStart, h]));
  const first = Date.parse(`${history[0].weekStart}T00:00:00Z`);
  const last = Date.parse(`${history[history.length - 1].weekStart}T00:00:00Z`);
  if (!Number.isFinite(first) || !Number.isFinite(last) || last < first) {
    return history.map((h) => ({ weekStart: h.weekStart, row: h }));
  }
  const out: { weekStart: string; row: T | null }[] = [];
  for (let t = first; t <= last && out.length < max; t += 7 * 86_400_000) {
    const ws = new Date(t).toISOString().slice(0, 10);
    out.push({ weekStart: ws, row: byWeek.get(ws) ?? null });
  }
  /* 기록의 월요일이 7일 간격에서 어긋나 있으면(수집 규칙이 바뀐 흔적) 칸을 만들지 않고 행 그대로 */
  if (out.filter((s) => s.row).length !== history.length) return history.map((h) => ({ weekStart: h.weekStart, row: h }));
  return out;
}
