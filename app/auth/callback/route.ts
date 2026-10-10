import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getSupabasePublicKey, getSupabaseUrl } from "@/lib/supabase/env";
import { DEFAULT_DESKTOP_ORIGIN } from "@/lib/platform-shell";
import { safeInternalPath } from "@/lib/safe-path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Supabase Auth 이메일 확인·매직링크 콜백.
 *
 * 인증 메일 링크 → Supabase verify → 여기로 redirect(?code=…).
 * 세션 쿠키를 심은 뒤 /login?verified=1 로 보낸다.
 *
 * Site URL / Redirect URLs 에 반드시 등록:
 *   https://naezipnow.com/auth/callback
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  /* `!startsWith("//")` 만으로는 `/\evil.com` 이 통과한다 — lib/safe-path.ts 참고.
     인증 메일 링크가 출발점이라, 여기가 뚫리면 "우리 도메인에서 시작하는" 피싱이 된다. */
  const next = safeInternalPath(
    searchParams.get("next"),
    "/login?verified=1",
  );

  const url = getSupabaseUrl();
  const key = getSupabasePublicKey();
  if (!url || !key) {
    return NextResponse.redirect(new URL("/login?error=config", origin));
  }

  if (code) {
    const cookieStore = await cookies();
    const supabase = createServerClient(url, key, {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            /* ignore — route handler 외에서 set 불가한 경우 */
          }
        },
      },
    });

    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      const fail = new URL("/login", DEFAULT_DESKTOP_ORIGIN);
      fail.searchParams.set("error", "verify_failed");
      return NextResponse.redirect(fail);
    }
  }

  /* 운영에서는 항상 canonical 도메인으로 — preview 호스트에 세션이 남는 걸 막는다 */
  const base =
    process.env.VERCEL_ENV === "production" ? DEFAULT_DESKTOP_ORIGIN : origin;
  /* [1053] 가입 확인 링크(next = /login?verified=1…)면 확인 화면으로 한 번 더 — 거기서 방금 심은 세션으로 자동 로그인
     (Credentials "email-confirm"). 실패하면 그 화면이 예전 목적지(next)로 보낸다 */
  if (code && next.startsWith("/login?verified=1")) {
    const finish = new URL("/auth/confirm", base);
    finish.searchParams.set("finish", "1");
    finish.searchParams.set("next", next);
    return NextResponse.redirect(finish);
  }
  return NextResponse.redirect(new URL(next, base));
}
