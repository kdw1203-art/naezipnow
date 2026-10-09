/* [1047] 단지 위치 · 주변 지도 + 버튼 모서리 — 소유자 지시(2026-10-09):
 *   "단지를 검색하면 지도에서 위치를 보여줄 수 있게 · 위치는 노란색 부분(오른쪽 레일)에"
 *   "지도에 확대·축소 · 인근 반경 범위 · 유사 단지나 전철역, 관공서 위치도 간단하게"
 *   "검색 네모 박스의 앵글이 흰 검색창과 같도록 · 이런 디테일을 사이트 전반에"
 *
 * 잠그는 사실:
 *  ① 역·관공서는 OpenStreetMap 태그에서 · 반경 안 · 이름 있는 것만 · 같은 역은 하나 · 가까운 순.
 *  ② 유사 단지는 반경 안에서 평당가·준공 연도가 닮은 순 · 자기 자신 제외 · 기준이 없으면 가까운 순.
 *  ③ 지도는 레일 맨 위(데스크톱)와 본문(폰) — 한쪽만 켜지고, 첫 로드 JS 와 무관하게 지연 로드.
 *  ④ 확대·축소 단추 · 반경 원 · 출처 표시(© OpenStreetMap).
 *  ⑤ 버튼 클래스가 호출부의 rounded-full 을 이기지 않는다(알약 검색창 안 알약 단추). */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  AREA_RADII_M,
  distanceM,
  formatDistance,
  isKoreaCoord,
  officeKind,
  overpassQuery,
  parseOverpass,
  pickSimilarComplexes,
  roundCoord,
} from "@/lib/map/area-pick";

const read = (p: string) => readFileSync(p, "utf8");
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const C = { lat: 37.3943, lng: 126.9568 };

test("거리 · 좌표 범위 · 반올림 · 표기", () => {
  assert.equal(distanceM(C.lat, C.lng, C.lat, C.lng), 0);
  const d = distanceM(C.lat, C.lng, C.lat + 0.009, C.lng);
  assert.ok(d > 990 && d < 1010, String(d));
  assert.equal(isKoreaCoord(37.5, 127), true);
  assert.equal(isKoreaCoord(0, 0), false);
  assert.equal(roundCoord(37.394349), 37.3943);
  assert.equal(formatDistance(450), "450m");
  assert.equal(formatDistance(1234), "1.2km");
  assert.equal(formatDistance(1000), "1km", "반경 단추는 1km(1.0km 아님)");
  assert.deepEqual([...AREA_RADII_M], [500, 1000]);
});

test("관공서 종류 — 태그에서만, 해당 없으면 null", () => {
  assert.equal(officeKind({ amenity: "townhall" }), "주민센터·청사");
  assert.equal(officeKind({ amenity: "police" }), "경찰");
  assert.equal(officeKind({ office: "government" }), "관공서");
  assert.equal(officeKind({ amenity: "cafe" }), null);
});

test("parseOverpass — 반경 안 · 이름 있는 것만 · 같은 역은 가장 가까운 하나 · 가까운 순", () => {
  const near = (dLat: number) => C.lat + dLat;
  const out = parseOverpass(
    [
      { type: "node", lat: near(0.003), lon: C.lng, tags: { railway: "station", name: "평촌" } },
      { type: "node", lat: near(0.002), lon: C.lng, tags: { station: "subway", name: "평촌역" } },
      { type: "node", lat: near(0.02), lon: C.lng, tags: { railway: "station", name: "먼역" } },
      { type: "way", center: { lat: near(0.001), lon: C.lng }, tags: { amenity: "townhall", name: "관양2동 행정복지센터" } },
      { type: "node", lat: near(0.004), lon: C.lng, tags: { amenity: "police" } },
      { type: "node", lat: near(0.001), lon: C.lng, tags: { amenity: "cafe", name: "카페" } },
    ],
    C,
  );
  assert.deepEqual(out.stations.map((s) => s.name), ["평촌역"]);
  assert.ok(out.stations[0].distanceM < 250);
  assert.deepEqual(out.offices.map((o) => [o.name, o.kind]), [["관양2동 행정복지센터", "주민센터·청사"]]);
  assert.match(overpassQuery(C.lat, C.lng), /\(around:1000,37\.3943,126\.9568\)/);
  assert.match(overpassQuery(C.lat, C.lng), /out center 80;$/);
});

