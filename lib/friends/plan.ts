/* [1035 · 친구 기능 구독 플랜] 보유 상한(친구 수·단체방 수)과 플랜별 묶음 — 월 횟수(쪽지·같이 임장)는 lib/subscriptions/access.ts
 * FEATURE_RULES 가 든다(두 표가 서로 다른 숫자를 말하지 않게 역할을 나눴다).
 *
 * 설계 원칙
 *  · 새 상품(별도 "친구 패스")을 만들지 않는다 — 카드사 심사 동결(가격·상품 변경 금지) 동안은 기존 세 플랜(무료·플러스·프로)
 *    안에 묶는다. 심사가 끝난 뒤 별도 패스가 필요하면 tier-packages 에 더한다(이 모듈의 표만 바꾸면 된다).
 *  · 관계 자체(친구 요청·수락·친구 공개 노트·친구가 보는 단지)는 전 플랜 — 커뮤니티가 시작되려면 벽이 없어야 한다.
 *  · 유료가 사는 것은 "더 많은 사람·더 많은 방·더 자주"다: 보유 상한(친구 10 → 100 → 무제한) · 단체방(0 → 3 → 무제한) ·
 *    월 횟수(쪽지 30 → 무제한 · 같이 임장 2 → 무제한).
 *  · 무료 한도는 가벼운 사용엔 닿지 않고, 열심인 사람만 만나는 벽이어야 한다(친구 10명 · 쪽지 월 30건).
 *  · 요금제 화면 행(PLAN_FEATURE_MATRIX)은 친구 1단계가 배포될 때 FRIEND_PLAN_MATRIX_ROWS 를 그대로 넣는다 —
 *    코드가 막지 않는 한도를 먼저 광고하지 않는다([1004]).
 */
import { type FeatureKey, type PlanTier, checkAccess, normalizeAccessPlan } from "@/lib/subscriptions/access";
import { planLabel } from "@/lib/subscriptions/labels";

export type FriendLimits = {
  /** 동시에 가질 수 있는 친구 수(수락된 관계) · null = 무제한 */
  friendsMax: number | null;
  /** 내가 만든 단체방 수 · 0 = 개설 불가(참여는 가능) · null = 무제한 */
  groupsMax: number | null;
  /** 쪽지 월 건수 · null = 무제한 (FEATURE_RULES.friend_message 와 같은 값) */
  messagesMonthly: number | null;
  /** 같이 임장 월 횟수 · null = 무제한 (FEATURE_RULES.friend_together 와 같은 값) */
  togetherMonthly: number | null;
};

export const FRIEND_PLAN: Record<PlanTier, FriendLimits> = {
  basic: { friendsMax: 10, groupsMax: 0, messagesMonthly: 30, togetherMonthly: 2 },
  pro: { friendsMax: 100, groupsMax: 3, messagesMonthly: null, togetherMonthly: null },
  expert: { friendsMax: null, groupsMax: null, messagesMonthly: null, togetherMonthly: null },
  enterprise: { friendsMax: null, groupsMax: null, messagesMonthly: null, togetherMonthly: null },
};

/** 플랜 → 친구 한도(월 횟수는 FEATURE_RULES 에서 읽어 와 두 표가 어긋나면 그쪽이 이긴다) */
export function friendLimits(userTier: string | null | undefined): FriendLimits {
  const tier = normalizeAccessPlan(userTier);
  const base = FRIEND_PLAN[tier];
  const msg = checkAccess(tier, "friend_message");
  const tog = checkAccess(tier, "friend_together");
  return {
    ...base,
    messagesMonthly: msg.allowed ? msg.limit : 0,
    togetherMonthly: tog.allowed ? tog.limit : 0,
  };
}

export type FriendGate =
  | { allowed: true; remaining: number | null }
  | { allowed: false; reason: "plan" | "limit"; requiredTier: PlanTier; limit: number };

/** 친구 요청을 보낼 수 있나 — 현재 친구 수(수락된 관계 + 보낸 대기 요청) 기준 */
export function friendAddGate(userTier: string | null | undefined, currentFriends: number): FriendGate {
  const lim = friendLimits(userTier).friendsMax;
  if (lim == null) return { allowed: true, remaining: null };
  if (currentFriends >= lim) return { allowed: false, reason: "limit", requiredTier: nextTierFor("friend_add", userTier), limit: lim };
  return { allowed: true, remaining: lim - currentFriends };
}

