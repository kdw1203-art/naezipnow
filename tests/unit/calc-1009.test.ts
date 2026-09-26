import { test } from "node:test";
import assert from "node:assert/strict";
import {
  LEASE_HOUSE_BRACKETS,
  SALE_HOUSE_BRACKETS,
  bracketLine,
  brokerageFeeCap,
  leaseAmountWon,
} from "../../lib/finance/brokerage.ts";
import { manwonText, shareText, shareTexts, wonParts, wonText } from "../../lib/finance/money.ts";
import {
  ACQ_TAX_HOW,
  FIRST_HOME_CAP_CAVEAT,
  burdenLabel,
  costBreakdown,
  firstHomeCapCaveat,
  loanConclusion,
  ltvTableLines,
  monthlyPaymentOf,
  priceTierLine,
  rentalYieldConclusion,
} from "../../lib/finance/calc-summary.ts";
import { computeLoanLimit, LTV_TABLE } from "../../lib/finance/loan-rules.ts";

/* [1009 · T] 계산기 — 중개보수 법정 상한(한도액 오류 수정) · 금액 표기 · 결론 한 줄 · 돈의 구성.
 * 숫자는 규칙 확인용 가짜 입력이다(운영 데이터 아님). */

test("중개보수 — 구간 한도액이 걸린다(예전 표는 한도가 10배라 한 번도 걸리지 않았다)", () => {
  // 1억 8천만원 매매: 0.5% = 90만원 → 한도 80만원
  const a = brokerageFeeCap({ amountWon: 180_000_000, deal: "sale" });
  assert.ok(a);
  assert.equal(a.feeWon, 800_000);
  assert.equal(a.capped, true);
  assert.equal(a.rateLabel, "0.5% (한도 80만원)");
  // 4,500만원 매매: 0.6% = 27만원 → 한도 25만원
  assert.equal(brokerageFeeCap({ amountWon: 45_000_000, deal: "sale" })?.feeWon, 250_000);
  // 4,000만원 임대차: 0.5% = 20만원(한도와 같다 — 걸리지 않음)
  const l = brokerageFeeCap({ amountWon: 40_000_000, deal: "lease" });
  assert.equal(l?.feeWon, 200_000);
  assert.equal(l?.capped, false);
  // 9,000만원 임대차: 0.4% = 36만원 → 한도 30만원
  assert.equal(brokerageFeeCap({ amountWon: 90_000_000, deal: "lease" })?.feeWon, 300_000);
});

test("중개보수 — 한도 없는 구간·경계(이상/미만)·오피스텔·주택 외", () => {
  assert.equal(brokerageFeeCap({ amountWon: 840_000_000, deal: "sale" })?.feeWon, 3_360_000); // 0.4%
  assert.equal(brokerageFeeCap({ amountWon: 900_000_000, deal: "sale" })?.rate, 0.005); // 9억 이상 0.5%
  assert.equal(brokerageFeeCap({ amountWon: 899_999_999, deal: "sale" })?.rate, 0.004);
  assert.equal(brokerageFeeCap({ amountWon: 1_500_000_000, deal: "sale" })?.rate, 0.007);
  assert.equal(brokerageFeeCap({ amountWon: 600_000_000, deal: "lease" })?.rate, 0.004);
  assert.equal(brokerageFeeCap({ amountWon: 500_000_000, deal: "sale", property: "officetel" })?.feeWon, 2_500_000);
  assert.equal(brokerageFeeCap({ amountWon: 500_000_000, deal: "lease", property: "officetel" })?.rate, 0.004);
  assert.equal(brokerageFeeCap({ amountWon: 100_000_000, deal: "sale", property: "other" })?.rateLabel, "0.9% 이내 협의");
  assert.equal(brokerageFeeCap({ amountWon: 0, deal: "sale" }), null);
  assert.equal(brokerageFeeCap({ amountWon: Number.NaN, deal: "sale" }), null);
});

test("임대차 거래금액 — 보증금 + 월세×100, 5천만원 미만이면 ×70", () => {
  assert.deepEqual(leaseAmountWon(300_000_000, 0), { amountWon: 300_000_000, note: "거래금액 = 보증금 + 월세×100" });
  assert.equal(leaseAmountWon(10_000_000, 300_000).amountWon, 10_000_000 + 300_000 * 70); // 1천 + 30만×100 = 4천만 < 5천만
  assert.equal(leaseAmountWon(20_000_000, 500_000).amountWon, 20_000_000 + 500_000 * 100); // 7천만 ≥ 5천만
});

