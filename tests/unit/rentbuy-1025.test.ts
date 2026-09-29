import { test } from "node:test";
import assert from "node:assert/strict";
import {
  amortizationInterest,
  appreciation,
  breakEvenGrowth,
  cheapestOf,
  compareRentVsBuy,
  opportunityCost,
  type RentVsBuyInput,
} from "../../lib/calc/rent-vs-buy.ts";
import { monthlyPaymentOf } from "../../lib/finance/calc-summary.ts";
import { acquisitionTaxOf } from "../../lib/finance/loan-rules.ts";
import { brokerageFeeCap } from "../../lib/finance/brokerage.ts";

/* [1025 · 담당 S] 살까·빌릴까 — 숫자는 규칙 확인용 가짜 입력(운영 데이터 아님). */

const BASE: RentVsBuyInput = {
  price: 55_000,
  jeonse: 30_750,
  deposit: 5_000,
  monthly: 120,
  loanRatio: 40,
  rate: 4,
  years: 5,
  growth: 0,
};

test("원리금균등 이자분 — 월별 잔액에 금리를 곱해 더한 값과 같다(1억 · 4% · 30년 · 5년)", () => {
  const L = 10_000;
  const rate = 4;
  const term = 30;
  const hold = 5;
  const r = rate / 100 / 12;
  const pay = monthlyPaymentOf(L, rate, term);
  let bal = L;
  let interest = 0;
  for (let m = 0; m < hold * 12; m++) {
    const i = bal * r;
    interest += i;
    bal -= pay - i;
  }
  const got = amortizationInterest(L, rate, term, hold);
  assert.ok(Math.abs(got - interest) < 0.01, `${got} vs ${interest}`);
  // 만기까지 들면 총 이자 = 월 상환액 × n − 원금
  const full = amortizationInterest(L, rate, term, term);
  assert.ok(Math.abs(full - (pay * term * 12 - L)) < 0.01);
  // 0% · 0 대출 · 0 년은 0
  assert.equal(amortizationInterest(L, 0, term, hold), 0);
  assert.equal(amortizationInterest(0, rate, term, hold), 0);
  assert.equal(amortizationInterest(L, rate, term, 0), 0);
});

test("세 합계 — 항목별 합이 정의대로 맞는다", () => {
  const r = compareRentVsBuy(BASE);
  const loan = 55_000 * 0.4;
  const equity = 55_000 - loan;
  const buyExpected =
    amortizationInterest(loan, 4, 30, 5) +
    acquisitionTaxOf(55_000, "무주택") +
    (brokerageFeeCap({ amountWon: 550_000_000, deal: "sale" })?.feeWon ?? 0) / 10_000 +
    opportunityCost(equity, 4, 5) -
    appreciation(55_000, 0, 5);
  assert.ok(r.buy.total !== null);
  assert.ok(Math.abs(r.buy.total - buyExpected) < 1e-6);
  // 상승률 0% 면 상승분 0 · 취득세 6억 이하 1.1% = 605만
  assert.equal(r.buy.parts.find((p) => p.key === "gain")?.manwon, -0);
  assert.equal(Math.round(r.buy.parts.find((p) => p.key === "tax")?.manwon ?? 0), 605);

  const jeonseExpected =
    opportunityCost(30_750, 4, 5) + (brokerageFeeCap({ amountWon: 307_500_000, deal: "lease" })?.feeWon ?? 0) / 10_000;
  assert.ok(r.jeonse.total !== null);
  assert.ok(Math.abs(r.jeonse.total - jeonseExpected) < 1e-6);

  const monthlyExpected =
    120 * 60 + opportunityCost(5_000, 4, 5) + (brokerageFeeCap({ amountWon: 50_000_000 + 1_200_000 * 100, deal: "lease" })?.feeWon ?? 0) / 10_000;
  assert.ok(r.monthly.total !== null);
  assert.ok(Math.abs(r.monthly.total - monthlyExpected) < 1e-6);

  // 가장 적게 드는 쪽은 세 합계 중 최솟값
  const totals = { buy: r.buy.total, jeonse: r.jeonse.total, monthly: r.monthly.total };
  const min = Math.min(...Object.values(totals));
  assert.equal(totals[r.cheapest!], min);
  // 가정 목록은 비어 있지 않고 입력 금리를 쓴다고 적는다
  assert.ok(r.assumptions.length >= 6);
  assert.ok(r.assumptions.some((a) => a.includes("입력 금리")));
});

