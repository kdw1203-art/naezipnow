import test from "node:test";
import assert from "node:assert/strict";
import { RouteVitalsLedger, MIN_DWELL_MS, SOFT_NAV } from "../../lib/metrics/vitals-route.ts";

/* 979 — 화면별 Web Vitals 장부.
   고치기 전 실제 동작(헤드리스 크롬 재현): 홈에서 쌓인 CLS 0.0199 가 /map 의 것으로
   전송됐다. 아래 첫 테스트가 그 상황을 그대로 재현하고, 이제는 홈에 달린다. */

test("CLS 누적분은 그 흔들림이 생긴 화면에 달린다 (예전엔 마지막 화면)", () => {
  const l = new RouteVitalsLedger("/", 0);
  l.addDelta({ name: "CLS", value: 0.0199, delta: 0.0199, rating: "good", element: "a.btn-primary.rise-in-3" });
  const left = l.enterRoute("/map", 5_000);
  assert.equal(left.length, 1);
  assert.equal(left[0].metric, "CLS");
  assert.equal(left[0].path, "/"); // ← 예전에는 "/map"
  assert.equal(left[0].navIndex, 0);
  assert.equal(left[0].element, "a.btn-primary.rise-in-3");
  assert.ok(Math.abs(left[0].value - 0.0199) < 1e-9);
});

test("화면별 값의 합 = 문서 전체 CLS", () => {
  const l = new RouteVitalsLedger("/", 0);
  l.addDelta({ name: "CLS", value: 0.02, delta: 0.02 });
  const a = l.enterRoute("/map", 3_000);
  l.addDelta({ name: "CLS", value: 0.32, delta: 0.3 });
  const b = l.enterRoute("/auctions", 9_000);
  l.addDelta({ name: "CLS", value: 0.35, delta: 0.03 });
  const c = l.flush(15_000);
  const perRoute = [...a, ...b, ...c].filter((s) => s.metric === "CLS" && s.scope === "route");
  const total = perRoute.reduce((n, s) => n + s.value, 0);
  assert.ok(Math.abs(total - 0.35) < 1e-9, `합=${total}`);
  /* 문서 단위 한 줄은 방문 전체 값을 그대로 들고 첫 화면에 달린다 */
  const doc = c.find((s) => s.metric === "CLS" && s.scope === "doc");
  assert.ok(doc && Math.abs(doc.value - 0.35) < 1e-9 && doc.path === "/");
  assert.deepEqual([a[0].path, b[0].path, c[0].path], ["/", "/map", "/auctions"]);
  assert.deepEqual([a[0].navIndex, b[0].navIndex, c[0].navIndex], [0, 1, 2]);
});

test("가장 큰 delta 를 만든 요소를 남긴다 — 마지막 작은 흔들림이 범인을 덮지 않게", () => {
  const l = new RouteVitalsLedger("/map", 0);
  l.addDelta({ name: "CLS", value: 0.4, delta: 0.4, element: "div.map-canvas" });
  l.addDelta({ name: "CLS", value: 0.401, delta: 0.001, element: "span.badge" });
  const out = l.flush(4_000).filter((s) => s.scope === "route");
  assert.equal(out[0].element, "div.map-canvas");
});

test("LCP·FCP·TTFB 는 문서가 처음 연 화면의 것 — 늦게 확정돼도 옮겨 달지 않는다", () => {
  const l = new RouteVitalsLedger("/", 0);
  l.enterRoute("/map", 2_000);
  const s = l.oneShot({ name: "LCP", value: 3184, rating: "needs-improvement", element: "a.today-slide" });
  assert.equal(s.path, "/");
  assert.equal(s.navIndex, 0);
});

test("bfcache 복귀분은 지금 화면의 것 — web-vitals 가 그 화면을 다시 재는 것이므로", () => {
  const l = new RouteVitalsLedger("/", 0);
  l.enterRoute("/map", 2_000);
  const s = l.oneShot({ name: "LCP", value: 120, navType: "back-forward-cache" });
  assert.equal(s.path, "/map");
  assert.equal(s.navIndex, 1);
});

test("INP 는 나빠진 시점의 화면에 달고, 그 화면의 최댓값만 남긴다", () => {
  const l = new RouteVitalsLedger("/", 0);
  l.addWorst({ name: "INP", value: 120, element: "button.a" });
  l.addWorst({ name: "INP", value: 480, element: "button.b" });
  l.addWorst({ name: "INP", value: 200, element: "button.c" });
  const out = l.flush(6_000).filter((s) => s.metric === "INP" && s.scope === "route");
  assert.equal(out.length, 1);
  assert.equal(out[0].value, 480);
  assert.equal(out[0].element, "button.b");
});

test("머문 화면은 CLS 0 도 기록한다 — 나쁜 방문만 남으면 p75 가 위로 치우친다", () => {
  const l = new RouteVitalsLedger("/qna", 0);
  const out = l.flush(MIN_DWELL_MS).filter((s) => s.scope === "route");
  assert.equal(out.length, 1);
  assert.equal(out[0].metric, "CLS");
  assert.equal(out[0].value, 0);
  assert.equal(out[0].path, "/qna");
});

