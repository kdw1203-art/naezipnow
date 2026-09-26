import { countBookmarks } from "@/lib/bookmarks/store";
import { countRunsThisMonth, countRunsTotal, appendRun } from "@/lib/ai/presets-store";
import { countConsultationsThisMonth } from "@/lib/expert-consultations/store-db";
import { countWatchlist } from "@/lib/watchlist/store-db";
import {
  checkAccess,
  FEATURE_RULES,
  normalizeAccessPlan,
  upgradeMessage,
  type FeatureKey,
  type PlanTier as AccessTier,
} from "@/lib/subscriptions/access";
import type { ProfilePlanTier } from "@/lib/subscriptions/labels";
import { loadMeProfile } from "@/lib/me/profile";
import { withUserQuotaLock } from "@/lib/subscriptions/quota-lock";

export type UsageItem = {
  key: FeatureKey | "watchlist";
  label: string;
  used: number;
  limit: number | null;
  /** [992] "누적" 한도면 true — 화면이 "이번 달" 대신 "무료 누적" 이라고 적는다 */
  lifetime?: boolean;
};

/** [992] 이 플랜에 누적 한도가 걸려 있는가(무료 AI 분석 3회) */
function lifetimeLimitFor(accessTier: AccessTier, feature: FeatureKey): number | null {
  return FEATURE_RULES[feature].lifetimeLimit?.[accessTier] ?? null;
}

export function profilePlanToAccessTier(plan: string | null | undefined): AccessTier {
  return normalizeAccessPlan(plan);
}

/** 한도 API용 — JWT가 아닌 DB(app_users) plan 우선 */
export async function resolveQuotaPlan(
  email: string,
  sessionPlan?: string | null,
): Promise<ProfilePlanTier> {
  const profile = await loadMeProfile(email, { plan: sessionPlan ?? "free" });
  return profile.plan;
}

function quotaDeniedResponseFields(
  requiredTier: AccessTier,
  used: number,
  limit: number,
) {
  return {
    requiredTier: requiredTier === "basic" ? ("pro" as const) : requiredTier,
    usage: { used, limit },
  };
}

function limitFor(accessTier: AccessTier, feature: FeatureKey): number | null {
  return FEATURE_RULES[feature].monthlyLimit?.[accessTier] ?? null;
}

export async function getUsageSummary(
  email: string,
  profilePlan: ProfilePlanTier,
): Promise<{ plan: ProfilePlanTier; accessTier: AccessTier; items: UsageItem[] }> {
  const accessTier = profilePlanToAccessTier(profilePlan);

  const aiLifetime = lifetimeLimitFor(accessTier, "ai_analysis");
  const [aiUsed, bookmarkCount, watchlistCount] = await Promise.all([
    /* [1008 · 리뷰 A-11] 한도는 외부 AI 모델 실행만 센다(자체 계산 실행은 기록만) — 한도 검사와 같은 셈 */
    aiLifetime != null ? countRunsTotal(email, { externalOnly: true }) : countRunsThisMonth(email, { externalOnly: true }),
    countBookmarks(email),
    countWatchlist(email),
  ]);

  const items: UsageItem[] = [
    {
      key: "ai_analysis",
      label: "AI 분석 실행",
      used: aiUsed,
      limit: aiLifetime ?? limitFor(accessTier, "ai_analysis"),
      ...(aiLifetime != null ? { lifetime: true } : {}),
    },
    {
      key: "bookmark",
      label: "북마크",
      used: bookmarkCount,
      limit: limitFor(accessTier, "bookmark"),
    },
    {
      key: "interest_complex",
      label: "관심 단지",
      used: watchlistCount,
      limit: limitFor(accessTier, "interest_complex"),
    },
    /* [1005] "전문가 상담" 미터 제거 — 전문가 마켓은 [992] 부터 보관(비노출)이고 공급이 0이다.
       요금제·마이 화면의 사용량 칸에 "0 / 무제한"으로 남아 있으면 없는 기능을 파는 셈이다.
       checkExpertConsultQuota(아래)는 API 게이트가 아직 부르므로 그대로 둔다 — 화면에서만 빼고,
       요금제 화면이 열릴 때마다 상담 건수를 세던 쿼리도 같이 뺐다. 되살릴 때 이 항목만 다시 넣으면 된다. */
  ];

  return { plan: profilePlan, accessTier, items };
}

