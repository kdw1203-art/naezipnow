import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import {
  hasCardRail,
  paymentRails,
  PAYMENT_METHODS_PATH,
  REVIEW_CHECKOUT_PATH,
} from "../../lib/payments/payment-methods";
import { checkoutLoginCallback } from "../../lib/payments/checkout-preview";

/* [990] 이 페이지는 전자상거래법 고지이자 PG 심사가 읽는 문서다. 거짓이 되는
   경로를 테스트가 막는다: 설정되지 않은 수단이 목록에 나타나면 실패.
   [992] 레일은 토스 하나 — 카카오페이·Stripe 행은 사라졌다. */

test("토스가 닫혀 있으면 목록이 비고 카드 레일도 없다", () => {
  assert.deepEqual(paymentRails({ toss: false }), []);
  assert.equal(hasCardRail({ toss: false }), false);
});

test("토스가 열리면 신용/체크카드 한 줄이 나온다", () => {
  const rails = paymentRails({ toss: true });
  assert.equal(rails.length, 1);
  assert.equal(rails[0]?.id, "toss-card");
  /* 심사 회신이 찾은 바로 그 두 낱말 — 문구가 바뀌어도 이 둘은 남아야 한다. */
  assert.match(rails[0]?.name ?? "", /신용카드/);
  assert.match(rails[0]?.name ?? "", /체크카드/);
  assert.equal(rails[0]?.provider, "토스페이먼츠");
  assert.equal(hasCardRail({ toss: true }), true);
});

/* [1026g] 주문서형(gck) 키 — 운영 결제 UI 가 계좌이체·간편결제를 함께 보여 준다(2026-10-01 운영 확인).
   카드가 여전히 첫 줄이고, 정기결제는 카드만이라는 사실이 함께 적혀야 한다. */
test("위젯 키면 카드 다음에 계좌이체·간편결제가 붙는다", () => {
  const rails = paymentRails({ toss: true, widget: true });
  assert.deepEqual(rails.map((r) => r.id), ["toss-card", "toss-transfer", "toss-easypay"]);
  assert.match(rails[0]?.name ?? "", /신용카드/);
  assert.ok(rails.every((r) => r.provider === "토스페이먼츠"));
  assert.match(rails[2]?.detail ?? "", /정기결제는[^.]*신용카드 · 체크카드만/);
  assert.deepEqual(paymentRails({ toss: false, widget: true }), []);
  assert.equal(paymentRails({ toss: true, widget: false }).length, 1);
});

test("체크아웃 문구는 위젯이 보일 때 '카드로 결제하기'라고 쓰지 않는다", () => {
  const src = readFileSync("app/subscription/checkout/CheckoutClient.tsx", "utf8");
  assert.match(src, /phase\.widget === "shown" \? "결제하기" : "카드로 결제하기"/);
  assert.match(src, /WIDGET_OTHER_METHODS_LABEL/);
  const ge = readFileSync("app/global-error.tsx", "utf8");
  assert.match(ge, /nz:chunk-reload:/);
});

test("심사용 경로 상수는 비로그인에서 위젯이 그려지는 주간권 주문서다", () => {
  assert.equal(REVIEW_CHECKOUT_PATH, "/subscription/checkout?tier=pro&billing=weekly");
  assert.equal(PAYMENT_METHODS_PATH, "/subscription/payment-methods");
});

/* [990] 정기(월간·연간) 미리보기의 로그인 버튼은 체크아웃이 아니라 빌링으로 보낸다 */
test("정기 미리보기의 로그인 링크는 빌링 화면으로 돌아온다", () => {
  const href = checkoutLoginCallback("/subscription/billing", "?tier=pro&billing=monthly");
  assert.equal(
    href,
    `/login?callbackUrl=${encodeURIComponent("/subscription/billing?tier=pro&billing=monthly")}`,
  );
});

test("주간권 미리보기의 로그인 링크는 같은 체크아웃으로 돌아온다", () => {
  const href = checkoutLoginCallback("/subscription/checkout", "?tier=pro&billing=weekly");
  assert.equal(
    href,
    `/login?callbackUrl=${encodeURIComponent("/subscription/checkout?tier=pro&billing=weekly")}`,
  );
});

test("외부 주소를 넣어도 내부 경로로 떨어진다", () => {
  const href = checkoutLoginCallback("//evil.example.com", "?tier=pro&billing=weekly");
  assert.ok(!href.includes("evil.example.com"), href);
});
