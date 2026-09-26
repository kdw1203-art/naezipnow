import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  buildComplexFacts,
  buildCompleteness,
  buildSummaryLine,
  computeJeonseRatio,
  currentYm,
  isMasterLinked,
  medianOf,
  summarizeRents,
  summarizeTrades,
  ymMonthsBefore,
  type ComplexFactsRow,
  type RentSample,
  type TradeSample,
} from "../../lib/complex/complex-facts.ts";
import { areaBandLabelByUnit } from "../../lib/complex/area-band-label.ts";

/* [1006 · B] 지도 단지 패널 "자료 완성도 · 한 줄 요약 · 단지 전세가율" — 순수 규칙 고정.
   지어내지 않는다: 없는 값은 문장에서 빠지고, 표본 3건 미만이면 중앙값·전세가율을 내지 않는다. */

const NOW = "202609";
const EOK = 100_000_000;

const FULL: ComplexFactsRow = {
  build_year: 2018,
  households: 9510,
  building_count: 84,
  parking_count: 13000,
  parking_per_hh: 1.37,
  builder_name: "현대건설·HDC현대산업개발·삼성물산",
  heating: "지역난방",
  road_address: "서울 송파구 송파대로 345",
  kapt_code: "A13520001",
};

const UNLINKED: ComplexFactsRow = {
  build_year: 1995,
  households: null,
  building_count: null,
  parking_count: null,
  parking_per_hh: null,
  builder_name: null,
  heating: null,
  road_address: null,
  kapt_code: null,
};

function trades(spec: Array<[ym: string, eok: number, area?: number | null]>): TradeSample[] {
  return spec.map(([ym, e, area]) => ({ ym, amountKrw: e * EOK, areaM2: area === undefined ? 84.9 : area }));
}
function jeonse(spec: Array<[ym: string, eok: number]>): RentSample[] {
  return spec.map(([ym, e]) => ({ ym, depositKrw: e * EOK, monthlyKrw: 0 }));
}
function wolse(spec: Array<[ym: string, depositEok: number, monthlyMan: number]>): RentSample[] {
  return spec.map(([ym, d, m]) => ({ ym, depositKrw: d * EOK, monthlyKrw: m * 10_000 }));
}

test("ymMonthsBefore — 연도 경계를 넘고 n=0 이면 그대로", () => {
  assert.equal(ymMonthsBefore("202609", 0), "202609");
  assert.equal(ymMonthsBefore("202609", 5), "202604");
  assert.equal(ymMonthsBefore("202609", 11), "202510");
  assert.equal(ymMonthsBefore("202601", 1), "202512");
  assert.equal(ymMonthsBefore("202601", 23), "202402");
});

test("currentYm — KST 기준 달: UTC 로는 전달인 KST 월초 새벽도 이번 달로 센다", () => {
  /* 2026-09-30 20:00Z = KST 10월 1일 05:00 → "202610" (UTC getMonth 면 "202609") */
  assert.equal(currentYm(new Date("2026-09-30T20:00:00Z")), "202610");
  /* 2026-09-30 14:59Z = KST 9월 30일 23:59 → 아직 "202609" */
  assert.equal(currentYm(new Date("2026-09-30T14:59:00Z")), "202609");
  /* 연도 경계: 2025-12-31 15:00Z = KST 2026-01-01 00:00 */
  assert.equal(currentYm(new Date("2025-12-31T15:00:00Z")), "202601");
  /* 한낮은 두 시간대가 같은 달 — 형식만 고정 */
  assert.equal(currentYm(new Date("2026-03-15T03:00:00Z")), "202603");
});

test("medianOf — 홀수는 가운데, 짝수는 가운데 둘의 반올림 평균, 빈 배열은 null", () => {
  assert.equal(medianOf([3, 1, 2]), 2);
  assert.equal(medianOf([4, 1, 3, 2]), 3); // (2+3)/2 = 2.5 → 3
  assert.equal(medianOf([]), null);
  assert.equal(medianOf([Number.NaN, 5]), 5);
});

