import { test } from "node:test";
import assert from "node:assert/strict";
import { matchRegionFromClsFullNm } from "../../lib/market/region-code.ts";
import { buildRegionPriceRows, isEmptyRegionPriceRow } from "../../lib/reb/price-rows.ts";
import {
  isBetterSnapshotRow,
  pickBestSnapshotMap,
  pickBestSnapshotRow,
  snapshotRowHasValue,
  type RegionPriceDbRow,
} from "../../lib/market/region-snapshot-pick.ts";
import {
  pickLatestMonthlyAverage,
  shortMonthLabel,
} from "../../lib/market/region-snapshot-fallback.ts";
import type { MonthlyRow } from "../../lib/newui/home-region-fallback.ts";

/* ============================================================
   [1007] 데이터 품질 회귀 잠금
   1. R-ONE 서울 구 4단 표기("서울>강북지역>도심권>종로구")가 카탈로그로 풀린다
   2. 값이 하나도 없는 지역은 가격 스냅샷 행을 만들지 않는다(빈 행 덮어쓰기 차단)
   3. 스냅샷 선택은 값 있는 행 우선 → 출처 순
   4. 허브 가격 티저 폴백 — 실거래 월 집계에서 기준월·평균 고르기
   ============================================================ */

/* ── 1. 지역 매핑 ─────────────────────────────────────────── */

test("R-ONE 동향조사 표의 서울 4단 표기 — 25개 구가 전부 카탈로그에 붙는다", () => {
  /* 실측(2026-09-20, selectOpenApiItmCd A_2024_00045·00061·00050·00072·00060·00064·주간) 표기 그대로 */
  const cases: Array<[string, string]> = [
    ["서울>강북지역>도심권>종로구", "jongno"],
    ["서울>강북지역>도심권>중구", "jung"],
    ["서울>강북지역>도심권>용산구", "yongsan"],
    ["서울>강북지역>동북권>성동구", "seongdong"],
    ["서울>강북지역>동북권>노원구", "nowon"],
    ["서울>강북지역>서북권>마포구", "mapo"],
    ["서울>강남지역>서남권>양천구", "yangcheon"],
    ["서울>강남지역>서남권>영등포구", "yeongdeungpo"],
    ["서울>강남지역>동남권>서초구", "seocho"],
    ["서울>강남지역>동남권>강남구", "gangnam"],
    ["서울>강남지역>동남권>송파구", "songpa"],
    ["서울>강남지역>동남권>강동구", "gangdong"],
  ];
  for (const [cls, id] of cases) {
    assert.equal(matchRegionFromClsFullNm(cls)?.id, id, cls);
  }
});

test("서울 권역 묶음 행(강북지역·도심권)은 구가 아니다 — null", () => {
  assert.equal(matchRegionFromClsFullNm("서울>강북지역"), null);
  assert.equal(matchRegionFromClsFullNm("서울>강남지역>동남권"), null);
  assert.equal(matchRegionFromClsFullNm("서울>강북지역>도심권"), null);
});

test("거래현황 표의 2단 표기와 다른 시도의 권역 표기는 예전처럼 붙는다", () => {
  assert.equal(matchRegionFromClsFullNm("서울>종로구")?.id, "jongno");
  assert.equal(matchRegionFromClsFullNm("서울>강남구")?.id, "gangnam");
  assert.equal(matchRegionFromClsFullNm("경기>서해안권>화성시>동탄구")?.id, "hwaseong-dongtan");
  assert.equal(matchRegionFromClsFullNm("경기>경부1권>안양시>만안구")?.id, "anyang-manan");
  assert.equal(matchRegionFromClsFullNm("부산>중부산권>중구")?.id, "busan-jung");
  assert.equal(matchRegionFromClsFullNm("전남광주>광주>광산구")?.id, "gwangju-gwangsan");
  assert.equal(matchRegionFromClsFullNm("전남광주>광주>동구")?.id, "gwangju-dong");
  /* 부천 옛 구 표기 "(구)원미구" 는 카탈로그에 없다 — 지어내지 않는다 */
  assert.equal(matchRegionFromClsFullNm("경기>서해안권>부천시>(구)원미구"), null);
});

