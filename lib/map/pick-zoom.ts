/**
 * 지도에서 단지를 **고를 수 있는** 축척.
 *
 * ── 왜 파일 하나가 필요했나 ──────────────────────────────────────────────
 * /api/map/clusters 는 축척에 따라 다른 것을 준다: 멀리서는 묶음(개수), 가까이서는
 * 개별 단지. 그런데 그 경계값이 라우트 안에만 있어서, 지도를 부르는 화면들은
 * 저마다 "이쯤이면 단지가 오겠지" 하고 **따로** 짐작했다. [975] 분석용 지도 서랍이
 * 정확히 그 지점에서 어긋났다 — level 7(zoom 14)에서 서버는 단지 300곳을 보내는데
 * 화면은 묶음 배열(빈 값)을 그려 "이 화면에는 단지가 없어요"라고 말했다.
 *
 * 경계는 한 곳에서만 정한다. 라우트도 화면도 여기서 가져다 쓴다.
 */

/** 이 네이버 줌 이상이면 /api/map/clusters 가 개별 단지 포인트를 준다. */
export const POINT_MODE_MIN_ZOOM = 14;

/**
 * 단지를 고르라고 띄우는 지도가 처음 서는 level.
 * (level → zoom 은 mapLevelToNaverZoom: 21 - level)
 * **열자마자 고를 수 있어야** 하므로 반드시 포인트 모드 안이어야 한다 —
 * tests/unit/map-pick-zoom-975.test.ts 가 그 관계를 잠근다.
 */
export const PICK_DEFAULT_LEVEL = 6;

/** 이 줌에서 개별 단지가 오는가. */
export function isPointZoom(zoom: number): boolean {
  return Math.round(zoom) >= POINT_MODE_MIN_ZOOM;
}