test("요율표 한 줄 — 표에서 만든다(ⓘ 설명이 표와 같은 말)", () => {
  assert.equal(
    bracketLine(SALE_HOUSE_BRACKETS),
    "5천만원 미만 0.6%(한도 25만원) · 2억 미만 0.5%(한도 80만원) · 9억 미만 0.4% · 12억 미만 0.5% · 15억 미만 0.6% · 15억 이상 0.7%",
  );
  assert.equal(
    bracketLine(LEASE_HOUSE_BRACKETS),
    "5천만원 미만 0.5%(한도 20만원) · 1억 미만 0.4%(한도 30만원) · 6억 미만 0.3% · 12억 미만 0.4% · 15억 미만 0.5% · 15억 이상 0.6%",
  );
  assert.equal((brokerageFeeCap({ amountWon: 84_000 * 10_000, deal: "sale" })?.feeWon ?? 0) / 10_000, 336);
});

test("금액 표기 — 사이트 표준(eok-man) + 0·음수 · 원 단위", () => {
  assert.equal(manwonText(124_500), "12억 4,500만원");
  assert.equal(manwonText(120_000), "12억원");
  assert.equal(manwonText(9_800), "9,800만원");
  assert.equal(manwonText(124_500, "만"), "12억 4,500만");
  assert.equal(manwonText(0), "0원");
  assert.equal(manwonText(0.4), "0원");
  assert.equal(manwonText(-2_400), "−2,400만원");
  assert.equal(manwonText(Number.NaN), "—");
  assert.equal(wonText(1_833_333), "183만 3,333원");
  assert.equal(wonText(3_360_000), "336만원");
  assert.equal(wonText(250_000), "25만원");
  assert.equal(wonText(9_800), "9,800원");
  assert.equal(wonText(123_456_789), "1억 2,345만 6,789원");
  assert.equal(wonText(0), "0원");
  assert.equal(wonText(-5_000), "−5,000원");
  assert.deepEqual(wonParts(123_456_789), { eok: 1, man: 2345, rest: 6789 });
  assert.equal(shareText(0.3843), "38%");
  assert.equal(shareText(0.0039), "0.4%");
  assert.equal(shareText(0), "0%");
});

test("결론 한 줄 — 실제 한도 계산에서 만든다(LTV · 가격 구간 한도 · 대출 불가)", () => {
  const seoul = loanConclusion({
    limit: computeLoanLimit({ priceManwon: 84_000, region: "regulated", ownership: "무주택" }),
    region: "regulated",
    ownership: "무주택",
  });
  assert.equal(seoul.sentence, "이 집은 최대 3억\u00a03,600만원까지 대출받을 수 있어요");
  assert.equal(seoul.basis, "규제지역 · 무주택 LTV 40% 기준");

  const cap = loanConclusion({
    limit: computeLoanLimit({ priceManwon: 200_000, region: "regulated", ownership: "생애최초" }),
    region: "regulated",
    ownership: "생애최초",
  });
  assert.equal(cap.sentence, "이 집은 최대 4억원까지 대출받을 수 있어요");
  assert.equal(cap.basis, "규제지역 · 15억 초과~25억 이하 주택 한도 4억원 기준(LTV 70%면 14억원)");

  const none = loanConclusion({
    limit: computeLoanLimit({ priceManwon: 84_000, region: "capital", ownership: "다주택" }),
    region: "capital",
    ownership: "다주택",
  });
  assert.equal(none.sentence, "이 조건에선 집을 사는 주택담보대출을 받을 수 없어요");
  assert.match(none.basis, /LTV 0%/);
});

