import { NextResponse } from "next/server";
import { safeAuth } from "@/lib/safe-auth";
import { canAccessAdminConsole } from "@/lib/auth/staff-roles";
import { getServiceSupabase } from "@/lib/supabase/service";
import { keyRateLimit, memoryKeyRateLimit } from "@/lib/rate-limit";
import { authSecret, readAdminTotp } from "@/lib/auth/admin-2fa";
import { ADMIN_2FA_COOKIE, ADMIN_2FA_TTL_SEC, checkAdmin2fa, generateTotpSecret, otpauthUrl, sealSecret, signAdmin2fa, verifyTotp } from "@/lib/auth/totp";
import { encodeQr } from "@/lib/qr/encode";
import { qrSvgString } from "@/lib/qr/svg";
import { logger } from "@/lib/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* [1147] 관리자 2단계 인증 — 상태 · 등록 시작(비밀값 발급) · 번호 확인. 관리자 콘솔 권한이 있는 로그인만.
   비밀값은 등록을 마치기 전(enabled=false)에만 다시 보여 준다 — 마친 뒤에는 어디에도 내보내지 않는다. */
async function who() {
  const session = await safeAuth();
  const email = session?.user?.email?.trim().toLowerCase() ?? "";
  return email && canAccessAdminConsole(session) ? email : null;
}

export async function GET(req: Request) {
  const email = await who();
  if (!email) return NextResponse.json({ error: "관리자 로그인 필요" }, { status: 403 });
  try {
    const row = await readAdminTotp(email);
    const cookie = req.headers.get("cookie")?.match(new RegExp(`${ADMIN_2FA_COOKIE}=([^;]+)`))?.[1] ?? null;
    return NextResponse.json(
      { enrolled: Boolean(row?.enabled), pending: Boolean(row && !row.enabled), verified: checkAdmin2fa(cookie, email, authSecret(), Date.now()) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    logger.warn("[admin-2fa] 상태 조회 실패", e);
    return NextResponse.json({ error: "2단계 인증 상태 불러오기 실패 · 잠시 후 다시" }, { status: 503 });
  }
}

export async function POST(req: Request) {
  const email = await who();
  if (!email) return NextResponse.json({ error: "관리자 로그인 필요" }, { status: 403 });
  const secretKey = authSecret();
  const sb = getServiceSupabase();
  if (!secretKey || !sb) return NextResponse.json({ error: "서버 설정 확인 필요" }, { status: 503 });
  const body = (await req.json().catch(() => null)) as { action?: unknown; code?: unknown } | null;
  const action = String(body?.action ?? "");

  /* 번호 대입 막기 — 10분에 8번. 공용 카운터 장애면 메모리 카운터 */
  let rl = await keyRateLimit(`admin-2fa:${email}`, { max: 8, windowMs: 10 * 60_000 });
  if (rl.degraded) rl = memoryKeyRateLimit(`admin-2fa:${email}`, { max: 8, windowMs: 10 * 60_000 });
  if (!rl.ok) return NextResponse.json({ error: "시도 한도 초과 · 10분 뒤 다시" }, { status: 429 });

  try {
    const row = await readAdminTotp(email);

    if (action === "setup") {
      if (row?.enabled) return NextResponse.json({ error: "이미 등록됨" }, { status: 409 });
      /* 등록 중이면 같은 비밀값을 다시 보여 준다(인증 앱에 이미 넣었을 수 있다) */
      const secret = row?.secret ?? generateTotpSecret();
      if (!row?.secret) {
        const { error } = await sb.from("admin_totp").upsert({ email, secret_sealed: sealSecret(secret, secretKey), enabled: false }, { onConflict: "email" });
        if (error) throw new Error(error.message);
      }
      const url = otpauthUrl(secret, email);
      return NextResponse.json({ ok: true, secret, qrSvg: qrSvgString(encodeQr(url, { ecLevel: "M" }).modules) }, { headers: { "Cache-Control": "no-store" } });
    }

    if (action === "verify") {
      if (!row?.secret) return NextResponse.json({ error: "등록부터 시작" }, { status: 409 });
      if (!verifyTotp(row.secret, String(body?.code ?? ""), Date.now())) return NextResponse.json({ error: "번호 불일치 · 인증 앱의 지금 번호 6자리" }, { status: 400 });
      const now = new Date().toISOString();
      const { error } = await sb
        .from("admin_totp")
        .update(row.enabled ? { last_used_at: now } : { enabled: true, confirmed_at: now, last_used_at: now })
        .eq("email", email);
      if (error) throw new Error(error.message);
      const res = NextResponse.json({ ok: true, enrolledNow: !row.enabled });
      res.cookies.set(ADMIN_2FA_COOKIE, signAdmin2fa(email, secretKey, Date.now()), {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: ADMIN_2FA_TTL_SEC,
      });
      return res;
    }
    return NextResponse.json({ error: "요청 형식 확인" }, { status: 400 });
  } catch (e) {
    logger.warn("[admin-2fa] 처리 실패", e);
    return NextResponse.json({ error: "2단계 인증 처리 실패 · 잠시 후 다시" }, { status: 503 });
  }
}
