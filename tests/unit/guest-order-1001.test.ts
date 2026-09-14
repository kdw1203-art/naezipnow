import test from "node:test";
import assert from "node:assert/strict";
import { isGuestCheckoutAllowed, normalizeGuestEmail, readGuestMeta } from "@/lib/payments/guest-order";

/* [1001] 비회원 단건 결제 규칙 — 토스 홈페이지 변경 심사 반려(결제창 미확인) 대응 */

test("isGuestCheckoutAllowed — 주간권만, 정기(월간·연간)는 계정 필요", () => {
  assert.equal(isGuestCheckoutAllowed("weekly"), true);
  assert.equal(isGuestCheckoutAllowed("monthly"), false);
  assert.equal(isGuestCheckoutAllowed("annual"), false);
  assert.equal(isGuestCheckoutAllowed(null), false);
  assert.equal(isGuestCheckoutAllowed(undefined), false);
});

test("normalizeGuestEmail — 다듬고 소문자, 모양이 아니면 null", () => {
  assert.equal(normalizeGuestEmail("  Test@Example.com "), "test@example.com");
  assert.equal(normalizeGuestEmail("a@b.co"), "a@b.co");
  assert.equal(normalizeGuestEmail("no-at.com"), null);
  assert.equal(normalizeGuestEmail("a@b"), null, "TLD 없음");
  assert.equal(normalizeGuestEmail("a b@c.com"), null, "공백");
  assert.equal(normalizeGuestEmail('x"y@c.com'), null, "따옴표");
  assert.equal(normalizeGuestEmail(""), null);
  assert.equal(normalizeGuestEmail(123), null);
  assert.equal(normalizeGuestEmail(`${"a".repeat(250)}@b.com`), null, "254자 초과");
});

test("readGuestMeta — guest 표식이 있을 때만, claimPending/claimedAt 을 그대로", () => {
  assert.equal(readGuestMeta(null), null);
  assert.equal(readGuestMeta({ source: "x" }), null);
  assert.equal(readGuestMeta({ guest: "true" }), null, "문자열 true 는 표식이 아니다");
  assert.deepEqual(readGuestMeta({ guest: true, claimPending: true }), { guest: true, claimPending: true });
  assert.deepEqual(readGuestMeta({ guest: true, claimPending: false, claimedAt: "2026-09-14T00:00:00Z" }), {
    guest: true,
    claimPending: false,
    claimedAt: "2026-09-14T00:00:00Z",
  });
  assert.deepEqual(readGuestMeta({ guest: true }), { guest: true, claimPending: false });
});
