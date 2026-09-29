import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";

import {
  amountForOp,
  KAPT_COMMON_COST_OPS,
  KAPT_COMMON_COST_SERVICE,
  KAPT_INDIVIDUAL_COST_OPS,
  KAPT_INDIVIDUAL_COST_SERVICE,
  KAPT_MGMT_FEE_CALLS_PER_COMPLEX,
  sumIndividualFields,
  sumItems,
  sumNamedFields,
  toMgmtFeeRow,
} from "@/lib/national-data/kapt-mgmt-fee-api";
import { parseMolitErrorDetail } from "@/lib/national-data/molit-api";
import {
  HISTORY_MAX_MONTHS_PER_RUN,
  HISTORY_MAX_REGIONS_CAP,
  HISTORY_MAX_REGIONS_PER_RUN,
  NONAPT_GAP_REGIONS_PER_RUN,
  NONAPT_RECENT_SLICE,
} from "@/lib/market/molit-core";
import { recentDealRows } from "@/app/complex/[id]/complex-v2-model";

/* [1025 · 데이터] 담당 Q — 오늘(2026-09-29) 실패한 크론 수리.
 *  #1 관리비: 오퍼레이션 22개(V3) · 항목별 금액 items    #3 오류 XML 사유(resultCode·resultMsg) 로그
 *  #5 백필 160곳 · 하루 2회                               #8 getComplexDeals includeCancelled(표만)
 *  #12 market_transactions 조회 9곳 property_type='apartment'
 * 순수 함수는 실제 코드를 부르고, server-only 사슬(complex-store · 크론 · SQL · page.tsx)은 소스 문자열로 잠근다. */

const read = (p: string): string => readFileSync(p, "utf8");
/** kapt-mgmt-fee-ingest.ts 는 server-only 사슬이라 문자열로 읽는다(위 테스트가 `MGMT_FEE_BATCH = 200` 을 잠근다) */
const MGMT_FEE_BATCH = 200;
/** 주석은 규칙 기록을 남기는 자리라 검사에서 뺀다 */
function code(p: string): string {
  return read(p)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/\/\/ \[1025[^\n]*/g, "");
}

/* ── 1. 관리비 — 오퍼레이션 목록·금액 규칙 ─────────────────────────────── */

test("[1025 · Q1] K-apt 관리비 — V3 서비스 2개 · 오퍼레이션 22개(공용 17 · 개별 5) · 이름 고정", () => {
  assert.equal(KAPT_COMMON_COST_SERVICE, "AptCmnuseManageCostServiceV3");
  assert.equal(KAPT_INDIVIDUAL_COST_SERVICE, "AptIndvdlzManageCostServiceV3");
  assert.equal(KAPT_COMMON_COST_OPS.length, 17);
  assert.equal(KAPT_INDIVIDUAL_COST_OPS.length, 5);
  assert.equal(KAPT_MGMT_FEE_CALLS_PER_COMPLEX, 22);
  const common = KAPT_COMMON_COST_OPS.map((s) => s.op);
  for (const op of [
    "getHsmpLaborCostInfoV3",
    "getHsmpTaxdueInfoV3",
    "getHsmpVhcleMntncCostInfoV3",
    "getHsmpEtcCostInfoV3",
    "getHsmpOfcrkCostInfoV3",
    "getHsmpClothingCostInfoV3",
    "getHsmpEduTraingCostInfoV3",
    "getHsmpCleaningCostInfoV3",
    "getHsmpGuardCostInfoV3",
    "getHsmpDisinfectionCostInfoV3",
    "getHsmpElevatorMntncCostInfoV3",
    "getHsmpHomeNetworkMntncCostInfoV3",
    "getHsmpRepairsCostInfoV3",
    "getHsmpFacilityMntncCostInfoV3",
    "getHsmpSafetyCheckUpCostInfoV3",
    "getHsmpDisasterPreventionCostInfoV3",
    "getHsmpConsignManageFeeInfoV3",
  ]) {
    assert.ok(common.includes(op), op);
  }
  assert.deepEqual(
    KAPT_INDIVIDUAL_COST_OPS.map((s) => s.op),
    ["getHsmpHeatCostInfoV3", "getHsmpHotWaterCostInfoV3", "getHsmpGasRentalFeeInfoV3", "getHsmpElectricityCostInfoV3", "getHsmpWaterCostInfoV3"],
  );
  /* items 키는 서로 다르다(jsonb 한 객체에 담긴다) */
  const keys = [...KAPT_COMMON_COST_OPS, ...KAPT_INDIVIDUAL_COST_OPS].map((s) => s.key);
  assert.equal(new Set(keys).size, 22);
  /* 예전 오퍼레이션(getHsmpCmnuseManageCostInfo — HTTP 400 의 원인)은 남아 있지 않다 */
  assert.doesNotMatch(code("lib/national-data/kapt-mgmt-fee-api.ts"), /getHsmpCmnuseManageCostInfo|getHsmpIndvdlzManageCostInfo/);
});

