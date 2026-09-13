import { test } from "node:test";
import assert from "node:assert/strict";
import {
  EXPERT_CERT_FEES,
  feePct,
  MARKETPLACE_FEES,
  REPORT_SELLER_FEE_RATE,
  VERIFIED_EXPERT_FEE_RATE,
} from "../../lib/billing/marketplace-fees";
import { getPlan, PLAN_DEFINITIONS } from "../../lib/subscriptions/plans";
import { planLabel } from "../../lib/subscriptions/labels";

/* [970 · A-08 · A-09 · C-15] 구독·수수료 표기의 단일 출처 — 브라우저 없이 검증 가능한 사실.
   lib/creator/sales.ts(정산 계산)는 server-only 라 여기서 못 불러온다 — 그 파일은
   SETTLEMENT.platformFeeRate = REPORT_SELLER_FEE_RATE 로 파생하도록 바꿨고 tsc 가 본다. */

test("feePct — 소수 요율을 정수 퍼센트 표기로", () => {
  assert.equal(feePct(0.07), "7%");
  assert.equal(feePct(0.1), "10%");
  // [971] 확정 요율 — 화면 표기가 모두 이 값에서 파생된다
  assert.equal(REPORT_SELLER_FEE_RATE, 0.1);
  assert.equal(feePct(0.06), "6%");
  assert.equal(feePct(0.1), "10%");
  assert.equal(feePct(0.029), "3%", "반올림");
});

test("리포트 판매 수수료 — /legal/fees 표·전문가 인증 표가 같은 상수를 본다", () => {
  const report = MARKETPLACE_FEES.find((r) => r.id === "report_seller");
  assert.ok(report);
  assert.equal(report.ours, feePct(REPORT_SELLER_FEE_RATE));
  const cert = EXPERT_CERT_FEES.find((f) => f.label === "전자책·리포트 판매 수수료");
  assert.ok(cert);
  assert.equal(cert.rate, feePct(REPORT_SELLER_FEE_RATE));
  assert.equal(EXPERT_CERT_FEES.find((f) => f.label === "인증 전문가 매칭 수수료")?.rate, feePct(VERIFIED_EXPERT_FEE_RATE));
});

/* [992] 고지 표에는 코드가 실제로 정산하는 요율만 남는다 — 청구하지 않는 수수료가 되살아나면 실패 */
test("수수료 표 — 청구하지 않는 행(구매자 수수료·상담 8%·현장 동행 등)이 없다 [992]", () => {
  assert.deepEqual(
    MARKETPLACE_FEES.map((r) => r.id),
    ["report_seller"],
  );
  for (const f of EXPERT_CERT_FEES) {
    assert.ok(!/재심사|모임 참가비|광고형|상담 매칭 수수료/.test(f.label), f.label);
  }
});

test("수수료 표 — 구 브랜드 필드(nuguzip)가 없고 ours 만 있다 [A-10]", () => {
  for (const row of MARKETPLACE_FEES) {
    assert.equal(typeof row.ours, "string");
    assert.ok(!("nuguzip" in row), row.id);
  }
});

test("[992] 플랜 카드 기능 목록 — 보관된 영역(전문가·리포트 판매)의 혜택을 적지 않는다", () => {
  for (const p of PLAN_DEFINITIONS) {
    for (const f of p.features) {
      assert.ok(!/리포트 판매|전문가 1:1|전문가 등록/.test(f.label), `${p.tier}: ${f.label}`);
    }
  }
  /* AI 분석 도구(ai_analysis) 한도가 표에 있고 무료는 누적이다 */
  assert.equal(getPlan("basic").features.find((f) => f.label === "AI 분석 도구")?.note, "누적 3회");
  assert.equal(getPlan("pro").features.find((f) => f.label === "AI 분석 도구")?.note, "월 50회");
});

test("플랜 카드 '모든 혜택 포함' 문구 — 카드에 있는 이름(무료·플러스)만 쓴다 [A-08]", () => {
  assert.equal(getPlan("pro").features[0].label, `${planLabel("free")}의 모든 혜택 포함`);
  assert.equal(getPlan("expert").features[0].label, `${planLabel("pro")}의 모든 혜택 포함`);
  /* 실사에서 나온 예전 표기("FREE 의 모든 혜택", "PRO 의 모든 혜택")가 되살아나면 실패.
     "Group Pass PRO" 같은 별개 상품명은 대상이 아니다. */
  for (const p of PLAN_DEFINITIONS) {
    for (const f of p.features) {
      if (!f.label.includes("모든 혜택")) continue;
      assert.ok(!/\b(FREE|PRO|EXPERT)\b/.test(f.label), `${p.tier}: ${f.label}`);
    }
  }
});
