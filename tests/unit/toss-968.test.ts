/**
 * [968] 토스 도메인 변경 심사 대응 — 순수 헬퍼 고정.
 *  · checkout-preview: 게스트 미리보기 금액은 판매가 단일 출처와 서버 규칙을 그대로 따른다.
 *  · toss-diagnostics: 헬스체크 toss 블록에 키 재료가 한 글자도 실리지 않는다.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  checkoutLoginCallback,
  previewAmount,
  previewBillingLabel,
} from "../../lib/payments/checkout-preview.ts";
import { tossDiagnostics } from "../../lib/payments/toss-diagnostics.ts";
import { WEEKLY_PASS, periodPrice } from "../../lib/subscriptions/billing-periods.ts";
import { getPlan } from "../../lib/subscriptions/plans.ts";

/* ── T1 · 미리보기 금액 ───────────────────────────────────────────── */

test("주간권 미리보기 = WEEKLY_PASS(플러스 전용 1,100원) · 프로 주간권은 없는 상품(null)", () => {
  assert.equal(previewAmount("pro", "weekly"), WEEKLY_PASS.totalKrw);
  assert.equal(previewAmount("pro", "weekly"), 1_100);
  assert.equal(previewAmount("expert", "weekly"), null);
});

test("월간·연간 미리보기 = 서버(toss/create)가 쓰는 plans.ts 금액과 동일", () => {
  for (const tier of ["pro", "expert"] as const) {
    const plan = getPlan(tier);
    assert.equal(previewAmount(tier, "monthly"), plan.priceMonthly, `${tier} monthly`);
    assert.equal(
      previewAmount(tier, "annual"),
      (plan.priceAnnualMonthly ?? 0) * 12,
      `${tier} annual`,
    );
    assert.equal(previewAmount(tier, "annual"), periodPrice(tier, 12)?.totalKrw);
  }
  // 심사 회신 가격표(check-toss-review-freeze LOCKED)와도 같은 숫자
  assert.equal(previewAmount("pro", "monthly"), 2_900);
  assert.equal(previewAmount("pro", "annual"), 27_600);
  assert.equal(previewAmount("expert", "monthly"), 18_900);
  assert.equal(previewAmount("expert", "annual"), 181_200);
});

test("주기 라벨 — 체크아웃 상단·요약 카드가 같은 말", () => {
  assert.equal(previewBillingLabel("weekly"), "주간권(7일 단건)");
  assert.equal(previewBillingLabel("monthly"), "월간");
  assert.equal(previewBillingLabel("annual"), "연간");
});

/* ── T1 · 로그인 복귀 링크 ────────────────────────────────────────── */

test("로그인 콜백은 체크아웃 경로+쿼리(returnTo 포함)를 그대로 보존한다", () => {
  const href = checkoutLoginCallback(
    "/subscription/checkout",
    "?tier=pro&billing=weekly&returnTo=%2Fnotes%2Fnew",
  );
  assert.ok(href.startsWith("/login?callbackUrl="));
  const cb = decodeURIComponent(href.slice("/login?callbackUrl=".length));
  assert.equal(cb, "/subscription/checkout?tier=pro&billing=weekly&returnTo=%2Fnotes%2Fnew");
});

test("로그인 콜백 — search 의 ? 유무·빈 값 모두 정상", () => {
  assert.equal(
    checkoutLoginCallback("/subscription/checkout", "tier=pro&billing=weekly"),
    `/login?callbackUrl=${encodeURIComponent("/subscription/checkout?tier=pro&billing=weekly")}`,
  );
  assert.equal(
    checkoutLoginCallback("/subscription/checkout", ""),
    `/login?callbackUrl=${encodeURIComponent("/subscription/checkout")}`,
  );
  assert.equal(
    checkoutLoginCallback("/subscription/checkout", "?"),
    `/login?callbackUrl=${encodeURIComponent("/subscription/checkout")}`,
  );
});

test("로그인 콜백 — 외부 경로(//evil · /\\evil · https:)는 /subscription 으로 접는다", () => {
  for (const bad of ["//evil.com", "/\\evil.com", "https://evil.com/x", "javascript:alert(1)"]) {
    const href = checkoutLoginCallback(bad, "?tier=pro");
    const cb = decodeURIComponent(href.slice("/login?callbackUrl=".length));
    assert.equal(cb, "/subscription?tier=pro", bad);
  }
});

/* ── T5 · 헬스체크 toss 블록 ───────────────────────────────────────── */