test("돈의 구성 — 대출 + 내 돈 + 취득세 + 중개보수 = 합계, 필요 현금 = 합계 − 대출", () => {
  const b = costBreakdown({ priceManwon: 84_000, loanManwon: 33_600, acqTaxManwon: 2_402, brokerManwon: 336 });
  assert.ok(b);
  assert.equal(b.totalManwon, 84_000 + 2_402 + 336);
  assert.equal(b.cashManwon, 84_000 - 33_600 + 2_402 + 336);
  const sum = b.segments.reduce((n, s) => n + s.manwon, 0);
  assert.equal(sum, b.totalManwon);
  const ratio = b.segments.reduce((n, s) => n + s.ratio, 0);
  assert.ok(Math.abs(ratio - 1) < 1e-9);
  assert.deepEqual(
    b.segments.map((s) => s.key),
    ["loan", "equity", "tax", "broker"],
  );
  // 대출이 매매가보다 크게 들어와도 매매가로 자른다
  assert.equal(costBreakdown({ priceManwon: 10_000, loanManwon: 20_000, acqTaxManwon: 0, brokerManwon: 0 })?.segments[1].manwon, 0);
  assert.equal(costBreakdown({ priceManwon: 0, loanManwon: 0, acqTaxManwon: 0, brokerManwon: 0 }), null);
});

test("부담률 구분 · 월 상환액(원리금균등) · 설명 문장이 표와 같다", () => {
  assert.equal(burdenLabel(30), "적정");
  assert.equal(burdenLabel(31), "주의");
  assert.equal(burdenLabel(40), "주의");
  assert.equal(burdenLabel(41), "위험");
  assert.equal(burdenLabel(null), null);
  // 3억 3,600만원 · 4% · 30년 → 약 160.4만원
  assert.equal(Math.round(monthlyPaymentOf(33_600, 4, 30) * 10) / 10, 160.4);
  assert.equal(monthlyPaymentOf(0, 4, 30), 0);
  assert.equal(monthlyPaymentOf(12_000, 0, 10), 100);
  const lines = ltvTableLines();
  assert.equal(lines.length, 3);
  assert.equal(lines[0], `규제지역: 생애최초 ${LTV_TABLE.regulated.생애최초}% · 무주택 ${LTV_TABLE.regulated.무주택}% · 1주택 처분조건 ${LTV_TABLE.regulated["1주택 처분조건"]}% · 다주택 ${LTV_TABLE.regulated.다주택}%`);
  assert.match(priceTierLine(), /15억 이하 → 6억 · 15억 초과~25억 이하 → 4억 · 25억 초과 → 2억/);
  assert.ok(ACQ_TAX_HOW.some((l) => l.includes("8.4%")));
});

/* ── [1009 · T 리뷰] ─────────────────────────────────────────────────────── */

test("수도권 밖 생애최초 — LTV 금액이 6억원을 넘으면 확정처럼 말하지 않고 '은행 확인' 조건을 붙인다", () => {
  const conclude = (priceManwon: number, region: "other" | "regulated" | "capital") =>
    loanConclusion({
      limit: computeLoanLimit({ priceManwon, region, ownership: "생애최초" }),
      region,
      ownership: "생애최초",
    });
  // 15억 · 그 외 지역 · 80% = 12억 → 조건
  const big = conclude(150_000, "other");
  assert.equal(big.caveat, FIRST_HOME_CAP_CAVEAT);
  assert.equal(big.caveat, "생애최초 금액 한도(도입 당시 6억원)는 은행 확인");
  assert.equal(big.sentence, "LTV 80%로는 최대 12억원까지예요 — 금액 한도가 남아 있다면 6억원까지예요");
  assert.doesNotMatch(big.sentence, /대출받을 수 있어요/);
  // 40억 → 32억도 같은 조건
  assert.equal(conclude(400_000, "other").caveat, FIRST_HOME_CAP_CAVEAT);
  // 7억 · 80% = 5억 6,000만 — 6억 안이라 조건 없음(도입 당시 한도가 살아 있어도 같은 금액)
  const small = conclude(70_000, "other");
  assert.equal(small.caveat, null);
  assert.equal(small.sentence, "이 집은 최대 5억\u00a06,000만원까지 대출받을 수 있어요");
  // 7억 5,000만 · 80% = 6억 정확히 — 넘지 않으니 조건 없음
  assert.equal(conclude(75_000, "other").caveat, null);
  // 수도권·규제지역 생애최초는 가격 구간 한도가 이미 건다 — 조건 없음
  assert.equal(conclude(100_000, "regulated").caveat, null);
  assert.equal(conclude(100_000, "capital").caveat, null);
  // 생애최초가 아니면 붙지 않는다
  assert.equal(
    firstHomeCapCaveat({
      limit: computeLoanLimit({ priceManwon: 150_000, region: "other", ownership: "무주택" }),
      region: "other",
      ownership: "무주택",
    }),
    null,
  );
});

