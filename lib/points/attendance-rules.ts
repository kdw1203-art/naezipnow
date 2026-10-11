/**
 * [1056] 출석 스트릭·보상 규칙 — 순수 함수(DB·Date.now() 를 모른다).
 *
 * 왜 따로 두나: GET /api/me/attendance 는 "7일 안 가장 최근 행의 streak" 를 그대로 연속
 * 출석일로 내려보냈다. 4일 전에 마지막으로 출석한 사람도 "연속 출석 N일 · 오늘 이어가기"
 * 를 보고 눌렀는데 결과는 1일로 리셋 — 끊긴 스트릭을 이어지는 것처럼 말한 셈이다.
 * 버튼도 늘 "+10P" 였다(3일째는 20P, 7일째는 50P 인데도). 두 사실을 한 곳에서 계산한다.
 *
 * 날짜는 전부 KST "YYYY-MM-DD" 문자열(lib/points/store-db.kstDateString 과 같은 표기).
 */

export interface AttendanceRow {
  date: string;
  streak: number;
}

/** 출석 1회 지급액(기본 10P · 3일 이상 20P · 7일 이상 50P) — store-db.checkIn 과 원장 규칙(attendance + attendance_streak_3/7)의 합 */
export function attendanceRewardFor(streak: number): 10 | 20 | 50 {
  return streak >= 7 ? 50 : streak >= 3 ? 20 : 10;
}

/** "YYYY-MM-DD" 의 하루 전 — UTC 산술이라 서버 시간대와 무관 */
export function prevDateString(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d) - 86_400_000).toISOString().slice(0, 10);
}

/** 가장 최근 출석 행(날짜 문자열 사전순 최대) — 비면 null */
export function latestAttendance(rows: readonly AttendanceRow[]): AttendanceRow | null {
  let best: AttendanceRow | null = null;
  for (const r of rows) if (!best || r.date > best.date) best = r;
  return best;
}

/**
 * 지금 살아 있는 연속 출석일. 가장 최근 행이 오늘이나 어제여야 그 streak 가 유효하고,
 * 그보다 오래됐으면 끊긴 것이므로 0 이다(다음 출석은 1일부터).
 */
export function currentStreak(rows: readonly AttendanceRow[], today: string): number {
  const latest = latestAttendance(rows);
  if (!latest) return 0;
  if (latest.date === today || latest.date === prevDateString(today)) return latest.streak;
  return 0;
}

/**
 * 다음에 할 수 있는 출석의 지급액.
 *  - 오늘 아직 안 했으면: 오늘 출석 시 스트릭(어제 했으면 +1, 아니면 1)의 티어
 *  - 오늘 이미 했으면: 내일 출석 시 스트릭(오늘 streak + 1)의 티어
 */
export function nextAttendanceReward(rows: readonly AttendanceRow[], today: string): 10 | 20 | 50 {
  const latest = latestAttendance(rows);
  if (!latest) return attendanceRewardFor(1);
  if (latest.date === today) return attendanceRewardFor(latest.streak + 1);
  if (latest.date === prevDateString(today)) return attendanceRewardFor(latest.streak + 1);
  return attendanceRewardFor(1);
}