test("summarizeTrades — 12개월 창 밖은 빼고, 표본이 가장 많은 면적대의 중앙값을 낸다", () => {
  const s = summarizeTrades(
    trades([
      ["202609", 31, 84.9],
      ["202608", 30.9, 84.9],
      ["202607", 30, 84.9],
      ["202606", 20, 59.9],
      ["202605", 19, 59.9],
      ["202510", 29, 84.9], // 창 안(202510 부터)
      ["202509", 99, 84.9], // 창 밖 — 12개월 전
      ["202401", 1, 84.9], // 창 밖
    ]),
    NOW,
  );
  assert.equal(s.fromYm, "202510");
  assert.equal(s.toYm, "202609");
  assert.equal(s.count, 6);
  assert.equal(s.latestYm, "202609");
  assert.ok(s.band);
  assert.equal(s.band?.label, "60~85㎡");
  assert.equal(s.band?.count, 4);
  assert.equal(s.band?.medianKrw, Math.round(((30 + 30.9) / 2) * EOK)); // 29·30·30.9·31 → (30+30.9)/2
  assert.equal(s.medianKrw, Math.round(((29 + 30) / 2) * EOK)); // 19·20·29·30·30.9·31
});

test("summarizeTrades — 표본 3건 미만이면 중앙값·면적대 모두 null (건수만 남는다)", () => {
  const s = summarizeTrades(trades([["202609", 31], ["202608", 30]]), NOW);
  assert.equal(s.count, 2);
  assert.equal(s.medianKrw, null);
  assert.equal(s.band, null);
  /* 면적이 없는 행은 면적대 집계에서만 빠진다 */
  const t = summarizeTrades(trades([["202609", 31, null], ["202608", 30, null], ["202607", 29, null]]), NOW);
  assert.equal(t.count, 3);
  assert.equal(t.medianKrw, 30 * EOK);
  assert.equal(t.band, null);
});

test("summarizeRents — 창 안 전세·월세를 나눠 세고, 가장 최근 달은 창 밖이라도 말한다", () => {
  const r = summarizeRents(
    [
      ...jeonse([["202608", 12.1], ["202607", 12], ["202606", 12.5]]),
      ...wolse([["202608", 1, 200], ["202605", 2, 150]]),
      ...jeonse([["202410", 9]]), // 창 밖(24개월 안)
    ],
    NOW,
  );
  assert.equal(r.jeonseCount, 3);
  assert.equal(r.jeonseMedianKrw, 12.1 * EOK);
  assert.equal(r.wolseCount, 2);
  assert.equal(r.wolseMedianDepositKrw, Math.round(1.5 * EOK));
  assert.equal(r.wolseMedianMonthlyKrw, 175 * 10_000);
  assert.equal(r.latest?.ym, "202608");
  assert.equal(r.latest?.jeonseCount, 1);
  assert.equal(r.latest?.wolseCount, 1);

  /* 12개월 창엔 없고 그 전에만 있으면 — 창 건수 0, 최근 달은 남는다 */
  const old = summarizeRents(jeonse([["202410", 9]]), NOW);
  assert.equal(old.jeonseCount, 0);
  assert.equal(old.jeonseMedianKrw, null);
  assert.equal(old.latest?.ym, "202410");
});

