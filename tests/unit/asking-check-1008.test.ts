import { test } from "node:test";
import assert from "node:assert/strict";
import {
  askingBandOptions,
  askingGapLabel,
  askingHeadline,
  askingPosition,
  askingWindow,
  barScale,
  defaultBandSlug,
  kstYm,
  medianOf,
  nearestTrades,
  parseAskingPrice,
  readAskingPrice,
  shiftYm,
  tradeToTuple,
  tradesFromTuples,
  type AskingTrade,
} from "@/lib/complex/asking-check";

/* [1008 · Q] 호가 점검 — 숫자는 테스트용 가짜(운영 데이터를 박지 않는다). */

const t = (ym: string, areaM2: number, priceManwon: number, floor: number | null = 5): AskingTrade => ({
  ym,
  areaM2,
  priceManwon,
  floor,
});

test("[1008·Q] parseAskingPrice — 억·만원 둘 다 알아듣고, 모르면 null", () => {
  assert.equal(parseAskingPrice("12억 5천"), 125_000);
  assert.equal(parseAskingPrice("12억5,000만원"), 125_000);
  assert.equal(parseAskingPrice("12.5억"), 125_000);
  assert.equal(parseAskingPrice("125000"), 125_000);
  assert.equal(parseAskingPrice("125,000만원"), 125_000);
  assert.equal(parseAskingPrice("12.5"), 125_000); // 1,000 미만 숫자는 억
  assert.equal(parseAskingPrice("1250000000"), 125_000); // 천만 이상은 원
  assert.equal(parseAskingPrice("9억 8000"), 98_000); // 억 뒤 끝의 단위 없는 숫자는 만원
  assert.equal(parseAskingPrice("1억2천5백만"), 12_500);
  assert.equal(parseAskingPrice("9,800만"), 9_800);
  assert.equal(parseAskingPrice("5천"), 5_000);
  assert.equal(parseAskingPrice("약 12억 정도"), 120_000);
  assert.equal(parseAskingPrice(""), null);
  assert.equal(parseAskingPrice("억"), null);
  assert.equal(parseAskingPrice("열두억"), null);
  assert.equal(parseAskingPrice("12억 abc"), null);
  assert.equal(parseAskingPrice("0"), null);
  assert.equal(parseAskingPrice("3천 5"), null); // 억 뒤가 아닌 단위 없는 숫자는 추측하지 않는다
  assert.equal(parseAskingPrice("１２억 ５천"), 125_000); // 전각 숫자
});

test("[1008·Q] 리뷰 C — 억 뒤 맨 끝 숫자는 네 자리만 만원, 1~3자리는 되묻는다", () => {
  assert.equal(parseAskingPrice("9억 8000"), 98_000);
  assert.equal(parseAskingPrice("12억 0500"), 120_500);
  for (const s of ["8억 5", "12억 5", "3억 50", "12억 500", "12억 5000.5"]) {
    assert.equal(parseAskingPrice(s), null, s); // 예전: "8억 5" → 80,005 · "12억 5" → 120,005
    assert.deepEqual(readAskingPrice(s), { ok: false, reason: "after-eok" }, s);
  }
  assert.deepEqual(readAskingPrice("  "), { ok: false, reason: "empty" });
  assert.deepEqual(readAskingPrice("열두억"), { ok: false, reason: "format" });
  assert.deepEqual(readAskingPrice("12억 5천"), { ok: true, manwon: 125_000 });
});

test("[1008·Q] 달력 — KST 연월과 창 시작", () => {
  assert.equal(kstYm(Date.UTC(2026, 8, 30, 15, 0, 0)), "202610"); // KST 10월 1일 0시
  assert.equal(kstYm(Date.UTC(2026, 8, 30, 14, 59, 0)), "202609");
  assert.equal(shiftYm("202609", -23), "202410");
});

test("[1008·Q] askingBandOptions·defaultBandSlug — 24개월 안에 거래 있는 구간만, 12개월 최다가 기본", () => {
  const trades = [
    t("202608", 84.9, 100_000),
    t("202605", 84.9, 98_000),
    t("202601", 59.9, 70_000),
    t("202512", 59.9, 69_000),
    t("202511", 59.9, 68_000),
    t("202311", 110, 150_000), // 창 밖
  ];
  const opts = askingBandOptions(trades, "202609");
  assert.deepEqual(
    opts.map((o) => [o.slug, o.count12, o.count24]),
    [
      ["under-60", 3, 3],
      ["60-85", 2, 2],
    ],
  );
  assert.equal(defaultBandSlug(opts), "under-60");
  assert.equal(defaultBandSlug([]), null);
});

test("[1008·Q] askingWindow — 12개월 3건 이상이면 12개월, 모자라면 24개월", () => {
  const many = [t("202608", 84, 1), t("202607", 84, 2), t("202606", 84, 3), t("202401", 84, 4)];
  const w = askingWindow(many, "60-85", "202609");
  assert.equal(w.months, 12);
  assert.equal(w.fromYm, "202510");
  assert.deepEqual(w.trades.map((x) => x.ym), ["202608", "202607", "202606"]);
  const few = [t("202608", 84, 1), t("202501", 84, 2), t("202411", 84, 3)];
  const w2 = askingWindow(few, "60-85", "202609");
  assert.equal(w2.months, 24);
  assert.equal(w2.trades.length, 3);
  // 다른 면적대 거래는 섞이지 않는다
  assert.equal(askingWindow([t("202608", 59, 1)], "60-85", "202609").trades.length, 0);
});

