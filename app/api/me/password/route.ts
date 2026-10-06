/**
 * [1040 · 로그인·가입 기능] POST /api/me/password — 로그인 상태에서 비밀번호 변경.
 * body: { current: string; next: string }
 *
 * 예전엔 설정 화면의 "비밀번호 변경"이 비밀번호 찾기(메일 링크)로 보냈다 — 메일함을 다녀와야 했다.
 * 지금 비밀번호를 한 번 확인하고 그 자리에서 바꾼다. 비밀번호가 없는 계정(소셜 가입)은 409 로 메일 설정 길을 안내한다.
 * 보호: 세션 필수 · IP 한도(AUTH_RATE_LIMIT) + 계정 한도(10분 5회) · 변경 뒤 알림 메일.
 */
import { NextRequest, NextResponse } from "next/server";
import { safeAuth } from "@/lib/safe-auth";
import { applyRateLimit, AUTH_RATE_LIMIT, keyRateLimit } from "@/lib/rate-limit";
import { PASSWORD_MIN } from "@/lib/auth/signup-form";
import { verifyCurrentPassword } from "@/lib/auth/password-login";
import { sendPasswordChangedNotice, setAccountPassword } from "@/lib/auth/set-password";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PASSWORD_MAX = 200;

export async function POST(req: NextRequest) {
  const limited = await applyRateLimit(req, AUTH_RATE_LIMIT);
  if (limited) return limited;

  const session = await safeAuth();
  const email = session?.user?.email?.trim().toLowerCase();
  if (!email) return NextResponse.json({ error: "로그인 필요" }, { status: 401 });

  /* 계정 단위 한도 — 세션을 가진 사람이 지금 비밀번호를 대입으로 찾는 길을 막는다. 카운터를 못 세면 막는다 */
  const rl = await keyRateLimit(`me-password:${email}`, { max: 5, windowMs: 10 * 60_000 });
  if (!rl.ok || rl.degraded) {
    return NextResponse.json({ error: "시도 한도 초과 · 10분 뒤 다시" }, { status: 429 });
  }

  const body = (await req.json().catch(() => ({}))) as { current?: unknown; next?: unknown };
  const current = typeof body.current === "string" ? body.current : "";
  const next = typeof body.next === "string" ? body.next : "";

  if (next.length < PASSWORD_MIN) {
    return NextResponse.json({ error: `새 비밀번호 ${PASSWORD_MIN}자 이상`, field: "next" }, { status: 400 });
  }
  if (next.length > PASSWORD_MAX) {
    return NextResponse.json({ error: `새 비밀번호 ${PASSWORD_MAX}자 이하`, field: "next" }, { status: 400 });
  }
  if (!current) {
    return NextResponse.json({ error: "지금 비밀번호 입력", field: "current" }, { status: 400 });
  }
  if (current === next) {
    return NextResponse.json({ error: "지금 비밀번호와 같음 · 다른 비밀번호", field: "next" }, { status: 400 });
  }

  const verdict = await verifyCurrentPassword(email, current);
  if (verdict === "no_password") {
    return NextResponse.json(
      { error: "비밀번호 없는 계정 · 메일 링크로 설정", code: "no_password" },
      { status: 409 },
    );
  }
  if (verdict !== "ok") {
    return NextResponse.json({ error: "지금 비밀번호 불일치", field: "current" }, { status: 400 });
  }

  const changed = await setAccountPassword(email, next);
  if (!changed.ok) return NextResponse.json({ error: changed.error }, { status: changed.status });

  const noticeSent = await sendPasswordChangedNotice(email, "settings");
  /* [1041] noticeSent — 화면이 "알림 메일 발송"을 실제로 보냈을 때만 적는다 */
  return NextResponse.json({ ok: true, noticeSent });
}
