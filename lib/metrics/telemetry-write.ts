/* [1106] 측정 쓰기(방문 수 · 웹 바이탈 · 클라이언트 오류 · 활동 이벤트)를 접어야 하는 실행인가.
 *
 * 왜: 매일 도는 자동 점검(.github/workflows/e2e.yml)은 운영 서비스 키로 로컬 서버를 띄워 Playwright 로 화면을 연다.
 *   활동 이벤트는 942 에서 PLATFORM_EVENTS_DISABLED=1 로 막았지만, 뒤에 생긴 익명 하루 수(1053 · /api/metrics/pageview)는
 *   이 플래그를 보지 않았다 — 운영 실측(2026-10-24~31, 운영 정지 중): 사람 방문이 0 인데 page_view_daily_agg 에 날마다
 *   102~108건(/no-such-page-xyz · /offline 같은 점검 화면 포함)이 쌓였고, 평소에도 같은 수가 "직접 방문"에 섞였다.
 *   Playwright 는 UA 에서 "Headless" 를 지워 로봇 판정(isBotAgent)으로는 걸리지 않는다.
 * 규칙: 플래그가 켜졌거나 GitHub Actions 안이면 쓰지 않는다(응답은 같게 — 클라이언트가 재시도하지 않도록). */
export function telemetryWritesDisabled(env: Readonly<Record<string, string | undefined>> = process.env): boolean {
  return env.PLATFORM_EVENTS_DISABLED === "1" || env.GITHUB_ACTIONS === "true";
}
