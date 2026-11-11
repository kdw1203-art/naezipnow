import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { safeAuth } from "@/lib/safe-auth";
import { getServiceSupabase } from "@/lib/supabase/service";
import { promoState, sanitizePromo } from "@/lib/experts/promo";
import { logger } from "@/lib/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* [1144 · 전문가 홍보] 내 홍보 글(한 줄 · 설명 · 켬/끔)과 상태(무료 N일 남음 · 구독 중 · 종료) — 승인된 전문가 본인만. */
async function mine(email: string) {
  const sb = getServiceSupabase();
  if (!sb) throw new Error("저장소 미구성");
  const owner = email.trim().toLowerCase();
  const [p, u] = await Promise.all([
    sb.from("expert_profiles").select("*").eq("owner_email", owner).maybeSingle(),
    sb.from("app_users").select("plan, plan_expires_at").eq("email", owner).maybeSingle(),
  ]);
  if (p.error) throw new Error(`expert_profiles 조회 실패: ${p.error.message}`);
  return { sb, profile: (p.data ?? null) as Record<string, unknown> | null, user: (u.data ?? null) as Record<string, unknown> | null };
}

function view(profile: Record<string, unknown>, user: Record<string, unknown> | null) {
  const state = promoState({
    createdAt: profile.created_at ? String(profile.created_at) : null,
    plan: user?.plan ? String(user.plan) : null,
    planExpiresAt: user?.plan_expires_at ? String(user.plan_expires_at) : null,
    now: new Date().toISOString(),
  });
  return {
    verified: profile.is_verified === true,
    /* 열 추가(sql 213) 전이면 저장할 곳이 없다 */
    ready: "promo_headline" in profile,
    headline: typeof profile.promo_headline === "string" ? profile.promo_headline : "",
    body: typeof profile.promo_body === "string" ? profile.promo_body : "",
    on: profile.promo_on !== false,
    state,
  };
}

export async function GET() {
  const session = await safeAuth();
  const email = session?.user?.email;
  if (!email) return NextResponse.json({ error: "로그인 필요" }, { status: 401 });
  try {
    const { profile, user } = await mine(email);
    if (!profile) return NextResponse.json({ error: "전문가 프로필 없음" }, { status: 404 });
    return NextResponse.json(view(profile, user), { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    logger.warn("[expert-promo] 조회 실패", e);
    return NextResponse.json({ error: "홍보 설정 불러오기 실패 · 잠시 후 다시" }, { status: 503 });
  }
}

export async function POST(req: Request) {
  const session = await safeAuth();
  const email = session?.user?.email;
  if (!email) return NextResponse.json({ error: "로그인 필요" }, { status: 401 });
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "요청 형식 확인" }, { status: 400 });
  const v = sanitizePromo(body);
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });
  try {
    const { sb, profile, user } = await mine(email);
    if (!profile) return NextResponse.json({ error: "전문가 프로필 없음" }, { status: 404 });
    if (profile.is_verified !== true) return NextResponse.json({ error: "승인된 전문가만 홍보 글을 쓸 수 있음" }, { status: 403 });
    const { data, error } = await sb
      .from("expert_profiles")
      .update({ promo_headline: v.value.headline, promo_body: v.value.body, promo_on: v.value.on, updated_at: new Date().toISOString() })
      .eq("id", String(profile.id))
      .select("*")
      .maybeSingle();
    if (error || !data) throw new Error(error?.message ?? "저장된 행 없음");
    revalidateTag("verified-experts");
    return NextResponse.json({ ok: true, ...view(data as Record<string, unknown>, user) });
  } catch (e) {
    logger.warn("[expert-promo] 저장 실패", e);
    return NextResponse.json({ error: "홍보 설정 저장 실패 · 잠시 후 다시" }, { status: 503 });
  }
}
