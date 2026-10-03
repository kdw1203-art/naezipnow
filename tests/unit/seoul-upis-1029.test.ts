/* [1029] 서울 도시계획 결정 조서(UPIS) — 파서·표기·이름 줄기·구별 요약의 규칙과, 크론·화면·카탈로그가 제대로 이어졌는지를 잠근다.
   원문 값은 열린데이터광장 공개 샘플(sample 키 · 5행)과 문서의 항목 이름만 쓴다 — 인증키는 테스트에 없다. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

import {
  UPIS_ANNOUNCEMENT_SERVICE,
  UPIS_SERVICES,
  UPIS_SERVICE_META,
  UPIS_SOURCE_URL,
  isUpisService,
  mapUpisAnnouncement,
  mapUpisRecord,
  summarizeByGu,
  upisAnnouncementToRecord,
  upisAreaLabel,
  upisCodeDate,
  upisDateLabel,
  upisEmd,
  upisKind,
  upisRowToRecord,
  upisSigungu,
  zoneNamePattern,
  zoneNameStems,
} from "../../lib/seoul/upis.ts";

const code = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

/* ── 서비스 목록 ───────────────────────────────────────────────────────── */

test("[1029] 서비스 셋 + 결정고시 — 이름·데이터셋 번호가 열린데이터광장 표기와 같다", () => {
  assert.deepEqual([...UPIS_SERVICES], ["upisRebuild", "upisUrbanDev", "upisDistUnitPlan"]);
  assert.equal(UPIS_ANNOUNCEMENT_SERVICE, "upisAnnouncement");
  assert.equal(UPIS_SERVICE_META.upisRebuild.datasetId, "OA-20281");
  assert.equal(UPIS_SERVICE_META.upisUrbanDev.datasetId, "OA-20287");
  assert.equal(UPIS_SERVICE_META.upisDistUnitPlan.datasetId, "OA-20280");
  for (const s of UPIS_SERVICES) {
    assert.match(UPIS_SERVICE_META[s].datasetUrl, /^https:\/\/data\.seoul\.go\.kr\/dataList\/OA-\d+\/S\/1\/datasetView\.do$/);
    assert.ok(UPIS_SERVICE_META[s].short.length <= 4, "표의 작은 배지는 네 글자까지");
  }
  assert.ok(isUpisService("upisRebuild"));
  assert.ok(!isUpisService("upisAnnouncement"), "결정고시는 조서 서비스가 아니다(다른 표)");
  assert.ok(!isUpisService(""));
  assert.match(UPIS_SOURCE_URL, /^https:\/\/data\.seoul\.go\.kr\//);
});

/* ── 시군구 ───────────────────────────────────────────────────────────── */

test("[1029] 시군구 — 코드 앞 5자리 > 지자체 > 위치명·지역명 > null(지어내지 않는다)", () => {
  assert.equal(upisSigungu({ rptMngCd: "11680AGZ202212050001" }), "강남구", "11680 = 강남구");
  assert.equal(upisSigungu({ rptMngCd: "11000AGZ202212050001", logvm: "서울특별시" }), null, "11000 은 시청 접수 — 구를 모른다");
  assert.equal(upisSigungu({ rptMngCd: "11000AGZ202212050001", logvm: "성동구" }), "성동구");
  assert.equal(upisSigungu({ rptMngCd: "11000AGZ202212050001", pstnNm: "성동구 하왕십리동 890번지 일대" }), "성동구");
  assert.equal(upisSigungu({ rptMngCd: "11000AGZ202212050001", rgnNm: "하왕제1구역제1지구", pstnNm: "태평로2가 43일대" }), null, "도심 조서 — 구 없음");
  assert.equal(upisSigungu({ rptMngCd: "41135AGZ202212050001", pstnNm: "분당구 정자동" }), null, "서울 밖 코드는 서울 구로 읽지 않는다");
  assert.equal(upisSigungu({ rptMngCd: "11000AGZ202212050001", logvm: "중구" }), "중구");
  assert.equal(upisSigungu({ rptMngCd: "11000AGZ202212050001", pstnNm: "대구 중구 동인동" }), "중구", "낱말만 보므로 한계가 있다 — 서울 조서라 전제");
});

test("[1029] 읍면동 — 번지 앞 첫 동·가·읍·면·리, 없으면 null", () => {
  assert.equal(upisEmd("성동구 하왕십리동 890번지 일대"), "하왕십리동");
  assert.equal(upisEmd("태평로2가 43일대"), "태평로2가");
  assert.equal(upisEmd("관악구 신림8동 1644번지"), "신림8동");
  assert.equal(upisEmd("서울특별시 중구 소공동 112-9번지 일대"), "소공동");
  assert.equal(upisEmd("강남구 테헤란로 152"), null, "도로명은 동이 아니다");
  assert.equal(upisEmd("강남구"), null);
  assert.equal(upisEmd(""), null);
  assert.equal(upisEmd(null), null);
  assert.equal(upisEmd("은평구 진관동 일원"), "진관동");
  assert.equal(upisEmd("송파구 가락동, 문정동 일대"), "가락동", "여러 동이면 첫 동");
});

test("[1029] 코드 날짜 — 5자리 코드 + 3글자 + YYYYMMDD, 말이 안 되는 날짜는 null", () => {
  assert.equal(upisCodeDate("11680AGZ202212050001"), "2022-12-05");
  assert.equal(upisCodeDate("11000AGZ199912310007"), "1999-12-31");
  assert.equal(upisCodeDate("11680AGZ202213050001"), null, "13월");
  assert.equal(upisCodeDate("11680AGZ195012050001"), null, "1960 이전");
  assert.equal(upisCodeDate("AGZ202212050001"), null);
  assert.equal(upisCodeDate(""), null);
  assert.equal(upisCodeDate(null), null);
});

/* ── 원문 → DB 행 → 화면 ─────────────────────────────────────────────── */

const SAMPLE_ROW = {
  RPT_MNG_CD: "11680AGZ202212050001",
  PRJC_CD: "P-1",
  LOGVM: "강남구",
  RPT_TYPE: "변경",
  LCLSF: "정비사업",
  MCLSF: "주택재건축",
  SCLSF: "",
  PSTN_NM: "강남구 개포동 189번지 일대",
  RGN_NM: "개포주공1단지 재건축",
  AREA_EXS: "123,456.7",
  AREA_ICDC_CD: "증",
  AREA_CHG: "100",
  AREA_CHG_AFTR: "123556.7",
  DCSN_ANCMNT_MNG_CD: "11680AGA202301100003",
};

test("[1029] 조서 원문 → DB 행 — 컬럼 이름은 표와 같고, 날짜는 결정고시 코드가 먼저", () => {
  const rec = upisRowToRecord("upisRebuild", SAMPLE_ROW)!;
  assert.equal(rec.rpt_mng_cd, "11680AGZ202212050001");
  assert.equal(rec.service, "upisRebuild");
  assert.equal(rec.sigungu, "강남구");
  assert.equal(rec.emd, "개포동");
  assert.equal(rec.area_exs, 123456.7, "쉼표 숫자");
  assert.equal(rec.area_chg_aftr, 123556.7);
  assert.equal(rec.sclsf, null, "빈 문자열은 null");
  assert.equal(rec.code_date, "2023-01-10", "결정고시 코드의 날짜");
  assert.equal(rec.dcsn_ancmnt_mng_cd, "11680AGA202301100003");
  assert.deepEqual(rec.raw, SAMPLE_ROW, "원문은 그대로 raw 에");
  assert.match(String(rec.fetched_at), /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(upisRowToRecord("upisRebuild", { ...SAMPLE_ROW, DCSN_ANCMNT_MNG_CD: "" })!.code_date, "2022-12-05", "고시 코드가 없으면 조서 코드");
  assert.equal(upisRowToRecord("upisRebuild", { ...SAMPLE_ROW, RPT_MNG_CD: " " }), null, "기본키 없으면 버린다");
  const expectedKeys = [
    "rpt_mng_cd", "service", "prjc_cd", "rpt_type", "lclsf", "mclsf", "sclsf", "pstn_nm", "rgn_nm", "area_exs", "area_chg_aftr",
    "dcsn_ancmnt_mng_cd", "sigungu", "emd", "code_date", "raw", "fetched_at",
  ];
  assert.deepEqual(Object.keys(rec).sort(), expectedKeys.sort());
  const mig = code("supabase/migrations/20261003162238_1029_seoul_upis_records.sql");
  for (const k of expectedKeys) assert.ok(new RegExp(`^  ${k} `, "m").test(mig) || k === "rpt_mng_cd", `표에 ${k} 컬럼`);
  assert.ok(mig.includes("rpt_mng_cd text primary key"));
});

test("[1029] 결정고시 원문 → DB 행 — 고시일자 8자리·하이픈 둘 다, 본문은 4,000자까지", () => {
  const a = upisAnnouncementToRecord({ ANCMNT_MNG_CD: "11680AGA202301100003", ANCMNT_NO: "서울특별시고시 제2023-12호", ANCMNT_YMD: "20230110", ANCMNT_INST: "서울특별시", TTL: "개포주공1단지 정비구역 변경", CN: "x".repeat(5000) })!;
  assert.equal(a.ancmnt_ymd, "2023-01-10");
  assert.equal(String(a.cn).length, 4000);
  assert.equal(upisAnnouncementToRecord({ ANCMNT_MNG_CD: "A", ANCMNT_YMD: "2023-01-10" })!.ancmnt_ymd, "2023-01-10");
  assert.equal(upisAnnouncementToRecord({ ANCMNT_MNG_CD: "A", ANCMNT_YMD: "2023.1" })!.ancmnt_ymd, null, "8자리가 아니면 날짜를 지어내지 않는다");
  assert.equal(upisAnnouncementToRecord({ ANCMNT_MNG_CD: "" }), null);
});

test("[1029] DB 행 → 화면 모양 — 모르는 서비스는 버리고, 날짜는 10자리로 자른다", () => {
  const r = mapUpisRecord({
    rpt_mng_cd: "11680AGZ202212050001", service: "upisRebuild", prjc_cd: null, rpt_type: "변경", lclsf: "정비사업", mclsf: "주택재건축", sclsf: null,
    pstn_nm: "강남구 개포동 189번지 일대", rgn_nm: "개포주공1단지 재건축", area_exs: "123456.7", area_chg_aftr: null, dcsn_ancmnt_mng_cd: null,
    sigungu: "강남구", emd: "개포동", code_date: "2022-12-05T00:00:00",
  })!;
  assert.equal(r.codeDate, "2022-12-05");
  assert.equal(r.areaExs, 123456.7);
  assert.equal(upisKind(r), "주택재건축", "소분류 없으면 중분류");
  assert.equal(upisKind({ sclsf: "소", mclsf: "중", lclsf: "대" }), "소");
  assert.equal(upisKind({ sclsf: null, mclsf: null, lclsf: null }), "—");
  assert.equal(upisAreaLabel(r), "123,457㎡", "변경 후가 없으면 기정 · 반올림 · 쉼표");
  assert.equal(upisAreaLabel({ areaExs: 100, areaChgAftr: 90.4 }), "90㎡", "변경 후가 먼저");
  assert.equal(upisAreaLabel({ areaExs: 0, areaChgAftr: 0 }), "—");
  assert.equal(upisDateLabel("2022-12-05"), "2022.12.05");
  assert.equal(upisDateLabel(null), "—");
  assert.equal(mapUpisRecord({ rpt_mng_cd: "x", service: "upisAnnouncement" }), null);
  assert.equal(mapUpisRecord({ rpt_mng_cd: "", service: "upisRebuild" }), null);
  const a = mapUpisAnnouncement({ ancmnt_mng_cd: "A", ancmnt_ymd: "2023-01-10T00:00:00+09:00", ancmnt_no: "제1호", ttl: "t" })!;
  assert.equal(a.ancmntYmd, "2023-01-10");
  assert.equal(mapUpisAnnouncement({ ancmnt_mng_cd: null }), null);
});

/* ── 구역 이름 줄기 ──────────────────────────────────────────────────── */

test("[1029] 구역 이름 줄기 — 사업 종류 낱말을 빼고 두 토큰까지, ilike 패턴은 %토큰%토큰%", () => {
  assert.deepEqual(zoneNameStems("잠실주공5단지 재건축"), ["잠실주공5단지"]);
  assert.deepEqual(zoneNameStems("여의도 시범아파트 재건축"), ["여의도", "시범아파트"]);
  assert.deepEqual(zoneNameStems("한남3구역"), ["한남3구역"]);
  assert.deepEqual(zoneNameStems("신당10구역 주택재개발 정비사업"), ["신당10구역"]);
  assert.deepEqual(zoneNameStems("성수전략정비구역 1지구(재개발)"), ["성수전략", "1지구"]);
  assert.deepEqual(zoneNameStems("재개발"), [], "사업 종류만 있으면 비어 있다");
  assert.deepEqual(zoneNameStems(null), []);
  assert.equal(zoneNamePattern("여의도 시범아파트 재건축"), "%여의도%시범아파트%");
  assert.equal(zoneNamePattern("a%b_c 재개발"), "%abc%", "ilike 와일드카드는 걷어낸다");
  assert.equal(zoneNamePattern("재건축"), null);
});

/* ── 구별 요약 ───────────────────────────────────────────────────────── */

test("[1029] 구별 요약 — 건수 많은 구부터, 구 미상은 맨 뒤", () => {
  const rows = summarizeByGu([
    { sigungu: "강남구", service: "upisRebuild" },
    { sigungu: "강남구", service: "upisDistUnitPlan" },
    { sigungu: "성동구", service: "upisRebuild" },
    { sigungu: null, service: "upisUrbanDev" },
    { sigungu: "마포구", service: "upisRebuild" },
  ]);
  assert.deepEqual(
    rows.map((r) => [r.sigungu, r.rebuild, r.urbanDev, r.distUnitPlan, r.total]),
    [
      ["강남구", 1, 0, 1, 2],
      ["마포구", 1, 0, 0, 1],
      ["성동구", 1, 0, 0, 1],
      ["구 미상", 0, 1, 0, 1],
    ],
  );
  assert.deepEqual(summarizeByGu([]), []);
});

/* ── 이어짐: 크론·저장·화면·카탈로그 ─────────────────────────────────── */

test("[1029] 크론 — redevelopment-ingest 는 UPIS 적재를 부르고, 옛 환경변수(SEOUL_OPENAPI_*)는 코드에서 더 읽지 않는다", () => {
  const route = code("app/api/cron/redevelopment-ingest/route.ts");
  assert.ok(route.includes('from "@/lib/seoul/upis-ingest"'));
  assert.ok(route.includes("ingestSeoulUpis({ budgetMs, services })"));
  assert.ok(route.includes("authorizeCron(req)"), "크론 보호");
  assert.ok(route.includes('dataset: "서울 UPIS 결정 조서"'));
  assert.ok(!/process\.env\.SEOUL_OPENAPI/.test(route));
  assert.ok(!existsSync(join(process.cwd(), "lib/redevelopment/ingest.ts")), "옛 적재기는 지웠다");
  const etl = code(".github/workflows/etl.yml");
  assert.ok(etl.includes("/api/cron/redevelopment-ingest"), "매일 크론이 부른다");
  const ingest = code("lib/seoul/upis-ingest.ts");
  assert.ok(ingest.includes("SEOUL_DATA_API_KEY") || ingest.includes("fetchSeoulOpenApi"), "열린데이터광장 공용 키·클라이언트");
  assert.ok(!/process\.env\.SEOUL_OPENAPI/.test(ingest));
  assert.ok(ingest.includes('onConflict'), "다시 받아도 겹쳐 쓴다(upsert)");
  assert.ok(ingest.includes("seoul_upis_sync"), "다음 시작 번호를 남긴다");
  const env = code("scripts/validate-env.mjs");
  assert.ok(env.includes('"SEOUL_DATA_API_KEY"') && env.includes("결정 조서"), "env 검사 설명이 새 용도");
  assert.ok(!env.includes("SEOUL_OPENAPI_KEY"), "옛 키 이름은 env 검사에서 뺐다");
});

test("[1029] 저장 — 공개 읽기 표·뷰 이름이 마이그레이션과 같고, 읽기 한도는 500행", () => {
  const store = code("lib/seoul/upis-store.ts");
  const mig = code("supabase/migrations/20261003162238_1029_seoul_upis_records.sql");
  for (const name of ["seoul_upis_records", "seoul_upis_gu_summary", "seoul_upis_announcements"]) {
    assert.ok(store.includes(`"${name}"`), `store 가 ${name} 을 읽는다`);
    assert.ok(mig.includes(`public.${name}`), `마이그레이션에 ${name}`);
  }
  assert.ok(store.includes("Math.min(500, opts.limit ?? 50)"));
  assert.ok(store.includes('.eq("service", "upisRebuild").ilike("rgn_nm", pattern)'), "구역 이름 찾기는 정비사업 조서만");
  assert.ok(mig.includes("security_invoker = on"), "뷰는 호출자 권한 — RLS 를 그대로 탄다");
  assert.ok(mig.includes("revoke all on table public.seoul_upis_sync from public, anon, authenticated;"), "진행 상태 표는 비공개");
  assert.ok(!/create policy [a-z_]+ on public\.seoul_upis_\w+ for (insert|update|delete|all)/.test(mig), "쓰기 정책 없음");
  assert.ok(!mig.endsWith("\n"), "미러 파일은 끝 줄바꿈 없음(원장과 글자 단위로 같다)");
});

test("[1029] API — /api/seoul/upis 는 구 이름을 검사하고 CDN 하루 캐시, 실패는 503 no-store", () => {
  const api = code("app/api/seoul/upis/route.ts");
  assert.ok(api.includes("^[가-힣]{1,4}구$"));
  assert.ok(api.includes("public, s-maxage=86400, stale-while-revalidate=86400"));
  assert.ok(api.includes("status: 503"));
  assert.ok(api.includes("no-store"));
});

test("[1029] 화면 — /redevelopment 조서 칸 · 구역 상세 결정 이력 · /region 머리칸이 이어져 있고, 출처 한 줄과 참고용 표기가 있다", () => {
  const page = code("app/redevelopment/page.tsx");
  assert.ok(page.includes("<SeoulPlanSection />"));
  const section = code("app/redevelopment/SeoulPlanSection.tsx");
  assert.ok(section.includes('id="seoul-plan"'));
  assert.ok(section.includes("if (totals.total === 0) return null;"), "표가 비어 있으면 칸을 내지 않는다");
  assert.ok(section.includes("참고용(법적 효력 없음)"));
  assert.ok(section.includes("조서 불러오기 실패 · 잠시 후 다시"), "실패는 실패라고");
  const browser = code("app/redevelopment/SeoulPlanBrowser.tsx");
  assert.ok(browser.includes('"use client"'));
  assert.ok(browser.includes("/api/seoul/upis?"));
  assert.ok(browser.includes('.get("gu")'), "지역 화면에서 ?gu= 로 들어온다");
  assert.ok(browser.includes("조서 없음") && browser.includes("불러오는 중…") && browser.includes("조서 불러오기 실패 · 잠시 후 다시"));
  for (const col of ["결정일", "구분", "구역", "위치", "면적", "조서"]) assert.ok(browser.includes(`>${col}</th>`), `표 머리 ${col}`);
  const detail = code("app/redevelopment/[id]/page.tsx");
  assert.ok(detail.includes("<ZoneDecisionHistory name={project.name} sido={project.sido} sigungu={project.sigungu} />"));
  const hist = code("app/redevelopment/ZoneDecisionHistory.tsx");
  assert.ok(hist.includes('if (!/^서울/.test(sido)) return null;'), "서울 밖은 그리지 않는다");
  assert.ok(hist.includes("if (rows.length === 0) return null;"), "못 찾으면 없다고 말하지 않는다");
  assert.ok(hist.includes("이름이 같은 다른 구역이 섞일 수 있음"));
  const region = code("app/region/[id]/page.tsx");
  assert.match(region, /sido === "서울"\s*\?\s*countUpisForGu\(shortName\)/, "서울 구만 센다");
  assert.ok(region.includes("upisGu && upisGu.total > 0 &&"), "0건이면 칸을 내지 않는다");
  assert.ok(region.includes("#seoul-plan"), "조서 칸으로 바로 간다");
  for (const f of [section, hist, region]) assert.ok(f.includes("열린데이터광장"), "출처 표기");
});

test("[1029] 카탈로그·운영 — 자료 출처 안내·공개 데이터 목록·신선도 표가 새 표를 가리킨다", () => {
  const sources = code("lib/public-data-sources.ts");
  assert.ok(sources.includes("저작자표시·비영리·변경금지"), "이용허락 조건을 숨기지 않는다");
  assert.ok(sources.includes("OA-20281"));
  const dsPage = code("app/data-sources/page.tsx");
  assert.ok(dsPage.includes("도시계획 결정 조서"));
  const fresh = code("lib/admin/data-freshness.ts");
  assert.ok(fresh.includes("seoul_upis_records"));
  const fresh2 = code("lib/admin/source-freshness.ts");
  assert.ok(fresh2.includes("seoul_upis_records"));
});
