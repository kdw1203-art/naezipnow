/* [1104] 멈춘 일일 수집 두 묶음 — KOSIS 보조지표 · 생활 인프라(학교 · 도시철도역) 표준데이터.
 *
 * 잠그는 사실:
 *  K1 KOSIS 요청 — jsonVD=Y(없으면 따옴표 없는 JS 객체 → JSON.parse 실패 → 115회 0건) · 표 축 수만큼 objL · 인구는 T20 만.
 *  K2 KOSIS 응답 — { err, errMsg } (따옴표 있든 없든) 는 코드·문구로 · 배열은 행 · HTML/빈 응답도 던지지 않는다.
 *  K3 지역 매핑 — 시도 안에서만(부산 동구 ≠ 강동구 · 대구 중구 ≠ 서울 중구) · 일반구는 상위 시 이름으로 · 시도 표는 sido-<영문>.
 *  K4 기록 — 표마다 적재 수 또는 KOSIS 오류 코드 · 같은 오류는 한 번 · 인증키면 KOSIS_API_KEY · 실패가 있으면 status=error.
 *  K5 표 레지스트리 — 없는 표(DT_2KAA101) 제거 · 인허가 연간 · 미분양 2축 · 착공 3축 "총계".
 *  P1 POI 경로 — 학교는 고정 요청주소 기본값 · 역은 env 필수(지어내지 않음) · 미구성 문구에 env 이름 · 데이터셋 번호.
 *  P2 POI 원천 실패 — 활용신청 안 된 키(30 SERVICE_KEY_IS_NOT_REGISTERED · HTTP 401/403)에 할 일을 붙인다.
 *  P3 학교 오픈API 영문 열(schoolId · schoolNm · cddcNm · latitude …) — 시도는 시도교육청명(cddcNm). */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  buildKosisUrl,
  describeKosisError,
  kosisErrorKind,
  kosisIngestMessage,
  kosisIngestStatus,
  kosisPeriodToDate,
  mapKosisRows,
  parseKosisResponse,
  type KosisTableOutcome,
  type RawKosisRow,
} from "@/lib/kosis/parse";
import { KOSIS_TABLES, type KosisTable } from "@/lib/kosis/stat-tables";
import {
  normalizePoiRow,
  parsePoiPayload,
  poiPageUrl,
  poiSourceBase,
  poiSourceErrorHint,
  poiUnconfiguredMessage,
  resolvePoiApiPath,
} from "@/lib/poi/parse";

const read = (p: string) => readFileSync(p, "utf8");
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const table = (label: string): KosisTable => {
  const t = KOSIS_TABLES.find((x) => x.label === label);
  assert.ok(t, label);
  return t;
};
const params = (u: string) => new URL(u).searchParams;

/* ── K1 요청 주소 ─────────────────────────────────────────────────────── */