test("[1025 · Q1] 금액 규칙 — 인건비 등 다섯 op 는 이름난 칸만, 나머지는 숫자 칸 합, 개별사용료는 C·P 칸 합", () => {
  const labor = KAPT_COMMON_COST_OPS.find((s) => s.key === "labor")!;
  assert.deepEqual(labor.fields, ["pay", "sundryCost", "bonus", "pension", "accidentPremium", "employPremium", "nationalPension", "healthPremium", "welfareBenefit"]);
  assert.deepEqual(KAPT_COMMON_COST_OPS.find((s) => s.key === "taxdue")!.fields, ["electCost", "telCost", "postageCost", "taxrestCost"]);
  assert.deepEqual(KAPT_COMMON_COST_OPS.find((s) => s.key === "vehicle")!.fields, ["fuelCost", "refairCost", "carInsurance", "carEtc"]);
  assert.deepEqual(KAPT_COMMON_COST_OPS.find((s) => s.key === "etc")!.fields, ["careItemCost", "accountingCost", "hiddenCost"]);
  assert.deepEqual(KAPT_COMMON_COST_OPS.find((s) => s.key === "office")!.fields, ["officeSupply", "bookSupply", "transportCost"]);
  /* 이름난 칸만 — 응답에 다른 숫자 칸(예: 세대수)이 있어도 더하지 않는다 */
  const laborItem = { kaptCode: "A1", kaptName: "공작", searchDate: "202607", pay: "1,000,000", bonus: 200000, hhldCnt: 1710, welfareBenefit: "" };
  assert.equal(amountForOp(labor, laborItem, false), 1_200_000);
  assert.equal(sumNamedFields({ pay: "abc" }, ["pay"]), null, "숫자 칸 없음 → null");
  /* 이름 모르는 op — 식별 칸 뺀 숫자 칸 합 */
  const guard = KAPT_COMMON_COST_OPS.find((s) => s.key === "guard")!;
  assert.equal(guard.fields, undefined);
  assert.equal(amountForOp(guard, { kaptCode: "A1", kaptName: "공작", searchDate: "202607", guardCost: "3,500,000" }, false), 3_500_000);
  /* 개별사용료 — 공용 C · 전용 P */
  assert.equal(sumIndividualFields({ kaptCode: "A1", kaptName: "공작", searchDate: "202607", heatC: "1,000", heatP: 2000 }), 3000);
  assert.equal(sumIndividualFields({ kaptCode: "A1", elecCost: 500 }), 500, "C/P 칸이 없으면 숫자 칸 합");
  const heat = KAPT_INDIVIDUAL_COST_OPS.find((s) => s.key === "heat")!;
  assert.equal(amountForOp(heat, { kaptCode: "A1", heatC: 10, heatP: 20 }, true), 30);
  assert.equal(amountForOp(heat, undefined, true), null, "item 없음 → null(0 아님)");
  /* 합 — 전부 null 이면 null */
  assert.equal(sumItems({ a: 1, b: null, c: 2 }, ["a", "b", "c"]), 3);
  assert.equal(sumItems({ a: null }, ["a"]), null);
});

