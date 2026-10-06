/**
 * [1042 · 메일 발송] POST /api/admin/email-test — 관리자 본인 주소로 시험 메일 한 통.
 *
 * 운영의 SMTP 값은 암호화돼 있어 밖에서는 맞는지 알 길이 없다(계정이 바뀌었는지 · 포트가 맞는지 · 발신 주소가 거절되는지).
 * 관리자가 한 번 눌러 "나갔다 / 왜 안 나갔다"를 본다. 받는 주소는 **로그인한 관리자 자신**뿐이다 — 입력받지 않는다
 * (임의 주소로 보내는 길을 열지 않는다). 계정당 10분 5회.
 */
import { NextResponse } from "next/server";
import { safeAuth } from "@/lib/safe-auth";
import { keyRateLimit } from "@/lib/rate-limit";
import { mailStatus, sendEmail } from "@/lib/email/send";
import { emailLayout } from "@/lib/email/templates";
import { maskEmailPublic } from "@/lib/privacy/mask-email";
import { formatKstDateTime } from "@/lib/format/kst";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST() {
  const session = await safeAuth();
  const email = session?.user?.email?.trim().toLowerCase();
  if (!email || session?.user?.role !== "admin") {
    return NextResponse.json({ error: "권한 필요" }, { status: 403 });
  }

  const rl = await keyRateLimit(`admin-email-test:${email}`, { max: 5, windowMs: 10 * 60_000 });
  if (!rl.ok) return NextResponse.json({ error: "시험 한도 초과 · 10분 뒤 다시" }, { status: 429 });

  const status = mailStatus();
  if (!status.provider) {
    return NextResponse.json({ ok: true, sent: false, reason: "미설정", provider: null, from: null });
  }

  const when = formatKstDateTime(new Date());
  const result = await sendEmail({
    to: email,
    subject: `[내집나우] 메일 발송 시험 — ${when}`,
    html: emailLayout(`
      <h1 style="margin:0 0 10px;font-size:17px;color:#191f28;">메일 발송 시험</h1>
      <table style="width:100%;border-collapse:collapse;font-size:14px;color:#3d4657;">
        <tr><td style="padding:6px 12px 6px 0;color:#8a94a6;">수단</td><td style="padding:6px 0;font-weight:700;">${status.provider === "smtp" ? "SMTP" : "Resend"}</td></tr>
        <tr><td style="padding:6px 12px 6px 0;color:#8a94a6;">발신</td><td style="padding:6px 0;">${escapeHtml(status.from ?? "")}</td></tr>
        <tr><td style="padding:6px 12px 6px 0;color:#8a94a6;">시각</td><td style="padding:6px 0;">${escapeHtml(when)} KST</td></tr>
      </table>`),
    text: `[내집나우] 메일 발송 시험 · ${status.provider === "smtp" ? "SMTP" : "Resend"} · ${when} KST`,
  }).catch(() => ({ sent: false as const, reason: "발송 오류" }));

  return NextResponse.json({
    ok: true,
    sent: result.sent,
    reason: result.sent ? null : result.reason,
    provider: status.provider,
    from: status.from,
    to: maskEmailPublic(email),
  });
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