test("전세대출 — 금액을 넣으면 이자가 붙고 보증금 기회비용은 자기 돈 부분만", () => {
  const r = compareRentVsBuy({ ...BASE, jeonseLoan: 10_000, jeonseLoanRate: 3 });
  const own = 30_750 - 10_000;
  assert.ok(Math.abs((r.jeonse.parts.find((p) => p.key === "opp")?.manwon ?? 0) - opportunityCost(own, 4, 5)) < 1e-9);
  assert.ok(Math.abs((r.jeonse.parts.find((p) => p.key === "jloan")?.manwon ?? 0) - opportunityCost(10_000, 3, 5)) < 1e-9);
  // 전세대출 금리를 안 넣으면 입력 금리
  const r2 = compareRentVsBuy({ ...BASE, jeonseLoan: 10_000 });
  assert.ok(Math.abs((r2.jeonse.parts.find((p) => p.key === "jloan")?.manwon ?? 0) - opportunityCost(10_000, 4, 5)) < 1e-9);
});

test("손익분기 상승률 — 매매 총비용은 상승률에 단조 감소, 손익분기에서 상대와 같다", () => {
  const r = compareRentVsBuy(BASE);
  const buys = r.sensitivity.map((s) => s.buy);
  for (let i = 1; i < buys.length; i++) {
    assert.ok(buys[i]! < buys[i - 1]!, `상승률 ${r.sensitivity[i].growthPct}% 매매 총비용이 더 작아야 한다`);
  }
  assert.equal(r.breakEvenAgainst, "jeonse");
  assert.equal(r.breakEven.kind, "in");
  if (r.breakEven.kind === "in") {
    const at = compareRentVsBuy({ ...BASE, growth: r.breakEven.pct });
    assert.ok(Math.abs(at.buy.total! - at.jeonse.total!) < 55_000 * 0.001 * 5 + 50, "손익분기에서 두 합계가 가깝다(0.1%p 반올림)");
    // 그보다 낮으면 전세, 높으면 매매
    assert.equal(compareRentVsBuy({ ...BASE, growth: r.breakEven.pct - 1 }).cheapest, "jeonse");
    assert.equal(compareRentVsBuy({ ...BASE, growth: r.breakEven.pct + 1 }).cheapest, "buy");
  }
  // 상대가 20% 상승분(약 8.2억)보다도 싸면 20% 안에 손익분기 없음, 아주 비싸면 0% 아래
  assert.equal(breakEvenGrowth(BASE, -100_000).kind, "above");
  assert.equal(breakEvenGrowth(BASE, 10_000_000).kind, "below");
  // 매매를 계산할 수 없으면 none
  assert.equal(breakEvenGrowth({ ...BASE, rate: null }, 1000).kind, "none");
});

