/* [1206] 전국 정비구역 참고 경계(브이월드 LT_C_UPISUQ161) — 정규화 · 단순화 · 서울 제외 · 매월 크론 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  isRedevZoneName,
  largestOuterRing,
  mergeShapes,
  simplifyRing,
  vworldFeatureToShape,
  zoneCodeFromName,
  MAX_RING_POINTS,
} from "@/lib/redevelopment/vworld-zone-shapes";

const square = (x: number, y: number, d: number) => [[x, y], [x + d, y], [x + d, y + d], [x, y + d], [x, y]];

test("이름 → 분류 코드 · 정비 이름 판정", () => {
  assert.equal(zoneCodeFromName("광명11R 재개발정비구역"), "UQ1221");
  assert.equal(zoneCodeFromName("철산주공 재건축"), "UQ1240");
  assert.equal(zoneCodeFromName("부천 소사 재정비촉진지구"), "UQ5110");
  assert.equal(zoneCodeFromName("주거환경개선지구"), "UQ1211");
  assert.equal(zoneCodeFromName("도시환경정비구역"), "UQ1222");
  assert.equal(isRedevZoneName("판교 지구단위계획구역"), false);
  assert.equal(isRedevZoneName("수원 115-3 재개발"), true);
});

test("가장 큰 바깥 고리 · 꼭짓점 상한 · 닫힌 점 제거", () => {
  const multi = { type: "MultiPolygon", coordinates: [[square(127, 37, 0.001)], [square(127.1, 37.1, 0.01)]] };
  const r = largestOuterRing(multi)!;
  assert.equal(r[0][0], 127.1);
  assert.equal(largestOuterRing({ type: "Point", coordinates: [1, 2] }), null);
  const many = Array.from({ length: 1000 }, (_, i) => [127 + Math.cos(i / 159) * 0.01, 37 + Math.sin(i / 159) * 0.01]);
  assert.ok(simplifyRing(many).length / 2 <= MAX_RING_POINTS);
  assert.equal(simplifyRing(square(127, 37, 0.001)).length, 8);
});

test("지물 → 도형 — 서울(11…)과 정비 아닌 이름은 뺀다 · 같은 구역은 한 번", () => {
  const f = (name: string, sgg: string, sn: string) => ({
    properties: { dgm_nm: name, signgu_se: sgg, present_sn: sn },
    geometry: { type: "Polygon", coordinates: [square(126.86, 37.47, 0.003)] },
  });
  const a = vworldFeatureToShape(f("광명1R 재개발", "41210", "A1"))!;
  assert.equal(a.k, "UQ1221");
  assert.equal(a.sgg, "41210");
  assert.ok(a.a > 50_000 && a.a < 150_000);
  assert.equal(vworldFeatureToShape(f("장위4 재개발", "11290", "S1")), null);
  assert.equal(vworldFeatureToShape(f("판교 지구단위", "41135", "P1")), null);
  assert.equal(mergeShapes([[a], [a]]).length, 1);
});

test("매월 크론 · 지도 두 곳 연결 · 서울 자료 유지", () => {
  const crons = (JSON.parse(readFileSync("vercel.json", "utf8")) as { crons: { path: string; schedule: string }[] }).crons;
  assert.equal(crons.find((c) => c.path === "/api/cron/redev-zone-shapes-refresh")?.schedule, "17 18 1 * *");
  for (const f of ["app/map/map-client.tsx", "app/redevelopment/RedevelopmentMap.tsx"]) {
    const s = readFileSync(f, "utf8");
    assert.match(s, /getZones\(VWORLD_ZONE_SHAPES_URL\)/, f);
    assert.match(s, /getZones\(ZONE_SHAPES_URL\)/, f);
  }
  const fetchSrc = readFileSync("lib/redevelopment/vworld-zone-shapes-fetch.ts", "utf8");
  assert.match(fetchSrc, /revalidate: VWORLD_ZONE_SHAPES_TTL_S/);
  assert.match(fetchSrc, /attrFilter: `dgm_nm:like:\$\{kw\}`/);
});

test("브이월드 NOT_FOUND 는 빈 모음(실패 아님) · 실패 문구에 status", () => {
  const src = readFileSync("lib/vworld/client.ts", "utf8");
  assert.match(src, /if \(status === "NOT_FOUND"\) \{\s*return \{ totalFeatureCount: 0/);
  assert.match(src, /failed \(status=\$\{status \?\? "없음"\}\)/);
});
