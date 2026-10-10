/* [1053] 생활 인프라 표준데이터(학교 · 도시철도역) 인제스트 · 단지 위치 지도의 역(공공 표 먼저) · 관공서 분리.
 *
 * 잠그는 사실:
 *  P1 응답 두 모양 — odcloud { data: [...] } · 오픈API tn_pubr_* response.body.items(배열 · { item: [...] } · { item: {...} } · "").
 *     원천 실패(인증키 · resultCode · XML 오류)는 error 로 — 0줄과 섞지 않는다.
 *  P2 열 이름 한글/영문 — 위도 · 역위도 · lat · LAT · latitude · LATITUDE / 경도 · 역경도 · lng · LNG · longitude · LONGITUDE /
 *     역사명 · 역명 · STATN_NM / 노선명 · LINE_NM / 학교명 · 학교급구분 … · 위경도 뒤바뀜은 바로잡고 · 한국 밖 · 이름 없음은 뺀다.
 *  P3 요청 주소 · 쪽 넘기기 안전장치(0줄 · 전체 건수 · 쪽 상한 · 같은 쪽 반복) · 시간 상한 · 수(조회/제외/업서트) 기록.
 *  P4 역 노선 묶기 — "강남역 · 2호선·신분당선".
 *  P5 역 원천 — 공공 표 먼저 · 표가 통째로 빌 때만 OpenStreetMap.
 *  P6 관공서는 따로(part=osm) — main(유사 단지 · 역)을 늦추지 않고, 관공서 실패가 역 · 유사 단지를 실패로 만들지 않는다.
 *  P7 /api/map/poi — 과대 뷰포트는 DB 전에 · DB 실패는 "준비 중"이 아니라 503. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  decodeServiceKey,
  mergeStationRows,
  nextPageStep,
  normalizePoiRow,
  parsePoiPayload,
  poiPageUrl,
  poiSourceBase,
  stationLabel,
} from "@/lib/poi/parse";
import {
  areaCacheControl,
  areaPartCount,
  composeAreaView,
  hasFailedPart,
  mainPending,
  mergeAreaPart,
  osmFetchPlan,
  osmShown,
  parseAreaPart,
  reloadPlan,
  stationSourceFor,
  type AreaResponse,
} from "@/lib/map/area-parts";
import type { AreaComplex } from "@/lib/map/area-pick";

const read = (p: string) => readFileSync(p, "utf8");
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const C = { lat: 37.4979, lng: 127.0276 }; // 강남역 부근

/* ── P1 응답 모양 ─────────────────────────────────────────────────────── */

test("P1 odcloud — { data: [...] } · totalCount(없으면 matchCount) · 오류 { code, msg }", () => {
  const page = parsePoiPayload(
    JSON.stringify({ page: 1, perPage: 1000, totalCount: 2, currentCount: 2, matchCount: 2, data: [{ 역사명: "강남" }, { 역사명: "역삼" }] }),
  );
  assert.equal(page.flavor, "odcloud");
  assert.equal(page.rows.length, 2);
  assert.equal(page.totalCount, 2);
  assert.equal(page.error, null);
  assert.equal(parsePoiPayload(JSON.stringify({ matchCount: "7", data: [] })).totalCount, 7);
  const err = parsePoiPayload(JSON.stringify({ code: -4, msg: "등록되지 않은 인증키 입니다." }));
  assert.match(err.error ?? "", /-4 등록되지 않은 인증키/);
  assert.deepEqual(err.rows, []);
});