test("없는 입력 — 그 항목만 null, 합계 null, 이유(missing) 에 이름이 남는다 · 기본값을 지어내지 않는다", () => {
  const r = compareRentVsBuy({ ...BASE, rate: null, loanRatio: null, monthly: null, deposit: null });
  assert.equal(r.buy.total, null);
  assert.deepEqual(r.buy.missing, ["대출 비율", "금리"]);
  // 금리 없이도 취득세·중개보수는 매매가만으로 계산한다
  assert.equal(Math.round(r.buy.parts.find((p) => p.key === "tax")?.manwon ?? 0), 605);
  assert.ok((r.buy.parts.find((p) => p.key === "broker")?.manwon ?? 0) > 0);
  assert.equal(r.buy.parts.find((p) => p.key === "interest")?.manwon, null);
  assert.equal(r.buy.parts.find((p) => p.key === "opp")?.manwon, null);
  assert.equal(r.jeonse.total, null);
  assert.deepEqual(r.jeonse.missing, ["금리"]);
  assert.equal(r.monthly.total, null);
  assert.deepEqual(r.monthly.missing, ["월세", "월세 보증금"]);
  assert.equal(r.cheapest, null);
  assert.equal(r.breakEven.kind, "none");
  assert.equal(r.breakEvenAgainst, null);
  assert.ok(r.sensitivity.every((s) => s.buy === null && s.cheapest === null));

  // 매매가만 없으면 전세·월세는 계산되고 가장 적게 드는 쪽도 둘 사이에서 정해진다
  const r2 = compareRentVsBuy({ ...BASE, price: null });
  assert.equal(r2.buy.total, null);
  assert.ok(r2.jeonse.total !== null && r2.monthly.total !== null);
  assert.ok(r2.cheapest === "jeonse" || r2.cheapest === "monthly");
  // 월세 보증금 0 은 없는 값이 아니다 — 기회비용 0 · 금리 없어도 월세 합계가 선다
  const r3 = compareRentVsBuy({ ...BASE, rate: null, deposit: 0 });
  assert.equal(r3.monthly.total, 120 * 60 + (r3.monthly.parts.find((p) => p.key === "broker")?.manwon ?? 0));
  // 합계가 하나뿐이면 cheapest 는 null
  assert.equal(cheapestOf({ buy: null, jeonse: 100, monthly: null }), null);
});

/* [1025b] 화면의 기본값 두 개는 lib 가 그대로 받는다 — 대출 비율 빈칸 = 0(대출 없음 · 이자 0 · 기회비용은 매매가 전액),
   월세 보증금 빈칸(월세 있음) = 0(기회비용 0). 숫자를 지어내지 않고 조건만 바꾼 것이라 합계가 선다. */
test("[1025b] 대출 0% · 월세 보증금 0 — 합계가 서고 이자·보증금 기회비용은 0", () => {
  const r = compareRentVsBuy({ ...BASE, loanRatio: 0, deposit: 0 });
  assert.ok(r.buy.total !== null);
  assert.equal(r.buy.parts.find((p) => p.key === "interest")?.manwon, 0);
  assert.ok(Math.abs((r.buy.parts.find((p) => p.key === "opp")?.manwon ?? 0) - opportunityCost(55_000, 4, 5)) < 1e-9);
  assert.equal(r.buy.missing.length, 0);
  assert.ok(r.monthly.total !== null);
  assert.equal(r.monthly.parts.find((p) => p.key === "opp")?.manwon, 0);
  assert.equal(r.monthly.missing.length, 0);
  assert.ok(r.cheapest !== null);
});

/* [1025c] 대표 그림 좌표(lib/calc/rent-vs-buy-chart) — 누적 막대 조각 합 = 총비용 · 곡선은 상승률에 단조 감소 ·
   교차점은 범위 안 · 슬라이더가 움직이면(상승률·보유 기간) 좌표도 같이 바뀐다. */
import {
  BE_CHART_RANGE,
  BE_CURVE_POINTS,
  layoutBreakEven,
  layoutStackedBars,
  niceStep,
  stackValuesOf,
  tickLabel,
} from "../../lib/calc/rent-vs-buy-chart.ts";
import { buyTotalAt } from "../../lib/calc/rent-vs-buy.ts";

test("[1025c] 누적 막대 — 조각 값의 합이 총비용과 같고, 그린 조각 높이는 값에 비례한다", () => {
  const r = compareRentVsBuy(BASE);
  for (const opt of [r.buy, r.jeonse, r.monthly]) {
    const vals = stackValuesOf(opt);
    assert.equal(vals.length, 5);
    const sum = vals.reduce((a, s) => a + (s.manwon ?? 0), 0);
    assert.ok(Math.abs(sum - (opt.total as number)) < 1e-6, `${opt.key} 조각 합 ${sum} vs 총비용 ${opt.total}`);
  }
  const lay = layoutStackedBars(r);
  assert.equal(lay.bars.length, 3);
  assert.equal(lay.width, 320);
  for (const b of lay.bars) {
    assert.ok(b.total !== null);
    // 양수 조각(덮개 제외) 높이 합 = (기준선 − 꼭대기)
    const drawn = b.segments.filter((s) => s.kind !== "offset").reduce((a, s) => a + s.h, 0);
    assert.ok(Math.abs(drawn - (lay.baseY - b.grossY)) < 0.5, `${b.key} 조각 높이 합`);
    // 상승률 0% 면 덮개 없음 · 순합계 = 꼭대기
    assert.equal(b.netY, b.grossY);
    for (const s of b.segments) {
      assert.ok(s.h > 0 && s.manwon > 0, "0 인 조각은 그리지 않는다");
      assert.ok(s.y >= lay.top - 0.5 && s.y + s.h <= lay.baseY + 0.5, "조각은 그림 안");
    }
  }
  // 가장 적게 드는 쪽만 best
  assert.deepEqual(lay.bars.filter((b) => b.best).map((b) => b.key), [r.cheapest]);
  // 범례 — 0 인 조각도 적힌다(이자 0 · 상승분 0), 월세가 있으니 "월세 합" 도
  const legend = Object.fromEntries(lay.legend.map((l) => [l.key, l.manwon]));
  assert.equal(legend.gain, 0);
  assert.ok("rent" in legend);
  assert.ok(legend.opp > 0);
});

