import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MAP_LEVEL_MAX,
  MAP_LEVEL_MIN,
  levelToZoom,
  planViewportSync,
  sameCenter,
  stepLevel,
  syncCenterState,
  syncLevelState,
  zoomToLevel,
  type IdleViewport,
  type LatLngLite,
  type ViewportSnapshot,
} from "../../lib/map/viewport-sync.ts";
import { NAVER_MAP_MAX_ZOOM, NAVER_MAP_MIN_ZOOM } from "../../lib/map/naver-maps-sdk.ts";

/* [1008 · M] "지도에서 위치를 옮긴 후 확대 축소를 하면 다시 원위치로 돌아가는 오류"(소유자 제보).
 *
 * 원인: NaverMap 의 effect 하나가 [center, level] 에 걸려 level 만 바뀌어도 setCenter(center prop)
 * 을 다시 불렀고, 부모 state 의 center 는 사용자가 끌어서 옮긴 자리를 몰랐다.
 * 이 파일은 (1) 적용 규칙(planViewportSync), (2) 부모 동기화(sync*State), (3) 둘을 합친 되먹임이
 * 수렴하는지(가짜 지도 모델)를 잠근다. 브라우저 재현(가짜 SDK)은 scratchpad 1008-M 에 있다. */

const C0: LatLngLite = { lat: 37.5665, lng: 126.978 }; // 처음 자리(서울시청)
const C1: LatLngLite = { lat: 37.5165, lng: 127.048 }; // 사용자가 끌어서 옮긴 자리
const C2: LatLngLite = { lat: 37.5301, lng: 127.0102 };
const P: LatLngLite = { lat: 37.5445, lng: 127.0557 }; // 묶음·단지 좌표

const snap = (center: LatLngLite, level: number): ViewportSnapshot => ({ center, level });
const idle = (center: LatLngLite, zoom: number): IdleViewport => ({ center, zoom });

test("level ↔ zoom 은 21 - level 이고 SDK 줌 범위(6~21)와 1:1 이다", () => {
  assert.equal(levelToZoom(6), 15);
  assert.equal(levelToZoom(12), 9);
  assert.equal(zoomToLevel(15), 6);
  assert.equal(zoomToLevel(9), 12);
  assert.equal(MAP_LEVEL_MIN, 21 - NAVER_MAP_MAX_ZOOM);
  assert.equal(MAP_LEVEL_MAX, 21 - NAVER_MAP_MIN_ZOOM);
  for (let z = NAVER_MAP_MIN_ZOOM; z <= NAVER_MAP_MAX_ZOOM; z += 1) {
    assert.equal(levelToZoom(zoomToLevel(z)), z, `zoom ${z} 왕복`);
  }
  // 범위 밖은 잘린다
  assert.equal(levelToZoom(30), NAVER_MAP_MIN_ZOOM);
  assert.equal(levelToZoom(-3), NAVER_MAP_MAX_ZOOM);
  assert.equal(zoomToLevel(3), MAP_LEVEL_MAX);
});

test("＋/－ 한 칸은 범위 끝에서 제자리 — 반대 방향으로 튀지 않는다", () => {
  assert.equal(stepLevel(8, -1), 7);
  assert.equal(stepLevel(8, 1), 9);
  // 예전 /map 은 1~14 로 잘라, 핀치로 zoom 6(level 15)까지 간 뒤 － 를 누르면 14(=확대)가 됐다
  assert.equal(stepLevel(MAP_LEVEL_MAX, 1), MAP_LEVEL_MAX);
  assert.equal(stepLevel(MAP_LEVEL_MIN, -1), MAP_LEVEL_MIN);
  for (let lv = MAP_LEVEL_MIN; lv <= MAP_LEVEL_MAX; lv += 1) {
    assert.ok(stepLevel(lv, -1) <= lv, `확대가 축소로 튀면 안 된다(level ${lv})`);
    assert.ok(stepLevel(lv, 1) >= lv, `축소가 확대로 튀면 안 된다(level ${lv})`);
  }
});