test("computeJeonseRatio — 6개월 창, 둘 다 3건 이상일 때만 숫자, 아니면 null + 이유", () => {
  const t = trades([["202609", 31], ["202608", 30.9], ["202607", 30], ["202512", 25]]); // 202512 는 6개월 밖
  const j = jeonse([["202609", 12.1], ["202608", 12], ["202606", 12.3]]);
  const ok = computeJeonseRatio(t, j, NOW);
  assert.ok(ok.ratio);
  assert.equal(ok.reason, null);
  assert.equal(ok.ratio?.fromYm, "202604");
  assert.equal(ok.ratio?.tradeCount, 3);
  assert.equal(ok.ratio?.jeonseCount, 3);
  assert.equal(ok.ratio?.tradeMedianKrw, 30.9 * EOK);
  assert.equal(ok.ratio?.jeonseMedianKrw, 12.1 * EOK);
  assert.equal(ok.ratio?.pct, 39.2);

  const thin = computeJeonseRatio(t, j.slice(0, 2), NOW);
  assert.equal(thin.ratio, null);
  assert.match(thin.reason ?? "", /전세 2건/);
  assert.match(thin.reason ?? "", /3건 이상/);

  const thinBoth = computeJeonseRatio(t.slice(0, 1), j.slice(0, 1), NOW);
  assert.match(thinBoth.reason ?? "", /전세 1건 · 매매 1건/);

  /* 월세는 전세 표본에 들어가지 않는다 */
  const withWolse = computeJeonseRatio(t, [...j.slice(0, 2), ...wolse([["202609", 1, 100]])], NOW);
  assert.equal(withWolse.ratio, null);

  /* 조회 실패(null)는 "표본 부족"과 다른 문장 */
  assert.match(computeJeonseRatio(null, j, NOW).reason ?? "", /매매 실거래를 지금 불러오지 못해/);
  assert.match(computeJeonseRatio(t, null, NOW).reason ?? "", /전세 실거래를 지금 불러오지 못해/);
  assert.match(computeJeonseRatio(null, null, NOW).reason ?? "", /매매·전세/);
});

test("isMasterLinked — kapt 코드나 대장 유래 필드가 하나라도 있으면 연결", () => {
  assert.equal(isMasterLinked(FULL), true);
  assert.equal(isMasterLinked(UNLINKED), false);
  assert.equal(isMasterLinked(null), false);
  assert.equal(isMasterLinked({ ...UNLINKED, heating: "개별난방" }), true);
  assert.equal(isMasterLinked({ ...UNLINKED, kapt_code: "A1" }), true);
});

test("buildCompleteness — 미연결 단지는 스펙 6종이 전부 master_unlinked, 연결 단지의 빈 세대수는 master_empty", () => {
  const un = buildCompleteness({
    complex: UNLINKED,
    tradeSummary: summarizeTrades([], NOW),
    rents: [],
    notes: { count: 0, latest: null },
  });
  assert.deepEqual(un.have, ["build_year"]);
  const unKeys = un.missing.map((g) => `${g.key}:${g.reason}`);
  for (const k of ["households", "building_count", "parking", "builder", "heating", "road"]) {
    assert.ok(unKeys.includes(`${k}:master_unlinked`), k);
  }
  assert.ok(unKeys.includes("trades:no_trade_12m"));
  assert.ok(unKeys.includes("rent:no_rent_24m"));
  assert.ok(unKeys.includes("notes:no_notes"));
  assert.ok(un.missing.every((g) => g.label && g.note));

  /* 같은 필지에 단지가 여럿 → 세대수만 비운 케이스(20260920031000) */
  const partial = buildCompleteness({
    complex: { ...FULL, households: null, parking_count: null },
    tradeSummary: null,
    rents: null,
    notes: null,
  });
  const byKey = new Map(partial.missing.map((g) => [g.key, g]));
  assert.equal(byKey.get("households")?.reason, "master_empty");
  assert.match(byKey.get("households")?.note ?? "", /같은 필지/);
  assert.equal(byKey.get("parking")?.reason, "master_empty");
  assert.equal(byKey.get("trades")?.reason, "fetch_failed");
  assert.equal(byKey.get("rent")?.reason, "fetch_failed");
  assert.equal(byKey.get("notes")?.reason, "fetch_failed");
  assert.ok(partial.have.includes("builder"));
  assert.ok(partial.have.includes("heating"));
  assert.ok(partial.have.includes("road"));
  assert.ok(partial.have.includes("building_count"));
});