test("pickSimilarComplexes — 평당가·준공 연도가 닮은 순 · 자기 자신 제외 · 반경 밖 제외", () => {
  const row = (name: string, dLat: number, price: number | null, year: number | null) => ({
    regionName: "안양 동안구",
    complexName: name,
    lat: C.lat + dLat,
    lng: C.lng,
    avgPerPyeongKrw: price,
    buildYear: year,
    households: null,
  });
  const rows = [
    row("공작아파트", 0, 40_000_000, 1993),
    row("가까운 비싼", 0.001, 80_000_000, 2020),
    row("닮은", 0.004, 41_000_000, 1994),
    row("조금 닮은", 0.003, 46_000_000, 2000),
    row("먼", 0.02, 40_000_000, 1993),
  ];
  const got = pickSimilarComplexes(rows, { name: "공작 아파트", lat: C.lat, lng: C.lng });
  assert.deepEqual(got.map((c) => c.name), ["닮은", "조금 닮은", "가까운 비싼"]);
  assert.ok((got[0].similarity ?? 0) > (got[1].similarity ?? 0));
  const noBase = pickSimilarComplexes(rows.slice(1), { name: "없는 단지", lat: C.lat, lng: C.lng });
  assert.ok(noBase.length > 0);
  const noPrice = pickSimilarComplexes(
    [row("가", 0.003, null, null), row("나", 0.001, null, null)],
    { name: "자기", lat: C.lat, lng: C.lng },
  );
  assert.deepEqual(noPrice.map((c) => c.name), ["나", "가"], "기준이 없으면 가까운 순");
});

test("주변 정보 API — 좌표 검사 · 원천별 실패 표시 · 실패면 짧은 캐시", () => {
  const r = code("app/api/complex/area/route.ts");
  assert.match(r, /if \(!isKoreaCoord\(lat, lng\)\)/);
  assert.match(r, /Promise\.allSettled/);
  assert.match(r, /missing\.push\("osm"\)/);
  assert.match(r, /s-maxage=604800/);
  assert.match(r, /s-maxage=300/);
  const load = code("lib/map/area-load.ts");
  assert.match(load, /AbortSignal\.timeout\(OVERPASS_TIMEOUT_MS\)/);
  assert.match(load, /\.from\("map_price_point_source"\)/);
});

test("지도 카드 — 레일 맨 위(데스크톱) · 본문(폰) · 확대·축소 · 반경 원 · 출처 · 지연 로드", () => {
  const rail = code("app/complex/[id]/ComplexRail.tsx");
  const iRail = rail.indexOf('<aside className="hidden flex-col gap-3 lg:flex"');
  assert.ok(rail.indexOf('media="desktop"') > iRail && rail.indexOf('media="desktop"') < rail.indexOf('aria-label="요약"'), "레일의 첫 칸");
  const page = code("app/complex/[id]/page.tsx");
  assert.match(page, /media="mobile"/);
  assert.match(page, /location=\{typeof v\.lat === "number"/);
  const map = code("app/complex/[id]/ComplexAreaMap.tsx");
  assert.match(map, /showControls/);
  assert.match(map, /circle=\{\{ lat, lng, radiusM: radius \}\}/);
  assert.match(map, /© OpenStreetMap 기여자/);
  assert.match(map, /window\.matchMedia\("\(min-width: 1024px\)"\)/);
  assert.match(code("app/complex/[id]/ComplexAreaMapLazy.tsx"), /ssr: false/);
});

test("버튼 모서리 — 호출부의 rounded-full 을 따른다(알약 검색창 안 알약 단추)", () => {
  const css = read("app/globals.css");
  assert.match(css, /:is\(\.btn-primary, \.btn-secondary, \.btn-soft, \.btn-outline, \.btn-ghost, \.btn-cta\)\.rounded-full \{\s*border-radius: var\(--radius-pill\);/);
  assert.match(read("app/components/home/HomeHeroSearch.tsx"), /className="btn-primary press h-10 shrink-0 rounded-full px-5 t-body"/);
  assert.match(read("app/components/home/HomeHeroSearch.tsx"), /home-search flex items-center gap-2\.5 rounded-full/);
});