export async function checkAiAnalysisQuota(
  email: string,
  profilePlan: string | null | undefined,
): Promise<
  | { allowed: true; used: number; limit: number | null; lifetime?: true }
  | { allowed: false; used: number; limit: number; requiredTier: AccessTier; message: string; lifetime?: true }
> {
  const accessTier = profilePlanToAccessTier(profilePlan);
  const access = checkAccess(accessTier, "ai_analysis");
  if (!access.allowed) {
    return {
      allowed: false,
      used: 0,
      limit: 0,
      requiredTier: access.requiredTier,
      message: access.reason,
    };
  }

  /* [992] 누적 한도(무료 3회)가 있으면 그것이 한도다 — 월이 바뀌어도 열리지 않는다 */
  const lifetime = lifetimeLimitFor(accessTier, "ai_analysis");
  if (lifetime != null) {
    const used = await countRunsTotal(email, { externalOnly: true });
    if (used >= lifetime) {
      return {
        allowed: false,
        used,
        limit: lifetime,
        requiredTier: "pro",
        message: `무료 AI 분석 ${lifetime}회를 모두 사용했습니다.`,
        lifetime: true,
      };
    }
    return { allowed: true, used, limit: lifetime, lifetime: true };
  }

  const used = await countRunsThisMonth(email, { externalOnly: true });
  const limit = access.limit;
  if (limit != null && used >= limit) {
    const requiredTier: AccessTier = accessTier === "basic" ? "pro" : "expert";
    return {
      allowed: false,
      used,
      limit,
      requiredTier,
      message: `이번 달 AI 분석 한도(${limit}회)를 모두 사용했습니다.`,
    };
  }

  return { allowed: true, used, limit };
}

export type QuotaDeniedPayload = {
  error: string;
  code: "QUOTA_EXCEEDED" | "TIER";
  requiredTier: "pro" | "expert";
  usage: { used: number; limit: number };
};

export function quotaDeniedJson(
  message: string,
  requiredTier: AccessTier,
  used: number,
  limit: number,
  code: "QUOTA_EXCEEDED" | "TIER" = "QUOTA_EXCEEDED",
): QuotaDeniedPayload {
  const tier: "pro" | "expert" =
    requiredTier === "basic" || requiredTier === "enterprise" ? "pro" : requiredTier;
  /* 한도 문구 뒤에 가격이 붙은 업그레이드 안내를 덧붙인다(항목 37).
     2,900원에서는 가격 자체가 설득이다 — 숨기면 벽이 징벌로 읽힌다.
     가격은 upgradeMessage → billing-periods.ts 단일 출처에서 온다. */
  const withUpgrade = message.includes("업그레이드")
    ? message
    : `${message} ${upgradeMessage(tier)}`;
  return {
    error: withUpgrade,
    code,
    requiredTier: tier,
    usage: { used, limit },
  };
}

/** AI run 저장 직전 한도 재검사 + 직렬화 */
export async function appendAiRunWithinQuota(
  email: string,
  sessionPlan: string | null | undefined,
  input: Parameters<typeof appendRun>[0],
): Promise<
  /* [AI-33·42] runId(공유 링크)·usage(쿼터 표면화)를 성공 응답에 실어 보낸다 */
  | { ok: true; runId: string | null; usage: { used: number; limit: number | null; lifetime?: true } }
  | { ok: false; body: QuotaDeniedPayload }
