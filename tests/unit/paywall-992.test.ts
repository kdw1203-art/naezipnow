import assert from "node:assert/strict";
import { test } from "node:test";
import { FEATURE_RULES, checkAccess } from "../../lib/subscriptions/access";
import { freeQuotaLabel, weeklyPassCheckoutHref } from "../../lib/payments/paywall-links";
import { SELLABLE_PAID_TIERS, isTierOnSale } from "../../lib/subscriptions/sell-config";

/* [992] 무료 AI 분석 = 누적 3회. 월 한도로 되돌아가면(아무도 못 보는 페이월) 실패. */
test("무료 AI 분석은 누적 3회, 월 한도는 없다", () => {
  assert.equal(FEATURE_RULES.ai_analysis.lifetimeLimit?.basic, 3);
  assert.equal(FEATURE_RULES.ai_analysis.monthlyLimit?.basic, null);
  /* 유료는 월 한도 그대로 */
  assert.equal(FEATURE_RULES.ai_analysis.monthlyLimit?.pro, 50);
  assert.equal(checkAccess("free", "ai_analysis").allowed, true);
});

test("페이월 링크 — 주간권 결제창 + 내부 returnTo 만", () => {
  assert.equal(weeklyPassCheckoutHref(null), "/subscription/checkout?tier=pro&billing=weekly");
  assert.equal(
    weeklyPassCheckoutHref("/analysis/ai/ai-diagnosis?complex=abc"),
    "/subscription/checkout?tier=pro&billing=weekly&returnTo=%2Fanalysis%2Fai%2Fai-diagnosis%3Fcomplex%3Dabc",
  );
  assert.ok(!weeklyPassCheckoutHref("//evil.example.com").includes("evil"));
  assert.equal(weeklyPassCheckoutHref("/"), "/subscription/checkout?tier=pro&billing=weekly");
});

test("한도 문구 — 누적/월간/무제한이 다르게 읽힌다", () => {
  assert.equal(freeQuotaLabel(2, 3, true), "무료 2 / 3회 (누적)");
  assert.equal(freeQuotaLabel(7, 50, undefined), "이번 달 7 / 50회");
  assert.equal(freeQuotaLabel(120, null, undefined), "사용 120회 (무제한)");
});

/* [992] 판매 카탈로그 — 프로(EXPERT)는 내려가 있다. 코드는 남는다. */
test("판매 중인 유료 티어는 플러스 하나", () => {
  assert.deepEqual([...SELLABLE_PAID_TIERS], ["pro"]);
  assert.equal(isTierOnSale("pro"), true);
  assert.equal(isTierOnSale("expert"), false);
  assert.equal(isTierOnSale("enterprise"), false);
});