test("P1 오픈API tn_pubr_* — items 배열 · { item: [...] } · { item: {...} } · 빈 문자열 · 03 자료 없음 · 오류 코드 · XML", () => {
  const wrap = (items: unknown, extra: Record<string, unknown> = {}) =>
    JSON.stringify({ response: { header: { resultCode: "00", resultMsg: "NORMAL_SERVICE" }, body: { items, totalCount: "1234", numOfRows: "1000", pageNo: "1", ...extra } } });
  const a = parsePoiPayload(wrap([{ schoolNm: "가" }, { schoolNm: "나" }]));
  assert.equal(a.flavor, "openapi");
  assert.equal(a.rows.length, 2);
  assert.equal(a.totalCount, 1234);
  assert.equal(parsePoiPayload(wrap({ item: [{ a: 1 }, { a: 2 }, { a: 3 }] })).rows.length, 3);
  assert.equal(parsePoiPayload(wrap({ item: { a: 1 } })).rows.length, 1, "한 줄이면 item 이 객체로 온다");
  assert.deepEqual(parsePoiPayload(wrap("")).rows, []);
  const nodata = parsePoiPayload(JSON.stringify({ response: { header: { resultCode: "03", resultMsg: "NODATA_ERROR" } } }));
  assert.equal(nodata.error, null, "마지막 쪽을 넘긴 요청은 실패가 아니라 0줄");
  assert.deepEqual(nodata.rows, []);
  const bad = parsePoiPayload(JSON.stringify({ response: { header: { resultCode: "30", resultMsg: "SERVICE_KEY_IS_NOT_REGISTERED_ERROR" } } }));
  assert.match(bad.error ?? "", /30 SERVICE_KEY_IS_NOT_REGISTERED_ERROR/);
  const xml = parsePoiPayload(
    "<OpenAPI_ServiceResponse><cmmMsgHeader><errMsg>SERVICE ERROR</errMsg><returnAuthMsg>SERVICE_KEY_IS_NOT_REGISTERED_ERROR</returnAuthMsg></cmmMsgHeader></OpenAPI_ServiceResponse>",
  );
  assert.match(xml.error ?? "", /SERVICE_KEY_IS_NOT_REGISTERED_ERROR/);
  assert.match(parsePoiPayload(JSON.stringify({ hello: 1 })).error ?? "", /알 수 없는 응답 형식/);
  assert.equal(parsePoiPayload(JSON.stringify({ header: { resultCode: "00" }, body: { items: [{ x: 1 }] } })).rows.length, 1, "response 감싸개 없는 변형");
});

/* ── P2 열 이름 ───────────────────────────────────────────────────────── */

test("P2 역 — 한글 열(역사명 · 노선명 · 역위도 · 역경도) · 영문 열(STATN_NM · LINE_NM · LAT · LNG / LATITUDE · LONGITUDE)", () => {
  const ko = normalizePoiRow("stations", { 역번호: "222", 역사명: "강남", 노선명: "2호선", 역위도: "37.49794", 역경도: "127.02762", 운영기관명: "서울교통공사", 역사도로명주소: "서울특별시 강남구 강남대로 396" });
  assert.ok(ko.ok);
  assert.equal(ko.record.name, "강남");
  assert.equal(ko.record.line, "2호선");
  assert.equal(ko.record.lat, 37.49794);
  assert.equal(ko.record.lng, 127.02762);
  assert.equal(ko.record.operator, "서울교통공사");
  assert.match(ko.record.source_key, /^stn:서울교통공사\|2호선\|222$/);

  const en = normalizePoiRow("stations", { STATN_NM: "역삼", LINE_NM: "2호선", LAT: 37.5006, LNG: 127.0364 });
  assert.ok(en.ok);
  assert.deepEqual([en.record.name, en.record.line, en.record.lat, en.record.lng], ["역삼", "2호선", 37.5006, 127.0364]);
  const en2 = normalizePoiRow("stations", { stationName: "선릉", lineName: "수인분당선", LATITUDE: "37.5045", LONGITUDE: "127.0490" });
  assert.ok(en2.ok);
  assert.deepEqual([en2.record.name, en2.record.line], ["선릉", "수인분당선"]);
  const plain = normalizePoiRow("stations", { 역명: "삼성", 위도: 37.5088, 경도: 127.0631, latitude: 1 });
  assert.ok(plain.ok, "한글 별칭이 먼저");
  assert.equal(plain.record.lat, 37.5088);
  const loose = normalizePoiRow("stations", { 역사명: "교대", "위도(WGS84)": "37.4934", "경도(WGS84)": "127.0140" });
  assert.ok(loose.ok, "별칭에 없어도 '위도'/'경도'가 든 열");

  /* 역번호가 없으면 이름 · 노선 · 좌표 — 부산 1호선 시청 ≠ 서울 1호선 시청 */
  const seoul = normalizePoiRow("stations", { 역사명: "시청", 노선명: "1호선", 위도: 37.5657, 경도: 126.9769 });
  const busan = normalizePoiRow("stations", { 역사명: "시청", 노선명: "1호선", 위도: 35.1798, 경도: 129.0766 });
  assert.ok(seoul.ok && busan.ok);
  assert.notEqual(seoul.record.source_key, busan.record.source_key);
});