test("K1 KOSIS 요청 — jsonVD=Y · 축 수만큼 objL · 항목 고정 · 시점 수 상한", () => {
  const unsold = params(buildKosisUrl(table("미분양주택현황"), { apiKey: "K", recentCount: 2 }));
  assert.equal(unsold.get("jsonVD"), "Y", "jsonVD=Y 가 없으면 키에 따옴표 없는 JS 객체가 온다");
  assert.equal(unsold.get("jsonVifId"), null, "예전 오타 파라미터는 없다");
  assert.equal(unsold.get("format"), "json");
  assert.equal(unsold.get("method"), "getList");
  assert.deepEqual([unsold.get("orgId"), unsold.get("tblId"), unsold.get("prdSe")], ["116", "DT_MLTM_2082", "M"]);
  assert.deepEqual([unsold.get("objL1"), unsold.get("objL2"), unsold.get("objL3")], ["ALL", "ALL", null], "미분양 표는 2축(시도 · 시군구)");
  assert.equal(unsold.get("newEstPrdCnt"), "2");

  const starts = params(buildKosisUrl(table("주택건설착공실적"), { apiKey: "K" }));
  assert.deepEqual([starts.get("objL1"), starts.get("objL2"), starts.get("objL3"), starts.get("objL4")], ["ALL", "ALL", "ALL", null], "착공 표는 3축");

  const pop = params(buildKosisUrl(table("주민등록인구"), { apiKey: "K" }));
  assert.equal(pop.get("itmId"), "T20", "총인구수만 — 남·여가 총인구를 덮어쓰지 않게");
  assert.equal(pop.get("objL2"), null, "주민등록 표는 1축");

  const permits = params(buildKosisUrl(table("주택건설인허가실적"), { apiKey: "K" }));
  assert.equal(permits.get("prdSe"), "Y", "DT_MLTM_666 은 연간 표");
  assert.equal(permits.get("newEstPrdCnt"), "1", "연간 표 기본 시점 1");

  assert.equal(params(buildKosisUrl(table("주민등록인구"), { apiKey: "K", recentCount: 999 })).get("newEstPrdCnt"), "24");
  assert.equal(params(buildKosisUrl(table("주민등록인구"), { apiKey: "K", recentCount: 0 })).get("newEstPrdCnt"), "1");
});

/* ── K2 응답 해석 ─────────────────────────────────────────────────────── */

test("K2 KOSIS 응답 — 오류 코드 · 문구를 버리지 않는다(따옴표 없는 옛 모양 포함)", () => {
  // 실측(키 없이 공개 호출, 2026-11-04): jsonVD 없음 → 따옴표 없는 키 · jsonVD=Y → 표준 JSON
  assert.deepEqual(parseKosisResponse('{err:"10",errMsg:"인증 KEY값이 누락되었습니다."}'), {
    ok: false,
    code: "10",
    message: "인증 KEY값이 누락되었습니다.",
  });
  assert.deepEqual(parseKosisResponse('{"err":"11","errMsg":"유효하지 않은 인증KEY입니다."}'), {
    ok: false,
    code: "11",
    message: "유효하지 않은 인증KEY입니다.",
  });
  assert.deepEqual(parseKosisResponse('{"err":"20","errMsg":"필수요청변수값이 누락되었습니다. (objL)"}').ok, false);
  const rows = parseKosisResponse('[{"PRD_DE":"202609","C1":"11680","C1_NM":"강남구","ITM_ID":"T20","DT":"551234"}]');
  assert.ok(rows.ok && rows.rows.length === 1 && rows.rows[0].C1_NM === "강남구");
  const html = parseKosisResponse("<html><body>점검 중입니다</body></html>");
  assert.equal(html.ok, false);
  assert.ok(!html.ok && html.code === "non-json" && /점검 중/.test(html.message));
  assert.deepEqual(parseKosisResponse("  "), { ok: false, code: "empty", message: "빈 응답" });
  assert.equal(parseKosisResponse('{"foo":1}').ok, false);

  assert.equal(kosisErrorKind("11"), "auth");
  assert.equal(kosisErrorKind("10"), "auth");
  assert.equal(kosisErrorKind("20"), "request");
  assert.equal(kosisErrorKind("30"), "no-data");
  assert.equal(kosisErrorKind("40"), "limit");
  assert.equal(kosisErrorKind("HTTP 503"), "server");
  assert.equal(kosisErrorKind("timeout"), "network");
  assert.equal(describeKosisError({ code: "11", message: "유효하지 않은 인증KEY입니다." }), "KOSIS err 11 유효하지 않은 인증KEY입니다.");
  assert.equal(describeKosisError({ code: "31", message: "" }), "KOSIS err 31 조회결과 40,000셀 초과");
});

/* ── K3 지역 매핑 ─────────────────────────────────────────────────────── */

