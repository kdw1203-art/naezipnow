/* [1009 · H] 지역 화면 머리 — 결론 한 줄·큰 숫자·신고 기한 판정·추세 데이터.
   숫자는 이 파일 안에서만 쓰는 가짜 값이다(운영 데이터 아님). */
import test from "node:test";
import assert from "node:assert/strict";
import {
  buildRegionOverview,
  countsToTrend,
  pctSentence,
  reportingClosed,
  seriesToTrend,
  shiftYm,
  splitByReporting,
  toYm,
  trendRanges,
  ymLong,
  ymShort,
} from "../../app/region/[id]/region-overview.ts";

/* 2026-09-22 12:00 KST */
const NOW = new Date("2026-09-22T03:00:00Z");

test("[1009·H] toYm · shiftYm · 라벨", () => {
  assert.equal(toYm("2026-07-01"), "202607");
  assert.equal(toYm("202607"), "202607");
  assert.equal(toYm("2026-07"), "202607");
  assert.equal(toYm("2026-13-01"), null);
  assert.equal(toYm(""), null);
  assert.equal(shiftYm("202601", 1), "202512");
  assert.equal(shiftYm("202607", 12), "202507");
  assert.equal(shiftYm("202512", -1), "202601");
  assert.equal(ymLong("202607"), "2026년 7월");
  assert.equal(ymShort("202607"), "26.07");
});

test("[1009·H] 신고 기한 — 말일 + 30일이 지나야 그 달이 끝난다(KST)", () => {
  assert.equal(reportingClosed("202607", NOW), true); // 기한 8/30
  assert.equal(reportingClosed("202608", NOW), false); // 기한 9/30
  assert.equal(reportingClosed("202609", NOW), false);
  /* 9/30 당일(KST)은 아직 기한 안 — 10/1 부터 끝 */
  assert.equal(reportingClosed("202608", new Date("2026-09-30T14:59:00Z")), false); // 9/30 23:59 KST
  assert.equal(reportingClosed("202608", new Date("2026-09-30T15:00:00Z")), true); // 10/1 00:00 KST
  /* 2월(28일) — 2/28 + 30 = 3/30 */
  assert.equal(reportingClosed("202602", new Date("2026-03-30T03:00:00Z")), false);
  assert.equal(reportingClosed("202602", new Date("2026-03-31T03:00:00Z")), true);
  const s = splitByReporting([{ month: "202606" }, { month: "202607" }, { month: "202608" }], NOW);
  assert.deepEqual(s.closed.map((r) => r.month), ["202606", "202607"]);
  assert.deepEqual(s.open.map((r) => r.month), ["202608"]);
});

const idx = [
  { period: "2025-07-01", value: 94.6 },
  { period: "2025-08-01", value: 95.2 },
  { period: "2026-06-01", value: 100 },
  { period: "2026-07-01", value: 100.6 },
];

test("[1009·H] 서울 구처럼 스냅샷이 비어도 시계열로 숫자와 결론을 세운다", () => {
  const o = buildRegionOverview({
    name: "가나구",
    snapshot: { period: "" },
    indexSeries: idx,
    jeonseSeries: [
      { period: "2026-06-01", value: 42.9 },
      { period: "2026-07-01", value: 43.0 },
    ],
    volume: [
      { month: "202606", count: 188, avgDealAmountKrw: 3_050_000_000 },
      { month: "202607", count: 189, avgDealAmountKrw: 3_250_000_000 },
      { month: "202608", count: 80, avgDealAmountKrw: 3_020_000_000 },
    ],
    now: NOW,
  });
  assert.equal(o.headline, "시세 지수가 전월보다 0.6% 올랐어요");
  assert.equal(o.headlineCaption, "가나구 · 2026년 7월 · 한국부동산원 매매가격지수");
  assert.equal(o.subline, "1년 전보다 6.3% 올랐어요");
  assert.equal(o.index?.ym, "202607");
  assert.ok(Math.abs((o.index?.momPct ?? 0) - 0.6) < 1e-9);
  assert.ok(Math.abs((o.jeonse?.ppChange ?? 0) - 0.1) < 1e-9);
  /* 거래량은 신고가 끝난 7월이 기준, 8월은 잠정으로 따로 */
  assert.deepEqual(o.volume && { ym: o.volume.ym, count: o.volume.count }, { ym: "202607", count: 189 });
  assert.ok(Math.abs((o.volume?.momPct ?? 0) - (1 / 188) * 100) < 1e-9);
  assert.deepEqual(o.volumeOpen, [{ ym: "202608", count: 80 }]);
  /* 평균가 — 부동산원 값이 없으면 신고가 끝난 달의 국토부 평균 */
  assert.deepEqual(o.avgPrice, { krw: 3_250_000_000, ym: "202607", basis: "tx", trades: 189 });
  assert.equal(o.hasReb, true);
});

