import test from "node:test";
import assert from "node:assert/strict";
import { planCheckoutHref } from "@/lib/subscriptions/checkout-href";
import { SELLABLE_PAID_TIERS, isTierOnSale } from "@/lib/subscriptions/sell-config";
import { PLAN_DEFINITIONS, PLAN_FEATURE_MATRIX } from "@/lib/subscriptions/plans";

/* [1004] 요금제 3종 복구 + 카드 버튼 직행.
   소유자 지시(2026-09-18): "구독 및 결제가 무료·플러스밖에 안 보여 — 원래 3개였어". */

test("planCheckoutHref — 주간권은 언제나 체크아웃(비회원도 결제창까지)", () => {
  assert.equal(
    planCheckoutHref({ tier: "pro", billing: "weekly", authed: false }),
    "/subscription/checkout?tier=pro&billing=weekly",
  );
  assert.equal(
    planCheckoutHref({ tier: "pro", billing: "weekly", authed: true }),
    "/subscription/checkout?tier=pro&billing=weekly",
    "로그인해도 단건은 체크아웃에서 그대로 결제한다",
  );
});

test("planCheckoutHref — 정기는 로그인했을 때만 빌링(카드 등록) 화면", () => {
  assert.equal(
    planCheckoutHref({ tier: "expert", billing: "monthly", authed: true }),
    "/subscription/billing?tier=expert&billing=monthly",
  );
  assert.equal(
    planCheckoutHref({ tier: "expert", billing: "annual", authed: true }),
    "/subscription/billing?tier=expert&billing=annual",
  );
  assert.equal(
    planCheckoutHref({ tier: "expert", billing: "monthly", authed: false }),
    "/subscription/checkout?tier=expert&billing=monthly",
    "비로그인은 결제수단을 먼저 보는 체크아웃으로",
  );
});

test("planCheckoutHref — returnTo 는 내부 경로만, '/' 는 싣지 않는다", () => {
  assert.equal(
    planCheckoutHref({ tier: "pro", billing: "monthly", authed: false, returnTo: "/analysis/ai/ai-diagnosis" }),
    "/subscription/checkout?tier=pro&billing=monthly&returnTo=%2Fanalysis%2Fai%2Fai-diagnosis",
  );
  const evil = planCheckoutHref({ tier: "pro", billing: "monthly", authed: false, returnTo: "//evil.example.com" });
  assert.ok(!evil.includes("evil"), "오픈 리다이렉트 금지");
  const backslash = planCheckoutHref({ tier: "pro", billing: "weekly", authed: false, returnTo: "/\\evil.example.com" });
  assert.ok(!backslash.includes("evil"), "역슬래시 우회도 막는다");
  assert.equal(
    planCheckoutHref({ tier: "pro", billing: "monthly", authed: false, returnTo: "/" }),
    "/subscription/checkout?tier=pro&billing=monthly",
  );
  assert.equal(
    planCheckoutHref({ tier: "pro", billing: "monthly", authed: false, returnTo: null }),
    "/subscription/checkout?tier=pro&billing=monthly",
  );
});

test("판매 카탈로그와 카드 정의가 어긋나지 않는다", () => {
  /* 화면에 파는 카드를 그리려면 그 티어의 플랜 정의가 있어야 한다 */
  for (const tier of SELLABLE_PAID_TIERS) {
    const def = PLAN_DEFINITIONS.find((p) => p.tier === tier);
    assert.ok(def, `${tier} 플랜 정의가 없다`);
    assert.ok(def!.priceMonthly > 0, `${tier} 월 가격이 0 이면 팔 수 없다`);
    assert.ok(def!.publicVisible !== false, `${tier} 는 공개 플랜이어야 한다`);
  }
  assert.equal(isTierOnSale("enterprise"), false, "B2B 는 문의 전용");
});

test("세 카드의 한도 줄은 비교표 한 표에서 나온다 — 순서·항목이 같다", () => {
  const labels = PLAN_FEATURE_MATRIX.map((r) => r.feature);
  for (const tier of ["basic", "pro", "expert"] as const) {
    const def = PLAN_DEFINITIONS.find((p) => p.tier === tier)!;
    const tail = def.features.slice(def.features.length - labels.length).map((f) => f.label);
    assert.deepEqual(tail, labels, `${tier} 카드의 한도 줄이 비교표와 다르다`);
  }
});

test("무제한은 잠금(—)이 아니라 제공(✓)으로 읽힌다", () => {
  const expert = PLAN_DEFINITIONS.find((p) => p.tier === "expert")!;
  for (const f of expert.features) {
    assert.notEqual(f.included, false, `프로 카드에 잠긴 줄이 있으면 안 된다: ${f.label}`);
  }
  assert.ok(
    expert.features.every((f) => f.note === undefined || f.note === "무제한"),
    "프로의 한도 줄은 전부 무제한이어야 한다",
  );
  /* [1004 · 리뷰] CSV 는 프로 전용 게이트(requirePlan("pdf_export"))라 "가능/불가" 두 값뿐이다 */
  const csv = expert.features.find((f) => f.label.startsWith("CSV"));
  assert.deepEqual(csv, { label: "CSV 내보내기(임장 기록)", included: true });
  /* 무료·플러스는 반대로 잠긴 줄이 실제로 잠겨 있어야 한다(과장 금지) */
  for (const tier of ["basic", "pro"] as const) {
    const def = PLAN_DEFINITIONS.find((p) => p.tier === tier)!;
    assert.equal(def.features.find((f) => f.label.startsWith("CSV"))?.included, false, `${tier} CSV`);
  }
});
