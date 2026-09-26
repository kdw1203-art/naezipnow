/**
 * GET  /api/me/preferences — 내 개인화 조회
 *        · personalization: 온보딩 관심 지역·예산·목적 { regions, budget, purpose }
 *        · preferences:     페르소나·우선순위(4축)
 *        · uiPrefs:         [1006] 표시·기록 기본값(UiPrefs — lib/prefs/ui-prefs.ts).
 *                           **항상 있다** — 비로그인·행 없음·조회 실패 전부 DEFAULT_UI_PREFS.
 *        · authenticated:   [1006] 세션 유무 — 설정 화면이 게스트 카드를 가를 때 쓴다
 * POST /api/me/preferences — 온보딩 개인화 저장 { regions, budget, purpose }
 * PUT  /api/me/preferences — 페르소나·우선순위 부분 업데이트(기존)
 * PATCH /api/me/preferences — [1006] 표시·기록 기본값 부분 저장 { uiPrefs: {...} } → { uiPrefs }
 * 비로그인: GET 은 빈 값(graceful), POST/PUT/PATCH 은 401.
 */
import { NextResponse } from "next/server";
import { safeAuth } from "@/lib/safe-auth";
import { getPreferences, getUiPrefs, putPreferences, putUiPrefs } from "@/lib/me/preferences-store";
import { parseUiPrefsPatch } from "@/lib/me/ui-prefs-request";
import { DEFAULT_UI_PREFS } from "@/lib/prefs/ui-prefs";
import type { PersonaId, PriorityWeights } from "@/lib/personalization/store";
import {
  getOnboardingPersonalization,
  saveOnboardingPersonalization,
} from "@/lib/onboarding/personalization";
import { logger } from "@/lib/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await safeAuth();
  const email = session?.user?.email;
  if (!email) {
    // 비로그인 — 정적/게스트 환경에서도 안전하게 빈 값 반환
    return NextResponse.json({
      authenticated: false,
      preferences: null,
      personalization: null,
      regions: [],
      budget: null,
      purpose: null,
      uiPrefs: DEFAULT_UI_PREFS,
    });
  }
  const [preferences, personalization, uiPrefs] = await Promise.all([
    getPreferences(email),
    getOnboardingPersonalization(email),
    /* 읽기는 실패해도 기본값으로 접는다(화면이 기본값으로 뜬다) — 쓰기(PATCH)는 접지 않는다(M1) */
    getUiPrefs(email).catch((err: unknown) => {
      logger.warn("[api/me/preferences] ui_prefs 조회 실패 — 기본값으로 응답", err);
      return DEFAULT_UI_PREFS;
    }),
  ]);
  return NextResponse.json({
    authenticated: true,
    preferences,
    personalization,
    regions: personalization?.regions ?? [],
    budget: personalization?.budget ?? null,
    purpose: personalization?.purpose ?? null,
    uiPrefs,
  });
}

/** [1006] 표시·기록 기본값 부분 저장 — body { uiPrefs: Partial<UiPrefs> }. 검증은 parseUiPrefsPatch. */
export async function PATCH(req: Request) {
  const session = await safeAuth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }
  const parsed = parseUiPrefsPatch(body);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }
  try {
    const uiPrefs = await putUiPrefs(session.user.email, parsed.patch);
    return NextResponse.json({ uiPrefs });
  } catch (err) {
    /* 저장 실패는 실패로 — 200 에 기본값을 돌려주면 화면이 "저장했어요" 를 띄운다 */
    logger.error("[api/me/preferences] ui_prefs 저장 실패", err);
    return NextResponse.json(
      { error: "저장에 실패했어요. 잠시 후 다시 시도해 주세요." },
      { status: 500 },
    );
  }
}

/** 온보딩 개인화 저장 — body: { regions:[], budget:{type,min,max,label}, purpose } */
export async function POST(req: Request) {
  const session = await safeAuth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }
  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }
  const personalization = await saveOnboardingPersonalization(session.user.email, {
    regions: body.regions,
    budget: body.budget,
    purpose: body.purpose,
    /* 타깃 페르소나(실전 투자자/실수요자/스터디 크루/탐색 중) — 방향성 리밸런싱.
       sanitizePersona 화이트리스트로 거른다. user_personalization jsonb 라 마이그레이션 불필요. */
    persona: body.persona,
    /* 가입 화면 기본 정보(나이대·성별·가구·직업·생애최초·보유 주택).
       예전엔 /signup 이 물어만 보고 아무 데도 보내지 않아 통째로 버려졌다.
       허용 항목·값은 sanitizeProfile 이 화이트리스트로 거른다. */
    profile: body.profile,
  });
  return NextResponse.json({
    personalization,
    regions: personalization.regions,
    budget: personalization.budget,
    purpose: personalization.purpose,
    persona: personalization.persona,
  });
}

/** 페르소나·우선순위 부분 업데이트 (기존 계약 유지) */
export async function PUT(req: Request) {
  const session = await safeAuth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }
  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }
  const prefs = await putPreferences(session.user.email, {
    persona: (body.persona as PersonaId | null | undefined) ?? undefined,
    priorities: body.priorities as Partial<PriorityWeights> | undefined,
    holdingYears:
      body.holdingYears != null
        ? Number(body.holdingYears)
        : (body.holdingYears as null | undefined),
    riskTolerance:
      body.riskTolerance != null
        ? Number(body.riskTolerance)
        : (body.riskTolerance as null | undefined),
  });
  return NextResponse.json({ preferences: prefs });
}
