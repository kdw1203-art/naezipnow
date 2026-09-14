import test from "node:test";
import assert from "node:assert/strict";
import { orderIdFromTicket } from "@/lib/support/ticket-labels";

/* [1002] 결제·환불 문의 → 결제 관리 딥링크 — 주문번호만 뽑고, 다른 카테고리는 무시 */

test("orderIdFromTicket — 결제·환불 본문의 주문번호만 읽는다", () => {
  assert.equal(orderIdFromTicket("결제·환불", "주문번호: nz_20260914_ab12cd\n결제 금액: 1,100원"), "nz_20260914_ab12cd");
  assert.equal(orderIdFromTicket("결제·환불", "주문번호 : ORD-000123"), "ORD-000123");
  assert.equal(orderIdFromTicket("결제·환불", "주문번호：ORD-000123 환불 요청"), "ORD-000123");
  assert.equal(orderIdFromTicket("일반 문의", "주문번호: ORD-000123"), null, "카테고리가 다르면 무시");
  assert.equal(orderIdFromTicket("결제·환불", "주문번호: abc"), null, "6자 미만");
  assert.equal(orderIdFromTicket("결제·환불", "환불해 주세요"), null);
  assert.equal(orderIdFromTicket("결제·환불", null), null);
});