test("K3 미분양(2축) — 시도 안에서만 붙인다 · 합계 · 경기 시 단위는 버린다 · '-' 는 0이 아니다", () => {
  const t = table("미분양주택현황");
  const row = (C1_NM: string, C2_NM: string, DT = "10"): RawKosisRow => ({ PRD_DE: "202609", C1_NM, C2_NM, DT, ITM_NM: "미분양현황" });
  const out = mapKosisRows(t, [
    row("서울", "강남구", "12"),
    row("부산", "동구", "34"),
    row("대구", "중구", "56"),
    row("서울", "중구", "7"),
    row("전남광주", "광산구", "8"),
    row("서울", "계", "999"),
    row("경기", "수원시", "11"),
    row("경기", "화성시 동탄구", "0"),
    row("서울", "종로구", "-"),
  ]);
  const got = Object.fromEntries(out.rows.map((r) => [r.region.id, r.value]));
  assert.equal(got.gangnam, 12);
  assert.equal(got["busan-dong"], 34, "부산 동구는 부산 동구 — 서울 강동구가 아니다");
  assert.equal(got.gangdong, undefined);
  assert.equal(got["daegu-jung"], 56);
  assert.equal(got.jung, 7, "서울 중구는 서울 중구");
  assert.equal(got["gwangju-gwangsan"], 8, "통합 시도 표기(전남광주)도 광주 광산구로");
  assert.equal(got["hwaseong-dongtan"], 0, "실제 0 은 0");
  assert.equal(out.rows.length, 6);
  assert.equal(out.unmatched, 2, "서울 계 · 경기 수원시(카탈로그는 구 단위)는 못 붙인다");
  assert.ok(!out.rows.some((r) => r.region.id === "jongno"), "'-' 는 값이 없다는 뜻 — 0 으로 싣지 않는다");
  assert.ok(out.rows.every((r) => r.region.level === "sigungu"));
});

test("K3 주민등록(1축 · 코드 계층) — 시도는 코드 앞 2자리 · 일반구는 상위 시 이름으로 · 항목 T20 만", () => {
  const t = table("주민등록인구");
  const r = (C1: string, C1_NM: string, DT: string, ITM_ID = "T20"): RawKosisRow => ({ PRD_DE: "202610", C1, C1_NM, DT, ITM_ID, ITM_NM: "총인구수" });
  const out = mapKosisRows(t, [
    r("00", "전국", "51000000"),
    r("11", "서울특별시", "9300000"),
    r("11680", "강남구", "551234"),
    r("11680", "강남구", "270000", "T21"),
    r("26170", "동구", "88000"),
    r("27110", "중구", "75000"),
    r("41110", "수원시", "1190000"),
    r("41117", "영통구", "360000"),
    r("4111300000", "권선구", "370000"),
    r("4111000000", "수원시", "1190000"),
    r("36110", "세종특별자치시", "390000"),
  ]);
  const got = Object.fromEntries(out.rows.map((x) => [x.region.id, x.value]));
  assert.equal(got.gangnam, 551234, "T21(남자) 행은 버린다");
  assert.equal(got["busan-dong"], 88000, "26xxx = 부산");
  assert.equal(got["daegu-jung"], 75000, "27xxx = 대구");
  assert.equal(got["suwon-yeongtong"], 360000, "41117 영통구 → 상위 41110 수원시 → 수원시 영통구");
  assert.equal(got["suwon-gwonseon"], 370000, "10자리 코드도 앞 5자리로");
  assert.equal(got.sejong, 390000);
  assert.equal(got.gangdong, undefined);
  assert.equal(got.jung, undefined);
  assert.ok(!out.rows.some((x) => x.value === 51000000 || x.value === 9300000), "전국 · 시도 행은 시군구 지표에 싣지 않는다");
});

