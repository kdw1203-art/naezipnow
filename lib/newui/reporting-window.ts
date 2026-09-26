/**
 * [1009 · H] 실거래 신고 기한 판정 — 순수 함수(서버·클라이언트·테스트 공용).
 *
 * 부동산 거래신고법 제3조: 계약일로부터 30일 안에 신고한다. 그래서 어떤 달의 계약분은 **그 달 말일 + 30일**이
 * 지나야 다 모인다. 예전 화면들은 "마지막 두 칸은 신고 중"처럼 달 수로 어림했는데, 실제 표(market_region_monthly)의
 * 마지막 달은 날짜에 따라 1칸일 때도 2칸일 때도 있다(2026-09-22: 7월분은 8/30 에 기한이 끝났고 8월분만 들어오는 중).
 * 날짜로 가른다 — 지역 화면(/region/[id])의 거래량·홈 지역 카드(월 집계)가 같은 규칙을 쓴다.
 */

const KST_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 86_400_000;

/** yyyymm 계약분의 신고 기한(말일 + 30일)이 한국 날짜로 지났는가 */
export function reportingClosed(ym: string, now: Date): boolean {
  const y = Number(ym.slice(0, 4));
  const m = Number(ym.slice(4, 6));
  if (!/^\d{6}$/.test(ym) || !(m >= 1 && m <= 12)) return false;
  /* Date.UTC(y, m, 0) = 그 달 말일(UTC 자정). 기한 날짜까지는 신고가 들어온다 */
  const deadline = Date.UTC(y, m, 0) + 30 * DAY_MS;
  const k = new Date(now.getTime() + KST_MS);
  const todayKst = Date.UTC(k.getUTCFullYear(), k.getUTCMonth(), k.getUTCDate());
  return todayKst > deadline;
}

/** yyyymm 계약분의 신고 기한 날짜 "M/D"(예: 202609 → "10/30") — 달이 아니면 null */
export function reportingDeadlineLabel(ym: string): string | null {
  const y = Number(ym.slice(0, 4));
  const m = Number(ym.slice(4, 6));
  if (!/^\d{6}$/.test(ym) || !(m >= 1 && m <= 12)) return null;
  const d = new Date(Date.UTC(y, m, 0) + 30 * DAY_MS);
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
}

/** 월별 행을 "신고가 끝난 달"과 "아직 들어오는 달"로 가른다 — 입력 순서 유지 */
export function splitByReporting<T extends { month: string }>(
  rows: readonly T[],
  now: Date,
): { closed: T[]; open: T[] } {
  const closed: T[] = [];
  const open: T[] = [];
  for (const r of rows) (reportingClosed(r.month, now) ? closed : open).push(r);
  return { closed, open };
}
