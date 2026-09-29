import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";

import {
  CAPITAL_AREA_PREFIXES,
  compactRaw,
  dailySliceIndex,
  HISTORY_BACKFILL_FLOOR_YM,
  HISTORY_BACKFILL_START_YM,
  HISTORY_MAX_REGIONS_PER_RUN,
  isBackfillDone,
  isCapitalAreaCode,
  isRecentMonth,
  isYm,
  molitDatasetLabel,
  nextNonAptGapYm,
  nonAptWindow,
  NONAPT_PROPERTY_TYPES,
  shiftYm,
  shouldAdvanceMonth,
} from "@/lib/market/molit-core";
import { parseMolitTotalCount } from "@/lib/national-data/molit-api";
import {
  MGMT_FEE_IDENTITY_KEYS,
  KAPT_COMMON_COST_SERVICE,
  KAPT_INDIVIDUAL_COST_SERVICE,
  sumCostFields,
  toMgmtFeeRow,
} from "@/lib/national-data/kapt-mgmt-fee-api";
import { summarizeMgmtFee, type ComplexMgmtFeeRow } from "@/lib/complex/mgmt-fee-core";
import { areaTypeKey, extremesByType, findTxExtremes, markExtremes } from "@/lib/market/tx-extremes";
import {
  areaBandKeyOf,
  dongOfAddress,
  rowToNonAptDeal,
  summarizeNonAptRent,
  type NonAptRentDeal,
} from "@/lib/market/rent-nonapt-core";

/* [1024 · 데이터] 담당 Q — 이력 백필(keepRaw:false · 수도권 · 커서) · 비아파트 수집(officetel·rowhouse·house) ·
 * K-apt 관리비(complex_mgmt_fee) · 조회 함수(rent-nonapt · mgmt-fee · tx-extremes). 순수 함수는 실제 코드를 부르고,
 * server-only 사슬(molit-transactions.ts · 크론 라우트 · SQL)은 소스 문자열로 잠근다. */