test("임대수익률 결론 — 대출 이자가 월세보다 많으면 '손해'라고 말한다(음수 수익률을 '버는 셈'이라 하지 않는다)", () => {
  // 매매 8.4억 · 보증금 5천 · 월세 100만 · 대출 6억 · 4% → 연 이자 2,400만 > 연 월세 1,200만
  const loss = rentalYieldConclusion({
    annualRentManwon: 100 * 12,
    annualInterestManwon: 60_000 * 0.04,
    investNoLoanManwon: 84_000 - 5_000,
    equityManwon: 84_000 - 5_000 - 60_000,
    hasLoan: true,
  });
  assert.equal(loss, "대출 이자가 월세보다 연 1,200만원 많아 내 돈 1억\u00a09,000만원 기준 연 6.32% 손해예요");
  assert.doesNotMatch(loss ?? "", /-|버는/);
  // 월세 200만이면 이익 — 예전 문장 그대로
  assert.equal(
    rentalYieldConclusion({
      annualRentManwon: 2_400 + 1_200,
      annualInterestManwon: 2_400,
      investNoLoanManwon: 79_000,
      equityManwon: 19_000,
      hasLoan: true,
    }),
    "대출 이자를 빼면 내 돈 1억\u00a09,000만원으로 연 6.32%를 버는 셈이에요",
  );
  // 같으면 남는 게 없다
  assert.match(
    rentalYieldConclusion({ annualRentManwon: 2_400, annualInterestManwon: 2_400, investNoLoanManwon: 79_000, equityManwon: 19_000, hasLoan: true }) ?? "",
    /남는 게 거의 없어요/,
  );
  // 대출 없음 — 단순 수익률
  assert.equal(
    rentalYieldConclusion({ annualRentManwon: 2_400, annualInterestManwon: 0, investNoLoanManwon: 79_000, equityManwon: 79_000, hasLoan: false }),
    "연 임대수익 2,400만원은 실투자금 7억\u00a09,000만원의 3.04%예요",
  );
  // 계산이 안 되면 문장 없음
  assert.equal(
    rentalYieldConclusion({ annualRentManwon: 0, annualInterestManwon: 0, investNoLoanManwon: 79_000, equityManwon: 79_000, hasLoan: false }),
    null,
  );
  assert.equal(
    rentalYieldConclusion({ annualRentManwon: 1_200, annualInterestManwon: 100, investNoLoanManwon: 79_000, equityManwon: 0, hasLoan: true }),
    null,
  );
});

test("구성 막대 비율 — 합이 정확히 100%(최대 잔여법), 1% 미만 칸이 있으면 모두 소수 한 자리", () => {
  const sum = (xs: string[]) => Math.round(xs.reduce((a, t) => a + parseFloat(t), 0) * 10) / 10;
  // 리뷰 사례: 1억 · 생애최초 · 그 외 지역 → 대출 7,000 · 내 돈 3,000 · 세금·보수 50 — 예전엔 70% + 30% + 0.5% = 100.5%
  const a = shareTexts([7_000, 3_000, 50]);
  assert.deepEqual(a, ["69.7%", "29.8%", "0.5%"]);
  assert.equal(sum(a), 100);
  // 칸마다 따로 반올림하던 예전 방식은 합이 100 이 아니었다
  assert.equal([7_000, 3_000, 50].map((v) => parseFloat(shareText(v / 10_050))).reduce((x, y) => x + y, 0), 100.5);
  // 8.4억 서울 무주택 — 정수
  const b = shareTexts([33_600, 50_400, 1_265]);
  assert.equal(sum(b), 100);
  assert.ok(b.every((t) => /^\d+%$/.test(t)));
  // 셋이 같으면 합 100(33 + 33 + 34 꼴), 값이 있는 칸은 0 으로 사라지지 않는다
  assert.equal(sum(shareTexts([1, 1, 1])), 100);
  assert.deepEqual(shareTexts([100_000, 1, 1]), ["99.8%", "0.1%", "0.1%"]);
  // 0 인 칸은 0%, 전부 0 이면 모두 0%
  assert.deepEqual(shareTexts([60, 40, 0]), ["60%", "40%", "0%"]);
  assert.deepEqual(shareTexts([0, 0]), ["0%", "0%"]);
});