test("스쳐 지나간 화면은 0 을 만들지 않는다 — 이번엔 아래로 치우친다", () => {
  const l = new RouteVitalsLedger("/", 0);
  const out = l.enterRoute("/map", MIN_DWELL_MS - 1);
  assert.deepEqual(out, []);
});

test("INP 만 있는 화면도 CLS 0 을 남긴다", () => {
  const l = new RouteVitalsLedger("/notes", 0);
  l.addWorst({ name: "INP", value: 300 });
  const out = l.flush(4_000).filter((s) => s.scope === "route");
  assert.deepEqual(out.map((s) => s.metric).sort(), ["CLS", "INP"]);
});

test("숨김이 두 번 불려도 같은 값을 두 번 보내지 않는다", () => {
  const l = new RouteVitalsLedger("/", 0);
  l.addDelta({ name: "CLS", value: 0.1, delta: 0.1 });
  /* 화면 줄 1 + 문서 줄 1 */
  assert.equal(l.flush(4_000).length, 2);
  assert.deepEqual(l.flush(4_010), []);
});

test("같은 경로로 다시 들어오는 것은 화면 이동이 아니다", () => {
  const l = new RouteVitalsLedger("/", 0);
  l.addDelta({ name: "CLS", value: 0.1, delta: 0.1 });
  assert.deepEqual(l.enterRoute("/", 5_000), []);
  assert.equal(l.flush(6_000).filter((s) => s.scope === "route")[0].value, 0.1);
});

test("음수·비유한 delta 는 무시한다 (CLS 세션 창이 바뀔 때 나온다)", () => {
  const l = new RouteVitalsLedger("/", 0);
  l.addDelta({ name: "CLS", value: 0.2, delta: 0.2 });
  l.addDelta({ name: "CLS", value: 0.2, delta: -0.05 });
  l.addDelta({ name: "CLS", value: 0.2, delta: Number.NaN });
  assert.ok(Math.abs(l.flush(4_000).filter((s) => s.scope === "route")[0].value - 0.2) < 1e-9);
});

test("첫 화면은 문서의 navigationType, 이어서 본 화면은 soft-nav 로 적는다", () => {
  const l = new RouteVitalsLedger("/", 0);
  l.addDelta({ name: "CLS", value: 0.1, delta: 0.1, navType: "navigate" });
  const a = l.enterRoute("/map", 5_000);
  l.addDelta({ name: "CLS", value: 0.2, delta: 0.1, navType: "navigate" });
  const b = l.flush(11_000).filter((s) => s.scope === "route");
  assert.equal(a[0].navType, "navigate");
  assert.equal(b[0].navType, SOFT_NAV);
});

test("bfcache 복귀는 soft-nav 가 아니라 back-forward-cache 로 남는다", () => {
  const l = new RouteVitalsLedger("/", 0);
  l.enterRoute("/map", 3_000);
  const s = l.oneShot({ name: "FCP", value: 40, navType: "back-forward-cache" });
  assert.equal(s.navType, "back-forward-cache");
  assert.equal(s.path, "/map");
});

test("문서 단위 줄은 숨을 때 딱 한 번 — 주간 시계열의 단위(방문 하나)를 지킨다", () => {
  const l = new RouteVitalsLedger("/", 0);
  l.addDelta({ name: "CLS", value: 0.12, delta: 0.12, navType: "navigate" });
  l.addWorst({ name: "INP", value: 340 });
  l.enterRoute("/map", 4_000);
  l.addDelta({ name: "CLS", value: 0.18, delta: 0.06 });
  const out = l.flush(9_000);
  const doc = out.filter((s) => s.scope === "doc");
  assert.deepEqual(doc.map((s) => s.metric).sort(), ["CLS", "INP"]);
  assert.ok(Math.abs(doc.find((s) => s.metric === "CLS")!.value - 0.18) < 1e-9);
  assert.equal(doc.find((s) => s.metric === "INP")!.value, 340);
  /* 문서 줄은 언제나 문서가 처음 연 화면에 달린다 — CrUX 와 같은 단위 */
  assert.ok(doc.every((s) => s.path === "/" && s.navIndex === 0 && s.navType === "navigate"));
  /* 두 번째 숨김에서는 문서 줄이 다시 나오지 않는다 */
  assert.deepEqual(l.flush(9_100), []);
});

test("흔들림이 하나도 없던 방문도 문서 CLS 0 을 남긴다 — 주간 p75 가 나쁜 방문 쪽으로 치우치지 않게", () => {
  const l = new RouteVitalsLedger("/qna", 0);
  const doc = l.flush(20_000).filter((s) => s.scope === "doc");
  assert.equal(doc.length, 1);
  assert.equal(doc[0].metric, "CLS");
  assert.equal(doc[0].value, 0);
});

test("LCP 는 문서 단위(scope doc) 로 남는다 — 화면별 표에서 첫 화면 값으로 읽힌다", () => {
  const l = new RouteVitalsLedger("/", 0);
  assert.equal(l.oneShot({ name: "LCP", value: 3164 }).scope, "doc");
});
