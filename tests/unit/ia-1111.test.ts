import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { REGION_CATALOG } from "../../lib/region/catalog.ts";
import {
  NATIONAL_VIEW,
  filterRegionMarkers,
  initialSido,
  levelForSpanKm,
  regionSiseMapMarkers,
  sidoViewports,
  toMapMarkerData,
} from "../../lib/region/region-map.ts";
import { cardMatchesRegion, townMapMarkers } from "../../lib/town/town-map.ts";

/* ============================================================
   [1111 · 지도 중심 개편 1차] 구조 계약 (소유자 2026-11-08 "지도를 통해 호갱노노 · 재개발닷컴처럼 · 너무 나열식" · "5개 넘으면 필터식")
     ① 지역 고르기 지도(순수 함수) — 시/도별 화면 범위 · 말풍선(값 있으면 이름|값 · 없으면 이름 알약) · 검색 · 처음 시/도
     ② 동네 홈 — 107개 칩 벽 · 바로가기 8칩 대신 지도 고르기(값 = 이 피드의 이웃 글 수) · 107개 링크는 닫힌 details 한 곳(크롤 경로)
     ③ 지역 시세 분석 — [표 | 지도] 보기 · "지도로 찾기"는 화면 안 지도 보기로
   ============================================================ */

const read = (p: string) => readFileSync(p, "utf8");
const strip = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/[^\n]*$/gm, "");

test("① 지도 고르기 — 시/도 범위 · 말풍선 · 검색 · 처음 시/도", () => {
  const markers = townMapMarkers(REGION_CATALOG, []);
  assert.ok(markers.length >= 100 && markers.every((m) => m.href === `/town/${encodeURIComponent(m.id)}` && m.value === null));
  const views = sidoViewports(markers);
  assert.deepEqual(views.slice(0, 3).map((v) => v.sido), ["서울", "경기", "인천"]);
  const seoul = views.find((v) => v.sido === "서울")!;
  assert.equal(seoul.count, 25);
  assert.ok(seoul.center.lat > 37.4 && seoul.center.lat < 37.7 && seoul.center.lng > 126.8 && seoul.center.lng < 127.2, "서울 중심");
  assert.equal(seoul.level, 9, "서울 25구 ≈ 30km → level 9(zoom 12 · 이름 알약이 접히지 않는 눈금)");
  assert.ok(views.find((v) => v.sido === "경기")!.level >= 10, "경기는 더 넓게");
  assert.equal(levelForSpanKm(0), 8);
  assert.equal(levelForSpanKm(200), 12);
  assert.equal(NATIONAL_VIEW.level, 14);
  assert.equal(initialSido(views, "부산"), "부산");
  assert.equal(initialSido(views, "없음"), "서울");
  assert.equal(initialSido([], "서울"), null);
  /* 말풍선 — 값이 있으면 호갱노노식(이름 | 값 · 등락) · 없으면 이름 알약(값 지어내지 않음) */
  const bubble = toMapMarkerData({ ...markers[0], value: "글 3", deltaPct: 1.2 });
  assert.equal(bubble.avgPricePerM2, 0);
  assert.equal(bubble.priceLabel, "글 3");
  assert.equal(bubble.showName, true);
  assert.equal(bubble.momPct, 1.2);
  const pill = toMapMarkerData(markers[0]);
  assert.equal(pill.avgPricePerM2, undefined);
  assert.equal(pill.priceLabel, undefined);
  /* 검색 — 앞 일치 먼저 · 두 글자부터 포함 */
  assert.equal(filterRegionMarkers(markers, "강남")[0]?.id, "gangnam");
  assert.equal(filterRegionMarkers(markers, "분당")[0]?.id, "seongnam-bundang");
  assert.deepEqual(filterRegionMarkers(markers, ""), []);
  assert.ok(filterRegionMarkers(markers, "구", 8).length <= 8);
});

