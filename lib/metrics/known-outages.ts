/* [1106] 운영이 멈춰 있던 날(한국 날짜) — 관리 화면 그래프가 이 날을 "방문 0"이나 "평소 수"로 읽지 않게.
 *
 * 왜: 2026-10-23 오후 ~ 11-01 아침 운영이 사용 요금 한도로 일시 정지(503 DEPLOYMENT_PAUSED)였다(배포 기록 1087 · 1097).
 *   그 사이 page_view_daily_agg 에는 하루 100건 남짓이 계속 쌓였는데, 사람이 아니라 매일 도는 자동 점검(E2E · 운영 키로
 *   로컬 서버를 띄워 화면을 연다)이 남긴 수였다 — 검색 유입은 8일 내리 0, 직접 방문은 날마다 102~108 로 거의 같았다.
 *   1106 부터 측정 쓰기는 운영 배포에서만 한다(lib/metrics/telemetry-write.ts). 이미 쌓인 그 8일은 여기서 표시만 한다(지우지 않음).
 *
 * 부분 정지일(10-23 · 11-01)은 넣지 않는다 — 그날 수의 대부분은 실제 방문이다. 문장(label)에만 적는다.
 * 새 정지가 생기면 같은 꼴로 한 줄 더한다(start ≤ end · 한국 날짜 YYYY-MM-DD). */
export type KnownOutage = { start: string; end: string; label: string };

export const KNOWN_OUTAGES: readonly KnownOutage[] = [
  { start: "2026-10-24", end: "2026-10-31", label: "운영 일시 정지 · 사용 요금 한도(10.23 오후 ~ 11.01 아침)" },
];

/** 그날이 정지 구간 안이면 그 항목, 아니면 null */
export function outageOn(day: string, list: readonly KnownOutage[] = KNOWN_OUTAGES): KnownOutage | null {
  for (const o of list) if (day >= o.start && day <= o.end) return o;
  return null;
}

/** [start, end] 안의 정지 날 수 */
export function outageDaysIn(start: string, end: string, list: readonly KnownOutage[] = KNOWN_OUTAGES): number {
  let n = 0;
  for (const o of list) {
    const s = o.start > start ? o.start : start;
    const e = o.end < end ? o.end : end;
    if (s > e) continue;
    n += Math.round((Date.parse(`${e}T00:00:00Z`) - Date.parse(`${s}T00:00:00Z`)) / 86_400_000) + 1;
  }
  return n;
}
