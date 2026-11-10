/* [1125 · 내 노트 방문 달력] 내 임장노트의 방문일을 최근 12개월 칸으로 센다(순수 함수 · 테스트 대상).
   방문일이 없는 노트는 어느 칸에도 넣지 않고 따로 센다(undated) — 작성일로 대신 채우지 않는다. */

export type VisitMonth = { ym: string; month: number; count: number; level: 0 | 1 | 2 | 3 };
export type VisitMonths = { cells: VisitMonth[]; total: number; undated: number };

export function buildVisitMonths(visitDates: ReadonlyArray<string | undefined | null>, now: Date, span = 12): VisitMonths {
  const keys: string[] = [];
  for (let i = span - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    keys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  const counts = new Map<string, number>(keys.map((k) => [k, 0]));
  let undated = 0;
  for (const v of visitDates) {
    if (!v || !/^\d{4}-\d{2}-\d{2}/.test(v)) {
      undated += 1;
      continue;
    }
    const k = v.slice(0, 7);
    if (counts.has(k)) counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  const max = Math.max(...counts.values(), 0);
  const cells = keys.map((k) => {
    const count = counts.get(k) ?? 0;
    const level: VisitMonth["level"] = count === 0 || max === 0 ? 0 : count / max > 0.66 ? 3 : count / max > 0.33 ? 2 : 1;
    return { ym: k, month: Number(k.slice(5)), count, level };
  });
  return { cells, total: cells.reduce((a, c) => a + c.count, 0), undated };
}