test("K3 시도 표(보급률 · 착공) — sido-<영문> · 세종은 'sejong' · 항목 · 고정 분류 이름으로 고른다", () => {
  const ratio = mapKosisRows(table("주택보급률"), [
    { PRD_DE: "2024", C1_NM: "서울", ITM_NM: "보급률", DT: "93.7" },
    { PRD_DE: "2024", C1_NM: "서울", ITM_NM: "보급률(다가구 구분거처 반영)", DT: "97.1" },
    { PRD_DE: "2024", C1_NM: "서울", ITM_NM: "주택수", DT: "3900000" },
    { PRD_DE: "2024", C1_NM: "세종", ITM_NM: "보급률", DT: "107.2" },
    { PRD_DE: "2024", C1_NM: "수도권", ITM_NM: "보급률", DT: "98.0" },
    { PRD_DE: "2024", C1_NM: "전국", ITM_NM: "보급률", DT: "102.9" },
  ]);
  assert.deepEqual(
    ratio.rows.map((r) => [r.region.id, r.region.level, r.value]),
    [
      ["sido-seoul", "sido", 93.7],
      ["sejong", "sigungu", 107.2],
    ],
  );
  assert.equal(ratio.unmatched, 2, "수도권 · 전국");

  const starts = mapKosisRows(table("주택건설착공실적"), [
    { PRD_DE: "202608", C1_NM: "총계", C2_NM: "총계", C3_NM: "서울", DT: "1500" },
    { PRD_DE: "202608", C1_NM: "공공부문", C2_NM: "총계", C3_NM: "서울", DT: "200" },
    { PRD_DE: "202608", C1_NM: "총계", C2_NM: "민간분양", C3_NM: "서울", DT: "900" },
    { PRD_DE: "202608", C1_NM: "총계", C2_NM: "총계", C3_NM: "경기", DT: "4200" },
  ]);
  assert.deepEqual(starts.rows.map((r) => [r.region.id, r.value]), [["sido-seoul", 1500], ["sido-gyeonggi", 4200]]);

  assert.equal(kosisPeriodToDate("202609"), "2026-09-01");
  assert.equal(kosisPeriodToDate("2024"), "2024-01-01");
});

/* ── K4 기록 문구 · 상태 ──────────────────────────────────────────────── */

const o = (label: string, p: Partial<KosisTableOutcome> = {}): KosisTableOutcome => ({
  label,
  received: 0,
  matched: 0,
  unmatched: 0,
  error: null,
  ...p,
});

test("K4 기록 — 인증키 오류는 한 번 · KOSIS_API_KEY 안내 · status=error (예전엔 skipped 0건)", () => {
  const auth = { code: "11", message: "유효하지 않은 인증KEY입니다." };
  const all = KOSIS_TABLES.map((t) => o(t.label, { error: auth }));
  const msg = kosisIngestMessage(0, all);
  assert.equal(kosisIngestStatus(0, all), "error");
  assert.match(msg, /^series=0 · 6개 표 모두 KOSIS err 11 유효하지 않은 인증KEY입니다\. · /);
  assert.match(msg, /KOSIS_API_KEY/);
  assert.doesNotMatch(msg, /키 활성화\/표ID 확인 필요/, "무엇이 문제인지 모르는 옛 문구는 없다");
  assert.equal(msg.match(/err 11/g)?.length, 1);
});