test("[1025c] 누적 막대 — 상승분은 덮개(offset)로 깎이고 순합계 선이 따로 선다 · 하락이면 비용으로 쌓인다 · 없는 쪽은 윤곽", () => {
  const up = layoutStackedBars(compareRentVsBuy({ ...BASE, growth: 3 }));
  const buy = up.bars.find((b) => b.key === "buy")!;
  const cover = buy.segments.find((s) => s.kind === "offset");
  assert.ok(cover, "상승률 3% 면 덮개 조각이 있다");
  assert.ok(buy.netY > buy.grossY, "순합계 선은 꼭대기보다 아래");
  assert.ok(Math.abs(cover!.h - (buy.netY - buy.grossY)) < 0.5);
  // 그린 양수 조각 + 덮개 = 상승분 뺀 순합계와 맞물린다(비례식)
  const scale = (up.baseY - buy.grossY) / buy.segments.filter((s) => s.kind !== "offset").reduce((a, s) => a + s.manwon, 0);
  assert.ok(Math.abs(cover!.h - scale * Math.abs(cover!.manwon)) < 0.5);

  const down = layoutStackedBars(compareRentVsBuy({ ...BASE, growth: -2 }));
  const buyDown = down.bars.find((b) => b.key === "buy")!;
  const loss = buyDown.segments.find((s) => s.key === "gain");
  assert.ok(loss && loss.kind === "fill" && loss.manwon > 0, "하락이면 손실이 비용 조각");
  assert.equal(buyDown.netY, buyDown.grossY);

  // 월세 없음 → 세 번째 기둥은 윤곽(total null · 조각 없음) · 범례에 월세 합 없음
  const two = layoutStackedBars(compareRentVsBuy({ ...BASE, monthly: null, deposit: null }));
  const m = two.bars.find((b) => b.key === "monthly")!;
  assert.equal(m.total, null);
  assert.equal(m.segments.length, 0);
  assert.ok(!two.legend.some((l) => l.key === "rent"));
  // 전부 없음(빈 상태 견본) 도 그려진다
  const empty = layoutStackedBars(compareRentVsBuy({ price: null, jeonse: null, deposit: null, monthly: null, loanRatio: null, rate: null, years: 5, growth: 0 }));
  assert.ok(empty.bars.every((b) => b.total === null));
});