> {
  return withUserQuotaLock(`ai:${email}`, async () => {
    const plan = await resolveQuotaPlan(email, sessionPlan);
    const quota = await checkAiAnalysisQuota(email, plan);
    if (!quota.allowed) {
      return {
        ok: false as const,
        body: quotaDeniedJson(quota.message, quota.requiredTier, quota.used, quota.limit),
      };
    }
    const run = await appendRun(input);
    return {
      ok: true as const,
      runId: (run as { id?: string } | null)?.id ?? null,
      usage: { used: quota.used + 1, limit: quota.limit, ...(quota.lifetime ? { lifetime: true as const } : {}) },
    };
  });
}

export async function checkExpertConsultQuota(
  email: string,
  profilePlan: string | null | undefined,
): Promise<
  | { allowed: true; used: number; limit: number | null }
  | { allowed: false; used: number; limit: number; requiredTier: AccessTier; message: string; code: "TIER" | "QUOTA_EXCEEDED" }
> {
  const accessTier = normalizeAccessPlan(profilePlan);
  const access = checkAccess(accessTier, "expert_consult");
  const used = await countConsultationsThisMonth(email);

  if (!access.allowed) {
    return {
      allowed: false,
      used,
      limit: 0,
      requiredTier: access.requiredTier,
      message: "전문가 상담은 PLUS 이상 멤버십에서 이용할 수 있습니다.",
      code: "TIER",
    };
  }

  const limit = access.limit;
  if (limit != null && used >= limit) {
    return {
      allowed: false,
      used,
      limit,
      requiredTier: "expert",
      message: `이번 달 전문가 상담 한도(${limit}회)를 모두 사용했습니다.`,
      code: "QUOTA_EXCEEDED",
    };
  }

  return { allowed: true, used, limit };
}

export async function checkBookmarkAddQuota(
  email: string,
  profilePlan: string | null | undefined,
  alreadyBookmarked: boolean,
): Promise<
  | { allowed: true; used: number; limit: number | null }
  | { allowed: false; used: number; limit: number; requiredTier: AccessTier; message: string; code: "QUOTA_EXCEEDED" }
> {
  const accessTier = profilePlanToAccessTier(profilePlan);
  const access = checkAccess(accessTier, "bookmark");
  const used = await countBookmarks(email);
  const tierLimit = limitFor(accessTier, "bookmark");

  if (alreadyBookmarked) {
    return { allowed: true, used, limit: tierLimit };
  }

  if (!access.allowed) {
    return {
      allowed: false,
      used,
      limit: 0,
      requiredTier: access.requiredTier,
      message: access.reason,
      code: "QUOTA_EXCEEDED",
    };
  }

  const limit = access.limit;
  if (limit != null && used >= limit) {
    return {
      allowed: false,
      used,
      limit,
      requiredTier: accessTier === "basic" ? "pro" : "expert",
      message: `북마크 한도(${limit}개)에 도달했습니다.`,
      code: "QUOTA_EXCEEDED",
    };
  }

  return { allowed: true, used, limit };
}

export async function checkWatchlistAddQuota(
  email: string,
  profilePlan: string | null | undefined,
  alreadyWatching: boolean,
): Promise<
  | { allowed: true; used: number; limit: number | null }
  | { allowed: false; used: number; limit: number; requiredTier: AccessTier; message: string; code: "QUOTA_EXCEEDED" }
> {
  const accessTier = profilePlanToAccessTier(profilePlan);
  const access = checkAccess(accessTier, "interest_complex");
  const used = await countWatchlist(email);
  const tierLimit = limitFor(accessTier, "interest_complex");

  if (alreadyWatching) {
    return { allowed: true, used, limit: tierLimit };
  }

  if (!access.allowed) {
    return {
      allowed: false,
      used,
      limit: 0,
      requiredTier: access.requiredTier,
      message: access.reason,
      code: "QUOTA_EXCEEDED",
    };
  }

  const limit = access.limit;
  if (limit != null && used >= limit) {
    return {
      allowed: false,
      used,
      limit,
      requiredTier: accessTier === "basic" ? "pro" : "expert",
      message: `관심 단지 한도(${limit}개)에 도달했습니다.`,
      code: "QUOTA_EXCEEDED",
    };
  }

  return { allowed: true, used, limit };
}

export { quotaDeniedResponseFields };