test("버그 재현 조건: 끌어서 옮긴 뒤 level 만 바뀌면 setZoom 만 — 중심은 옮기지 않는다", () => {
  // 부모 state 는 여전히 C0(끌기를 모름), 지도는 C1 에 있다. ＋ 로 level 12 → 11.
  const plan = planViewportSync({
    next: snap(C0, 11),
    prev: snap(C0, 12),
    actual: { center: C1, zoom: 9 },
    lastIdle: idle(C1, 9),
  });
  assert.equal(plan.setCenter, false, "처음 자리(C0)로 되돌리면 소유자 제보 그대로다");
  assert.equal(plan.setZoom, 10);
});

test("지도 기본 컨트롤(SDK)이 이미 확대한 뒤 부모가 level 을 되돌려 주면(메아리) 아무것도 안 한다", () => {
  const plan = planViewportSync({
    next: snap(C0, 8), // 서랍: idle 에서 setLevel(21 - 13)
    prev: snap(C0, 9),
    actual: { center: C1, zoom: 13 },
    lastIdle: idle(C1, 13),
  });
  assert.deepEqual(plan, { setCenter: false, setZoom: null });
});

test("부모가 idle 의 중심을 state 로 되돌려 준 것(메아리)은 다시 적용하지 않는다 — 사용자가 또 끌고 있어도", () => {
  const settled = planViewportSync({
    next: snap(C1, 12),
    prev: snap(C0, 12),
    actual: { center: C1, zoom: 9 },
    lastIdle: idle(C1, 9),
  });
  assert.deepEqual(settled, { setCenter: false, setZoom: null });
  // idle 뒤 React 렌더 사이에 사용자가 다시 끌기 시작(실제 C2) — 메아리로 C1 에 끌어당기면 안 된다
  const midDrag = planViewportSync({
    next: snap(C1, 12),
    prev: snap(C0, 12),
    actual: { center: C2, zoom: 9 },
    lastIdle: idle(C1, 9),
  });
  assert.equal(midDrag.setCenter, false);
  assert.equal(midDrag.setZoom, null);
});

test("다른 곳으로 가기(center 변경)는 옮기고, 그 level 도 함께 맞춘다(예전 동작 유지)", () => {
  // 묶음 클릭: center P, level 8 → 6
  const go = planViewportSync({
    next: snap(P, 6),
    prev: snap(C1, 8),
    actual: { center: C1, zoom: 13 },
    lastIdle: idle(C1, 13),
  });
  assert.deepEqual(go, { setCenter: true, setZoom: 15 });
  // idle 을 받지 않는 화면(정비사업 지도): 사용자가 SDK 로 축소해 둔 뒤 다른 사업장을 고르면 그 축척으로
  const redev = planViewportSync({
    next: snap(C2, 6),
    prev: snap(P, 6),
    actual: { center: C1, zoom: 12 },
    lastIdle: idle(C1, 12),
  });
  assert.deepEqual(redev, { setCenter: true, setZoom: 15 });
  // 같은 축척이면 setZoom 은 부르지 않는다
  const panOnly = planViewportSync({
    next: snap(P, 9),
    prev: snap(C1, 9),
    actual: { center: C1, zoom: 12 },
    lastIdle: idle(C1, 12),
  });
  assert.deepEqual(panOnly, { setCenter: true, setZoom: null });
});

test("첫 적용(지도 생성 직후)은 이미 그 자리·축척이면 아무것도 부르지 않는다", () => {
  const plan = planViewportSync({
    next: snap(C0, 12),
    prev: null,
    actual: { center: C0, zoom: 9 },
    lastIdle: null,
  });
  assert.deepEqual(plan, { setCenter: false, setZoom: null });
});

