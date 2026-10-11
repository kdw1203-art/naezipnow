import "server-only";
import { getServiceSupabase } from "@/lib/supabase/service";
import { awardPoints } from "@/lib/points/ledger";
import { logger } from "@/lib/log";

/**
 * 온보딩 "진짜 3스텝"의 서버 판정.
 *
 * 예전에는 /welcome 위저드가 화면을 넘길 때마다 explore/inspection/share 를
 * PATCH 로 기록해서, 아무 행동도 하지 않은 사용자가 3분 만에 3/3 완주(+200P)가
 * 됐다. 이제 스텝 완료는 클라이언트 신고가 아니라 **실데이터**로 판정한다:
 *
 *  - explore    : user_watchlist 에 행 존재 (관심 단지 or `alert:` 접두 지역·키워드 구독)
 *  - inspection : inspection_notes 에 내 노트 존재
 *  - share      : inspection_notes 에 내 공개(is_public) 노트 존재
 *
 * 200P 완주 보너스도 여기서만, 서버 판정 3/3일 때 지급한다.
 * 멱등성은 원장(point_ledger)의 once 룰(onboarding_complete)이 보장한다.
 */

export const REAL_ONBOARDING_STEPS = ["explore", "inspection", "share"] as const;
export type RealOnboardingStep = (typeof REAL_ONBOARDING_STEPS)[number];

export type VerifiedOnboarding = {
  completedSteps: RealOnboardingStep[];
  completedAt: string | null;
  isComplete: boolean;
  total: number;
  /** 이번 호출에서 실제 지급된 완주 보너스 (이미 받았으면 0) */
  bonusAwarded: number;
};

const EMPTY: VerifiedOnboarding = {
  completedSteps: [],
  completedAt: null,
  isComplete: false,
  total: REAL_ONBOARDING_STEPS.length,
  bonusAwarded: 0,
};

/**
 * [1056 · A3] 3스텝 판정 조회만 — 지급 없음. /my 허브(getVerifiedOnboarding)와 미션 센터의
 * "시작 3미션"(lib/missions/missions.ts)이 **같은 질의**로 같은 사실을 보게 하기 위해 분리했다.
 * 예전엔 미션 쪽이 다른 3개(관심 단지·키워드 알림·노트)를 세면서 같은 onboarding_complete 200P
 * 를 청구해, 어느 쪽이 먼저 끝나든 다른 쪽은 자기 항목이 미완인데도 "적립 완료"가 됐다.
 * 조회 실패는 던진다(호출부가 "진행도 불러오기 실패"로 접는다).
 */
export async function readVerifiedOnboardingSteps(email: string): Promise<RealOnboardingStep[]> {
  const sb = getServiceSupabase();
  const em = email.trim().toLowerCase();
  if (!sb || !em) return [];
  // watchlist·노트 적재 경로는 세션 이메일 원문을 그대로 쓰므로 두 표기를 모두 조회
  const emailForms = [...new Set([em, email.trim()])];
  const [watchlistRes, noteRes, publicNoteRes] = await Promise.all([
    sb
      .from("user_watchlist")
      .select("id", { count: "exact", head: true })
      .in("user_email", emailForms),
    sb
      .from("inspection_notes")
      .select("id", { count: "exact", head: true })
      .in("author_email", emailForms),
    sb
      .from("inspection_notes")
      .select("id", { count: "exact", head: true })
      .in("author_email", emailForms)
      .eq("is_public", true),
  ]);
  for (const r of [watchlistRes, noteRes, publicNoteRes]) {
    if (r.error) throw new Error(`온보딩 3스텝 조회 실패: ${r.error.message}`);
  }
  const completedSteps: RealOnboardingStep[] = [];
  if ((watchlistRes.count ?? 0) > 0) completedSteps.push("explore");
  if ((noteRes.count ?? 0) > 0) completedSteps.push("inspection");
  if ((publicNoteRes.count ?? 0) > 0) completedSteps.push("share");
  return completedSteps;
}

export async function getVerifiedOnboarding(email: string): Promise<VerifiedOnboarding> {
  const sb = getServiceSupabase();
  const em = email.trim().toLowerCase();
  if (!sb || !em) return EMPTY;

  try {
    const [completedSteps, userRes] = await Promise.all([
      readVerifiedOnboardingSteps(email),
      sb
        .from("app_users")
        .select("onboarding_completed_at")
        .eq("email", em)
        .maybeSingle(),
    ]);

    const isComplete = completedSteps.length >= REAL_ONBOARDING_STEPS.length;
    let completedAt: string | null = userRes.data?.onboarding_completed_at
      ? String(userRes.data.onboarding_completed_at)
      : null;

    let bonusAwarded = 0;
    if (isComplete) {
      // 완주 시각 기록 (최초 1회) — 실패해도 판정 자체는 유지
      if (!completedAt) {
        completedAt = new Date().toISOString();
        const { error } = await sb
          .from("app_users")
          .update({ onboarding_completed_at: completedAt })
          .eq("email", em)
          .is("onboarding_completed_at", null);
        if (error) logger.warn("[onboarding:verify] completed_at update", error.message);
      }
      // 200P 완주 보너스 — once 룰이 중복 지급을 막는다 (멱등)
      try {
        const res = await awardPoints(em, "onboarding_complete");
        bonusAwarded = res.awarded;
      } catch (e) {
        logger.warn("[onboarding:verify] bonus award", e);
      }
    }

    return {
      completedSteps,
      completedAt,
      isComplete,
      total: REAL_ONBOARDING_STEPS.length,
      bonusAwarded,
    };
  } catch (e) {
    logger.warn("[onboarding:verify]", e);
    return EMPTY;
  }
}
