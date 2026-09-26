/* [1009 · H] 홈 — 지역 카드 빈 칸 채우기 · 신고 기한 · 오늘의 한 줄 문장.
   숫자는 이 파일 안에서만 쓰는 가짜 값이다(운영 데이터 아님). */
import test from "node:test";
import assert from "node:assert/strict";
import {
  CARD_REGIONS,
  applyCardSeries,
  cardSeriesFromRows,
  fillMissingRegionCards,
  regionCardsFromMonthly,
  type MonthlyRow,
} from "../../lib/newui/home-region-fallback.ts";
import { reportingClosed, reportingDeadlineLabel, splitByReporting } from "../../lib/newui/reporting-window.ts";
import { todayRegionSentence, todayTradeSentence } from "../../app/components/home/today-line.ts";
import { indexMoMByRegion } from "../../lib/newui/home-briefing.ts";
import type { HomeRegionCard } from "../../lib/newui/home-data.ts";
import type { KpiRegion } from "../../app/components/home/HomeKpiRow.tsx";

const EOK = 100_000_000;
const NOW = new Date("2026-09-22T03:00:00Z"); // 12:00 KST

function row(region_name: string, month: string, n: number, won: number, d: number | null): MonthlyRow {
  return { region_name, month, transaction_count: n, avg_deal_amount_krw: won, trend_delta_pct: d };
}

function card(id: string, over: Partial<HomeRegionCard> = {}): HomeRegionCard {
  return {
    id,
    name: id,
    meta: "",
    periodLabel: "8월",
    price: "1억",
    delta: "▲ 1.0%",
    tone: "up",
    href: "/map",
    spark: [],
    ...over,
  };
}

test("[1009·H] 신고 기한 — 말일 + 30일(KST)", () => {
  assert.equal(reportingClosed("202607", NOW), true);
  assert.equal(reportingClosed("202608", NOW), false);
  assert.equal(reportingClosed("2026-08", NOW), false);
  assert.deepEqual(
    splitByReporting([{ month: "202607" }, { month: "202608" }], NOW).open.map((r) => r.month),
    ["202608"],
  );
  /* 기한 날짜 표기 — 말일 + 30일 */
  assert.equal(reportingDeadlineLabel("202609"), "10/30");
  assert.equal(reportingDeadlineLabel("202608"), "9/30");
  assert.equal(reportingDeadlineLabel("202602"), "3/30");
  assert.equal(reportingDeadlineLabel("202613"), null);
});

test("[1009·H] 월 집계 카드 — now 를 주면 신고 중인 달(8월)을 건너뛰고 7월을 쓴다 · 새 필드", () => {
  const rows = [
    row("서울 강남구", "202608", 80, 30 * EOK, -6.9),
    row("서울 강남구", "202607", 189, 32 * EOK, 2.4),
  ];
  const [old] = regionCardsFromMonthly(rows, CARD_REGIONS);
  assert.equal(old.periodLabel, "8월"); // 옛 규칙(now 없음) 그대로
  const [c] = regionCardsFromMonthly(rows, CARD_REGIONS, { now: NOW });
  assert.equal(c.periodLabel, "7월");
  assert.equal(c.price, "32억");
  assert.equal(c.city, "서울");
  assert.equal(c.trades, 189);
  assert.equal(c.tradesYm, "202607"); // 건수의 달 = 카드의 달(국토부 계약월)
  assert.equal(c.tradesSource, "molit");
  assert.equal(c.changePct, 2.4);
  assert.equal(c.changeBasis, "avg");
  assert.equal(c.changeYm, "202607");
  const [u] = regionCardsFromMonthly([row("서울 강남구", "202607", 20, 10 * EOK, null)], CARD_REGIONS, { now: NOW });
  assert.equal(u.changePct, null);
});

test("[1009·H] 스냅샷 카드가 빠진 지역만 월 집계로 채운다 — 대상 순서, 스냅샷 우선", () => {
  const snap = [card("namyangju", { changeBasis: "index" })];
  const fb = [card("gangnam", { stale: true }), card("songpa", { stale: true }), card("namyangju", { stale: true })];
  const merged = fillMissingRegionCards(snap, fb, CARD_REGIONS);
  assert.deepEqual(
    merged.map((c) => c.id),
    ["gangnam", "songpa", "namyangju"],
  );
  assert.equal(merged[2].stale, undefined); // 남양주는 스냅샷 카드가 이긴다
  assert.deepEqual(fillMissingRegionCards([], [], CARD_REGIONS), []);
});

function kr(over: Partial<KpiRegion>): KpiRegion {
  return { name: "가나구", price: "8.5억", delta: "▲ 1.9%", tone: "up", tradeLabel: null, href: "/map", periodLabel: "8월", ...over };
}