test("[1025c] 손익분기 선 — 곡선 17점은 상승률에 단조 감소, 교차점은 0~8% 안이고 lib 의 손익분기와 같다", () => {
  const r = compareRentVsBuy(BASE);
  const lay = layoutBreakEven(BASE, r, 0);
  assert.ok(lay);
  assert.equal(lay!.curve.length, BE_CURVE_POINTS);
  assert.equal(lay!.curve[0].g, BE_CHART_RANGE[0]);
  assert.equal(lay!.curve[lay!.curve.length - 1].g, BE_CHART_RANGE[1]);
  for (let i = 1; i < lay!.curve.length; i++) {
    assert.ok(lay!.curve[i].total < lay!.curve[i - 1].total, "총비용은 상승률에 단조 감소");
    assert.ok(lay!.curve[i].y > lay!.curve[i - 1].y, "y 는 아래로(값이 작을수록 아래)");
    assert.ok(lay!.curve[i].x > lay!.curve[i - 1].x);
  }
  // 곡선 값은 순수 함수 그대로
  for (const p of lay!.curve) assert.ok(Math.abs(p.total - (buyTotalAt(BASE, p.g) as number)) < 1e-6);
  // 수평선 = 전세 총비용
  assert.equal(lay!.rentLine?.key, "jeonse");
  assert.equal(lay!.rentLine?.total, r.jeonse.total);
  // 교차점 — 범위 안 · lib 손익분기(0~20 이분법)와 같은 값 · 수평선 위
  assert.ok(lay!.cross, "손익분기가 0~8% 안에 있다");
  assert.ok(r.breakEven.kind === "in");
  if (r.breakEven.kind === "in") assert.ok(Math.abs(lay!.cross!.g - r.breakEven.pct) <= 0.1);
  assert.equal(lay!.cross!.y, lay!.rentLine!.y);
  assert.ok(lay!.cross!.x >= lay!.plot.l && lay!.cross!.x <= lay!.plot.r);
  // 모든 점과 수평선은 그림 안
  for (const p of lay!.curve) assert.ok(p.y >= lay!.plot.t - 0.5 && p.y <= lay!.plot.b + 0.5);
  assert.ok(lay!.rentLine!.y >= lay!.plot.t && lay!.rentLine!.y <= lay!.plot.b);
  // 지금 상승률 표식 — 범위 안이면 있고, −1% 면 없다
  assert.deepEqual(lay!.now, { g: 0, x: lay!.plot.l });
  assert.equal(layoutBreakEven(BASE, r, -1)!.now, null);
  assert.equal(layoutBreakEven(BASE, r, 8)!.now?.x, lay!.plot.r);
  // y 눈금은 오름차순 · 0 이 포함되면 "0"
  const ys = lay!.yTicks.map((t) => t.v);
  for (let i = 1; i < ys.length; i++) assert.ok(ys[i] > ys[i - 1]);
  assert.ok(lay!.yTicks.every((t) => t.y >= lay!.plot.t && t.y <= lay!.plot.b));
});

test("[1025c] 손익분기 선 — 상대가 아주 싸면 교차점 없음 · 매매를 계산할 수 없으면 null · 보유 기간이 바뀌면 곡선도 바뀐다", () => {
  /* 전세가 아주 비싸면 0% 에서 이미 매매가 싸다 — 교차점 없음(lib 는 "below") · 수평선이 곡선 전체보다 위 */
  const dearInput = { ...BASE, jeonse: 300_000 };
  const dearRent = compareRentVsBuy(dearInput);
  const lay = layoutBreakEven(dearInput, dearRent, 0);
  assert.ok(lay && lay.cross === null, "0% 에서 이미 매매가 싸면 교차점 없음");
  assert.equal(dearRent.breakEven.kind, "below");
  assert.ok(lay!.curve.every((p) => p.y > lay!.rentLine!.y));
  assert.equal(layoutBreakEven({ ...BASE, rate: null }, compareRentVsBuy({ ...BASE, rate: null }), 0), null);
  const noRent = compareRentVsBuy({ ...BASE, jeonse: null, monthly: null, deposit: null });
  assert.equal(layoutBreakEven({ ...BASE, jeonse: null, monthly: null, deposit: null }, noRent, 0), null);
  const y10 = layoutBreakEven({ ...BASE, years: 10 }, compareRentVsBuy({ ...BASE, years: 10 }), 0)!;
  const y5 = layoutBreakEven(BASE, compareRentVsBuy(BASE), 0)!;
  assert.notEqual(y10.curve[8].total, y5.curve[8].total);
  // 눈금 간격은 1·2·5 계열 · 글자는 억/천/만
  assert.equal(niceStep(28_000), 5_000);
  assert.equal(niceStep(9_000), 2_000);
  assert.equal(tickLabel(12_000), "1.2억");
  assert.equal(tickLabel(-6_000), "−6천");
  assert.equal(tickLabel(0), "0");
  assert.equal(tickLabel(500), "500만");
});