test("지도 좌표를 모르면(getCenter 없음) 옮기라는 요청은 적용한다 — 삼키지 않는다", () => {
  const plan = planViewportSync({
    next: snap(P, 6),
    prev: snap(C0, 6),
    actual: { center: null, zoom: null },
    lastIdle: null,
  });
  assert.deepEqual(plan, { setCenter: true, setZoom: 15 });
});

test("부모 동기화: 같은 자리·같은 축척이면 이전 값을 그대로(같은 참조) 돌려준다 — 리렌더 없음", () => {
  const prev = { lat: 37.5, lng: 127.0 };
  assert.equal(syncCenterState(prev, { lat: 37.5, lng: 127.0 }), prev);
  assert.equal(syncCenterState(prev, { lat: 37.5 + 1e-9, lng: 127.0 }), prev, "부동소수 흔들림");
  const moved = syncCenterState(prev, C1);
  assert.notEqual(moved, prev);
  assert.deepEqual(moved, C1);
  // 모르는 값은 버린다(emit 이 getCenter 없을 때 0,0 을 준다)
  assert.equal(syncCenterState(prev, { lat: 0, lng: 0 }), prev);
  assert.equal(syncCenterState(prev, { lat: Number.NaN, lng: 127 }), prev);
  assert.equal(syncCenterState(prev, null), prev);

  assert.equal(syncLevelState(6, 15), 6);
  assert.equal(syncLevelState(6, 13), 8);
  assert.equal(syncLevelState(6, 0), 6);
  assert.equal(syncLevelState(6, Number.NaN), 6);
});

/* ── 되먹임 모델: 가짜 지도 + 부모 state + NaverMap effect 를 규칙대로 돌린다 ───────────── */
function makeWorld(opts: { parentSyncs: boolean; start: LatLngLite; level: number }) {
  const map = { center: { ...opts.start }, zoom: levelToZoom(opts.level), setCenterCalls: 0, setZoomCalls: 0 };
  let props: ViewportSnapshot = snap(opts.start, opts.level);
  let applied: ViewportSnapshot | null = null;
  let lastIdle: IdleViewport | null = null;
  let effectRuns = 0;
  const runEffect = () => {
    effectRuns += 1;
    const plan = planViewportSync({
      next: props,
      prev: applied,
      actual: { center: { ...map.center }, zoom: map.zoom },
      lastIdle,
    });
    applied = props;
    if (plan.setCenter) {
      map.center = { ...props.center };
      map.setCenterCalls += 1;
    }
    if (plan.setZoom !== null) {
      map.zoom = plan.setZoom;
      map.setZoomCalls += 1;
    }
    return plan.setCenter || plan.setZoom !== null;
  };
  /** 부모 state 가 바뀌면 React 가 effect 를 다시 돌린다(deps: center.lat/lng, level) */
  const setProps = (next: ViewportSnapshot) => {
    const changed =
      next.level !== props.level || next.center.lat !== props.center.lat || next.center.lng !== props.center.lng;
    props = next;
    if (changed) runEffect();
    return changed;
  };
  /** 지도가 멈춤 → idle → (부모가 동기화하면) state 갱신 → effect … 가 가라앉을 때까지 */
  const settle = () => {
    for (let i = 0; i < 10; i += 1) {
      lastIdle = { center: { ...map.center }, zoom: map.zoom };
      if (!opts.parentSyncs) return i;
      const next = snap(syncCenterState(props.center, lastIdle.center), syncLevelState(props.level, lastIdle.zoom));
      const moved = setProps(next) && (map.center.lat !== lastIdle.center.lat || map.zoom !== lastIdle.zoom);
      if (!moved) return i;
    }
    throw new Error("idle → state → effect 가 수렴하지 않는다(되먹임 고리)");
  };
  runEffect(); // 생성 직후 첫 적용
  settle();
  return {
    map,
    get props() {
      return props;
    },
    get effectRuns() {
      return effectRuns;
    },
    drag(to: LatLngLite) {
      map.center = { ...to }; // 사용자 손 — 앱의 setCenter 를 거치지 않는다
      return settle();
    },
    pinch(delta: number) {
      map.zoom = Math.min(NAVER_MAP_MAX_ZOOM, Math.max(NAVER_MAP_MIN_ZOOM, map.zoom + delta));
      return settle();
    },
    /** 앱 ＋/－ 단추: setLevel(v => stepLevel(v, d)) */
    step(delta: number) {
      setProps(snap(props.center, stepLevel(props.level, delta)));
      return settle();
    },
    /** 단지·묶음 고르기: setCenter(p) + setLevel(l) */
    goTo(p: LatLngLite, level: number) {
      setProps(snap(p, level));
      return settle();
    },
  };
}