test("[1009·H] 오늘의 한 줄 — 변동 미상은 비교를 쓰지 않고, 지수/평균 기준을 가른다", () => {
  assert.equal(
    todayRegionSentence(kr({ changePct: 1.91, changeBasis: "index" })),
    "가나구 8월 아파트 평균은 8.5억, 시세 지수는 전월보다 1.9% 올랐어요.",
  );
  assert.equal(
    todayRegionSentence(kr({ changePct: -6.88, changeBasis: "avg", delta: "▼ 6.9%", tone: "down" })),
    "가나구 8월 아파트 평균은 8.5억, 평당가는 전월보다 6.9% 내렸어요.",
  );
  /* 예전엔 "…전월과 비슷해요" — 모르는 것을 보합이라고 말했다 */
  assert.equal(
    todayRegionSentence(kr({ changePct: null, delta: "변동 미상", tone: "flat" })),
    "가나구 8월 아파트 평균은 8.5억이에요.",
  );
  assert.equal(todayRegionSentence(kr({ changePct: 0.02, changeBasis: "avg" })), "가나구 8월 아파트 평균은 8.5억, 평당가는 전월보다 거의 그대로예요.");
  /* 옛 응답(changePct 없음) — delta 문자열에서 읽는다 */
  assert.equal(todayRegionSentence(kr({ delta: "▼ 0.8%", tone: "down" })), "가나구 8월 아파트 평균이 8.5억, 전월보다 0.8% 내렸어요.");
  assert.equal(todayRegionSentence(kr({ delta: "변동 미상", periodLabel: null })), "가나구 아파트 평균은 8.5억이에요.");
});

import { briefingFromDeltas, briefingFromIndexRows } from "../../lib/newui/home-briefing.ts";

test("[1009·H] 브리핑 — 스냅샷과 같은 문장 규칙 · 5곳 미만이면 null", () => {
  assert.deepEqual(briefingFromDeltas([0.5, 0.3, -0.2, 0.0, 1.2], "202607"), {
    text: "서울 5개 구 중 3곳 상승, 평균 ▲0.4%",
    asOfLabel: "기준 2026.07",
    basis: "한국부동산원 매매가격지수 전월비 · 위 지역 평균과 같은 기준",
  });
  assert.equal(briefingFromDeltas([0.5, 0.3], "202607"), null);
  assert.equal(briefingFromDeltas([0.01, -0.02, 0.03, 0, 0.04], "202607")?.text, "서울 5개 구 중 0곳 상승, 평균 보합");
});

test("[1009·H] 지수 시계열 → 기준월(가장 많은 구의 최신 달) · 바로 전 달이 없는 구는 세지 않는다", () => {
  const rows = [
    ...["a", "b", "c", "d", "e"].flatMap((id, i) => [
      { region_id: id, period: "2026-07-01", value: 101 + i * 0.1 },
      { region_id: id, period: "2026-06-01", value: 100 },
    ]),
    /* f 는 7월이 없고 g 는 6월이 없다 */
    { region_id: "f", period: "2026-06-01", value: 100 },
    { region_id: "g", period: "2026-07-01", value: 120 },
  ];
  const b = briefingFromIndexRows(rows);
  assert.equal(b?.asOfLabel, "기준 2026.07");
  assert.equal(b?.text, "서울 5개 구 중 5곳 상승, 평균 ▲1.2%");
  assert.equal(briefingFromIndexRows([]), null);
  /* 기준 문구는 호출부가 정한다(지역 카드와 기준이 다를 때 "같은 기준"이라고 말하지 않게) */
  assert.equal(briefingFromIndexRows(rows, { basis: "지수 기준" })?.basis, "지수 기준");
});

/* ── [1009 · H 리뷰] 카드 곁값 — 한 화면 한 기준 · 거래 건수의 제 달 ── */

const SERIES_ROWS = {
  /* 주간 지수 — 입력은 최신순(조회 순서)이라도 스파크라인은 오래된 것 → 최신 */
  weekly: [
    { region_id: "namyangju", period: "2026-09-14", value: 102 },
    { region_id: "namyangju", period: "2026-09-07", value: 101 },
    { region_id: "namyangju", period: "2026-08-31", value: 100 },
    { region_id: "gangnam", period: "2026-09-14", value: 110 },
  ],
  /* 부동산원 월간 거래량 — 지역마다 가장 최근 달 */
  trades: [
    { region_id: "namyangju", period: "2026-07-01", value: 2000 },
    { region_id: "namyangju", period: "2026-06-01", value: 1800 },
  ],
  /* 월간 지수 — 강남 7월·6월, 송파는 7월만(전월 없음 → 등락 없음) */
  index: [
    { region_id: "gangnam", period: "2026-07-01", value: 101 },
    { region_id: "gangnam", period: "2026-06-01", value: 100 },
    { region_id: "songpa", period: "2026-07-01", value: 105 },
    { region_id: "namyangju", period: "2026-08-01", value: 102 },
    { region_id: "namyangju", period: "2026-07-01", value: 100 },
  ],
};