test("P2 학교 — 학교명 · 학교급구분 · 위도/경도 · 영문(schoolNm · schoolSe · latitude · longitude) · 같은 이름 다른 학교", () => {
  const ko = normalizePoiRow("schools", { 학교ID: "B000012345", 학교명: "서울중앙초등학교", 학교급구분: "초등학교", 시도교육청명: "서울특별시교육청", 소재지도로명주소: "서울특별시 강남구 …", 위도: "37.5", 경도: "127.03" });
  assert.ok(ko.ok);
  assert.deepEqual([ko.record.source_key, ko.record.name, ko.record.category, ko.record.sido], ["sch:B000012345", "서울중앙초등학교", "초등학교", "서울특별시교육청"]);
  const en = normalizePoiRow("schools", { schoolId: "B1", schoolNm: "가나중학교", schoolSe: "중학교", rdnmadr: "부산광역시 해운대구 …", latitude: "35.16", longitude: "129.16" });
  assert.ok(en.ok);
  assert.deepEqual([en.record.name, en.record.category, en.record.sido], ["가나중학교", "중학교", "부산광역시"], "시도가 없으면 주소 첫 마디");
  const a = normalizePoiRow("schools", { 학교명: "중앙초등학교", 위도: 37.5, 경도: 127.0 });
  const b = normalizePoiRow("schools", { 학교명: "중앙초등학교", 위도: 35.1, 경도: 129.0 });
  assert.ok(a.ok && b.ok);
  assert.notEqual(a.record.source_key, b.record.source_key, "ID 가 없으면 좌표를 열쇠에");
});

test("P2 버리는 줄 — 좌표 없음 · 0,0 · 한국 밖 · 이름 없음 / 위경도 뒤바뀜은 바로잡는다", () => {
  assert.deepEqual(normalizePoiRow("stations", { 역사명: "가" }), { ok: false, reason: "no-coord" });
  assert.deepEqual(normalizePoiRow("stations", { 역사명: "가", 위도: "", 경도: "127" }), { ok: false, reason: "no-coord" });
  assert.deepEqual(normalizePoiRow("stations", { 역사명: "가", 위도: 0, 경도: 0 }), { ok: false, reason: "no-coord" });
  assert.deepEqual(normalizePoiRow("stations", { 역사명: "가", 위도: 48.85, 경도: 2.35 }), { ok: false, reason: "out-of-range" });
  assert.deepEqual(normalizePoiRow("schools", { 위도: 37.5, 경도: 127 }), { ok: false, reason: "no-name" });
  const sw = normalizePoiRow("stations", { 역사명: "강남", 위도: 127.0276, 경도: 37.4979 });
  assert.ok(sw.ok);
  assert.equal(sw.swapped, true);
  assert.deepEqual([sw.record.lat, sw.record.lng], [37.4979, 127.0276]);
});

/* ── P3 요청 주소 · 쪽 넘기기 · 수 기록 ─────────────────────────────── */

