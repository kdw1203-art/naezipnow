import test from "node:test";
import assert from "node:assert/strict";
import { readGuestEmailInput, normalizeGuestEmail } from "@/lib/payments/guest-order";
import { guestAttachDecision } from "@/lib/payments/guest-attach";
import { safePageLocation } from "@/lib/analytics/safe-page-location";

/* [1003] 비회원 주간권 — 이메일은 **선택**이다.
   토스 심사자는 이메일 칸 앞에서 멈췄다(2026-09-16 실측: /subscription 13.5초 → 이탈,
   /subscription/checkout 페이지뷰 0 · payments 주문 0건). 결제창까지 가는 길에 타이핑을
   세워 두지 않는다. 클라이언트(CheckoutClient)와 서버(create 라우트)가 이 함수 하나를 본다. */

test("readGuestEmailInput — 빈칸은 통과(주문 이메일 없음), 오류가 아니다", () => {
  assert.deepEqual(readGuestEmailInput(undefined), { email: null, error: null });
  assert.deepEqual(readGuestEmailInput(null), { email: null, error: null });
  assert.deepEqual(readGuestEmailInput(""), { email: null, error: null });
  assert.deepEqual(readGuestEmailInput("   "), { email: null, error: null });
  assert.deepEqual(readGuestEmailInput("\t\n "), { email: null, error: null });
});

test("readGuestEmailInput — 적었으면 모양을 본다", () => {
  assert.deepEqual(readGuestEmailInput(" Test@Example.com "), { email: "test@example.com", error: null });
  assert.deepEqual(readGuestEmailInput("a@b.co"), { email: "a@b.co", error: null });
  assert.deepEqual(readGuestEmailInput("no-at-sign"), { email: null, error: "invalid" });
  assert.deepEqual(readGuestEmailInput("a@b"), { email: null, error: "invalid" }, "TLD 없음");
  assert.deepEqual(readGuestEmailInput("a b@c.com"), { email: null, error: "invalid" }, "공백");
  assert.deepEqual(readGuestEmailInput(`${"a".repeat(250)}@b.com`), { email: null, error: "invalid" });
});

test("readGuestEmailInput — 문자열이 아니면 오류(빈칸과 구분한다)", () => {
  assert.deepEqual(readGuestEmailInput(123), { email: null, error: "invalid" });
  assert.deepEqual(readGuestEmailInput({}), { email: null, error: "invalid" });
  assert.deepEqual(readGuestEmailInput(true), { email: null, error: "invalid" });
});

test("readGuestEmailInput 의 통과분은 normalizeGuestEmail 과 같은 값", () => {
  for (const raw of [" A@B.com ", "user.name+tag@example.co.kr", "x@y.io"]) {
    assert.equal(readGuestEmailInput(raw).email, normalizeGuestEmail(raw));
  }
});

/* ── 결제 뒤 이메일 붙이기 판정 — 이 규칙이 남의 이용권을 지킨다 ───────────────── */

test("guestAttachDecision — paymentKey 가 맞아야 한다(주문번호는 비밀이 아니다)", () => {
  const base = {
    status: "paid",
    isGuest: true,
    storedPaymentKey: "tviva20260917key_ABC",
    currentEmail: null,
    email: "buyer@example.com",
  };
  assert.deepEqual(guestAttachDecision({ ...base, givenPaymentKey: "tviva20260917key_ABC" }), { ok: true });
  assert.deepEqual(guestAttachDecision({ ...base, givenPaymentKey: "tviva20260917key_ABD" }), {
    ok: false,
    reason: "mismatch",
  });
  assert.deepEqual(guestAttachDecision({ ...base, givenPaymentKey: "" }), { ok: false, reason: "mismatch" });
  assert.deepEqual(guestAttachDecision({ ...base, givenPaymentKey: "tviva" }), { ok: false, reason: "mismatch" }, "길이가 다르면 비교 전에 탈락");
  assert.deepEqual(
    guestAttachDecision({ ...base, storedPaymentKey: null, givenPaymentKey: "tviva20260917key_ABC" }),
    { ok: false, reason: "mismatch" },
    "승인 전(키 없음) 주문에는 못 붙인다",
  );
});

test("guestAttachDecision — 결제·비회원·기존 이메일 조건", () => {
  const ok = {
    isGuest: true,
    storedPaymentKey: "k".repeat(20),
    givenPaymentKey: "k".repeat(20),
    currentEmail: null,
    email: "buyer@example.com",
  };
  assert.deepEqual(guestAttachDecision({ ...ok, status: "requested" }), { ok: false, reason: "not_paid" });
  assert.deepEqual(guestAttachDecision({ ...ok, status: "refunded" }), { ok: false, reason: "not_paid" });
  assert.deepEqual(guestAttachDecision({ ...ok, status: "paid", isGuest: false }), { ok: false, reason: "not_guest" });
  /* 이미 붙은 이메일은 바꿔치기할 수 없다 — 먼저 결제한 사람의 이용권이 사라진다 */
  assert.deepEqual(
    guestAttachDecision({ ...ok, status: "paid", currentEmail: "other@example.com" }),
    { ok: false, reason: "taken" },
  );
  /* 같은 이메일을 다시 보내는 것(새로고침·재시도)은 통과 */
  assert.deepEqual(
    guestAttachDecision({ ...ok, status: "paid", currentEmail: " Buyer@Example.com " }),
    { ok: true },
  );
});

test("safePageLocation — 분석 도구로 결제 열쇠를 내보내지 않는다", () => {
  assert.equal(
    safePageLocation("https://naezipnow.com/payment/success?orderId=WOODONG-1&paymentKey=abc&amount=1100"),
    "https://naezipnow.com/payment/success?orderId=WOODONG-1&amount=1100",
    "주문번호·금액(광고 전환 집계)은 남기고 열쇠만 뺀다",
  );
  assert.equal(
    safePageLocation("https://naezipnow.com/town?tab=news"),
    "https://naezipnow.com/town?tab=news",
    "지울 것이 없으면 원문 그대로",
  );
  assert.equal(safePageLocation("not a url?paymentKey=abc"), "not a url", "파싱 실패는 쿼리째 버린다");
});