/* ── 2. 가격 스냅샷 행 구성 ───────────────────────────────── */

test("가격·지수가 전부 없고 period 도 빈 지역은 upsert 행을 만들지 않는다", () => {
  const monthlyByKey = new Map([
    /* 거래현황 표만 붙은 서울 구(실측 상황) */
    ["jongno|trade_count", [{ period: "202607", value: 120 }, { period: "202608", value: 131 }]],
    /* 매매지수까지 있는 지역 — period 는 지수 최신 월 */
    ["gangnam|sale_index", [{ period: "202608", value: 101.2 }, { period: "202607", value: 100.9 }]],
    ["gangnam|trade_count", [{ period: "202608", value: 300 }]],
  ]);
  const priceAcc = new Map([
    ["mapo", { regionName: "마포구", period: "202608", perM2Sale: 15_000_000 }],
  ]);
  const regionNames = new Map([["jongno", "종로구"], ["gangnam", "강남구"]]);
  const { rows, skipped } = buildRegionPriceRows({ priceAcc, monthlyByKey, regionNames });
  assert.deepEqual(skipped, ["jongno"]);
  const ids = rows.map((r) => r.regionId).sort();
  assert.deepEqual(ids, ["gangnam", "mapo"]);
  const gangnam = rows.find((r) => r.regionId === "gangnam")!;
  assert.equal(gangnam.period, "202608", "응답 순서와 무관하게 정렬해 최신 월");
  assert.equal(gangnam.regionName, "강남구");
  assert.equal(gangnam.tradeCount, 300);
  assert.ok(Math.abs((gangnam.saleChange ?? 0) - 0.3) < 0.01, "전월비 (101.2-100.9)/100.9 ≈ 0.30%");
  const mapo = rows.find((r) => r.regionId === "mapo")!;
  assert.equal(mapo.perM2Sale, 15_000_000);
  assert.equal(mapo.period, "202608");
});

test("isEmptyRegionPriceRow — 거래건수·수급만 있는 행은 비었다, 가격 하나라도 있으면 아니다", () => {
  const base = { source: "reb" as const, regionId: "x", regionName: "x", propertyType: "apt" as const, period: "" };
  assert.equal(isEmptyRegionPriceRow({ ...base, tradeCount: 10, buySuperiority: 90 }), true);
  assert.equal(isEmptyRegionPriceRow({ ...base, avgJeonse: 1 }), false);
  assert.equal(isEmptyRegionPriceRow({ ...base, period: "202608" }), false, "period 가 있으면 지수 표에서 온 행");
  assert.equal(isEmptyRegionPriceRow({ ...base, saleChange: -0.2 }), false);
});

/* ── 3. 스냅샷 선택 ───────────────────────────────────────── */

function dbRow(source: string, perM2: number | null, avg: number | null = null): RegionPriceDbRow {
  return {
    source,
    region_id: "gangnam",
    region_name: "강남구",
    period: perM2 ? "202608" : "",
    per_m2_sale: perM2,
    avg_sale: avg,
    median_sale: null,
    jeonse_ratio: null,
    sale_change: null,
    trade_count: 12,
    buy_superiority: null,
    jeonse_supply: null,
  };
}

test("pickBestSnapshotRow — 값 있는 행이 출처 우선순위보다 먼저다", () => {
  const emptyReb = dbRow("reb", null);
  const kb = dbRow("kb", 12_000_000);
  assert.equal(pickBestSnapshotRow([emptyReb, kb])?.source, "kb");
  assert.equal(pickBestSnapshotRow([kb, emptyReb])?.source, "kb");
  /* 둘 다 값이 있으면 예전 규칙(reb > kb > crawl) */
  const reb = dbRow("reb", 30_000_000);
  assert.equal(pickBestSnapshotRow([kb, reb])?.source, "reb");
  assert.equal(pickBestSnapshotRow([reb, kb, dbRow("crawl", 1)])?.source, "reb");
  /* avg_sale 만 있어도 "값 있음" */
  assert.equal(pickBestSnapshotRow([emptyReb, dbRow("crawl", null, 2_000_000_000)])?.source, "crawl");
  /* 전부 비었으면 그래도 하나는 돌려준다(출처 순) — 호출부가 perM2Sale 유무로 판단 */
  assert.equal(pickBestSnapshotRow([dbRow("kb", null), emptyReb])?.source, "reb");
  assert.equal(pickBestSnapshotRow([]), null);
});