test("[1009·H 리뷰] 시계열 행 → 곁값 · 지역별 지수 전월비(바로 전 달이 있을 때만)", () => {
  const s = cardSeriesFromRows(SERIES_ROWS, 2);
  assert.deepEqual(s.sparks.namyangju, [101, 102]); // 오름차순 마지막 2개
  assert.deepEqual(s.trades.namyangju, { ym: "202607", count: 2000 });
  const moms = indexMoMByRegion(s.index);
  assert.equal(moms.get("gangnam")?.ym, "202607");
  assert.equal(Math.round((moms.get("gangnam")?.pct ?? 0) * 100) / 100, 1);
  assert.equal(moms.has("songpa"), false);
});

test("[1009·H 리뷰] 곁값 적용 — 월 집계 카드는 등락을 지수로, 스냅샷 카드는 거래 건수를 제 달·원천으로", () => {
  const series = cardSeriesFromRows(SERIES_ROWS, 16);
  const stale = card("gangnam", {
    stale: true,
    periodLabel: "7월",
    delta: "▲ 2.4%",
    changePct: 2.4,
    changeBasis: "avg",
    changeYm: "202607",
    trades: 189,
    tradesYm: "202607",
    tradesSource: "molit",
  });
  const snap = card("namyangju", { changePct: 0.8, changeBasis: "index", changeYm: "202608", trades: 2646, tradesYm: null });
  const noIndex = card("songpa", { stale: true, changePct: 5.7, changeBasis: "avg" });
  const [g, n, s] = applyCardSeries([stale, snap, noIndex], series);
  /* 서울 월 집계 카드 — 가격·건수는 국토부 그대로, 등락은 부동산원 지수 전월비(브리핑과 같은 원천) */
  assert.equal(g.changeBasis, "index");
  assert.equal(g.changeYm, "202607");
  assert.equal(g.delta, "▲ 1.0%");
  assert.equal(g.trades, 189);
  assert.equal(g.tradesSource, "molit");
  assert.deepEqual(g.spark, [110]);
  /* 스냅샷 카드 — 건수는 스냅샷 값을 버리고 부동산원 거래량의 제 달(7월) */
  assert.equal(n.trades, 2000);
  assert.equal(n.tradesYm, "202607");
  assert.equal(n.tradesSource, "reb");
  assert.equal(n.changePct, 0.8); // 스냅샷 월간 변동률이 있으면 그대로
  assert.deepEqual(n.spark, [100, 101, 102]);
  /* 지수 전월비를 못 구하면 원래의 평당가 기준을 그대로 둔다(화면이 "평당가 전월 대비"로 적는다) */
  assert.equal(s.changeBasis, "avg");
  assert.equal(s.changePct, 5.7);
});

test("[1009·H 리뷰] 오늘의 한 줄 — 거래 문장은 건수의 제 달·원천으로, 가격 원천·등락의 달을 적는다", () => {
  assert.equal(
    todayTradeSentence(kr({ name: "남양주", tradeLabel: "2,646건", tradesYm: "202607", tradesSource: "reb" })),
    "남양주 7월 아파트 매매 거래는 2,646건이에요(한국부동산원 집계).",
  );
  assert.equal(
    todayTradeSentence(kr({ name: "강남구", tradeLabel: "189건", tradesYm: "202607", tradesSource: "molit" })),
    "강남구 7월 계약 아파트 매매 189건이 신고됐어요.",
  );
  /* 달을 모르면 "최근" — 카드 기준월을 붙이지 않는다 */
  assert.equal(todayTradeSentence(kr({ tradeLabel: "37건" })), "가나구 최근 아파트 매매 37건이 신고됐어요.");
  assert.equal(todayTradeSentence(kr({ tradeLabel: null })), null);
  assert.equal(
    todayRegionSentence(kr({ periodLabel: "7월", priceKind: "molit", changePct: 0.6, changeBasis: "index", changeYm: "202607" })),
    "가나구 7월 아파트 실거래 평균은 8.5억, 시세 지수는 전월보다 0.6% 올랐어요.",
  );
  /* 등락의 달이 가격의 달과 다르면 그 달을 적는다 */
  assert.equal(
    todayRegionSentence(kr({ periodLabel: "7월", priceKind: "molit", changePct: 0.6, changeBasis: "index", changeYm: "202608" })),
    "가나구 7월 아파트 실거래 평균은 8.5억, 8월 시세 지수는 전월보다 0.6% 올랐어요.",
  );
});
