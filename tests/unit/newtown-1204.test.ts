/* [1204] 1기 신도시 구역 근사 범위 · 바탕 지도 넷 · 서울 지정 이력 구역 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { convexHull, newtownZoneShape, newtownZoneShapes } from "@/lib/redevelopment/newtown-shapes";
import { historyShapesIn, matchZoneShape } from "@/lib/redevelopment/zone-shapes";

test("볼록 껍질 — 안쪽 점은 빠지고 꼭짓점만", () => {
  const h = convexHull([[0, 0], [2, 0], [2, 2], [0, 2], [1, 1]]);
  assert.equal(h.length, 4);
  assert.ok(!h.some(([x, y]) => x === 1 && y === 1));
});

test("구역 도형 — 단지 좌표를 넓혀 감싼다 · 좌표 없으면 그리지 않는다 · 짝짓기는 같은 이름으로", () => {
  assert.equal(newtownZoneShape("빈 구역", "newtown_lead", []), null);
  const one = newtownZoneShape("평촌 꿈마을", "newtown_lead", [[126.97, 37.385]])!;
  assert.ok(one.p.length >= 16, "팔각형");
  assert.ok(one.a > 10_000 && one.a < 20_000, `반경 70m 팔각형 넓이 ${one.a}`);
  const many = newtownZoneShapes(
    [{ name: "분당 샛별마을", typeKey: "newtown_lead", regionKey: "성남분당구", complexes: ["가", "나", "없음"] }],
    (_rk, cn) => (cn === "가" ? [127.129, 37.37] : cn === "나" ? [127.132, 37.372] : null),
  );
  assert.equal(many.length, 1);
  assert.ok(many[0].a > one.a);
  /* 지도 짝짓기 — 정비사업 목록의 같은 이름 구역과 이어진다 */
  assert.equal(matchZoneShape({ name: "분당 샛별마을", lat: 37.371, lng: 127.1305 }, many), many[0]);
});

test("서울 지정 이력 구역 — 짝 없는 도형만 · 화면 안만", () => {
  const a = { n: "가", k: "UQ1221", c: [127.0, 37.5] as [number, number], a: 1, p: [] };
  const b = { n: "나", k: "UQ1221", c: [127.5, 37.9] as [number, number], a: 1, p: [] };
  const used = new Set([a]);
  assert.deepEqual(historyShapesIn([a, b], used, null), [b]);
  assert.deepEqual(historyShapesIn([a, b], new Set(), { swLat: 37.4, swLng: 126.9, neLat: 37.6, neLng: 127.1 }), [a]);
});

test("바탕 지도 넷 — 일반 · 위성 · 겹쳐보기 · 지형 (정비사업 지도 · 통합 지도) · 정비사업 지도 지적도 기본 끔", () => {
  const nm = readFileSync("components/map/NaverMap.tsx", "utf8");
  assert.match(nm, /export type NaverBaseMap = "normal" \| "satellite" \| "satelliteOnly" \| "terrain";/);
  for (const f of ["app/redevelopment/RedevelopmentMap.tsx", "app/map/map-client.tsx"]) {
    const s = readFileSync(f, "utf8");
    for (const l of ['["normal", "일반"]', '["satelliteOnly", "위성"]', '["satellite", "겹쳐보기"]', '["terrain", "지형"]']) assert.ok(s.includes(l), `${f}: ${l}`);
    assert.match(s, /NEWTOWN_SHAPES_URL/);
  }
  assert.match(readFileSync("app/redevelopment/RedevelopmentMap.tsx", "utf8"), /const \[cadastral, setCadastral\] = useState\(false\);/);
});
