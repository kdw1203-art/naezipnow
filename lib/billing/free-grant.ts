/* [1167 · 무료 이용 기간] 소유자 2026-11-12 "가입하면 3개월 · 전문가 등록하면 1년 무료 이용".
   · 가입: 프로 요금제(plan id "expert" · 월 18,900원) 90일 — 새 계정을 만들 때 요금제와 만료 시각을 같이 적는다.
   · 전문가 인증 승인: 프로 요금제 365일 + 홍보 노출 365일(lib/experts/promo PROMO_FREE_DAYS).
   결제는 일어나지 않는다 — 만료 시각이 지나면 예전처럼 만료 스윕(plan-expiry-sweep)이 무료 요금제로 돌린다.
   요금 · 상품은 바꾸지 않는다(무료로 주는 기간만 정한다). 순수 규칙 — node:test 가 같이 쓴다. */

export const SIGNUP_FREE_PLAN = "expert" as const;
export const SIGNUP_FREE_DAYS = 90;
export const EXPERT_FREE_PLAN_DAYS = 365;

const DAY_MS = 86_400_000;

/** 새 계정 행에 얹을 요금제 칸 — plan · plan_expires_at */
export function signupTrialColumns(nowMs: number): { plan: typeof SIGNUP_FREE_PLAN; plan_expires_at: string } {
  return { plan: SIGNUP_FREE_PLAN, plan_expires_at: new Date(nowMs + SIGNUP_FREE_DAYS * DAY_MS).toISOString() };
}

export type GrantDecision = { grant: false; reason: "subscription" | "other-plan" } | { grant: true; expiresAt: string };

/** 전문가 승인 때 무료 기간을 줄지 — 자동결제 구독 중(유료 · 만료 시각 없음)이면 건드리지 않는다(만료를 적으면 결제 중인 구독이 강등된다).
    무료이거나 같은 프로 요금제의 기간권이면 준다: 남은 기간이 있으면 거기에 이어 붙인다. 다른 유료 요금제는 건드리지 않는다. */
export function expertGrantDecision(cur: { plan: string | null; planExpiresAt: string | null }, nowMs: number, days = EXPERT_FREE_PLAN_DAYS): GrantDecision {
  const plan = (cur.plan ?? "free").toLowerCase();
  const paid = plan === "pro" || plan === "expert" || plan === "enterprise";
  if (paid && !cur.planExpiresAt) return { grant: false, reason: "subscription" };
  if (paid && plan !== SIGNUP_FREE_PLAN) return { grant: false, reason: "other-plan" };
  const existing = cur.planExpiresAt ? Date.parse(cur.planExpiresAt) : NaN;
  const base = paid && Number.isFinite(existing) && existing > nowMs ? existing : nowMs;
  return { grant: true, expiresAt: new Date(base + days * DAY_MS).toISOString() };
}
