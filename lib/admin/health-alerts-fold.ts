/* [999] 운영 경보 접기 — 순수(server-only 없음, 단위테스트 대상). 설명은 health-alerts.ts. */

export interface HealthAlertRow {
  checkName: string;
  severity: "critical" | "warn" | string;
  detail: string | null;
  ageHours: number | null;
  checkedAt: string;
  /** 같은 check_name 이 이 기간에 몇 번 울렸는지 */
  count: number;
  /** [999] 마지막 발생(= checkedAt) 기준으로 아직 울리고 있는지 */
  active: boolean;
  /** [999] 마지막 발생으로부터 지난 시간 */
  sinceLastHours: number;
  /** [999] 첫 발생 시각(이 기간 안) */
  firstAt: string;
}

/** [999] 발생 간격(시간)에서 "진행 중" 판정 창을 고른다 — 순수. */
export function activeWindowHours(gapsHours: readonly number[]): number {
  const positive = gapsHours.filter((g) => Number.isFinite(g) && g > 0);
  if (positive.length === 0) return 27; // 1건뿐이면 일 단위 검사로 본다(보수적)
  const minGap = Math.min(...positive);
  return minGap <= 2 ? 3 : 27;
}

/** [999] 접기 — 순수(테스트 가능). rows 는 checked_at 내림차순이어야 한다. */
export function foldHealthAlerts(
  rows: ReadonlyArray<Record<string, unknown>>,
  now: Date = new Date(),
  limit = 12,
): HealthAlertRow[] {
  type Acc = HealthAlertRow & { times: number[] };
  const folded = new Map<string, Acc>();
  for (const r of rows) {
    const key = `${String(r.check_name ?? "")}|${String(r.severity ?? "")}`;
    const at = String(r.checked_at ?? "");
    const t = Date.parse(at);
    const prev = folded.get(key);
    if (prev) {
      prev.count += 1;
      prev.firstAt = at;
      if (Number.isFinite(t)) prev.times.push(t);
      continue;
    }
    folded.set(key, {
      checkName: String(r.check_name ?? ""),
      severity: String(r.severity ?? "warn"),
      detail: r.detail == null ? null : String(r.detail),
      ageHours: r.age_hours == null ? null : Number(r.age_hours),
      checkedAt: at,
      firstAt: at,
      count: 1,
      active: false,
      sinceLastHours: 0,
      times: Number.isFinite(t) ? [t] : [],
    });
  }
  const nowMs = now.getTime();
  const out: HealthAlertRow[] = [];
  for (const a of folded.values()) {
    const times = a.times.sort((x, y) => y - x); // 최신 → 과거
    const gaps: number[] = [];
    for (let i = 1; i < times.length; i += 1) gaps.push((times[i - 1] - times[i]) / 3_600_000);
    const last = times[0];
    const since = Number.isFinite(last) ? Math.max(0, (nowMs - last) / 3_600_000) : Infinity;
    const { times: _t, ...row } = a;
    void _t;
    out.push({
      ...row,
      sinceLastHours: Number.isFinite(since) ? Math.round(since * 10) / 10 : 9999,
      active: since <= activeWindowHours(gaps),
    });
  }
  const rank = (s: string) => (s === "critical" ? 0 : s === "warn" ? 1 : 2);
  return out
    .sort(
      (a, b) =>
        Number(b.active) - Number(a.active) ||
        rank(a.severity) - rank(b.severity) ||
        a.sinceLastHours - b.sinceLastHours ||
        b.count - a.count,
    )
    .slice(0, limit);
}

