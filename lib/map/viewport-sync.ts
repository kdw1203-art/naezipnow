/**
 * [1008 · M] 지도 화면(중심·축척) 동기화 규칙 — 순수 함수(단위검증: tests/unit/map-viewport-1008.test.ts).
 *
 * ── 왜 ──────────────────────────────────────────────────────────────────
 * 소유자 지시(2026-09-21): "지도에서 위치를 옮긴 후 확대 축소를 하면 다시 원위치로 돌아가는 오류".
 * 가짜 네이버 SDK 로 재현해 확인한 원인:
 *   NaverMap 의 effect 하나가 [center.lat, center.lng, level] 에 걸려 있어 **level 만 바뀌어도**
 *   setCenter(center prop) 을 다시 불렀다. 부모 화면은 사용자가 끌어서 옮긴 중심을 state 에 담지
 *   않으므로 center prop 은 "처음 자리" 그대로였다 → 줌이 바뀌는 순간 처음 자리로 되돌아갔다.
 *     /map   : 끌기 → 우하단 ＋ → 중심 (37.5165, 127.048) → (37.5665, 126.978), 앱 setCenter 1회
 *     서랍   : 끌기 → 지도 기본 컨트롤 － → 같은 증상(소유자 캡처)
 *   또 /map 의 ＋/－ 는 state 의 level 에서 한 칸씩 움직였는데, 핀치·휠로 바뀐 실제 줌을 몰라서
 *   핀치로 12 까지 확대한 뒤 － 를 누르면 9 로 **세 칸** 튀었다.
 *
 * ── 규칙 ────────────────────────────────────────────────────────────────
 *  1) center prop 이 **실제로 바뀌었고**, 지도가 방금 idle 로 알려 준 값의 메아리가 아니고,
 *     지도가 이미 그 자리에 있지 않을 때만 setCenter.
 *  2) level prop 만 바뀌면 setZoom 만 — 중심은 지금 지도 중심(= 사용자가 옮긴 자리) 그대로.
 *     단 1)의 "다른 곳으로 가기" 에는 그 level 도 함께 맞춘다 — idle 을 받지 않는 화면(정비사업
 *     지도 등)이 "단지를 고르면 그 축척으로 간다" 에 기대고 있어서 예전 동작을 지킨다.
 *  3) 부모는 idle 에서 받은 실제 중심·축척을 state 에 담는다(syncCenterState·syncLevelState).
 *     값이 같으면 이전 값을 그대로 돌려줘 React 가 리렌더를 건너뛴다. 이렇게 해야 ＋/－ 가 실제
 *     축척에서 한 칸씩 움직이고, 같은 단지·묶음을 다시 골라도(state 가 같은 값) 지도가 그리로 간다.
 *  메아리(1·2의 lastIdle 비교)가 idle → state → effect → setCenter → idle 의 되먹임 고리를 끊는다.
 */
import {
  NAVER_MAP_MAX_ZOOM,
  NAVER_MAP_MIN_ZOOM,
  mapLevelToNaverZoom,
} from "@/lib/map/naver-maps-sdk";

export type LatLngLite = { lat: number; lng: number };

/** 좌표 비교 허용 오차(도). 1e-7° ≈ 1cm — SDK 가 돌려주는 부동소수 흔들림만 거른다(화면 1px 보다 훨씬 작다). */
export const CENTER_EPSILON_DEG = 1e-7;
/** 줌 비교 허용 오차. 래스터 지도 줌은 정수지만 GL(분수 줌)에서의 흔들림도 거른다. */
export const ZOOM_EPSILON = 1e-3;

/** level(1=확대 … 14=축소, 네이버 zoom = 21 - level) 의 범위 — SDK 줌 범위(6~21)와 1:1. */
export const MAP_LEVEL_MIN = 21 - NAVER_MAP_MAX_ZOOM;
export const MAP_LEVEL_MAX = 21 - NAVER_MAP_MIN_ZOOM;

function finiteLatLng(p: LatLngLite | null | undefined): p is LatLngLite {
  return !!p && Number.isFinite(p.lat) && Number.isFinite(p.lng);
}

/** 두 중심이 같은 자리인가(허용 오차 안). 하나라도 모르면 false — 모를 때 "같다" 고 치면 이동을 삼킨다. */
export function sameCenter(
  a: LatLngLite | null | undefined,
  b: LatLngLite | null | undefined,
  eps = CENTER_EPSILON_DEG,
): boolean {
  if (!finiteLatLng(a) || !finiteLatLng(b)) return false;
  return Math.abs(a.lat - b.lat) <= eps && Math.abs(a.lng - b.lng) <= eps;
}

