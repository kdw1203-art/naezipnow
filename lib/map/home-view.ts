/**
 * [1027] 지도(/map) 첫 화면 — 목적지 없는 진입이 어디를 보여 주는가. 순수 값·함수(tests/unit/map-1027.test.ts).
 *
 * ── 왜 ──────────────────────────────────────────────────────────────────
 * 예전 규칙은 "서버가 준 단지 목록 좌표의 평균 + 단지 줌"이었다. 목록이 수도권 한 지역이던 때에는
 * 그 평균이 그 지역 어딘가였지만, 목록이 **전국 인기 단지 30곳**(창원·안양·수원·군포·화성…)이 된 뒤로는
 * 평균이 충북 진천의 산속(히든밸리GC 옆)에 떨어졌다. 운영 실측(2026-10-03): 처음 들어온 사람은
 * 단지 줌으로 확대된 산과 골프장을 보고, 화면 안 마커는 0개였다.
 *
 * ── 규칙 ────────────────────────────────────────────────────────────────
 *  목적지(?region·complexId·noteId·apt·lat&lng)가 없으면 서울시청을 중심으로 level 10 에서 연다.
 *  level 10(네이버 줌 11)은 운영에서 구 평균가 버블이 서로 겹치지 않는 가장 넓은 축척이다
 *  (level 11·12 는 버블이 포개져 값이 가려졌다 — 같은 날 1440폭·390폭 캡처로 확인).
 *  위치 권한이 이미 허용된 사람은 종전대로 자기 위치·단지 줌으로 옮겨진다(map-client 의 geolocation effect).
 *  탭은 "시·군·구"(city) — 이 축척에서 지도가 그리는 것이 구 평균 버블이다. 탭은 표시만이 아니라 무엇을 그릴지도
 *  정하므로(동·시군구 탭 = 지역 버블 · 단지 탭 = 단지 마커) 가장 가까운 숫자의 탭("동")이 아니라 내용이 맞는 탭을 켠다.
 */
export const MAP_HOME_VIEW = { lat: 37.5665, lng: 126.978, level: 10, tab: "city" } as const;

/** 줌 탭(시·군·구 12 / 동 9 / 단지 6) 가운데 주어진 level 에 가장 가까운 탭 */
export function nearestZoomTab<K extends string>(
  level: number,
  levelByTab: Readonly<Record<K, number>>,
): K {
  const entries = Object.entries(levelByTab) as [K, number][];
  entries.sort((a, b) => Math.abs(a[1] - level) - Math.abs(b[1] - level));
  return entries[0][0];
}

/**
 * 첫 화면의 축척. URL 의 ?z 가 있으면 그것, 목적지가 있으면 단지 줌, 둘 다 없으면 홈 화면 축척.
 * (예전: 목적지가 없어도 단지 목록이 있으면 단지 줌 — 위 "왜" 참고)
 */
export function initialMapLevel(input: {
  initialLevel: number | null;
  hasEntryFocus: boolean;
  focusLevel: number;
}): number {
  if (input.initialLevel != null) return input.initialLevel;
  return input.hasEntryFocus ? input.focusLevel : MAP_HOME_VIEW.level;
}