test("K4 기록 — 표마다 적재 수 · 응답 수 · 실패 코드 · 자료 없음(err 30)은 실패가 아니다", () => {
  const out = [
    o("미분양주택현황", { received: 576, matched: 212, unmatched: 364 }),
    o("주민등록인구", { received: 280, matched: 280 }),
    o("주택건설착공실적", { error: { code: "20", message: "필수요청변수값이 누락되었습니다. (objL)" } }),
    o("주택보급률", { error: { code: "30", message: "데이터가 존재하지 않습니다." } }),
    o("주택건설인허가실적", { received: 40, matched: 0, unmatched: 40 }),
  ];
  const msg = kosisIngestMessage(492, out);
  assert.equal(kosisIngestStatus(492, out), "ok");
  assert.equal(
    msg,
    "series=492 · 미분양주택현황 212건(응답 576행) · 주민등록인구 280건 · " +
      "주택건설착공실적 실패(KOSIS err 20 필수요청변수값이 누락되었습니다. (objL)) · " +
      "주택보급률 0건(KOSIS 자료 없음 · err 30) · 주택건설인허가실적 0건(응답 40행 · 지역 매칭 0) · " +
      "표 구조·요청변수 확인 필요(lib/kosis/stat-tables.ts · 코드 쪽)",
  );
  assert.equal(kosisIngestStatus(0, [o("a", { error: { code: "30", message: "" } })]), "skipped", "자료 없음뿐이면 skipped");
  assert.equal(kosisIngestStatus(0, [o("a", { received: 10, matched: 10 })]), "error", "매핑은 됐는데 저장 0 = DB 실패");
  assert.match(kosisIngestMessage(0, [o("a", { received: 10, matched: 10 })]), /^series=0\(매핑 10 중 · DB 저장 실패 확인\)/);
});

/* ── K5 표 레지스트리 · 소스 ─────────────────────────────────────────── */

test("K5 표 레지스트리 — 없는 표 제거 · 축 수 · 지역 단위", () => {
  const ids = KOSIS_TABLES.map((t) => `${t.orgId}/${t.tblId}`);
  assert.ok(!ids.some((x) => x.endsWith("DT_2KAA101")), "DT_2KAA101 은 국토부에 없는 표(통계청 같은 ID 는 국토면적 · 국가별)");
  assert.ok(ids.includes("116/DT_MLTM_2100"), "(新)주택보급률");
  assert.deepEqual(
    KOSIS_TABLES.map((t) => [t.label, t.objL.length, t.regionLevel]),
    [
      ["미분양주택현황", 2, "sigungu"],
      ["주민등록세대수", 1, "sigungu"],
      ["주민등록인구", 1, "sigungu"],
      ["주택건설인허가실적", 1, "sido"],
      ["주택건설착공실적", 3, "sido"],
      ["주택보급률", 1, "sido"],
    ],
  );
  assert.equal(table("미분양주택현황").sidoAxis, "C1");
  assert.equal(table("미분양주택현황").regionAxis, "C2");

  const client = code("lib/kosis/client.ts");
  assert.doesNotMatch(client, /jsonVifId/);
  assert.doesNotMatch(client, /return \[\];/, "실패를 빈 배열(=0건)로 묻지 않는다");
  assert.match(client, /parseKosisResponse\(text\)/);
  assert.doesNotMatch(client, /logger\.\w+\([^)]*buildKosisUrl/, "apiKey 가 든 주소를 로그에 싣지 않는다");
  const ingest = code("lib/kosis/ingest.ts");
  assert.match(ingest, /message = kosisIngestMessage\(seriesRows, outcomes\)/);
  assert.match(ingest, /status = kosisIngestStatus\(seriesRows, outcomes\)/);
  assert.match(ingest, /level: row\.region\.level/, "시도 표는 시도 단위로 싣는다");
  assert.doesNotMatch(ingest, /키 활성화\/표ID 확인 필요/);
});

/* ── P1 POI 경로 ──────────────────────────────────────────────────────── */