test("되먹임 모델(/map): 끌기 → ＋ → 핀치 → － 동안 중심은 옮긴 자리, 줌은 실제 줌에서 한 칸씩, 고리 없음", () => {
  const w = makeWorld({ parentSyncs: true, start: C0, level: 12 });
  assert.equal(w.map.setCenterCalls, 0, "생성 직후 불필요한 setCenter 없음");
  w.drag(C1);
  assert.deepEqual(w.props.center, C1, "부모 state 가 옮긴 자리를 안다");
  const before = w.map.setCenterCalls;
  w.step(-1); // ＋
  assert.deepEqual(w.map.center, C1);
  assert.equal(w.map.zoom, 10);
  w.pinch(2); // 12
  w.step(1); // －
  assert.deepEqual(w.map.center, C1, "핀치 뒤 － 도 제자리");
  assert.equal(w.map.zoom, 11, "12 에서 한 칸 축소 — 예전엔 9 로 세 칸 튀었다");
  assert.equal(w.map.setCenterCalls, before, "줌 조작 중 앱이 setCenter 를 부르지 않는다");
});

test("되먹임 모델: 같은 단지·묶음을 다시 고르면(사이에 끌기) 그 자리로 간다 — 부모 동기화가 있어야 성립", () => {
  const synced = makeWorld({ parentSyncs: true, start: C0, level: 8 });
  synced.goTo(P, 6);
  assert.deepEqual(synced.map.center, P);
  synced.drag(C2);
  synced.step(1);
  synced.step(1);
  synced.goTo(P, 6);
  assert.deepEqual(synced.map.center, P, "state 가 C2 로 동기화돼 있어 P 는 '바뀐 값'이다");
  assert.equal(synced.map.zoom, 15);

  // 동기화가 없으면 state 는 이미 P 라 center 가 안 바뀐다 → 축척만 바뀌고 지도는 C2 에 남는다.
  // (그래서 map-client·지도 서랍은 idle 에서 syncCenterState 를 쓴다)
  const unsynced = makeWorld({ parentSyncs: false, start: C0, level: 8 });
  unsynced.goTo(P, 6);
  unsynced.drag(C2);
  unsynced.goTo(P, 8);
  unsynced.goTo(P, 6);
  assert.ok(sameCenter(unsynced.map.center, C2), "동기화 없는 부모에선 재선택이 중심을 못 옮긴다");
});

test("되먹임 모델: 동기화하는 부모에서 idle 한 번이 effect 를 한 번 넘게 돌리지 않는다", () => {
  const w = makeWorld({ parentSyncs: true, start: C0, level: 12 });
  const runs0 = w.effectRuns;
  const rounds = w.drag(C1);
  assert.ok(rounds <= 1, `idle 뒤 되먹임이 ${rounds}번 돌았다`);
  assert.ok(w.effectRuns - runs0 <= 1);
  const runs1 = w.effectRuns;
  w.drag(C1); // 같은 자리 — state 도 안 바뀐다
  assert.equal(w.effectRuns, runs1, "같은 값이면 state 가 안 바뀌어 effect 도 안 돈다");
});