test("P3 요청 주소 — odcloud 경로 · 오픈API 경로 · 전체 주소 · 다른 호스트 거절 · 인코딩 키는 한 번만", () => {
  const od = poiSourceBase("/api/15041335/v1/uddi:abc-123");
  assert.equal(od?.flavor, "odcloud");
  const odUrl = new URL(poiPageUrl(od!, "a+b/c==", 2, 1000));
  assert.equal(odUrl.origin + odUrl.pathname, "https://api.odcloud.kr/api/15041335/v1/uddi:abc-123");
  assert.deepEqual([odUrl.searchParams.get("page"), odUrl.searchParams.get("perPage"), odUrl.searchParams.get("returnType")], ["2", "1000", "JSON"]);
  assert.equal(odUrl.searchParams.get("serviceKey"), "a+b/c==");
  const api = poiSourceBase("/openapi/tn_pubr_public_test_api");
  assert.equal(api?.flavor, "openapi");
  const apiUrl = new URL(poiPageUrl(api!, "a%2Bb%2Fc%3D%3D", 3, 500));
  assert.equal(apiUrl.origin + apiUrl.pathname, "https://api.data.go.kr/openapi/tn_pubr_public_test_api");
  assert.deepEqual([apiUrl.searchParams.get("pageNo"), apiUrl.searchParams.get("numOfRows"), apiUrl.searchParams.get("type")], ["3", "500", "json"]);
  assert.equal(apiUrl.searchParams.get("serviceKey"), "a+b/c==", "인코딩 키를 넣어도 두 번 인코딩하지 않는다");
  assert.equal(poiSourceBase("tn_pubr_public_test_api")?.flavor, "openapi");
  assert.equal(poiSourceBase("http://api.data.go.kr/openapi/tn_pubr_x_api")?.url.protocol, "https:");
  assert.equal(poiSourceBase("https://api.odcloud.kr/api/1/v1/uddi:x")?.flavor, "odcloud");
  assert.equal(poiSourceBase("https://evil.example.com/api/x"), null);
  assert.equal(poiSourceBase("uddi:abc"), null);
  assert.equal(poiSourceBase(""), null);
  assert.equal(decodeServiceKey("plainKey=="), "plainKey==");
});

test("P3 쪽 넘기기 — 0줄 · 전체 건수 도달 · (건수 모름) 짧은 쪽에서 끝 · 쪽 상한 · 같은 쪽 반복", () => {
  const base = { page: 1, perPage: 1000, got: 1000, fetchedSoFar: 1000, totalCount: null, maxPages: 40, firstRowSig: "a", prevFirstRowSig: null };
  assert.equal(nextPageStep(base), "next");
  assert.equal(nextPageStep({ ...base, got: 0 }), "done");
  assert.equal(nextPageStep({ ...base, got: 412, fetchedSoFar: 1412 }), "done", "건수를 모르면 짧은 쪽이 끝");
  assert.equal(nextPageStep({ ...base, totalCount: 1000 }), "done");
  assert.equal(nextPageStep({ ...base, got: 100, fetchedSoFar: 100, totalCount: 12000 }), "next", "원천이 쪽 크기를 줄여도 건수까지 이어 묻는다");
  assert.equal(nextPageStep({ ...base, page: 40, totalCount: 99_999 }), "page-cap");
  assert.equal(nextPageStep({ ...base, page: 2, fetchedSoFar: 2000, prevFirstRowSig: "a" }), "repeated", "쪽 번호를 무시하는 원천");
});

