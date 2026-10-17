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

/**
 * [1070] 지도 없이도 "이 화면의 단지"를 물어볼 수 있게 — 중심·축척으로 대략의 경계 상자를 만든다.
 *
 * 왜 필요한가(실측 2026-10-16): 지도 SDK 가 뜨지 않으면 NaverMap 은 OSM 대체 지도로 내려가는데,
 * 거기에는 **마커가 없다**. 뷰포트 조회는 지도의 onIdle 에서만 돌았으므로 그때는 목록도 비었고,
 * 결국 고를 길이 검색 하나만 남았다(소유자: "지도에서 단지를 누르면 분석으로 넘어가지 않는 것 같아").
 * 서랍이 열리는 순간 이 상자로 한 번 물어보면, 지도가 떠도 안 떠도 목록은 선다.
 * 지도가 뜨면 곧바로 onIdle 이 **진짜** 경계로 덮어쓴다 — 이 값은 첫 화면용 근사치다.
 *
 * 위도 1도 ≈ 111.32km, 경도 1도 ≈ 111.32km × cos(위도). 네이버 줌의 해상도는
 * 156543.03392 × cos(위도) / 2^zoom m/px (웹 메르카토르 표준).
 */
export function approxBounds(
  center: { lat: number; lng: number },
  zoom: number,
  widthPx = 880,
  heightPx = 420,
): { swLat: number; neLat: number; swLng: number; neLng: number } {
  const rad = (center.lat * Math.PI) / 180;
  const mPerPx = (156543.03392 * Math.cos(rad)) / Math.pow(2, zoom);
  const halfW = (widthPx * mPerPx) / 2;
  const halfH = (heightPx * mPerPx) / 2;
  const dLat = halfH / 111_320;
  const dLng = halfW / (111_320 * Math.max(Math.cos(rad), 0.01));
  return {
    swLat: center.lat - dLat,
    neLat: center.lat + dLat,
    swLng: center.lng - dLng,
    neLng: center.lng + dLng,
  };
}

/** level(네이버 지도 단계) → zoom. 두 곳에서 따로 계산하지 않도록 여기 한 줄로 둔다. */
export function levelToZoom(level: number): number {
  return 21 - level;
}
