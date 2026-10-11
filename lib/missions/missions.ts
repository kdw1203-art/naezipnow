import "server-only";

import { getServiceSupabase } from "@/lib/supabase/service";
import { kstParts } from "@/lib/format/kst";
import {
  readVerifiedOnboardingSteps,
  type RealOnboardingStep,
} from "@/app/api/me/onboarding/verify";

/* ============================================================
   [#119·#120] 미션 — 시작 3미션 + 주간 미션.
   원칙: 진행도는 **전부 기존 실데이터에서 파생**한다(전용 진행 테이블 없음).
   달성→적립은 point_ledger 의 refId 멱등으로 이중 지급을 막는다.
     시작 3미션: /my 허브의 온보딩 3스텝과 **같은 것**(app/api/me/onboarding/verify.ts)
                — 관심 단지·지역 알림 1개(user_watchlist) · 첫 임장노트 1편 · 노트 1편 공개
                → 전부 달성 시 onboarding_complete(200P, once). 청구는 getVerifiedOnboarding 이 멱등 지급.
                [1056 · A3] 예전엔 여기서 다른 3개(관심 단지·키워드 알림·노트)를 세면서 같은 200P
                를 청구했다 — 두 체크리스트 중 먼저 끝난 쪽이 받고, 다른 쪽은 미완인데 "적립 완료"였다.
     주간 미션(ISO 주 단위 리셋): 노트 1편 · 출석 3회 · 관심 단지 +2곳
                → 각 달성 시 weekly_mission(50P) 청구, refId=주차:키 멱등
   ============================================================ */

/* [1056 · A3] 시작 3미션의 표시 정의 — 순서·id 는 verify.ts 의 REAL_ONBOARDING_STEPS 와 같다 */
export const START_MISSION_DEFS: ReadonlyArray<{
  key: RealOnboardingStep;
  label: string;
  desc: string;
  href: string;
}> = [
  {
    key: "explore",
    label: "관심 단지 또는 지역 알림 1개",
    desc: "지도·단지 페이지의 관심 담기 또는 지역 알림 구독",
    href: "/map",
  },
  {
    key: "inspection",
    label: "첫 임장노트 1편",
    desc: "현장 퀵모드로 사진·메모만 저장해도 1편",
    href: "/notes/new?quick=1",
  },
  {
    key: "share",
    label: "임장노트 1편 공개",
    desc: "내 노트 목록에서 공개로 전환",
    href: "/notes?mine=1",
  },
];

export type MissionState = {
  key: string;
  label: string;
  desc: string;
  href: string;
  target: number;
  progress: number;
  done: boolean;
  /** 이미 적립까지 끝났는가 (claim 버튼 상태) */
  claimed: boolean;
  points: number;
};

