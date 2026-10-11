/* [1056] 홈 "오늘의 활동" 카드의 순수 문장 규칙 — 카드(.tsx)는 단위 시험이 import 못 하므로 여기 둔다. */

export type EngagementAttendance = {
  checkedToday: boolean;
  streak: number;
  nextReward: 10 | 20 | 50;
  lastDate: string | null;
};

/** "2026-10-07" → "10/7" */
export function shortMd(date: string): string {
  const [, m, d] = date.split("-").map(Number);
  return Number.isFinite(m) && Number.isFinite(d) ? `${m}/${d}` : date;
}

/** 출석 줄 — 상태별 한 문장(사실 낱말만) */
export function attendanceLine(a: EngagementAttendance): string {
  if (a.checkedToday) return `오늘 출석 완료 · 연속 ${a.streak}일 · 내일 ${a.nextReward}P`;
  if (a.streak > 0) return `연속 출석 ${a.streak}일 · 오늘 ${a.nextReward}P`;
  if (a.lastDate) return `마지막 출석 ${shortMd(a.lastDate)} · 오늘 ${a.nextReward}P`;
  return `첫 출석 · 오늘 ${a.nextReward}P`;
}

/** 포인트·미션 줄의 링크 — 적립 가능한 주간 미션이 있으면 미션 탭으로 */
export function pointsLink(claimable: number): { href: string; label: string } {
  return claimable > 0
    ? { href: "/my/points?tab=missions", label: "적립 받기 ›" }
    : { href: "/my/points", label: "포인트·미션 ›" };
}