const FAKE = {
  clientKey: "live_gck_ZZZZFAKECLIENTKEY0001",
  secretKey: "live_gsk_ZZZZFAKESECRETKEY0002",
  billingClientKey: "live_ck_ZZZZFAKEBILLCLIENT003",
  billingSecretKey: "live_sk_ZZZZFAKEBILLSECRET004",
};

test("toss 진단 — 접두사 판정 결과만 담고 키 재료는 한 글자도 싣지 않는다", () => {
  const d = tossDiagnostics({
    ...FAKE,
    billingEnabledFlag: "1",
    billingEnabled: true,
    siteOrigin: "https://naezipnow.com/",
  });
  assert.equal(d.clientKeyMode, "live");
  assert.equal(d.clientKeyKind, "widget");
  assert.equal(d.keyPairOk, true);
  assert.equal(d.secretKey, true);
  assert.equal(d.billingClientKey, true);
  assert.equal(d.billingClientKeyKind, "api");
  assert.equal(d.billingSecretKey, true);
  assert.equal(d.billingEnabledFlag, true);
  assert.equal(d.billingEnabled, true);
  assert.equal(d.webhookSecret, true);
  assert.equal(d.webhookVerification, "refetch-with-secret-key");
  assert.equal(d.siteOrigin, "https://naezipnow.com");
  assert.equal(d.webhookUrl, "https://naezipnow.com/api/payments/toss/webhook");
  assert.equal(d.successUrlOrigin, "runtime(window.location.origin)");
  assert.equal(d.reviewCheckoutPath, "/subscription/checkout?tier=pro&billing=weekly");

  const json = JSON.stringify(d);
  for (const raw of Object.values(FAKE)) {
    assert.ok(!json.includes(raw), `키 전체 유출: ${raw}`);
    // 접두사를 뺀 무작위 부분(실제 비밀)이 어떤 형태로도 들어가면 안 된다
    const body = raw.replace(/^(test|live)_g?[cs]k_/, "");
    assert.ok(!json.includes(body), `키 본문 유출: ${body}`);
    assert.ok(!json.includes(body.slice(0, 6)), `키 본문 일부 유출: ${body.slice(0, 6)}`);
  }
  // 값 타입도 boolean/enum/문자열 상수뿐이다 — 숫자(길이)도 싣지 않는다
  for (const v of Object.values(d)) {
    assert.ok(typeof v === "boolean" || typeof v === "string" || v === null, String(v));
  }
});

test("toss 진단 — 미설정은 null/false, 종류·환경이 어긋나면 keyPairOk=false", () => {
  const none = tossDiagnostics({
    clientKey: undefined,
    secretKey: "",
    billingClientKey: undefined,
    billingSecretKey: undefined,
    billingEnabledFlag: undefined,
    billingEnabled: false,
    siteOrigin: "https://naezipnow.com",
  });
  assert.equal(none.clientKeyMode, null);
  assert.equal(none.clientKeyKind, null);
  assert.equal(none.keyPairOk, false);
  assert.equal(none.secretKey, false);
  assert.equal(none.webhookSecret, false);
  assert.equal(none.billingClientKeyKind, null);
  assert.equal(none.billingEnabledFlag, false);

  // 위젯 클라이언트(gck) + API 시크릿(sk): 결제창은 뜨는데 승인에서 깨지는 조합
  const mismatch = tossDiagnostics({
    clientKey: "live_gck_FAKE1",
    secretKey: "live_sk_FAKE2",
    billingClientKey: "test_ck_FAKE3",
    billingSecretKey: undefined,
    billingEnabledFlag: "0",
    billingEnabled: false,
    siteOrigin: "https://naezipnow.com",
  });
  assert.equal(mismatch.keyPairOk, false);
  assert.equal(mismatch.clientKeyKind, "widget");
  assert.equal(mismatch.billingClientKeyKind, "api");
  // 형식이 토스 키가 아닌 값은 종류를 알 수 없다 → null (raw 는 절대 반환하지 않음)
  // [969] 픽스처 교체: 예전 값 "sk_live_…" 은 gitleaks stripe-access-token 규칙에 걸려
  // 2026-09-06 968 배포 워크플로가 시크릿 스캔 단계에서 멈췄다. 토스 접두사가 아니기만 하면 된다.
  const invalid = tossDiagnostics({
    clientKey: "not-a-toss-key-format",
    secretKey: undefined,
    billingClientKey: undefined,
    billingSecretKey: undefined,
    billingEnabledFlag: undefined,
    billingEnabled: false,
    siteOrigin: "https://naezipnow.com",
  });
  assert.equal(invalid.clientKeyMode, null);
  assert.ok(!JSON.stringify(invalid).includes("notatosskey"));
});