/* [1055] 한국 날짜로 주를 센다 — 예전엔 서버(UTC) 날짜라 월요일 00~09시(KST)엔 지난주 키·지난주 시작이었다(이미 받은 주에 다시 셈) */
function kstDateUtc(d: Date): Date {
  const p = kstParts(d);
  return p ? new Date(Date.UTC(p.year, p.month - 1, p.day)) : new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

export function isoWeekKey(d = new Date()): string {
  // ISO 주차 (목요일 규칙) — apply 캘린더의 주 슬러그와 같은 계산 철학
  const t = kstDateUtc(d);
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((t.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${t.getUTCFullYear()}-w${String(week).padStart(2, "0")}`;
}

function isoWeekStartIso(d = new Date()): string {
  /* 한국 월요일 0시 = UTC 일요일 15:00 */
  const t = kstDateUtc(d);
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() - day + 1);
  return new Date(t.getTime() - 9 * 3_600_000).toISOString();
}

async function alreadyAwardedRef(
  email: string,
  reason: string,
  refId: string | null,
): Promise<boolean> {
  const sb = getServiceSupabase();
  if (!sb) return false;
  let q = sb
    .from("point_ledger")
    .select("id", { count: "exact", head: true })
    .eq("user_email", email)
    .eq("reason", reason);
  if (refId !== null) q = q.eq("ref_id", refId);
  const { count } = await q;
  return (count ?? 0) > 0;
}

export type MissionBoard = {
  start: MissionState[];
  startAllDone: boolean;
  startClaimed: boolean;
  weekKey: string;
  weekly: MissionState[];
};

/** 진행도 계산 — 조회 실패 시 throw (호출부가 접는다). */
export async function buildMissionBoard(email: string): Promise<MissionBoard> {
  const sb = getServiceSupabase();
  if (!sb) throw new Error("서비스 클라이언트 미구성");
  const weekKey = isoWeekKey();
  const weekStart = isoWeekStartIso();

  const [verifiedSteps, notesWeek, attendWeek, watchWeek, startClaimed, aiRunsAll, aiClaimed] =
    await Promise.all([
      /* [1056 · A3] 시작 3미션 = /my 허브의 온보딩 3스텝과 같은 질의(verify.ts) */
      readVerifiedOnboardingSteps(email),
      sb.from("inspection_notes").select("id", { count: "exact", head: true }).eq("author_email", email).gte("created_at", weekStart),
      sb.from("point_ledger").select("id", { count: "exact", head: true }).eq("user_email", email).eq("reason", "attendance").gte("created_at", weekStart),
      /* [1056 · A4] 지역 알림 구독도 user_watchlist 에 `alert:region:*` 행으로 들어간다 — "관심 단지 2곳"에 세면 안 된다 */
      sb
        .from("user_watchlist")
        .select("complex_id", { count: "exact", head: true })
        .eq("user_email", email)
        .not("complex_id", "like", "alert:%")
        .gte("created_at", weekStart),
      alreadyAwardedRef(email, "onboarding_complete", null),
      /* [AI-39] 첫 AI 분석 — 워크벤치 실행 기록 */
      sb.from("ai_analysis_runs").select("id", { count: "exact", head: true }).eq("author_email", email),
      alreadyAwardedRef(email, "ai_first", null),
    ]);
  for (const r of [notesWeek, attendWeek, watchWeek]) {
    if ((r as { error?: unknown }).error) throw new Error("미션 진행도 조회 실패");
  }
  const n = (r: { count: number | null }) => r.count ?? 0;

  const doneSteps = new Set<RealOnboardingStep>(verifiedSteps);
  const start: MissionState[] = START_MISSION_DEFS.map((d) => ({
    key: d.key,
    label: d.label,
    desc: d.desc,
    href: d.href,
    target: 1,
    progress: doneSteps.has(d.key) ? 1 : 0,
    done: doneSteps.has(d.key),
    claimed: startClaimed,
    points: 0,
  }));
  /* 시작 3미션 완주 판정(200P 조건) — [AI-39] 4번째 줄은 별도 100P 미션으로 뒤에 붙인다. */
  const startAllDone = start.every((m) => m.done);
  start.push({
    key: "first_ai",
    label: "첫 AI 분석 1회",
    desc: "단지 하나 고르면 실거래·전월세·공급 자료로 1분 진단.",
    href: "/analysis",
    target: 1,
    progress: Math.min(1, n(aiRunsAll)),
    done: n(aiRunsAll) >= 1,
    claimed: aiClaimed,
    points: 100,
  });

  const weeklyDefs = [
    {
      key: "note1",
      label: "임장노트 1편",
      /* [1056] 권유문 → 사실 */
      desc: "이번 주 저장한 임장노트 1편",
      href: "/notes/new?quick=1",
      target: 1,
      progress: n(notesWeek),
    },
    {
      key: "attend3",
      label: "출석 3회",
      desc: "이번 주 출석 3일 · 연속이 아니어도 됨",
      href: "/my/points",
      target: 3,
      progress: n(attendWeek),
    },
    {
      key: "watch2",
      label: "관심 단지 2곳 추가",
      /* [1056 · A4] 권유문("담아 보세요") → 사실 · 지역 알림은 세지 않는다는 기준을 적는다 */
      desc: "이번 주 새로 담은 관심 단지 2곳 · 지역 알림 구독은 제외",
      href: "/map",
      target: 2,
      progress: n(watchWeek),
    },
  ];
  const weekly: MissionState[] = await Promise.all(
    weeklyDefs.map(async (d) => ({
      ...d,
      done: d.progress >= d.target,
      claimed: await alreadyAwardedRef(email, "weekly_mission", `${weekKey}:${d.key}`),
      points: 50,
    })),
  );

  return { start, startAllDone, startClaimed, weekKey, weekly };
}
