import test from "node:test";
import assert from "node:assert/strict";
import {
  CANCEL_NOTE_MAX,
  CANCEL_REASON_CODES,
  CANCEL_REASONS,
  isCancelReason,
  parseCancelBody,
} from "@/lib/payments/cancel-reasons";
import {
  SUBSCRIPTION_EVENTS,
  SUBSCRIPTION_EVENT_LABEL,
  subscriptionEventLabel,
} from "@/lib/payments/subscription-event-labels";
import { chargeReceiptInfo, BILLING_METHOD_LABEL } from "@/lib/payments/charge-receipt";

test("해지 사유 5종 — DB 컬럼 주석(cancel_reason)과 같은 코드, 전부 한글 라벨", () => {
  assert.deepEqual(
    [...CANCEL_REASON_CODES],
    ["too_expensive", "not_using", "missing_feature", "switching", "other"],
  );
  for (const code of CANCEL_REASON_CODES) {
    assert.ok(CANCEL_REASONS[code].length > 0, code);
    assert.ok(isCancelReason(code));
  }
  assert.equal(isCancelReason("refund"), false);
  assert.equal(isCancelReason(null), false);
});

test("parseCancelBody — 본문 없음(하위 호환)·빈 객체 → 사유 없음으로 통과", () => {
  assert.deepEqual(parseCancelBody(null), { ok: true, reason: null, note: null });
  assert.deepEqual(parseCancelBody(undefined), { ok: true, reason: null, note: null });
  assert.deepEqual(parseCancelBody({}), { ok: true, reason: null, note: null });
  assert.deepEqual(parseCancelBody({ reason: "" }), { ok: true, reason: null, note: null });
});

test("parseCancelBody — 정상 사유·의견(trim) 통과, 빈 의견은 null", () => {
  assert.deepEqual(parseCancelBody({ reason: "not_using", note: "  잘 안 써요  " }), {
    ok: true,
    reason: "not_using",
    note: "잘 안 써요",
  });
  assert.deepEqual(parseCancelBody({ reason: "other", note: "   " }), {
    ok: true,
    reason: "other",
    note: null,
  });
});

test("parseCancelBody — 모르는 사유·비문자열 의견·500자 초과·배열 본문은 400 감", () => {
  assert.equal(parseCancelBody({ reason: "hacked" }).ok, false);
  assert.equal(parseCancelBody({ note: 123 }).ok, false);
  assert.equal(parseCancelBody({ note: "a".repeat(CANCEL_NOTE_MAX + 1) }).ok, false);
  assert.equal(parseCancelBody({ note: "a".repeat(CANCEL_NOTE_MAX) }).ok, true);
  assert.equal(parseCancelBody([]).ok, false);
  assert.equal(parseCancelBody("not_using").ok, false);
});

test("구독 이벤트 — DB check 제약 10종과 같고 라벨이 전부 있다", () => {
  assert.equal(SUBSCRIPTION_EVENTS.length, 10);
  for (const ev of SUBSCRIPTION_EVENTS) {
    assert.ok(SUBSCRIPTION_EVENT_LABEL[ev].length > 0, ev);
  }
  assert.equal(subscriptionEventLabel("renewed"), "자동결제 갱신");
  /* 모르는 값은 지어내지 않고 원문 */
  assert.equal(subscriptionEventLabel("something_new"), "something_new");
});

test("chargeReceiptInfo — 승인 응답의 영수증·카드·결제수단, 없으면 null(지어내지 않음)", () => {
  const info = chargeReceiptInfo({
    receipt: { url: "https://dashboard.tosspayments.com/receipt/abc" },
    card: { company: "신한", number: "5327**********12" },
    method: "카드",
    approvedAt: "2026-09-14T10:10:00+09:00",
  });
  assert.equal(info.receiptUrl, "https://dashboard.tosspayments.com/receipt/abc");
  assert.equal(info.cardCompany, "신한");
  assert.equal(info.cardNumberMasked, "5327**********12");
  assert.equal(info.method, BILLING_METHOD_LABEL);
  assert.equal(info.approvedAt, "2026-09-14T10:10:00+09:00");

  const empty = chargeReceiptInfo({});
  assert.equal(empty.receiptUrl, null);
  assert.equal(empty.cardCompany, null);
  assert.equal(empty.method, BILLING_METHOD_LABEL);
  assert.equal(chargeReceiptInfo(null).receiptUrl, null);
});

test("chargeReceiptInfo — http/javascript 영수증 링크는 버린다, 다른 결제수단은 '(자동결제)' 접미", () => {
  assert.equal(chargeReceiptInfo({ receipt: { url: "javascript:alert(1)" } }).receiptUrl, null);
  assert.equal(chargeReceiptInfo({ receipt: { url: "http://x.test/r" } }).receiptUrl, null);
  assert.equal(chargeReceiptInfo({ method: "간편결제" }).method, "간편결제(자동결제)");
});
