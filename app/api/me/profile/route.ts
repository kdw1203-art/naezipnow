import { NextResponse } from "next/server";
import { logger } from "@/lib/log";
import { safeAuth } from "@/lib/safe-auth";
import { appendOnboardingStep } from "@/lib/onboarding/append-step";
import { loadMeProfile, normalizePersona } from "@/lib/me/profile";
import { getServiceSupabase } from "@/lib/supabase/service";
import { scheduleProfileInvalidation } from "@/lib/town/invalidate-town";
import { invalidatePathList } from "@/lib/cache/invalidate";
import { profilePaths } from "@/lib/town/changed-town-paths";
import { isHandleConflict, validateBio, validateHandle } from "@/lib/account/profile-handle";

export const runtime = "nodejs";

/** GET /api/me/profile — 현재 사용자 프로필 조회 */
export async function GET() {
  const session = await safeAuth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  const profile = await loadMeProfile(session.user.email, {
    name: session.user.name,
    plan: (session.user as { plan?: string }).plan,
    role: (session.user as { role?: string }).role,
  });

  return NextResponse.json({ profile });
}

/**
 * PATCH /api/me/profile — 프로필 업데이트.
 *
 * [1058] 저장 자리가 둘이다:
 *   · app_users: name · avatar_url · persona · primary_region · intent_horizon
 *   · profiles(공개 프로필 /u/[handle] 이 읽는 표): full_name(=name) · handle · bio
 * 예전엔 bio·phone·location 을 app_users 에 쓰려 했다 — 그 표에 그런 컬럼이 없어 보내면 500 이었고,
 * 공개 프로필의 이름(profiles.full_name)·핸들·소개는 가입 뒤 아무도 쓰지 않았다(새 글의 이름은
 * lib/account/display-name 이 app_users.name 을 먼저 읽는다).
 */