test("② 동네 홈 — 글 수는 시/도까지 맞아야 센다 · 0건은 값 없음 · 화면은 지도 고르기 + 닫힌 전체 목록", () => {
  assert.equal(cardMatchesRegion("서울 중구", "서울", "중구"), true);
  assert.equal(cardMatchesRegion("부산 중구", "서울", "중구"), false, "동명 구는 시/도가 가른다");
  assert.equal(cardMatchesRegion("중구", "서울", "중구"), true, "시/도 없는 표기는 이름으로");
  assert.equal(cardMatchesRegion("경기 성남시 분당구", "경기", "성남시 분당구"), true);
  assert.equal(cardMatchesRegion("경기 성남시 수정구", "경기", "성남시 분당구"), false);
  assert.equal(cardMatchesRegion("전국", "서울", "강남구"), false);
  assert.equal(cardMatchesRegion(null, "서울", "강남구"), false);
  const markers = townMapMarkers(REGION_CATALOG, [{ region: "서울 강남구" }, { region: "서울 강남구" }, { region: "부산 중구" }, { region: "전국" }]);
  assert.equal(markers.find((m) => m.id === "gangnam")?.value, "글 2");
  assert.equal(markers.find((m) => m.id === "junggu" || m.name === "중구" && m.sido === "서울")?.value ?? null, null, "서울 중구는 0건 → 값 없음");
  assert.equal(markers.filter((m) => m.value).length, 2, "강남 · 부산 중구");
  assert.ok(markers.every((m) => !REGION_CATALOG.find((c) => c.id === m.id)?.retired), "폐지 지역은 지도에 없다");

  const page = strip(read("app/town/page.tsx"));
  assert.match(page, /<RegionMapPicker\s+markers=\{markers\}\s+label="동네 홈 고르기 지도"/);
  assert.match(page, /townMapMarkers\(REGION_CATALOG, cards\)/);
  assert.doesNotMatch(page, /TOWN_HOME_SHORTCUTS\.map|shortcuts\.map\(/, "바로가기 8칩 줄 없음(지도 말풍선이 같은 수를 보여 준다)");
  assert.doesNotMatch(page, /open=\{g\.city === "서울"\}/, "시/도별로 펼치던 칩 벽 없음");
  assert.match(page, /<details className="group mt-2 px-1">[\s\S]*시·도별 전체 목록 \{total\}곳/, "107개 링크는 닫힌 details 한 곳(크롤 경로)");
  assert.match(page, /href=\{`\/town\/\$\{r\.id\}`\}/);
  assert.match(page, /<TownIndex first=\{!loadFailed && firstPage\.length === 0\} markers=\{markers\} \/>/);
});

test("③ 지역 시세 분석 — 표 | 지도 보기 · 지도 보기 말풍선 = 평균 매매가(없으면 온도) · 지도 조각은 SDK 지연 로드 · 폴백은 시/도 한 벌 목록", () => {
  const coords = new Map([["gangnam", { lat: 37.5, lng: 127.05 }]]);
  const rows = [
    { id: "gangnam", name: "강남구", sido: "서울", href: "/region/gangnam", keys: ["강남구"], avgSaleKrw: 2_781_976_608, temp: { score: 13 } },
    { id: "nocoord", name: "없음", sido: "서울", href: "/region/nocoord", keys: ["없음"], avgSaleKrw: null, temp: { score: 50 } },
  ];
  const ms = regionSiseMapMarkers(rows, coords, (krw) => `${Math.round(krw / 1e8 * 10) / 10}억`);
  assert.equal(ms.length, 1, "좌표 없는 줄은 지도에 없다");
  assert.equal(ms[0].value, "27.8억");
  const ms2 = regionSiseMapMarkers([{ ...rows[0], avgSaleKrw: null }], coords, () => "x");
  assert.equal(ms2[0].value, "온도 13", "평균가가 없으면 온도");
  const client = strip(read("app/analysis/region-sise-client.tsx"));
  assert.match(client, /useState<"table" \| "map">\("table"\)/, "처음은 표(서버 HTML)");
  assert.match(client, /onMapClick=\{\(\) => setView\("map"\)\}/);
  const picker = strip(read("app/components/region/RegionMapPicker.tsx"));
  assert.match(picker, /from "@\/components\/map\/NaverMapLazy"/, "지도 SDK 는 지연 로드");
  assert.match(picker, /declutter\s+declutterMaxLabels=\{80\}/);
  assert.match(picker, /fallback=\{listFallback\}/);
  assert.match(picker, /markers\.filter\(\(m\) => m\.sido === sido\)/, "폴백 목록은 고른 시/도 한 벌(5개 초과 필터 규칙)");
  assert.match(picker, /role="tablist" aria-label="시\/도"/);
  const box = strip(read("app/analysis/region-search-box.tsx"));
  assert.match(box, /onMapClick\?: \(\) => void;/);
});
