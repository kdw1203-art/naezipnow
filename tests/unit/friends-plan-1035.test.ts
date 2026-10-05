/* [1035] 친구 기능 구독 플랜 — 새 상품 없이 기존 세 플랜 안의 한도. 월 횟수는 FEATURE_RULES, 보유 상한은 FRIEND_PLAN(두 표의 역할 분리) ·
   관계 맺기는 전 플랜 · 요금제 화면 행은 아직 넣지 않는다(코드가 막기 전에 광고하지 않음) · 심사 동결 파일은 건드리지 않는다. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { FEATURE_RULES, checkAccess, monthlyLimitsAsPlanTiers } from "../../lib/subscriptions/access.ts";
import { FRIEND_PLAN, FRIEND_PLAN_MATRIX_ROWS, friendAddGate, friendGateLine, friendGroupGate, friendLimits, friendMonthlyGate } from "../../lib/friends/plan.ts";

const src = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

test("관계 맺기(friend_add)·친구 공개는 전 플랜 — 커뮤니티 시작에 벽이 없다", () => {
  assert.equal(FEATURE_RULES.friend_add.minTier, "basic");
  assert.equal(checkAccess("basic", "friend_add").allowed, true);
  assert.equal(friendAddGate("basic", 0).allowed, true);
});

test("보유 상한 — 무료 10 → 플러스 100 → 프로 무제한 · 벽 문구는 사실만", () => {
  assert.deepEqual([FRIEND_PLAN.basic.friendsMax, FRIEND_PLAN.pro.friendsMax, FRIEND_PLAN.expert.friendsMax], [10, 100, null]);
  const g = friendAddGate("basic", 10);
  assert.equal(g.allowed, false);
  assert.equal(friendGateLine(g, "친구"), "친구 10명 · 플러스 100명");
  assert.deepEqual(friendAddGate("pro", 99), { allowed: true, remaining: 1 });
  assert.deepEqual(friendAddGate("expert", 5000), { allowed: true, remaining: null });
});

test("쪽지·같이 임장 월 횟수 — FEATURE_RULES 가 단일 출처 · friendLimits 는 거기서 읽는다", () => {
  assert.deepEqual(monthlyLimitsAsPlanTiers("friend_message"), { free: 30, pro: null, expert: null, enterprise: null });
  assert.deepEqual(monthlyLimitsAsPlanTiers("friend_together"), { free: 2, pro: null, expert: null, enterprise: null });
  assert.equal(friendLimits("basic").messagesMonthly, FEATURE_RULES.friend_message.monthlyLimit?.basic);
  const g = friendMonthlyGate("basic", "friend_message", 30);
  assert.equal(g.allowed, false);
  assert.equal(friendGateLine(g, "쪽지"), "쪽지 월 30건 · 플러스 무제한");
  assert.deepEqual(friendMonthlyGate("pro", "friend_message", 10_000), { allowed: true, remaining: null });
  assert.equal(friendGateLine(friendMonthlyGate("basic", "friend_together", 2), "같이 임장"), "같이 임장 월 2회 · 플러스 무제한");
});

test("단체방 — 플러스부터 · 플러스 3개 · 프로 무제한", () => {
  const g0 = friendGroupGate("basic", 0);
  assert.equal(g0.allowed, false);
  assert.equal(g0.allowed ? null : g0.reason, "plan");
  assert.equal(friendGateLine(g0, "단체방"), "단체방 · 플러스부터");
  assert.equal(friendGateLine(friendGroupGate("pro", 3), "단체방"), "단체방 3개 · 프로 무제한");
  assert.deepEqual(friendGroupGate("expert", 40), { allowed: true, remaining: null });
});

test("요금제 화면 — 아직 친구 행을 넣지 않는다(코드가 막기 전엔 광고하지 않음) · 행은 FRIEND_PLAN 에서 만들어 둔다", () => {
  assert.ok(!/친구/.test(src("lib/subscriptions/plans.ts")), "PLAN_FEATURE_MATRIX 에 친구 행 없음(1단계 배포 때)");
  assert.deepEqual(FRIEND_PLAN_MATRIX_ROWS.map((r) => r.feature), ["친구", "친구 쪽지", "친구 단체방", "같이 임장"]);
  assert.deepEqual(FRIEND_PLAN_MATRIX_ROWS[0], { feature: "친구", free: "10명", pro: "100명", expert: "무제한" });
  assert.deepEqual(FRIEND_PLAN_MATRIX_ROWS[1], { feature: "친구 쪽지", free: "월 30건", pro: "무제한", expert: "무제한" });
});

test("심사 동결 파일(가격·주기·고지)은 건드리지 않았다 — 새 상품·가격 없음", () => {
  const bp = src("lib/subscriptions/billing-periods.ts");
  assert.ok(!/친구/.test(bp));
  assert.ok(!/friend/i.test(src("lib/subscriptions/tier-packages.ts")));
});