test("[1025 · Q1] toMgmtFeeRow — items 는 있을 때만 열에 실린다 · 적재는 items 열 없음(미적용)에 총액만으로 물러선다", () => {
  const items = { labor: 100, guard: 50, heat: null };
  const r = toMgmtFeeRow("A10027389", "202607", 150, null, 50, "2026-09-29T00:00:00.000Z", items);
  assert.ok(r);
  assert.deepEqual(r.items, items);
  assert.equal(r.total_krw, 150);
  assert.equal(r.per_m2_krw, 3);
  const bare = toMgmtFeeRow("A10027389", "202607", 150, null, 50);
  assert.equal(bare && "items" in bare, false, "items 없으면 열을 보내지 않는다");
  const src = code("lib/national-data/kapt-mgmt-fee-ingest.ts");
  assert.match(src, /toMgmtFeeRow\(c\.kapt_code, ym, fee\.commonKrw, fee\.individualKrw, c\.manage_area_m2, fetchedAt, fee\.items\)/);
  assert.match(src, /itemsColumnMissing = true/);
  assert.match(src, /withoutItems\(chunk\)/);
  assert.match(src, /MGMT_FEE_BATCH = 200/);
  /* op 하나라도 던지면 단지 실패 — 절반 합을 관리비로 쓰지 않는다 */
  const api = code("lib/national-data/kapt-mgmt-fee-api.ts");
  assert.match(api, /const failed = results\.find\(\(r\) => r\.error\);\s*if \(failed\?\.error\) throw new Error/);
  assert.match(api, /fetchAptJson\(t\.service, t\.spec\.op, params, 10, true\)/, "strict — 인증·한도 오류는 던진다");
});

test("[1025 · Q1] 마이그레이션 SQL — complex_mgmt_fee.items jsonb(statistics 0) · 해제 행 부분 인덱스 · 지우는 것 없음", () => {
  const p = "supabase/migrations/20260929104354_1025_mgmt_fee_items.sql";
  assert.ok(existsSync(p));
  const sql = read(p);
  assert.match(sql, /alter table public\.complex_mgmt_fee\s+add column if not exists items jsonb/);
  assert.match(sql, /alter column items set statistics 0/);
  assert.match(sql, /create index if not exists mt_trade_complex_cancelled_idx/);
  assert.match(sql, /where transaction_type = 'trade' and is_cancelled = true/);
  assert.doesNotMatch(sql, /grant .* to anon/i);
  assert.doesNotMatch(sql, /drop table|drop column|truncate/i);
});

/* ── 2. 오류 XML 사유 ───────────────────────────────────────────────────── */

test("[1025 · Q2] parseMolitErrorDetail — resultCode·resultMsg / returnReasonCode·returnAuthMsg, 정상 코드는 null", () => {
  assert.equal(
    parseMolitErrorDetail("<response><header><resultCode>30</resultCode><resultMsg>SERVICE_KEY_IS_NOT_REGISTERED_ERROR</resultMsg></header></response>"),
    "30 SERVICE_KEY_IS_NOT_REGISTERED_ERROR",
  );
  assert.equal(
    parseMolitErrorDetail("<OpenAPI_ServiceResponse><cmmMsgHeader><errMsg>SERVICE ERROR</errMsg><returnAuthMsg>LIMITED_NUMBER_OF_SERVICE_REQUESTS_EXCEEDS_ERROR</returnAuthMsg><returnReasonCode>22</returnReasonCode></cmmMsgHeader></OpenAPI_ServiceResponse>"),
    "22 LIMITED_NUMBER_OF_SERVICE_REQUESTS_EXCEEDS_ERROR",
  );
  assert.equal(parseMolitErrorDetail("<header><resultCode>00</resultCode><resultMsg>NORMAL SERVICE.</resultMsg></header>"), null);
  assert.equal(parseMolitErrorDetail("<header><resultCode>000</resultCode></header>"), null);
  assert.equal(parseMolitErrorDetail("<html>Bad Gateway</html>"), null, "코드도 메시지도 없으면 null(호출부가 HTTP 상태·본문 머리로 대신)");
  assert.equal(parseMolitErrorDetail("<resultMsg>UNKNOWN</resultMsg>"), "UNKNOWN");
});

