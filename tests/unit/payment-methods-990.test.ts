import assert from "node:assert/strict";
import { test } from "node:test";
import {
  hasCardRail,
  paymentRails,
  PAYMENT_METHODS_PATH,
  REVIEW_CHECKOUT_PATH,
  type PaymentRailFlags,
} from "../../lib/payments/payment-methods";
import { checkoutLoginCallback } from "../../lib/payments/checkout-preview";

const NONE: PaymentRailFlags = { toss: false, kakaoPay: false, stripe: false };

/* [990] 이 페이지는 전자상거래법 고지이자 PG 심사가 읽는 문서다. 거짓이 되는
   경로를 테스트가 막는다: 설정되지 않은 수단이 목록에 나타나면 실패. */

test("설정되지 않은 레일은 목록에 없다", () => {
  assert.deepEqual(paymentRails(NONE), []);
  assert.equal(hasCardRail(NONE), false);
});

test("토스가 열리면 신용/체크카드가 첫 줄로 나온다", () => {
  const rails = paymentRails({ ...NONE, toss: true });
  assert.equal(rails.length, 1);
  assert.equal(rails[0]?.id, "toss-card");
  /* 심사 회신이 찾은 바로 그 두 낱말 — 문구가 바뀌어도 이 둘은 남아야 한다. */
  assert.match(rails[0]?.name ?? "", /신용카드/);
  assert.match(rails[0]?.name ?? "", /체크카드/);
  assert.equal(rails[0]?.provider, "토스페이먼츠");
  assert.equal(hasCardRail({ ...NONE, toss: true }), true);
});

test("카카오페이만 열려 있으면 카드 레일은 없다", () => {
  const flags: PaymentRailFlags = { ...NONE, kakaoPay: true };
  const rails = paymentRails(flags);
  assert.equal(rails.length, 1);
  assert.equal(rails[0]?.id, "kakaopay");
  assert.equal(hasCardRail(flags), false);
});

test("Stripe 도 카드 레일로 센다", () => {
  assert.equal(hasCardRail({ ...NONE, stripe: true }), true);
});

test("세 레일이 모두 열리면 카드가 항상 먼저다", () => {
  const rails = paymentRails({ toss: true, kakaoPay: true, stripe: true });
  assert.deepEqual(
    rails.map((r) => r.id),
    ["toss-card", "kakaopay", "stripe-card"],
  );
});

test("심사용 경로 상수는 비로그인에서 위젯이 그려지는 주간권 주문서다", () => {
  assert.equal(REVIEW_CHECKOUT_PATH, "/subscription/checkout?tier=pro&billing=weekly");
  assert.equal(PAYMENT_METHODS_PATH, "/subscription/payment-methods");
});

/* [990] 정기(월간·연간) 미리보기의 로그인 버튼은 체크아웃이 아니라 빌링으로
   보낸다 — 체크아웃으로 되돌리면 로그인 직후 다시 빌링으로 튕겨 한 번 더 깜빡인다. */
test("정기 미리보기의 로그인 링크는 빌링 화면으로 돌아온다", () => {
  const href = checkoutLoginCallback(
    "/subscription/billing",
    "?tier=pro&billing=monthly",
  );
  assert.equal(
    href,
    `/login?callbackUrl=${encodeURIComponent("/subscription/billing?tier=pro&billing=monthly")}`,
  );
});

test("주간권 미리보기의 로그인 링크는 같은 체크아웃으로 돌아온다", () => {
  const href = checkoutLoginCallback(
    "/subscription/checkout",
    "?tier=pro&billing=weekly",
  );
  assert.equal(
    href,
    `/login?callbackUrl=${encodeURIComponent("/subscription/checkout?tier=pro&billing=weekly")}`,
  );
});

/* 오픈 리다이렉트 방어가 이 경로에도 살아 있는지 — safeInternalPath 경유 */
test("외부 주소를 넣어도 내부 경로로 떨어진다", () => {
  const href = checkoutLoginCallback("//evil.example.com", "?tier=pro&billing=weekly");
  assert.ok(!href.includes("evil.example.com"), href);
});