export function sameZoom(
  a: number | null | undefined,
  b: number | null | undefined,
  eps = ZOOM_EPSILON,
): boolean {
  if (a == null || b == null || !Number.isFinite(a) || !Number.isFinite(b)) return false;
  return Math.abs(a - b) <= eps;
}

export function clampLevel(level: number): number {
  return Math.min(MAP_LEVEL_MAX, Math.max(MAP_LEVEL_MIN, Math.round(level)));
}

/** level → 네이버 zoom. NaverMap 이 SDK 에 넘기는 값과 같은 식(상·하한 포함). */
export function levelToZoom(level: number): number {
  return Math.min(NAVER_MAP_MAX_ZOOM, Math.max(NAVER_MAP_MIN_ZOOM, mapLevelToNaverZoom(level)));
}

/** 네이버 zoom → level. idle 이 알려 준 실제 줌을 부모 state 로 옮길 때. */
export function zoomToLevel(zoom: number): number {
  return clampLevel(21 - zoom);
}

/**
 * ＋/－ 한 칸(delta: 확대 -1, 축소 +1). 범위 끝에서는 제자리다.
 * 예전 /map 은 1~14 로 잘랐는데, 핀치로 zoom 6(level 15)까지 간 뒤 － 를 누르면 14 로 잘려
 * **확대**가 됐다(반대로 튄다). 범위를 SDK 줌 범위와 같게 둔다.
 */
export function stepLevel(level: number, delta: number): number {
  return clampLevel(clampLevel(level) + delta);
}

export type ViewportSnapshot = { center: LatLngLite; level: number };
export type ActualViewport = { center: LatLngLite | null; zoom: number | null };
export type IdleViewport = { center: LatLngLite; zoom: number };

export type ViewportPlan = {
  /** true 면 map.setCenter(next.center) */
  setCenter: boolean;
  /** null 이 아니면 map.setZoom(값) — setCenter 다음에 부른다(새 중심 기준으로 확대·축소) */
  setZoom: number | null;
};

/**
 * props(center·level)가 바뀐 순간 지도에 무엇을 적용할지.
 * @param next     이번 렌더의 props
 * @param prev     지난번에 처리한 props(첫 적용이면 null)
 * @param actual   지금 지도의 실제 중심·줌(getCenter/getZoom)
 * @param lastIdle 지도가 마지막 idle 로 알린 중심·줌(부모가 그대로 되돌려 주면 "메아리")
 */
export function planViewportSync(input: {
  next: ViewportSnapshot;
  prev: ViewportSnapshot | null;
  actual: ActualViewport;
  lastIdle: IdleViewport | null;
}): ViewportPlan {
  const { next, prev, actual, lastIdle } = input;

  const centerChanged = !prev || !sameCenter(prev.center, next.center);
  const centerEcho = !!lastIdle && sameCenter(lastIdle.center, next.center);
  const moveRequested = centerChanged && !centerEcho;
  const setCenter = moveRequested && finiteLatLng(next.center) && !sameCenter(actual.center, next.center);

  const levelChanged = !prev || prev.level !== next.level;
  const levelEcho =
    !!lastIdle && Number.isFinite(lastIdle.zoom) && zoomToLevel(lastIdle.zoom) === clampLevel(next.level);
  const zoomRequested = (levelChanged && !levelEcho) || moveRequested;
  const targetZoom = levelToZoom(next.level);
  const setZoom = zoomRequested && !sameZoom(actual.zoom, targetZoom) ? targetZoom : null;

  return { setCenter, setZoom };
}

/**
 * 부모 state ← idle 의 실제 중심. 같은 자리면 **이전 객체를 그대로** 돌려준다
 * (setState(prev => …) 에서 같은 참조 = React 가 리렌더를 건너뛴다).
 * 좌표를 모르면(SDK 가 getCenter 를 못 줘 0,0 이 온 경우 포함) 이전 값을 지킨다.
 */
export function syncCenterState(prev: LatLngLite, reported: LatLngLite | null | undefined): LatLngLite {
  if (!finiteLatLng(reported)) return prev;
  if (reported.lat === 0 && reported.lng === 0) return prev;
  if (sameCenter(prev, reported)) return prev;
  return { lat: reported.lat, lng: reported.lng };
}

/** 부모 state ← idle 의 실제 줌(level 로). 같으면 이전 값 그대로. 줌을 모르면(0·NaN) 이전 값. */
export function syncLevelState(prev: number, reportedZoom: number | null | undefined): number {
  if (reportedZoom == null || !Number.isFinite(reportedZoom) || reportedZoom <= 0) return prev;
  const next = zoomToLevel(reportedZoom);
  return next === prev ? prev : next;
}