export async function PATCH(req: Request) {
  const session = await safeAuth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "JSON이 필요합니다." }, { status: 400 });
  }

  const email = session.user.email;
  const lowerEmail = email.trim().toLowerCase();
  const updates: Record<string, unknown> = {};
  /* profiles 표에 갈 값 — 키가 있으면 그 컬럼을 쓴다 */
  const publicUpdates: { full_name?: string; handle?: string | null; bio?: string } = {};

  if (typeof body.name === "string") {
    const name = body.name.replace(/\s+/g, " ").trim();
    if (name.length < 1 || name.length > 50) {
      return NextResponse.json({ error: "이름은 1~50자" }, { status: 400 });
    }
    updates.name = name;
    publicUpdates.full_name = name;
  }

  /* [1058] 핸들 — 소문자 [a-z0-9_]{3,20} · 예약어 금지 · 빈 값은 null(핸들 없음) */
  if (body.handle !== undefined) {
    const v = validateHandle(body.handle === null ? "" : String(body.handle));
    if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });
    publicUpdates.handle = v.handle;
  }

  /* [1058] 소개 — 120자 · 빈 값은 ''(profiles.bio NOT NULL). 예전엔 app_users.bio(없는 컬럼)로 보내 500 */
  if (body.bio !== undefined) {
    const v = validateBio(body.bio === null ? "" : String(body.bio));
    if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });
    publicUpdates.bio = v.bio;
  }

  if (typeof body.avatarUrl === "string") {
    const url = body.avatarUrl.trim();
    if (url.startsWith("http://") || url.startsWith("https://") || url.startsWith("data:image/")) {
      updates.avatar_url = url;
    }
  }

  if (body.persona !== undefined) {
    const p = normalizePersona(
      body.persona === null || body.persona === "" ? null : String(body.persona),
    );
    updates.persona = p;
  }
  if (body.primaryRegion !== undefined) {
    const r = String(body.primaryRegion ?? "").trim().slice(0, 80);
    updates.primary_region = r || null;
  }
  if (body.intentHorizon !== undefined) {
    const h = String(body.intentHorizon ?? "").trim().slice(0, 32);
    updates.intent_horizon = h || null;
  }

  if (Object.keys(updates).length === 0 && Object.keys(publicUpdates).length === 0) {
    return NextResponse.json({ error: "변경할 내용 없음" }, { status: 400 });
  }

  const regionSaved =
    body.primaryRegion !== undefined &&
    String(updates.primary_region ?? "").trim().length > 0;

  const sb = getServiceSupabase();
  if (!sb) {
    // Supabase 미설정 — 세션 기반 프로필 반환
    const profile = await loadMeProfile(email, {
      name: String(updates.name ?? session.user.name ?? ""),
      plan: (session.user as { plan?: string }).plan,
      role: (session.user as { role?: string }).role,
    });
    return NextResponse.json({ profile, warning: "DB 미연결 · 변경사항이 저장되지 않음" });
  }

  if (Object.keys(updates).length > 0) {
    const dbUpdates: Record<string, unknown> = {
      ...updates,
      updated_at: new Date().toISOString(),
    };
    const { error } = await sb.from("app_users").update(dbUpdates).eq("email", lowerEmail);
    if (error) {
      logger.error("[api/me/profile] app_users 저장 실패", error.message);
      return NextResponse.json({ error: "프로필 저장 실패 · 잠시 후 다시" }, { status: 500 });
    }
  }

  /* [1058] 공개 프로필 표(profiles) — 옛 핸들·이름을 먼저 읽어 둔다(바뀌면 옛 주소 /u/옛값 도 비워야 한다) */
  let previous: { handle: string | null; full_name: string | null } | null = null;
  if (Object.keys(publicUpdates).length > 0) {
    const prev = await sb
      .from("profiles")
      .select("email, handle, full_name")
      .in("email", [...new Set([email.trim(), lowerEmail])])
      .limit(1);
    if (prev.error) {
      logger.error("[api/me/profile] profiles 조회 실패", prev.error.message);
      return NextResponse.json({ error: "프로필 저장 실패 · 잠시 후 다시" }, { status: 500 });
    }
    const row = prev.data?.[0] as { email?: string; handle?: string | null; full_name?: string | null } | undefined;
    if (!row) {
      /* 가입 트리거가 모든 auth 사용자에게 profiles 행을 만든다 — 없으면 사실대로 */
      logger.error("[api/me/profile] profiles 행 없음", lowerEmail);
      return NextResponse.json({ error: "공개 프로필 없음 · 잠시 후 다시" }, { status: 500 });
    }
    previous = { handle: row.handle ?? null, full_name: row.full_name ?? null };
    const { error } = await sb
      .from("profiles")
      .update({ ...publicUpdates, updated_at: new Date().toISOString() })
      .eq("email", String(row.email ?? lowerEmail));
    if (error) {
      /* 핸들 유니크(lower(handle)) 위반 — 23505 또는 인덱스 이름이 든 메시지 */
      if (isHandleConflict(error)) {
        return NextResponse.json({ error: "이미 쓰는 핸들" }, { status: 409 });
      }
      logger.error("[api/me/profile] profiles 저장 실패", error.message);
      return NextResponse.json({ error: "프로필 저장 실패 · 잠시 후 다시" }, { status: 500 });
    }
  }

  if (regionSaved) {
    void appendOnboardingStep(email, "explore");
  }

  /* [1010 · 동네축] 공개 프로필(/u/{handle}) 은 app_users.avatar_url·profiles.full_name·handle·bio 를 서버에서
     그린다(ISR 하루). [1058] 이름·핸들·소개가 바뀌어도 비운다 — 예전엔 사진만 비웠고, 이름은 쓰기 경로가 없었다.
     핸들·이름이 **바뀌기 전** 주소(/u/옛핸들·/u/옛이름)도 같이 비운다 — 헬퍼는 새 값으로만 주소를 만든다. */
  if (updates.avatar_url !== undefined || Object.keys(publicUpdates).length > 0) {
    scheduleProfileInvalidation(email);
    if (previous) {
      const stale = profilePaths([previous.handle, previous.full_name]);
      if (stale.length > 0) {
        try {
          invalidatePathList(stale, { label: "profile-prev" });
        } catch (e) {
          logger.warn("[api/me/profile] 옛 프로필 주소 재검증 실패(무시)", e);
        }
      }
    }
  }

  const profile = await loadMeProfile(email, {
    name: String(updates.name ?? session.user.name ?? ""),
    plan: (session.user as { plan?: string }).plan,
    role: (session.user as { role?: string }).role,
  });

  return NextResponse.json({ profile });
}
