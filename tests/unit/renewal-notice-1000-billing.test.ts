import test from "node:test";
import assert from "node:assert/strict";
import { needsUpcomingNotice, UPCOMING_NOTICE_LEAD_DAYS } from "@/lib/payments/renewal-notice";
import { paymentRenewalFailedEmail, paymentUpcomingChargeEmail } from "@/lib/email/templates";

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 8, 14, 1, 10); // 2026-09-14 10:10 KST

test("사전 통지 기본 리드타임은 3일", () => {
  assert.equal(UPCOMING_NOTICE_LEAD_DAYS, 3);
});

test("3일 안 회차 · 아직 통지 안 함 → 보낸다", () => {
  assert.equal(
    needsUpcomingNotice({ nextChargeAt: new Date(NOW + 2 * DAY).toISOString(), noticeSentFor: null, now: NOW }),
    true,
  );
  /* 창 경계(정확히 3일)도 포함 */
  assert.equal(
    needsUpcomingNotice({ nextChargeAt: new Date(NOW + 3 * DAY).toISOString(), noticeSentFor: null, now: NOW }),
    true,
  );
});

test("같은 회차에 이미 통지했으면 다시 안 보낸다 — 표기 형식이 달라도(PostgREST +00:00 vs Z)", () => {
  const next = new Date(NOW + 2 * DAY);
  const postgrest = next.toISOString().replace("Z", "+00:00");
  assert.equal(
    needsUpcomingNotice({ nextChargeAt: next.toISOString(), noticeSentFor: postgrest, now: NOW }),
    false,
  );
  /* 다른 회차(한 주기 전)에 보낸 표식은 이번 회차를 막지 않는다 */
  assert.equal(
    needsUpcomingNotice({
      nextChargeAt: next.toISOString(),
      noticeSentFor: new Date(next.getTime() - 28 * DAY).toISOString(),
      now: NOW,
    }),
    true,
  );
});

test("이미 지난 회차·너무 먼 회차·회차 없음 → 안 보낸다", () => {
  assert.equal(
    needsUpcomingNotice({ nextChargeAt: new Date(NOW - 1000).toISOString(), noticeSentFor: null, now: NOW }),
    false,
    "지난 회차는 갱신 크론 몫",
  );
  assert.equal(
    needsUpcomingNotice({ nextChargeAt: new Date(NOW + 4 * DAY).toISOString(), noticeSentFor: null, now: NOW }),
    false,
  );
  assert.equal(needsUpcomingNotice({ nextChargeAt: null, noticeSentFor: null, now: NOW }), false);
  assert.equal(needsUpcomingNotice({ nextChargeAt: "not-a-date", noticeSentFor: null, now: NOW }), false);
});

test("leadDays 를 바꾸면 창이 따라온다", () => {
  const next = new Date(NOW + 6 * DAY).toISOString();
  assert.equal(needsUpcomingNotice({ nextChargeAt: next, noticeSentFor: null, now: NOW }), false);
  assert.equal(needsUpcomingNotice({ nextChargeAt: next, noticeSentFor: null, now: NOW, leadDays: 7 }), true);
});

test("갱신 실패 메일 — 재시도 예정이면 날짜, 중단이면 카드 재등록 안내; 오류 원문·관리 링크 포함", () => {
  const retry = paymentRenewalFailedEmail({
    plan: "플러스",
    billing: "monthly",
    amount: 2900,
    error: "NOT_ENOUGH_BALANCE: 잔액이 부족합니다",
    retryAt: new Date(NOW + 12 * 60 * 60 * 1000),
    manageUrl: "https://naezipnow.com/my/subscription",
  });
  assert.match(retry.subject, /자동결제 실패/);
  assert.match(retry.subject, /2,900원/);
  assert.match(retry.html, /NOT_ENOUGH_BALANCE/);
  assert.match(retry.html, /한 번 더 시도/);
  assert.match(retry.html, /my\/subscription/);
  assert.doesNotMatch(retry.subject, /\(광고\)/);

  const suspended = paymentRenewalFailedEmail({
    plan: "플러스",
    billing: "annual",
    amount: 27600,
    error: "INVALID_STOPPED_CARD: 정지된 카드",
    retryAt: null,
    manageUrl: "https://naezipnow.com/my/subscription",
  });
  assert.match(suspended.html, /카드 다시 등록/);
  assert.match(suspended.text, /멈췄어요/);
  /* HTML 이스케이프 — 오류 원문에 태그가 섞여도 그대로 박히지 않는다 */
  const xss = paymentRenewalFailedEmail({
    plan: "플러스",
    billing: "monthly",
    amount: 2900,
    error: "<script>alert(1)</script>",
    manageUrl: "https://naezipnow.com/my/subscription",
  });
  assert.doesNotMatch(xss.html, /<script>/);
});

test("청구 사전 통지 메일 — 결제 예정일·금액(VAT 포함)·카드·해지 경로", () => {
  const m = paymentUpcomingChargeEmail({
    plan: "플러스",
    billing: "monthly",
    amount: 2900,
    chargeAt: new Date(Date.UTC(2026, 9, 12, 1, 0)),
    cardMasked: "신한 5327**********12",
    manageUrl: "https://naezipnow.com/my/subscription",
  });
  assert.match(m.subject, /2026년 10월 12일/);
  assert.match(m.subject, /플러스/);
  assert.match(m.html, /VAT 포함/);
  assert.match(m.html, /신한 5327\*+12/);
  assert.match(m.html, /해지/);
  assert.match(m.text, /결제 예정일: 2026년 10월 12일/);
  const noCard = paymentUpcomingChargeEmail({
    plan: "플러스",
    billing: "annual",
    amount: 27600,
    chargeAt: new Date(NOW + 2 * DAY),
    cardMasked: null,
    manageUrl: "https://naezipnow.com/my/subscription",
  });
  assert.doesNotMatch(noCard.html, /결제 카드/);
});