test("snapshotRowHasValue · isBetterSnapshotRow — 0·음수·NaN 은 값이 아니다", () => {
  assert.equal(snapshotRowHasValue({ per_m2_sale: 0, avg_sale: null }), false);
  assert.equal(snapshotRowHasValue({ per_m2_sale: -1, avg_sale: 0 }), false);
  assert.equal(snapshotRowHasValue({ per_m2_sale: Number.NaN, avg_sale: null }), false);
  assert.equal(snapshotRowHasValue({ per_m2_sale: null, avg_sale: 1 }), true);
  assert.equal(isBetterSnapshotRow(dbRow("kb", 1), dbRow("reb", null)), true);
  assert.equal(isBetterSnapshotRow(dbRow("reb", null), dbRow("kb", 1)), false);
});

test("pickBestSnapshotMap — 입력 순서와 무관하게 같은 결과, 지역별 최선 하나", () => {
  const rows: RegionPriceDbRow[] = [
    dbRow("reb", null),
    dbRow("kb", 12_000_000),
    { ...dbRow("reb", 8_000_000), region_id: "mapo", region_name: "마포구" },
  ];
  const a = pickBestSnapshotMap(rows);
  const b = pickBestSnapshotMap([...rows].reverse());
  assert.equal(a.size, 2);
  assert.equal(a.get("gangnam")?.source, "kb");
  assert.equal(a.get("gangnam")?.perM2Sale, 12_000_000);
  assert.equal(a.get("mapo")?.source, "reb");
  assert.deepEqual([...a.entries()].sort(), [...b.entries()].sort());
});

/* ── 4. 허브 가격 티저 폴백 ───────────────────────────────── */

function m(region_name: string, month: string, count: number | null, avg: number | null): MonthlyRow {
  return { region_name, month, transaction_count: count, avg_deal_amount_krw: avg, trend_delta_pct: null };
}

test("pickLatestMonthlyAverage — 거래 10건 이상인 가장 최근 달, 지역 이름 정확 일치, 순서 무관", () => {
  const rows = [
    m("서울 강남구", "202609", 4, 3_000_000_000), // 당월 부분 집계 — 건너뜀
    m("서울 강남구", "202607", 40, 2_800_000_000),
    m("서울 강남구", "202608", 25, 2_900_000_000),
    m("서울 마포구", "202609", 50, 1_500_000_000), // 다른 지역
    m("서울 강남구", "2026-08", 99, 1), // 형식 불량
    m("서울 강남구", "202606", "12" as unknown as number, "2700000000" as unknown as number), // 문자열 숫자
  ];
  const pick = pickLatestMonthlyAverage(rows, "서울 강남구");
  assert.deepEqual(pick, { month: "202608", count: 25, avgWon: 2_900_000_000 });
  assert.deepEqual(pickLatestMonthlyAverage([...rows].reverse(), "서울 강남구"), pick);
  assert.equal(pickLatestMonthlyAverage(rows, "서울 송파구"), null);
  assert.equal(pickLatestMonthlyAverage([m("서울 강남구", "202608", 9, 1)], "서울 강남구"), null);
  assert.equal(pickLatestMonthlyAverage([m("서울 강남구", "202608", 20, 0)], "서울 강남구"), null, "평균 0 은 값이 아니다");
  assert.equal(pickLatestMonthlyAverage(rows, "서울 강남구", { minTrades: 1 })?.month, "202609");
});

test("shortMonthLabel — YYYYMM 만 26.08 로, 그 외는 null", () => {
  assert.equal(shortMonthLabel("202608"), "26.08");
  assert.equal(shortMonthLabel("2026-08-01"), null);
  assert.equal(shortMonthLabel(""), null);
  assert.equal(shortMonthLabel(null), null);
});
