import { NextResponse } from "next/server";
import { safeAuth } from "@/lib/safe-auth";
import { getAttendanceHistory, kstDateString } from "@/lib/points/store-db";
import { currentStreak, latestAttendance, nextAttendanceReward } from "@/lib/points/attendance-rules";
import { getBalance } from "@/lib/points/ledger";
import { buildMissionBoard } from "@/lib/missions/missions";
import { loadMeProfile } from "@/lib/me/profile";
import { getOnboardingPersonalization } from "@/lib/onboarding/personalization";
import { logger } from "@/lib/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* [1056] 홈 "오늘의 활동" 카드 한 번의 조회 — 출석(스트릭·다음 지급액) · 포인트 잔액 ·
   이번 주 미션 진행 · 시작 3미션 · 관심지역 설정 여부.
   예전 홈 카드(HomeEngagementCard, 한 번도 홈에 붙지 않은 고아 컴포넌트)는 출석·포인트·
   온보딩 세 API 를 따로 불렀고, 관심지역 판정을 `steps.includes("profile_region")` 로
   했는데 그 배열(explore/inspection/share)에 그 값은 없어 늘 "미설정"이었다.
   조회 하나가 실패해도 나머지는 내려보낸다(실패한 칸은 null) — 카드가 통째로 사라지지 않게. */
export type EngagementPayload = {
  attendance: { checkedToday: boolean; streak: number; nextReward: 10 | 20 | 50; lastDate: string | null } | null;
  balance: number | null;
  missions: {
    weekDone: number;
    weekTotal: number;
    /** 달성했지만 아직 적립 청구를 안 한 주간 미션 수 */
    claimable: number;
    startDone: number;
    startTotal: number;
    startClaimed: boolean;
  } | null;
  regionsSet: boolean | null;
};

export async function GET() {
  const session = await safeAuth();
  const email = session?.user?.email;
  if (!email) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const today = kstDateString();
  const [att, bal, board, profile, personalization] = await Promise.all([
    getAttendanceHistory(email, 30).then(
      (rows) => ({
        checkedToday: rows.some((r) => r.date === today),
        streak: currentStreak(rows, today),
        nextReward: nextAttendanceReward(rows, today),
        lastDate: latestAttendance(rows)?.date ?? null,
      }),
      (e: unknown) => {
        logger.warn("[api/me/engagement] 출석 조회 실패", e);
        return null;
      },
    ),
    getBalance(email).then(
      (b) => b,
      (e: unknown) => {
        logger.warn("[api/me/engagement] 잔액 조회 실패", e);
        return null;
      },
    ),
    buildMissionBoard(email).then(
      (b) => ({
        weekDone: b.weekly.filter((m) => m.done).length,
        weekTotal: b.weekly.length,
        claimable: b.weekly.filter((m) => m.done && !m.claimed).length,
        startDone: b.start.filter((m) => m.key !== "first_ai" && m.done).length,
        startTotal: b.start.filter((m) => m.key !== "first_ai").length,
        startClaimed: b.startClaimed,
      }),
      (e: unknown) => {
        logger.warn("[api/me/engagement] 미션 조회 실패", e);
        return null;
      },
    ),
    loadMeProfile(email).then(
      (p) => p,
      () => null,
    ),
    getOnboardingPersonalization(email).then(
      (p) => p,
      () => null,
    ),
  ]);

  const regionsSet =
    profile === null && personalization === null
      ? null
      : Boolean(profile?.primaryRegion) || (personalization?.regions?.length ?? 0) > 0;

  const payload: EngagementPayload = { attendance: att, balance: bal, missions: board, regionsSet };
  return NextResponse.json(payload, {
    headers: { "Cache-Control": "private, no-store" },
  });
}