test("P3 인제스트 소스 — 시간 상한 · 쪽 상한 · 한 upsert 안 중복 열쇠 제거 · 수 기록 · 역 먼저", () => {
  const store = code("lib/poi/store.ts");
  assert.match(store, /signal: AbortSignal\.timeout\(PAGE_TIMEOUT_MS\)/);
  assert.match(store, /if \(Date\.now\(\) - startedAt > KIND_BUDGET_MS\)/);
  assert.match(store, /maxPages: MAX_PAGES/);
  assert.match(store, /if \(seen\.has\(n\.record\.source_key\)\) \{\s*out\.skippedBy\.duplicate \+= 1;/);
  assert.match(store, /parsePoiPayload\(text\)/);
  assert.match(store, /process\.env\.POI_SCHOOLS_API_PATH/);
  assert.match(store, /process\.env\.POI_STATIONS_API_PATH/);
  assert.match(store, /process\.env\.DATA_GO_KR_SERVICE_KEY/);
  assert.match(store, /`조회=\$\{r\.fetched\}/);
  assert.match(store, /`제외=\$\{r\.skipped\}/);
  assert.match(store, /`업서트=\$\{r\.upserted\}`/);
  assert.doesNotMatch(store, /throw new Error\([^)]*\$\{url\}/, "serviceKey 가 든 주소를 오류 메시지에 싣지 않는다");
  const cron = code("app/api/cron/poi-ingest/route.ts");
  assert.match(cron, /for \(const kind of \["stations", "schools"\] as const\)/, "작은 역 표를 먼저");
  assert.match(cron, /message: summary/);
  assert.match(cron, /status: nothingSaved \|\| badPath \? "error" : !r\.configured \? "skipped" : "ok"/, "받았는데 0건 저장 · 경로 형식 오류는 오류로 남긴다");
});

/* ── P4 역 노선 묶기 ─────────────────────────────────────────────────── */

test("P4 같은 역은 하나 — 노선을 모으고(숫자 노선 먼저) · 가장 가까운 줄의 좌표 · 반경 밖 · 좌표 없음 제외", () => {
  const rows = [
    { name: "강남", line: "신분당선", lat: C.lat + 0.0006, lng: C.lng },
    { name: "강남역", line: "2호선", lat: C.lat + 0.0002, lng: C.lng },
    { name: "강남", line: "2호선", lat: C.lat + 0.0003, lng: C.lng },
    { name: "역삼", line: "2호선", lat: C.lat + 0.004, lng: C.lng + 0.008 },
    { name: "먼역", line: "9호선", lat: C.lat + 0.03, lng: C.lng },
    { name: "좌표없음", line: "1호선", lat: null, lng: C.lng },
  ];
  const out = mergeStationRows(rows, C, 1000);
  assert.deepEqual(out.map((s) => s.name), ["강남역", "역삼역"]);
  assert.equal(out[0].line, "2호선·신분당선");
  assert.equal(out[0].lat, C.lat + 0.0002, "가장 가까운 줄의 좌표");
  assert.ok(out[0].distanceM < 30);
  assert.equal(stationLabel(out[0]), "강남역 · 2호선·신분당선");
  assert.equal(stationLabel({ name: "역삼역", line: null }), "역삼역");
  assert.equal(mergeStationRows(rows, C, 1000, 1).length, 1, "가까운 순 상한");
  assert.deepEqual(mergeStationRows([{ name: "서울역", line: null, lat: C.lat, lng: C.lng }], C, 1000)[0], {
    name: "서울역",
    line: null,
    lat: C.lat,
    lng: C.lng,
    distanceM: 0,
  });
});

/* ── P5 역 원천 ──────────────────────────────────────────────────────── */

test("P5 역 원천 — 반경 안 줄 있으면 공공 · 표에 줄 있으면 공공('역 없음'이 사실) · 표가 통째로 빌 때만 OSM", () => {
  assert.equal(stationSourceFor(3, null), "public");
  assert.equal(stationSourceFor(0, true), "public");
  assert.equal(stationSourceFor(0, false), "osm");
  assert.equal(stationSourceFor(0, null), "public", "모르면 비었다고 보지 않는다");
  assert.deepEqual(mainPending("public"), ["offices"]);
  assert.deepEqual(mainPending("osm"), ["stations", "offices"]);

  const load = code("lib/map/area-load.ts");
  const fn = load.slice(load.indexOf("export async function loadAreaStations"), load.indexOf("export const loadAreaOsmCached"));
  assert.match(fn, /\.from\("poi_stations"\)\s*\.select\("name,line,lat,lng"\)\s*\.gte\("lat", box\.minLat\)/, "반경 bbox 로 공공 표");
  assert.match(fn, /const box = bboxForRadius\(center\.lat, center\.lng, AREA_RADIUS_M\);/);
  assert.match(fn, /if \(rows\.length === 0\) \{\s*const probe = await sb\.from\("poi_stations"\)\.select\("id"\)\.limit\(1\);/, "반경 안이 비었을 때만 표 전체 한 줄 확인");
  assert.match(fn, /stationSourceFor\(rows\.length, tableHasRows\)/);
  assert.match(fn, /mergeStationRows\(rows, center, AREA_RADIUS_M, 6\)/);
  assert.match(fn, /if \(error\) throw/, "조회 실패는 던진다(없음과 구분)");
});

/* ── P6 관공서 분리 ─────────────────────────────────────────────────── */

const C2 = { lat: 37.3943, lng: 126.9568 };
const cx = (name: string, distanceM: number, similarity: number | null): AreaComplex => ({
  name,
  regionName: "안양 동안구",
  lat: C2.lat,
  lng: C2.lng,
  distanceM,
  avgPerPyeongKrw: null,
  buildYear: null,
  households: null,
  similarity,
});
const resp = (over: Partial<AreaResponse>): AreaResponse => ({
  part: "main",
  center: C2,
  radiusM: 1000,
  similar: [],
  stations: [],
  offices: [],
  stationSource: "public",
  pending: ["offices"],
  missing: [],
  ...over,
});
const mainOk = resp({ similar: [cx("닮은", 300, 0.9)], stations: [{ name: "평촌역", line: "4호선", lat: C2.lat, lng: C2.lng, distanceM: 450 }] });
const osmFail = resp({ part: "osm", stationSource: null, pending: [], missing: ["offices"] });
const osmOk = resp({ part: "osm", stationSource: null, pending: [], offices: [{ name: "관양2동 행정복지센터", kind: "주민센터·청사", lat: C2.lat, lng: C2.lng, distanceM: 200 }] });

test("P6 route — main 은 DB 만(Overpass 를 부르지 않는다) · Overpass 는 part=osm 에서만 · 원천별 missing", () => {
  const r = code("app/api/complex/area/route.ts");
  const iOsm = r.indexOf('if (part === "osm")');
  const iMain = r.indexOf("} else {", iOsm);
  assert.ok(iOsm > 0 && iMain > iOsm);
  const osmBranch = r.slice(iOsm, iMain);
  const mainBranch = r.slice(iMain);
  assert.match(osmBranch, /await loadAreaOsmCached\(center\.lat, center\.lng\)/);
  assert.doesNotMatch(mainBranch, /loadAreaOsm/, "main 은 Overpass 를 기다리지 않는다");
  assert.match(mainBranch, /Promise\.allSettled\(\[\s*loadAreaComplexes\(/);
  assert.match(mainBranch, /loadAreaStations\(center\)/);
  assert.match(mainBranch, /pending: mainPending\(stationSource\)/);
  assert.match(osmBranch, /withStations \? \(\["stations", "offices"\] as const\) : \(\["offices"\] as const\)/);
  assert.equal(parseAreaPart("osm"), "osm");
  assert.equal(parseAreaPart(null), "main");
  assert.equal(parseAreaPart("anything"), "main");
});

test("P6 캐시 — 다 읽음 7일 · 공공 역 표가 비어 넘김 하루 · 못 읽음 5분", () => {
  assert.match(areaCacheControl(mainOk), /s-maxage=604800/);
  assert.match(areaCacheControl({ ...mainOk, stationSource: "osm" }), /s-maxage=86400(?!\d)/);
  assert.match(areaCacheControl({ ...mainOk, missing: ["similar"] }), /s-maxage=300(?!\d)/);
  assert.match(areaCacheControl(osmFail), /s-maxage=300(?!\d)/);
  assert.match(areaCacheControl(osmOk), /s-maxage=604800/);
});

test("P6 화면 상태 — main 만 와도 유사 단지 · 역을 그린다 · 관공서 실패는 관공서만 '—'", () => {
  const loading = composeAreaView({ main: null, mainFailed: false, osm: null, osmFailed: false });
  assert.deepEqual(loading.status, { similar: "loading", stations: "loading", offices: "loading" });
  assert.equal(areaPartCount(loading, "stations", 1000), null);

  const mainOnly = composeAreaView({ main: mainOk, mainFailed: false, osm: null, osmFailed: false });
  assert.deepEqual(mainOnly.status, { similar: "ok", stations: "ok", offices: "loading" }, "관공서를 기다리지 않는다");
  assert.equal(areaPartCount(mainOnly, "stations", 1000), "1");
  assert.equal(areaPartCount(mainOnly, "offices", 1000), null);

  const officeFail = composeAreaView({ main: mainOk, mainFailed: false, osm: osmFail, osmFailed: false });
  assert.deepEqual(officeFail.status, { similar: "ok", stations: "ok", offices: "failed" });
  assert.equal(areaPartCount(officeFail, "offices", 1000), "—");
  assert.equal(areaPartCount(officeFail, "stations", 1000), "1", "관공서 실패가 역으로 번지지 않는다");
  assert.equal(areaPartCount(officeFail, "similar", 1000), "1");
  assert.equal(osmShown(officeFail), false, "OSM 자료가 화면에 없으면 OSM 출처를 적지 않는다");
  assert.deepEqual(reloadPlan(officeFail), { main: false, osm: true, st: false }, "실패한 관공서 요청만 다시");

  const requestFail = composeAreaView({ main: mainOk, mainFailed: false, osm: null, osmFailed: true });
  assert.deepEqual(requestFail.status, { similar: "ok", stations: "ok", offices: "failed" });

  const all = composeAreaView({ main: mainOk, mainFailed: false, osm: osmOk, osmFailed: false });
  assert.deepEqual(all.status, { similar: "ok", stations: "ok", offices: "ok" });
  assert.equal(hasFailedPart(all), false);
  assert.equal(osmShown(all), true);

  const simFail = composeAreaView({ main: resp({ ...mainOk, similar: [], missing: ["similar"] }), mainFailed: false, osm: osmOk, osmFailed: false });
  assert.deepEqual(simFail.status, { similar: "failed", stations: "ok", offices: "ok" });
  assert.deepEqual(reloadPlan(simFail), { main: true, osm: false, st: false });

  const mainDown = composeAreaView({ main: null, mainFailed: true, osm: osmOk, osmFailed: false });
  assert.deepEqual(mainDown.status, { similar: "failed", stations: "failed", offices: "ok" });
});

test("P6 공공 역 표가 빈 동안 — main 은 stationSource osm · osm 요청이 st=1 로 역까지 · 그 실패는 역 · 관공서만", () => {
  const mainOsm = resp({ ...mainOk, stations: [], stationSource: "osm", pending: ["stations", "offices"] });
  assert.equal(osmFetchPlan({ main: null, mainFailed: false, osm: null, osmFailed: false }), null, "main 전에는 부르지 않는다");
  assert.deepEqual(osmFetchPlan({ main: mainOk, mainFailed: false, osm: null, osmFailed: false }), { st: false });
  assert.deepEqual(osmFetchPlan({ main: mainOsm, mainFailed: false, osm: null, osmFailed: false }), { st: true });
  assert.deepEqual(osmFetchPlan({ main: null, mainFailed: true, osm: null, osmFailed: false }), { st: false }, "main 이 실패해도 관공서는 따로");
  assert.equal(osmFetchPlan({ main: mainOk, mainFailed: false, osm: osmOk, osmFailed: false }), null);
  assert.deepEqual(osmFetchPlan({ main: mainOsm, mainFailed: false, osm: osmOk, osmFailed: false }), { st: true }, "역 없이 받은 osm 이면 역까지 다시");
  assert.equal(osmFetchPlan({ main: mainOk, mainFailed: false, osm: null, osmFailed: true }), null, "실패 뒤 재요청은 '다시 불러오기'가");

  const waiting = composeAreaView({ main: mainOsm, mainFailed: false, osm: null, osmFailed: false });
  assert.deepEqual(waiting.status, { similar: "ok", stations: "loading", offices: "loading" });
  const osmSt = resp({ part: "osm", stationSource: "osm", pending: [], stations: [{ name: "평촌역", line: null, lat: C2.lat, lng: C2.lng, distanceM: 450 }], offices: osmOk.offices });
  const got = composeAreaView({ main: mainOsm, mainFailed: false, osm: osmSt, osmFailed: false });
  assert.deepEqual(got.status, { similar: "ok", stations: "ok", offices: "ok" });
  assert.equal(got.stations[0].name, "평촌역");
  assert.equal(osmShown(got), true);
  const stFail = composeAreaView({ main: mainOsm, mainFailed: false, osm: resp({ part: "osm", stationSource: "osm", pending: [], missing: ["stations", "offices"] }), osmFailed: false });
  assert.deepEqual(stFail.status, { similar: "ok", stations: "failed", offices: "failed" });
  assert.deepEqual(reloadPlan(stFail), { main: false, osm: true, st: true });
});

test("P6 mergeAreaPart — 다시 부른 응답과 합칠 때 원천별로 읽은 쪽을 남긴다", () => {
  const retry = resp({ ...mainOk, similar: [], missing: ["similar"] });
  const merged = mergeAreaPart(resp({ ...mainOk, stations: [], missing: ["stations"] }), retry);
  assert.deepEqual(merged.missing, [], "처음 읽은 유사 단지 + 다시 읽은 역");
  assert.equal(merged.similar.length, 1);
  assert.equal(merged.stations.length, 1);
  assert.equal(mergeAreaPart(null, retry), retry);
  assert.equal(mergeAreaPart(osmOk, retry), retry, "다른 쪽(main · osm)은 섞지 않는다");
  const osmMerged = mergeAreaPart(osmOk, osmFail);
  assert.deepEqual(osmMerged.missing, []);
  assert.equal(osmMerged.offices.length, 1);
});

test("P6 지도 카드 — 역 출처(공공데이터) · OSM 출처는 OSM 자료가 있을 때만 · 실거래 문구 · 노선 이름표", () => {
  const map = code("app/complex/[id]/ComplexAreaMap.tsx");
  assert.match(map, /역 = 공공데이터 전국도시철도역사정보표준데이터/);
  assert.match(map, /\{stationsFromPublic \? /);
  assert.match(map, /const showOsmCredit = osmShown\(view\);/);
  assert.match(map, /\{showOsmCredit\s*\?\s*` · \$\{[^}]*\} © OpenStreetMap 기여자`/);
  assert.match(map, /주변 단지 = 가까운 순 · 비교할 실거래 없음/);
  assert.doesNotMatch(read("app/complex/[id]/ComplexAreaMap.tsx"), /시세/, "실거래만 있는 화면에 '시세'라 쓰지 않는다");
  assert.match(map, /`가까운 역 \$\{stationLabel\(nearestStation\)\} · \$\{formatStraightDistance\(nearestStation\.distanceM\)\}`/);
  assert.match(map, /"역 불러오기 실패 · 잠시 후 다시"/);
  assert.match(map, /const count = \(k: Layer\) => areaPartCount\(view, k, radius\);/);
  /* main → osm 순서 · main 효과는 Overpass 를 부르지 않는다 */
  assert.match(map, /fetchArea\(areaUrl\(\{ lat, lng, part: "main", name, buildYear \}\), "main", ctrl\.signal\)/);
  assert.match(map, /const osmPlan = active \? osmFetchPlan\(\{ main, mainFailed, osm, osmFailed \}\) : null;/);
  assert.match(map, /qs\.set\("v", "2"\);/, "예전 모양 캐시 칸을 피한다");
});

/* ── P7 /api/map/poi ─────────────────────────────────────────────────── */

test("P7 /api/map/poi — 과대 뷰포트는 DB 전에 · 정확 개수 없음 · DB 실패는 503(준비 중 아님)", () => {
  const r = code("app/api/map/poi/route.ts");
  const iWide = r.indexOf("if (tooWide) {");
  assert.ok(iWide > 0);
  assert.ok(iWide < r.indexOf("getServiceSupabase()"), "줌아웃은 DB 를 묻지 않는다");
  assert.doesNotMatch(r, /count: "exact"/);
  assert.match(r, /if \(failed\?\.error\) \{[\s\S]{0,200}return dbUnavailable\("map\/poi", failed\.error, "학교·지하철 불러오기 실패"\);/);
  assert.match(r, /schoolsReady: null, stationsReady: null, tooWide: true/, "줌아웃에서는 ready 를 모른다(null)");
  /* 화면은 실패 응답(!r.ok)을 "불러오기 실패"로 그린다 */
  const client = code("app/map/map-client.tsx");
  assert.match(client, /\.then\(\(r\) => \(r\.ok \? r\.json\(\) : Promise\.reject\(new Error\(String\(r\.status\)\)\)\)\)/);
  assert.match(client, /text: "학교·지하철 불러오기 실패 · 잠시 후 다시"/);
  const iFail = client.indexOf('key: "poi-failed"');
  const iZoom = client.indexOf('key: "poi-zoom"');
  const iReady = client.indexOf('key: "poi-not-ready"');
  assert.ok(iFail > 0 && iFail < iZoom && iZoom < iReady, "실패 → 줌아웃 → 준비 중 순으로 가른다");
});