/** 단체방을 하나 더 만들 수 있나 — 내가 만든 방 수 기준 */
export function friendGroupGate(userTier: string | null | undefined, myGroups: number): FriendGate {
  const access = checkAccess(userTier, "friend_group");
  if (!access.allowed) return { allowed: false, reason: "plan", requiredTier: access.requiredTier, limit: 0 };
  const lim = friendLimits(userTier).groupsMax;
  if (lim == null) return { allowed: true, remaining: null };
  if (myGroups >= lim) return { allowed: false, reason: "limit", requiredTier: nextTierFor("friend_group", userTier), limit: lim };
  return { allowed: true, remaining: lim - myGroups };
}

/** 월 횟수 동작(쪽지·같이 임장) — 이번 달 사용 수 기준 */
export function friendMonthlyGate(userTier: string | null | undefined, feature: "friend_message" | "friend_together", usedThisMonth: number): FriendGate {
  const access = checkAccess(userTier, feature);
  if (!access.allowed) return { allowed: false, reason: "plan", requiredTier: access.requiredTier, limit: 0 };
  if (access.limit == null) return { allowed: true, remaining: null };
  if (usedThisMonth >= access.limit) return { allowed: false, reason: "limit", requiredTier: nextTierFor(feature, userTier), limit: access.limit };
  return { allowed: true, remaining: access.limit - usedThisMonth };
}

/** 한도에 닿았을 때 권할 다음 플랜 — 무료 → 플러스, 플러스 → 프로(그 위는 없음) */
export function nextTierFor(_feature: FeatureKey, userTier: string | null | undefined): PlanTier {
  const tier = normalizeAccessPlan(userTier);
  return tier === "basic" ? "pro" : "expert";
}

/** 요금제 비교표에 넣을 행 — 친구 1단계 배포 때 PLAN_FEATURE_MATRIX 에 그대로 추가(값은 위 표에서 만든다) */
export const FRIEND_PLAN_MATRIX_ROWS: Array<{ feature: string; free: string; pro: string; expert: string }> = [
  { feature: "친구", free: `${FRIEND_PLAN.basic.friendsMax}명`, pro: `${FRIEND_PLAN.pro.friendsMax}명`, expert: "무제한" },
  { feature: "친구 쪽지", free: `월 ${FRIEND_PLAN.basic.messagesMonthly}건`, pro: "무제한", expert: "무제한" },
  { feature: "친구 단체방", free: "불가", pro: `${FRIEND_PLAN.pro.groupsMax}개`, expert: "무제한" },
  { feature: "같이 임장", free: `월 ${FRIEND_PLAN.basic.togetherMonthly}회`, pro: "무제한", expert: "무제한" },
];

/** 한도 벽 문구 — 사실만("친구 10명 · 플러스 100명" · "쪽지 월 30건 · 플러스 무제한" · "단체방 · 플러스부터") · 권유문 없음 */
export function friendGateLine(gate: FriendGate, what: "친구" | "쪽지" | "단체방" | "같이 임장"): string | null {
  if (gate.allowed) return null;
  const next = planLabel(gate.requiredTier);
  if (gate.reason === "plan") return `${what} · ${next}부터`;
  const nextLimits = FRIEND_PLAN[gate.requiredTier];
  const fmt = (n: number | null, unit: string) => (n == null ? "무제한" : `${n}${unit}`);
  if (what === "친구") return `친구 ${gate.limit}명 · ${next} ${fmt(nextLimits.friendsMax, "명")}`;
  if (what === "단체방") return `단체방 ${gate.limit}개 · ${next} ${fmt(nextLimits.groupsMax, "개")}`;
  if (what === "쪽지") return `쪽지 월 ${gate.limit}건 · ${next} ${fmt(nextLimits.messagesMonthly, "건")}`;
  return `같이 임장 월 ${gate.limit}회 · ${next} ${fmt(nextLimits.togetherMonthly, "회")}`;
}