test("[1008·Q] askingPosition·askingHeadline — N건 중 M건보다 높아요 + 상위/하위", () => {
  const prices = [100, 110, 120, 130, 140, 150, 160, 170, 180, 190];
  const p = askingPosition(prices, 175)!;
  assert.equal(p.below, 8);
  assert.equal(p.above, 2);
  assert.equal(p.side, "within");
  assert.equal(p.rankLabel, "상위 20%");
  assert.equal(p.min, 100);
  assert.equal(p.max, 190);
  assert.equal(p.median, 145);
  assert.equal(askingHeadline(p, 12), "최근 12개월 이 면적대 실거래 10건 중 8건보다 높아요");

  const cheap = askingPosition(prices, 115)!;
  assert.equal(cheap.rankLabel, "하위 20%");

  const top = askingPosition(prices, 250)!;
  assert.equal(top.side, "above-all");
  assert.equal(top.rankLabel, null); // 모든 거래 밖이면 "상위 1%" 라고 하지 않는다
  assert.equal(askingHeadline(top, 24), "최근 24개월 이 면적대 실거래 10건 모두보다 높아요");
  assert.equal(askingGapLabel(top, 250), "최고 거래가보다 60만 높아요");
  const bottom = askingPosition(prices, 50)!;
  assert.equal(askingHeadline(bottom, 12), "최근 12개월 이 면적대 실거래 10건 모두보다 낮아요");
  assert.equal(askingGapLabel(bottom, 50), "최저 거래가보다 50만 낮아요");
  assert.equal(askingGapLabel(p, 175), null);

  const tie = askingPosition(prices, 140)!;
  assert.equal(tie.equal, 1);
  assert.equal(tie.rankLabel, "하위 50%");
  // 가운데에 같은 값이 몰려 양쪽 모두 절반을 넘으면 "중간쯤"
  assert.equal(askingPosition([1, 2, 5, 5, 5, 8, 9], 5)!.rankLabel, "중간쯤");
  assert.equal(askingHeadline(tie, 12), "최근 12개월 이 면적대 실거래 10건 중 4건보다 높고 1건과 같아요");
  assert.equal(askingHeadline(askingPosition(prices, 100)!, 12), "최근 12개월 이 면적대 실거래 10건 중 가장 낮은 거래와 같아요");
  assert.equal(askingHeadline(askingPosition(prices, 190)!, 12), "최근 12개월 이 면적대 실거래 10건 중 가장 높은 거래와 같아요");
  // 리뷰 C — 최저·최고와 같거나 모두 같을 때 순위 칩을 붙이지 않는다("가장 낮은 거래와 같아요" + "하위 50%" 어긋남)
  assert.equal(askingPosition(prices, 100)!.rankLabel, null);
  assert.equal(askingPosition(prices, 190)!.rankLabel, null);
  const lowTie = askingPosition([5, 5, 6, 7], 5)!;
  assert.equal(lowTie.rankLabel, null);
  assert.equal(askingHeadline(lowTie, 12), "최근 12개월 이 면적대 실거래 4건 중 가장 낮은 거래 2건과 같아요");
  const allSame = askingPosition([10, 10, 10], 10)!;
  assert.equal(allSame.rankLabel, null);
  assert.equal(askingHeadline(allSame, 12), "최근 12개월 이 면적대 실거래 3건 모두 이 호가와 같은 값이에요");
  assert.equal(askingGapLabel(allSame, 10), null);

  assert.equal(askingPosition([], 100), null);
  assert.equal(askingPosition([100], 0), null);
  assert.equal(medianOf([3, 1, 2]), 2);
  assert.equal(medianOf([1, 2, 3, 4]), 3); // (2+3)/2=2.5 → 반올림
});

test("[1008·Q] nearestTrades — 가까운 순, 같으면 최근 먼저", () => {
  const trades = [t("202601", 84, 100), t("202608", 84, 120), t("202605", 84, 80), t("202607", 84, 100)];
  assert.deepEqual(
    nearestTrades(trades, 101, 3).map((x) => `${x.ym}:${x.priceManwon}`),
    ["202607:100", "202601:100", "202608:120"],
  );
});

test("[1008·Q] 응답 튜플 — 왕복하고, 모양이 틀린 행은 버린다", () => {
  const a = t("202608", 84.99, 290_000, 35);
  assert.deepEqual(tradesFromTuples([tradeToTuple(a)]), [a]);
  assert.deepEqual(tradesFromTuples([["2026-08", 84, 1, 1], ["202608", -1, 1, 1], ["202608", 84, 0, null], "x", null]), []);
  assert.deepEqual(tradesFromTuples([["202608", 84, 100, 0]]), [t("202608", 84, 100, null)]);
  assert.deepEqual(tradesFromTuples({ nope: 1 }), []);
});

test("[1008·Q] barScale — 양끝 4% 여백, 한 값이면 가운데", () => {
  const x = barScale([100, 200]);
  assert.equal(x(100), 4);
  assert.equal(x(200), 96);
  assert.equal(barScale([5, 5])(5), 50);
});