test("buildSummaryLine — 있는 숫자만 ' · ' 로 잇고, 없는 항목은 문장에서 빠진다", () => {
  const t = trades([
    ["202609", 31],
    ["202608", 30.9],
    ["202607", 30],
  ]);
  const j = jeonse([["202609", 12.1], ["202608", 12], ["202606", 12.3]]);
  const facts = buildComplexFacts({
    complex: FULL,
    trades: t,
    rents: j,
    notes: { count: 2, latest: null },
    nowYm: NOW,
  });
  assert.equal(
    facts.summaryLine,
    "2018년 준공 · 9,510세대 · 최근 12개월 매매 3건, 60~85㎡ 중앙 30.9억 · 전세 중앙 12.1억 · 전세가율 39.2%(6개월)",
  );
  assert.ok(!facts.summaryLine?.includes("—"));
  assert.ok(!facts.summaryLine?.includes("()"));

  /* 미연결·거래 없음 — 준공만 남는다 */
  const bare = buildSummaryLine({
    complex: UNLINKED,
    tradeSummary: summarizeTrades([], NOW),
    rentSummary: summarizeRents([], NOW),
    jeonseRatio: null,
  });
  assert.equal(bare, "1995년 준공");

  /* 아무것도 없으면 null (빈 문자열·"—" 아님) */
  assert.equal(
    buildSummaryLine({ complex: null, tradeSummary: null, rentSummary: null, jeonseRatio: null }),
    null,
  );

  /* 전세 표본 1~2건이면 중앙값 대신 건수만 */
  const thin = buildSummaryLine({
    complex: { ...UNLINKED, build_year: null },
    tradeSummary: summarizeTrades(trades([["202609", 31], ["202608", 30]]), NOW),
    rentSummary: summarizeRents(jeonse([["202609", 12.1]]), NOW),
    jeonseRatio: null,
  });
  assert.equal(thin, "최근 12개월 매매 2건 · 전세 1건");
});

test("buildComplexFacts — 조회 실패(null)와 0건([])을 다르게 적는다", () => {
  const failed = buildComplexFacts({ complex: FULL, trades: null, rents: null, notes: null, nowYm: NOW });
  assert.equal(failed.tradeSummary, null);
  assert.equal(failed.rentSummary, null);
  assert.equal(failed.jeonseRatio, null);
  assert.match(failed.jeonseRatioReason ?? "", /불러오지 못해/);
  assert.equal(failed.summaryLine, "2018년 준공 · 9,510세대");

  const empty = buildComplexFacts({ complex: FULL, trades: [], rents: [], notes: { count: 0, latest: null }, nowYm: NOW });
  assert.equal(empty.tradeSummary?.count, 0);
  assert.equal(empty.rentSummary?.jeonseCount, 0);
  assert.match(empty.jeonseRatioReason ?? "", /전세 0건 · 매매 0건/);
  const reasons = new Map(empty.completeness.missing.map((g) => [g.key, g.reason]));
  assert.equal(reasons.get("trades"), "no_trade_12m");
  assert.equal(reasons.get("rent"), "no_rent_24m");
  assert.equal(reasons.get("notes"), "no_notes");
});

test("areaBandLabelByUnit — ㎡ 라벨의 숫자만 평으로, m2 는 그대로", () => {
  assert.equal(areaBandLabelByUnit("60~85㎡", "m2"), "60~85㎡");
  assert.equal(areaBandLabelByUnit("60~85㎡", "pyeong"), "18.1~25.7평");
  assert.equal(areaBandLabelByUnit("~59㎡", "pyeong"), "~17.8평");
  assert.equal(areaBandLabelByUnit("135㎡~", "pyeong"), "40.8평~");
  /* ㎡ 가 없는 문자열(이미 평·건수 라벨)은 손대지 않는다 */
  assert.equal(areaBandLabelByUnit("3건", "pyeong"), "3건");
});