test("[1009·H] 부동산원 스냅샷 값이 있으면 평균가는 스냅샷, 1년 전 점이 없으면 둘째 줄 없음", () => {
  const o = buildRegionOverview({
    name: "다라시",
    snapshot: { period: "202608", avgSale: 854_000_000, jeonseRatio: 61.6, saleChangeMonthly: 1.91 },
    indexSeries: [
      { period: "2026-07-01", value: 102.6 },
      { period: "2026-08-01", value: 104.6 },
    ],
    jeonseSeries: [],
    volume: [],
    now: NOW,
  });
  assert.equal(o.headline, "시세 지수가 전월보다 1.9% 올랐어요");
  assert.equal(o.subline, null);
  assert.deepEqual(o.avgPrice, { krw: 854_000_000, ym: "202608", basis: "reb", trades: null });
  assert.deepEqual(o.jeonse, { value: 61.6, ym: "202608", ppChange: null });
  assert.equal(o.volume, null);
});

test("[1009·H] 지수 시계열이 없으면 스냅샷 변동률 → 그것도 없으면 거래량 → 모두 없으면 null", () => {
  const a = buildRegionOverview({
    name: "마바구",
    snapshot: { period: "202608", saleChangeMonthly: -0.02 },
    indexSeries: [],
    jeonseSeries: [],
    volume: [],
    now: NOW,
  });
  assert.equal(a.headline, "시세 지수가 전월보다 거의 그대로예요");
  const b = buildRegionOverview({
    name: "사아구",
    snapshot: null,
    indexSeries: [],
    jeonseSeries: [],
    volume: [
      { month: "202606", count: 50 },
      { month: "202607", count: 40 },
      { month: "202608", count: 9 },
    ],
    now: NOW,
  });
  assert.equal(b.headline, "아파트 매매 신고가 전월보다 10건(20.0%) 줄었어요");
  assert.equal(b.headlineCaption, "사아구 · 2026년 7월 · 국토교통부 실거래 신고");
  assert.equal(b.hasReb, false);
  const c = buildRegionOverview({ name: "자차구", snapshot: null, indexSeries: [], jeonseSeries: [], volume: [], now: NOW });
  assert.equal(c.headline, null);
  assert.equal(c.index, null);
  assert.equal(c.avgPrice, null);
});

test("[1009·H] 달이 비어 있으면(직전 달 없음) 전월 대비를 지어내지 않는다", () => {
  const o = buildRegionOverview({
    name: "카타구",
    snapshot: null,
    indexSeries: [
      { period: "2026-04-01", value: 98 },
      { period: "2026-07-01", value: 100 },
    ],
    jeonseSeries: [],
    volume: [
      { month: "202604", count: 30 },
      { month: "202606", count: 40 },
    ],
    now: NOW,
  });
  assert.equal(o.index?.momPct, null);
  assert.equal(o.headline, null);
  assert.equal(o.volume?.momPct, null);
});

test("[1009·H] pctSentence · 추세 데이터 · 기간 탭", () => {
  assert.equal(pctSentence(1.91, "전월보다"), "전월보다 1.9% 올랐어요");
  assert.equal(pctSentence(-0.8, "전월보다"), "전월보다 0.8% 내렸어요");
  assert.equal(pctSentence(null, "전월보다"), null);
  const t = seriesToTrend("index", "시세 지수", idx);
  assert.deepEqual(t?.labels, ["25.07", "25.08", "26.06", "26.07"]);
  assert.deepEqual(t?.fullLabels[0], "2025년 7월");
  assert.equal(seriesToTrend("index", "x", [{ period: "2026-07-01", value: 1 }]), null);
  const v = countsToTrend("volume", "거래량", [
    { month: "202608", count: 80 },
    { month: "202606", count: 188 },
    { month: "202607", count: 189 },
  ], NOW);
  assert.deepEqual(v?.values, [188, 189]); // 8월(잠정)은 선에서 뺀다
  assert.equal(trendRanges(14), undefined);
  assert.equal(trendRanges(24)?.length, 2);
});