test("P1 POI — 학교는 고정 요청주소 기본값 · 역은 env 필수 · 미구성 문구에 env 이름 · 데이터셋 번호", () => {
  assert.deepEqual(resolvePoiApiPath("schools", undefined), { path: "tn_pubr_public_elesch_mskul_lc_api", from: "default" });
  assert.deepEqual(resolvePoiApiPath("schools", "  "), { path: "tn_pubr_public_elesch_mskul_lc_api", from: "default" });
  assert.deepEqual(resolvePoiApiPath("schools", "/api/15021148/v1/uddi:abc"), { path: "/api/15021148/v1/uddi:abc", from: "env" });
  assert.equal(resolvePoiApiPath("stations", undefined), null, "역 표준데이터는 오픈API 요청주소가 없다 — 지어내지 않는다");

  const base = poiSourceBase(resolvePoiApiPath("schools", undefined)!.path);
  assert.ok(base);
  assert.equal(base.flavor, "openapi");
  assert.equal(base.url.toString(), "https://api.data.go.kr/openapi/tn_pubr_public_elesch_mskul_lc_api");
  const u = new URL(poiPageUrl(base, "K", 2, 1000));
  assert.deepEqual([u.searchParams.get("pageNo"), u.searchParams.get("numOfRows"), u.searchParams.get("type")], ["2", "1000", "json"]);

  const st = poiUnconfiguredMessage("stations", "no-path");
  assert.match(st, /^POI_STATIONS_API_PATH 미설정 · /);
  assert.match(st, /15013205/);
  assert.match(st, /Vercel env/);
  assert.match(poiUnconfiguredMessage("schools", "no-key"), /^DATA_GO_KR_SERVICE_KEY 미설정/);
  assert.match(poiUnconfiguredMessage("schools", "bad-path"), /^POI_SCHOOLS_API_PATH 형식 오류/);

  const store = code("lib/poi/store.ts");
  assert.match(store, /resolvePoiApiPath\(\s*kind,/);
  assert.match(store, /poiUnconfiguredMessage\(r\.kind, r\.reason\)/, "no-path 한 단어가 아니라 할 일까지");
  assert.match(store, /poiSourceErrorHint\(kind, got\.error\)/);
});

/* ── P2 원천 실패 안내 · P3 영문 열 ───────────────────────────────────── */

test("P2 POI — 활용신청 안 된 키는 무엇을 신청할지 붙인다 · 다른 오류는 그대로", () => {
  const xml =
    "<OpenAPI_ServiceResponse><cmmMsgHeader><errMsg>SERVICE ERROR</errMsg>" +
    "<returnAuthMsg>SERVICE_KEY_IS_NOT_REGISTERED_ERROR</returnAuthMsg><returnReasonCode>30</returnReasonCode></cmmMsgHeader></OpenAPI_ServiceResponse>";
  const page = parsePoiPayload(xml);
  assert.ok(page.error);
  const hinted = poiSourceErrorHint("schools", page.error);
  assert.match(hinted, /SERVICE_KEY_IS_NOT_REGISTERED_ERROR · DATA_GO_KR_SERVICE_KEY 계정으로 전국초중등학교위치표준데이터 오픈API\(data\.go\.kr 15021148\) 활용신청 필요$/);
  assert.match(poiSourceErrorHint("stations", "HTTP 403 Forbidden"), /역 위치 오픈API.*활용신청 필요/);
  assert.match(poiSourceErrorHint("schools", 'HTTP 401 {"code":-4,"msg":"등록되지 않은 인증키 입니다."}'), /활용신청 필요/);
  assert.equal(poiSourceErrorHint("schools", "openapi 10 INVALID_REQUEST_PARAMETER_ERROR"), "openapi 10 INVALID_REQUEST_PARAMETER_ERROR");
});

test("P3 학교 오픈API 영문 열 — schoolId · schoolNm · schoolSe · cddcNm(시도교육청) · latitude/longitude", () => {
  const n = normalizePoiRow("schools", {
    schoolId: "B000012345",
    schoolNm: "서울중앙초등학교",
    schoolSe: "초등학교",
    cddcNm: "서울특별시교육청",
    edcSportNm: "서울특별시강남서초교육지원청",
    rdnmadr: "서울특별시 강남구 …",
    latitude: "37.5",
    longitude: "127.03",
  });
  assert.ok(n.ok);
  assert.deepEqual([n.record.source_key, n.record.name, n.record.category, n.record.sido], [
    "sch:B000012345",
    "서울중앙초등학교",
    "초등학교",
    "서울특별시교육청",
  ]);
});