const read = (p: string): string => readFileSync(p, "utf8");
/** 주석은 규칙 기록을 남기는 자리라 검사에서 뺀다 */
function code(p: string): string {
  return read(p)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

/* ── 1. 순수 도우미(molit-core) ─────────────────────────────────────────── */

test("[1024 · Q1] isRecentMonth — 당월·전월·전전월은 최근, 3개월 전부터는 아님(형식 어긋나면 false)", () => {
  const now = new Date(Date.UTC(2026, 8, 28)); // 2026-09-28
  assert.equal(isRecentMonth("202609", now), true);
  assert.equal(isRecentMonth("202608", now), true);
  assert.equal(isRecentMonth("202607", now), true);
  assert.equal(isRecentMonth("202606", now), false);
  assert.equal(isRecentMonth("202512", now), false);
  assert.equal(isRecentMonth("2026-09", now), false);
});

test("[1024 · Q1] shiftYm — 연 경계를 넘어 과거·미래로", () => {
  assert.equal(shiftYm("202601", -1), "202512");
  assert.equal(shiftYm("202512", -12), "202412");
  assert.equal(shiftYm("202511", 2), "202601");
  assert.equal(isYm("202513"), false);
  assert.equal(isYm("202512"), true);
});

test("[1024 · Q1] compactRaw — raw 미저장은 빈 객체, 해제 근거(cdealType·cdealDay)만 남긴다", () => {
  assert.deepEqual(compactRaw({ aptNm: "공작", dealAmount: "85,000", cdealType: " " }), {});
  assert.deepEqual(compactRaw({ aptNm: "공작", cdealType: "O", cdealDay: "26.07.10" }), {
    cdealType: "O",
    cdealDay: "26.07.10",
  });
});

test("[1024 · Q1] molitDatasetLabel — 아파트만이면 예전 문구 그대로(신선도 화면 잠금), 비아파트는 유형명", () => {
  assert.equal(molitDatasetLabel(["apartment"]), "아파트 매매·전월세 실거래");
  assert.equal(molitDatasetLabel([]), "아파트 매매·전월세 실거래");
  assert.equal(molitDatasetLabel(["officetel", "rowhouse", "house"]), "오피스텔·연립다세대·단독다가구 매매·전월세 실거래");
});

test("[1024 · Q1] 이력 백필 커서 — 상한만큼 봤으면 머물고, 덜 봤으면 넘긴다. 키 없음·중단·오류는 절대 넘기지 않는다", () => {
  const base = { configured: true, aborted: false, errors: 0, attempted: 10, inserted: 5000, limit: 40 };
  assert.equal(shouldAdvanceMonth(base), true, "빈 곳 10 < 상한 40 → 이 달 끝");
  assert.equal(shouldAdvanceMonth({ ...base, attempted: 40 }), false, "상한만큼 → 더 있을 수 있다");
  assert.equal(shouldAdvanceMonth({ ...base, attempted: 0, inserted: 0 }), true, "빈 곳 없음 → 넘김");
  assert.equal(shouldAdvanceMonth({ ...base, configured: false }), false, "키 없음");
  assert.equal(shouldAdvanceMonth({ ...base, aborted: true }), false, "DB 중단");
  assert.equal(shouldAdvanceMonth({ ...base, errors: 1 }), false, "오류");
  assert.equal(isBackfillDone("202012"), true);
  assert.equal(isBackfillDone("202101"), false);
  assert.equal(HISTORY_BACKFILL_START_YM, "202512");
  assert.equal(HISTORY_BACKFILL_FLOOR_YM, "202101");
  /* 일일 한도 10,000 — 1회 시군구 × (유형 2 × 최대 3페이지). [1025] 40 → 160(≤ 960회) · 하루 2회 — data-1025 가 합계를 잠근다 */
  assert.ok(HISTORY_MAX_REGIONS_PER_RUN * 6 <= 960);
});

test("[1024 · Q2] 수도권 판정 · 비아파트 유형 상수", () => {
  assert.deepEqual([...CAPITAL_AREA_PREFIXES], ["11", "41", "28"]);
  assert.equal(isCapitalAreaCode("11680"), true);
  assert.equal(isCapitalAreaCode("41173"), true);
  assert.equal(isCapitalAreaCode("28245"), true);
  assert.equal(isCapitalAreaCode("26350"), false);
  assert.deepEqual([...NONAPT_PROPERTY_TYPES], ["officetel", "rowhouse", "house"]);
});

test("[1024 · Q2] 비아파트 창·커서 — 12개월 창, 빈 달 훑기는 전월부터 과거로, 끝나면 전월로 되감기, 슬라이스는 일수", () => {
  const now = new Date(Date.UTC(2026, 8, 28));
  const w = nonAptWindow(now);
  assert.equal(w.length, 12);
  assert.equal(w[0], "202609");
  assert.equal(w[11], "202510");
  assert.equal(nextNonAptGapYm(null, w), "202608");
  assert.equal(nextNonAptGapYm("202608", w), "202607");
  assert.equal(nextNonAptGapYm("202510", w), "202608", "창 끝 → 되감기");
  assert.equal(nextNonAptGapYm("202401", w), "202608", "창 밖 → 처음");
  const a = dailySliceIndex(now, 80, 12);
  const b = dailySliceIndex(new Date(now.getTime() + 86_400_000), 80, 12);
  assert.ok(a >= 0 && a < 7 && b >= 0 && b < 7);
  assert.equal((a + 1) % 7, b, "하루 지나면 정확히 한 칸(홀수 슬라이스를 건너뛰지 않는다)");
});

/* ── 2. 국토부 API 매핑·페이징 ───────────────────────────────────────────── */

test("[1024 · Q2] molit-api — rh-rent(RTMSDataSvcRHRent) 매핑 · totalCount 파싱 · maxPages 기본 1", () => {
  const src = read("lib/national-data/molit-api.ts");
  assert.match(src, /"rh-rent":\s*\{\s*service:\s*"RTMSDataSvcRHRent"/);
  assert.match(src, /"sh-rent":\s*\{\s*service:\s*"RTMSDataSvcSHRent"/);
  assert.equal(parseMolitTotalCount("<body><totalCount>1234</totalCount></body>"), 1234);
  assert.equal(parseMolitTotalCount("<body></body>"), null);
  assert.match(code("lib/national-data/molit-api.ts"), /maxPages \?\? 1/);
});

test("[1024 · Q1·Q2] molit-transactions — house 그룹(sh-sale·sh-rent) · rowhouse 에 rh-rent · 유형별 커버 판정 · keepRaw · 들여쓰기 수리", () => {
  const src = code("lib/market/molit-transactions.ts");
  assert.match(src, /house:\s*\[\s*\{ type: "sh-sale"[\s\S]*?\{ type: "sh-rent"/);
  assert.match(src, /rowhouse:\s*\[\s*\{ type: "rh-sale"[\s\S]*?\{ type: "rh-rent"/);
  /* 커버 판정이 이 실행의 유형만 센다 — 아파트 행이 있다고 오피스텔이 "채워짐"이 되면 비아파트는 영영 0 이다 */
  assert.match(src, /\.eq\("contract_ym", yyyymm\)\s*\.in\("property_type", propertyTypes\)/);
  assert.match(src, /raw: ctx\.keepRaw \? deal\.raw : compactRaw\(deal\.raw\)/);
  assert.match(src, /keepRaw\?: boolean;/);
  assert.match(src, /types\?: readonly string\[\];/);
  /* 예전 루프 안 인라인(열 0 의 const RECENT_MONTHS)이 사라지고 순수 함수로 갔다 */
  assert.doesNotMatch(read("lib/market/molit-transactions.ts"), /^const RECENT_MONTHS = 3;/m);
  assert.match(src, /isRecentMonth\(yyyymm, now\)/);
  /* codes + gapsFirst → 그 코드들 안에서 빈 곳(수도권 백필) */
  assert.match(src, /if \(opts\.gapsFirst\) \{[\s\S]*?findCoverageGaps\(sb, yyyymm, infos, sliceSize, propertyTypes\)/);
  /* "키 없음" · "응답 실패" · "정상 0건" 을 가른다 — 백필 커서가 진짜 빈 구를 키 없음으로 읽고 멈추지 않게,
     네트워크 실패를 0건으로 읽고 넘기지 않게 */
  assert.match(src, /res\.reason === "not-configured"\) notConfigured = true/);
  assert.match(src, /res\.reason === "fetch-failed"\) fetchFailed = true/);
  assert.match(src, /if \(fetchFailed\) \{[\s\S]*?result\.errors \+= 1/);
});

/* ── 3. 집계 오염 없음 — property_type='apartment' 조건 잠금 ─────────────── */

test("[1024 · Q2] 집계 뷰·RPC·조회는 property_type='apartment' 를 명시한다(비아파트 행이 아파트 시세에 섞이지 않음)", () => {
  const agg = read("supabase/migrations/20260727150000_aggregates_filter_property_type.sql");
  assert.ok((agg.match(/property_type = 'apartment'/g) ?? []).length >= 5, "다섯 집계 전부");
  const monthly = read("supabase/migrations/20260922000300_1009_region_monthly_base_month.sql");
  assert.match(monthly, /t\.property_type = 'apartment'/);
  const lawd = read("supabase/migrations/20260801120000_household_match_by_region_and_normalized_name.sql");
  assert.match(lawd, /where property_type = 'apartment'/);
  const rent = code("lib/market/rent.ts");
  assert.match(rent, /\.eq\("property_type", "apartment"\)/);
  /* 비아파트 조회는 반대로 비아파트 유형만 — 아파트 전월세가 원룸 화면에 섞이지 않는다 */
  const nonapt = code("lib/market/rent-nonapt.ts");
  assert.match(nonapt, /\.eq\("property_type", opts\.type\)/);
  assert.match(nonapt, /\.eq\("transaction_type", "rent"\)/);
});

/* ── 4. K-apt 관리비 ───────────────────────────────────────────────────── */

test("[1024 · Q3] sumCostFields — 식별 필드 제외, 콤마 숫자 허용, 숫자 없음·음수 합은 null", () => {
  assert.ok(MGMT_FEE_IDENTITY_KEYS.has("kaptCode"));
  assert.equal(sumCostFields({ kaptCode: "A10027389", kaptName: "공작", cleanCost: "1,200,000", guardCost: 800000 }), 2_000_000);
  assert.equal(sumCostFields({ kaptCode: "A1", kaptName: "x" }), null, "금액 필드 없음 → null(0 아님)");
  assert.equal(sumCostFields({ kaptCode: "A1", refund: -10, cost: 5 }), null, "합이 음수 → null");
  assert.equal(sumCostFields({ kaptCode: "A1", a: "", b: "abc", c: "12.5" }), 13);
  /* 서비스명은 브리프의 표준 표기(버전 env 미설정 시 접미 없음) */
  assert.match(KAPT_COMMON_COST_SERVICE, /^AptCmnuseManageCostService(V\d+)?$/);
  assert.match(KAPT_INDIVIDUAL_COST_SERVICE, /^AptIndvdlzManageCostService(V\d+)?$/);
});

test("[1024 · Q3] toMgmtFeeRow — 둘 다 null 이면 행 없음, 총액=합, ㎡당은 면적 있을 때만", () => {
  assert.equal(toMgmtFeeRow("A1", "202607", null, null, 1000), null);
  assert.equal(toMgmtFeeRow("", "202607", 10, null, 1000), null);
  const r = toMgmtFeeRow("A10027389", "202607", 120_000_000, 80_000_000, 50_000, "2026-09-28T00:00:00.000Z");
  assert.ok(r);
  assert.equal(r.total_krw, 200_000_000);
  assert.equal(r.per_m2_krw, 4000);
  assert.equal(r.source, "k-apt");
  const noArea = toMgmtFeeRow("A1", "202607", 100, null, null);
  assert.equal(noArea?.per_m2_krw, null);
  assert.equal(noArea?.individual_krw, null);
});

test("[1024 · Q3] summarizeMgmtFee — 최근 달·12개월 평균·전년 동월 비교(없으면 null)", () => {
  const rows: ComplexMgmtFeeRow[] = [
    { ym: "202607", commonKrw: 100, individualKrw: 100, totalKrw: 220, perM2Krw: 22 },
    { ym: "202606", commonKrw: 100, individualKrw: 80, totalKrw: 180, perM2Krw: null },
    { ym: "202507", commonKrw: 100, individualKrw: 100, totalKrw: 200, perM2Krw: 20 },
  ];
  const s = summarizeMgmtFee(rows);
  assert.equal(s.latest?.ym, "202607");
  assert.equal(s.months, 3);
  assert.equal(s.avgTotalKrw, 200);
  assert.equal(s.avgPerM2Krw, 21, "㎡당은 있는 달만 평균");
  assert.equal(s.yoyPct, 10, "220 vs 전년 동월 200 → +10%");
  assert.equal(s.yoyBaseYm, "202507");
  const none = summarizeMgmtFee([]);
  assert.equal(none.latest, null);
  assert.equal(none.yoyPct, null);
  const noBase = summarizeMgmtFee(rows.slice(0, 2));
  assert.equal(noBase.yoyPct, null, "전년 동월이 없으면 지어내지 않는다");
});

test("[1024 · Q3] 마이그레이션 SQL — complex_mgmt_fee(키 kapt_code·ym) · RLS · anon 차단 · 후보 뷰(실거래 우선)", () => {
  const p = "supabase/migrations/20260928125309_1024_complex_mgmt_fee.sql";
  assert.ok(existsSync(p));
  const sql = read(p);
  assert.match(sql, /create table if not exists public\.complex_mgmt_fee/);
  assert.match(sql, /primary key \(kapt_code, ym\)/);
  for (const col of ["common_krw", "individual_krw", "total_krw", "per_m2_krw"]) assert.ok(sql.includes(col), col);
  assert.match(sql, /alter table public\.complex_mgmt_fee enable row level security/);
  assert.match(sql, /revoke all on public\.complex_mgmt_fee from anon, authenticated/);
  assert.match(sql, /create or replace view public\.kapt_mgmt_fee_candidates/);
  assert.match(sql, /market_agg\.complex_master_link/);
  assert.match(sql, /left\(a\.lawd_cd, 2\) in \('11', '41', '28'\)/);
  assert.doesNotMatch(sql, /grant .* to anon/i);
  assert.doesNotMatch(sql, /drop table|truncate/i);
});

test("[1024 · Q3] 관리비 적재 — 키 없음이면 0행·no-key, 병합 RPC 로만 스탬프, 대상 달 기본 2개월 전", () => {
  const src = code("lib/national-data/kapt-mgmt-fee-ingest.ts");
  assert.match(src, /if \(!isDataGoKrEncodingConfigured\(\)\) return \{ \.\.\.base, skipped: "no-key" \}/);
  assert.match(src, /sb\.rpc\("upsert_apartment_complexes"/);
  assert.match(src, /\.from\("complex_mgmt_fee"\)\.upsert\(chunk, \{ onConflict: "kapt_code,ym" \}\)/);
  assert.match(src, /shiftYm\(cur, -2\)/);
  assert.match(src, /MGMT_FEE_BATCH = 200/);
  /* [1025] 미검증 표식은 걷혔다 — 실제 오퍼레이션(V3 · 22개)으로 확인. data-1025 가 목록을 잠근다 */
  assert.match(read("lib/national-data/kapt-mgmt-fee-api.ts"), /\[1025\] K-apt 공동주택 관리비 API/);
});

/* ── 5. 신고가·신저가(순수) ─────────────────────────────────────────────── */

test("[1024 · Q4] findTxExtremes — 기간 안 최고·최저, 동률은 최근 계약, 한 건이면 single", () => {
  const deals = [
    { ym: "202603", day: 5, man: 90000, area: 84.97, floor: 10 },
    { ym: "202605", day: 1, man: 90000, area: 84.98, floor: 3 },
    { ym: "202604", day: 20, man: 70000, area: 84.97, floor: 1 },
    { ym: "202601", day: 2, man: 65000, area: 59.9, floor: 7 },
  ];
  const e = findTxExtremes(deals);
  assert.equal(e.high, deals[1], "동률 90000 → 최근(202605)");
  assert.equal(e.low, deals[3]);
  assert.equal(e.count, 4);
  assert.equal(e.single, false);
  const ranged = findTxExtremes(deals, { fromYm: "202603", toYm: "202604" });
  assert.equal(ranged.high, deals[0]);
  assert.equal(ranged.low, deals[2]);
  const one = findTxExtremes(deals.slice(0, 1));
  assert.equal(one.single, true);
  assert.deepEqual(markExtremes(deals.slice(0, 1), one), [{ high: false, low: false }]);
  const marks = markExtremes(deals, e);
  assert.equal(marks[1].high, true);
  assert.equal(marks[3].low, true);
  assert.equal(marks[0].high, false);
});

test("[1024 · Q4] extremesByType — 전용면적 정수 ㎡ 로 묶는다(84.97·84.98 → \"84\"), 면적 없는 건 빠짐", () => {
  assert.equal(areaTypeKey(84.97), "84");
  assert.equal(areaTypeKey(null), null);
  const deals = [
    { ym: "202603", day: 5, man: 90000, area: 84.97, floor: 10 },
    { ym: "202605", day: 1, man: 95000, area: 84.98, floor: 3 },
    { ym: "202601", day: 2, man: 65000, area: 59.9, floor: 7 },
    { ym: "202602", day: 2, man: 10, area: null, floor: 7 },
  ];
  const m = extremesByType(deals);
  assert.deepEqual([...m.keys()].sort(), ["59", "84"]);
  assert.equal(m.get("84")?.high?.man, 95000);
  assert.equal(m.get("84")?.low?.man, 90000);
  assert.equal(m.get("59")?.single, true);
});

/* ── 6. 원룸·오피스텔 동네 전월세(순수) ───────────────────────────────────── */

test("[1024 · Q4] dongOfAddress — 시군구(두 토큰 포함)를 지나 첫 동/읍/면/가/리", () => {
  assert.equal(dongOfAddress("안양시 동안구 관양동 1602"), "관양동");
  assert.equal(dongOfAddress("종로구 종로1가 45"), "종로1가");
  assert.equal(dongOfAddress("수원시 영통구 영통동 1000-1"), "영통동");
  assert.equal(dongOfAddress("가평군 가평읍 읍내리 12"), "가평읍");
  assert.equal(dongOfAddress("동구 123"), null);
  assert.equal(dongOfAddress(null), null);
});

test("[1024 · Q4] areaBandKeyOf — ~30 원룸형 · 30~60 투룸형 · 60~ (경계는 위 밴드)", () => {
  assert.equal(areaBandKeyOf(29.99), "s");
  assert.equal(areaBandKeyOf(30), "m");
  assert.equal(areaBandKeyOf(59.99), "m");
  assert.equal(areaBandKeyOf(60), "l");
  assert.equal(areaBandKeyOf(null), null);
  assert.equal(areaBandKeyOf(0), null);
});

test("[1024 · Q4] rowToNonAptDeal — 아파트 행 거부 · 단독다가구는 건물명 null · 보증금 0 거부", () => {
  const base = {
    contract_ym: "202609",
    contract_day: 12,
    property_type: "officetel",
    address: "안양시 동안구 관양동 1602",
    area_m2: "28.5",
    floor: 7,
    deposit_krw: 10_000_000,
    monthly_rent_krw: 600_000,
    complex_name: "평촌오피스텔",
    build_year: 2018,
  };
  const d = rowToNonAptDeal(base);
  assert.ok(d);
  assert.equal(d.dong, "관양동");
  assert.equal(d.areaM2, 28.5);
  assert.equal(d.buildingName, "평촌오피스텔");
  assert.equal(rowToNonAptDeal({ ...base, property_type: "apartment" }), null);
  assert.equal(rowToNonAptDeal({ ...base, deposit_krw: 0 }), null);
  const house = rowToNonAptDeal({ ...base, property_type: "house", complex_name: "다가구" });
  assert.equal(house?.buildingName, null);
  assert.equal(house?.type, "house");
});

test("[1024 · Q4] summarizeNonAptRent — 월세·전세 분리, 중앙값, 동·면적대 필터, 동 목록은 필터 전 건수순", () => {
  const mk = (o: Partial<NonAptRentDeal>): NonAptRentDeal => ({
    ym: "202609",
    day: 1,
    type: "officetel",
    dong: "관양동",
    areaM2: 25,
    floor: 3,
    depositKrw: 10_000_000,
    monthlyKrw: 500_000,
    buildingName: null,
    buildYear: null,
    ...o,
  });
  const deals = [
    mk({ monthlyKrw: 500_000, depositKrw: 10_000_000 }),
    mk({ monthlyKrw: 700_000, depositKrw: 20_000_000, day: 9 }),
    mk({ monthlyKrw: 600_000, depositKrw: 5_000_000, dong: "평촌동", areaM2: 45 }),
    mk({ monthlyKrw: 0, depositKrw: 150_000_000, areaM2: 33 }),
    mk({ monthlyKrw: 0, depositKrw: 90_000_000, dong: "평촌동" }),
  ];
  const all = summarizeNonAptRent(deals);
  assert.equal(all.wolse.count, 3);
  assert.equal(all.wolse.medianDepositKrw, 10_000_000);
  assert.equal(all.wolse.medianMonthlyKrw, 600_000);
  assert.equal(all.jeonse.count, 2);
  assert.equal(all.jeonse.medianDepositKrw, 120_000_000);
  assert.equal(all.jeonse.medianMonthlyKrw, null);
  assert.deepEqual(all.dongs, [
    { dong: "관양동", count: 3 },
    { dong: "평촌동", count: 2 },
  ]);
  assert.equal(all.wolse.deals[0].day, 9, "최근 계약 먼저");

  const gwanyang = summarizeNonAptRent(deals, { dong: "관양동", areaBand: "s" });
  assert.equal(gwanyang.wolse.count, 2);
  assert.equal(gwanyang.jeonse.count, 0, "33㎡ 전세는 투룸형");
  assert.deepEqual(gwanyang.dongs, all.dongs, "동 목록은 필터와 무관");
  const empty = summarizeNonAptRent([]);
  assert.equal(empty.wolse.medianDepositKrw, null);
  assert.equal(empty.dongs.length, 0);
});

/* ── 7. 크론 라우트·vercel.json ─────────────────────────────────────────── */

test("[1024 · Q1~3] 새 크론 셋 — authorizeCron·withBudget·logIngest, vercel.json 에 02:40(+14:40 [1025])/02:50/03:10 UTC", () => {
  for (const r of ["molit-history-backfill", "molit-nonapt-ingest", "kapt-mgmt-fee-ingest"]) {
    const p = `app/api/cron/${r}/route.ts`;
    assert.ok(existsSync(p), p);
    const src = code(p);
    assert.match(src, /authorizeCron\(req\)/);
    assert.match(src, /withBudget\(/);
    assert.match(src, /CRON_WORK_BUDGET_MS/);
    assert.match(src, /logIngest\(/);
    assert.match(src, /export const maxDuration = 300/);
    assert.match(read(p), /\[1024\]/);
  }
  const vercel = JSON.parse(read("vercel.json")) as { crons: { path: string; schedule: string }[] };
  const by = new Map(vercel.crons.map((c) => [c.path, c.schedule]));
  assert.equal(by.get("/api/cron/molit-history-backfill"), "40 2,14 * * *"); // [1025] 하루 2회
  assert.equal(by.get("/api/cron/molit-nonapt-ingest"), "50 2 * * *");
  assert.equal(by.get("/api/cron/kapt-mgmt-fee-ingest"), "10 3 * * *");
  /* 백필·비아파트는 raw 미저장 · 아파트 일일 크론은 keepRaw 를 안 건드린다(예전과 같다) */
  assert.match(code("lib/market/molit-history-backfill.ts"), /keepRaw: false/);
  assert.match(code("lib/market/molit-nonapt.ts"), /keepRaw: false/);
  assert.doesNotMatch(code("app/api/cron/molit-transactions-ingest/route.ts"), /keepRaw/);
  /* 커서는 새 표가 아니라 public_data_cache */
  assert.match(code("lib/market/molit-cursor.ts"), /\.from\("public_data_cache"\)/);
  /* 관리비 조회는 실패·표 부재 시 null(카드 생략) — 던지지 않는다 */
  assert.match(code("lib/complex/mgmt-fee.ts"), /if \(error\) \{[\s\S]*?return null;/);
});