test("[1025 · Q2] 적재 로그 — 응답 실패의 첫오류에 사유(detail)가 들어간다", () => {
  const api = code("lib/national-data/molit-api.ts");
  assert.match(api, /detail\?: string;/);
  assert.match(api, /parseMolitErrorDetail\(body\) \?\? `HTTP \$\{res\.status\}`/);
  assert.match(api, /reason: "fetch-failed", totalCount, detail/);
  assert.match(api, /detail: `\$\{cfg\.service\} \$\{first\.detail\}`/);
  const tx = code("lib/market/molit-transactions.ts");
  assert.match(tx, /fetchDetail \?\?= res\.detail \?\? null/);
  assert.match(tx, /국토부 API 응답 실패\(\$\{fetchDetail \?\? "네트워크·5xx·오류 XML"\}\)/);
  /* [1024] 잠금 유지 — 실패는 오류로 세고 0건으로 넘기지 않는다 */
  assert.match(tx, /if \(fetchFailed\) \{[\s\S]*?result\.errors \+= 1/);
  assert.match(tx, /첫오류=\$\{firstError\.slice\(0, 300\)\}/);
});

/* ── 3. 백필 속도 ───────────────────────────────────────────────────────── */

test("[1025 · Q3] 이력 백필 — 1회 160곳(≤ 960회) · 상한 200 · 하루 2회(02:40·14:40 UTC) · 일일 합계 < 10,000", () => {
  assert.equal(HISTORY_MAX_REGIONS_PER_RUN, 160);
  assert.ok(HISTORY_MAX_REGIONS_PER_RUN * 6 <= 960);
  assert.equal(HISTORY_MAX_REGIONS_CAP, 200);
  assert.equal(HISTORY_MAX_MONTHS_PER_RUN, 3);
  const vercel = JSON.parse(read("vercel.json")) as { crons: { path: string; schedule: string }[] };
  const by = new Map(vercel.crons.map((c) => [c.path, c.schedule]));
  assert.equal(by.get("/api/cron/molit-history-backfill"), "40 2,14 * * *");
  assert.equal(by.get("/api/cron/kapt-mgmt-fee-ingest"), "10 3 * * *", "관리비는 하루 1회 그대로");
  assert.equal(by.get("/api/cron/molit-nonapt-ingest"), "50 2 * * *");
  /* 호출량 — 관리비 200×22 · 백필 960×2 · 비아파트 (12+30)×6 · 아파트 일일 16×2 · apt-master/detail ≈400 */
  const backfillRuns = (by.get("/api/cron/molit-history-backfill") ?? "").split(" ")[1].split(",").length;
  const daily =
    MGMT_FEE_BATCH * KAPT_MGMT_FEE_CALLS_PER_COMPLEX +
    HISTORY_MAX_REGIONS_PER_RUN * 6 * backfillRuns +
    (NONAPT_RECENT_SLICE + NONAPT_GAP_REGIONS_PER_RUN) * 6 +
    16 * 2 +
    400;
  assert.ok(daily < 10_000, `일일 호출 ${daily}`);
  /* 클램프 — 백필은 CAP, ingestMolitTransactions 의 sliceSize 는 200 까지(60 이면 160 이 잘린다) */
  assert.match(code("lib/market/molit-history-backfill.ts"), /Math\.min\(HISTORY_MAX_REGIONS_CAP, opts\.maxRegions \?\? HISTORY_MAX_REGIONS_PER_RUN\)/);
  assert.match(code("lib/market/molit-transactions.ts"), /const sliceSize = Math\.max\(1, Math\.min\(200, opts\.sliceSize \?\? 16\)\)/);
  assert.match(code("lib/market/molit-history-backfill.ts"), /keepRaw: false/);
});

/* ── 4. 해제 행 ─────────────────────────────────────────────────────────── */

test("[1025 · Q4] getComplexDeals — includeCancelled 옵션(기본 false) · 해제 행은 별도 조회 · 공용 행은 그대로", () => {
  const src = code("lib/complex/complex-store.ts");
  assert.match(src, /export async function getComplexDeals\(complexId: string, opts\?: \{ includeCancelled\?: boolean \}\)/);
  assert.match(src, /if \(!opts\?\.includeCancelled\) return out;/);
  assert.match(src, /out\.push\(\{ \.\.\.d, cancelled: true \}\)/);
  /* 해제 행 조회는 is_cancelled=true 로 따로(공용 행·부분 인덱스·1,000행 상한을 건드리지 않는다) */
  assert.match(src, /loadCancelledTradeRowsShared = cache\(/);
  assert.match(src, /\.eq\("is_cancelled", true\)[\s\S]*?\.limit\(200\)/);
  /* check-tx-filters 예외 표식은 해제 행 조회에만 */
  const raw = read("lib/complex/complex-store.ts");
  assert.equal((raw.match(/tx-filters-allow:/g) ?? []).length, 1);
  /* 공용 행은 여전히 해제 제외 */
  assert.match(src, /const loadTradeRowsShared = cache\([\s\S]*?\.eq\("is_cancelled", false\)/);
});

test("[1025 · Q4] 단지 상세 — 최근 실거래 표만 includeCancelled, 대표가·추이는 기본 경로 · 신고가는 해제 제외", () => {
  const page = code("app/complex/[id]/page.tsx");
  assert.equal((page.match(/includeCancelled: true/g) ?? []).length, 1, "표 한 곳만");
  assert.match(page, /const loadDeals = cache\(\(canonicalId: string\) => getComplexDeals\(canonicalId\)\);/, "대표가·추이 로더는 옵션 없음");
  assert.match(page, /rows=\{recentRowsWithCancelled\}/);
  assert.match(page, /const recentRows = recentDealRows\(dealsForV2, 10\);/, "머리 사실 줄(최근 계약)은 해제 없는 표");
  assert.match(page, /buildTxTrendData\(dealsForV2,/, "추이·신고가/신저가는 해제 없는 행");
  /* 순수 규칙 — 해제 행은 취소선, 신고가 배지는 해제 안 된 거래끼리 */
  const d = (ym: string, day: number, man: number, area: number, cancelled = false) => ({ ym, day, man, area, floor: 5, cancelled });
  const rows = recentDealRows([d("202609", 3, 99_000, 84.9, true), d("202608", 1, 90_000, 84.9), d("202607", 1, 80_000, 84.9)], 10);
  assert.equal(rows[0].cancelled, true);
  assert.equal(rows[0].high, false, "해제된 9억 9,000만은 신고가가 아니다");
  assert.equal(rows[1].high, true, "신고가는 해제 안 된 9억");
});

/* ── 5. 섞임 방지 ───────────────────────────────────────────────────────── */

test("[1025 · Q5] market_transactions 조회 9곳 — property_type='apartment' 조건", () => {
  const targets: [string, number][] = [
    ["app/api/map/clusters/route.ts", 1],
    ["app/map/page.tsx", 1],
    ["lib/complex/complex-store.ts", 4],
    ["lib/complex/asking-trades.ts", 1],
    ["app/api/analysis/complex-compare/route.ts", 1],
    ["lib/agent/tools.ts", 1],
    ["lib/newui/home-coverage.ts", 1],
    ["lib/social/autopost.ts", 1],
    ["lib/saved-search/alert-matcher.ts", 1],
  ];
  for (const [file, want] of targets) {
    const src = code(file);
    const froms = (src.match(/\.from\("market_transactions"\)/g) ?? []).length;
    const filters = (src.match(/\.eq\("property_type", "apartment"\)/g) ?? []).length;
    assert.equal(filters, want, `${file}: property_type 필터 ${filters}/${want}`);
    assert.ok(froms >= want, `${file}: market_transactions 조회 ${froms}`);
  }
});
