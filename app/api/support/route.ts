import { NextRequest, NextResponse } from "next/server";
import { safeAuth } from "@/lib/safe-auth";
import { appendInboxNotification } from "@/lib/notifications/inbox";
import { rateLimit, getClientIp, tooManyRequests } from "@/lib/rate-limit";
import { sendEmail } from "@/lib/email/send";
import { supportInquiryEmail } from "@/lib/email/templates";
import { DEFAULT_ADMIN_EMAIL, getBusinessInfo } from "@/lib/brand/business-info";
import { createSupportTicket } from "@/lib/support/tickets";
import {
  firstTicketError,
  formatTicketNo,
  validateTicketInput,
} from "@/lib/support/ticket-labels";
import { RESPONSE_TIME } from "@/lib/support/constants";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/support — 1:1 문의 접수.
 *
 * [1000] 접수가 **행**이 된다(support_tickets). 순서:
 *   1) 티켓 insert (실패해도 멈추지 않는다 — 문의를 잃는 쪽이 더 나쁘다)
 *   2) 관리자 인박스 알림(+ 접수번호) → /admin/support
 *   3) 운영 메일(제목에 접수번호)
 *   4) 로그인 사용자면 접수 확인 알림 → /my/support
 * 응답 { ok, ticketId, ticketNo } — insert 실패 시 ticketId:null(메일·알림은 나갔다).
 */
export async function POST(req: NextRequest) {
  // IP당 10분에 5회 (인스턴스별 best-effort)
  const rl = rateLimit(`support:${getClientIp(req)}`, { limit: 5, windowMs: 10 * 60_000 });
  if (!rl.ok) return tooManyRequests(rl.retryAfterSec);

  const session = await safeAuth();

  const body = (await req.json().catch(() => null)) as {
    category?: unknown;
    subject?: unknown;
    message?: unknown;
    email?: unknown;
  } | null;

  if (!body) return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });

  const sessionEmail = session?.user?.email?.trim().toLowerCase() || null;
  /* 로그인 세션 이메일이 있으면 그것이 답변 주소다(폼 값보다 우선 — 남의 주소로 접수 방지). */
  const checked = validateTicketInput({
    category: body.category,
    subject: body.subject,
    message: body.message,
    email: sessionEmail ?? body.email,
  });
  if (!checked.ok) {
    return NextResponse.json({ error: firstTicketError(checked.errors) }, { status: 400 });
  }
  const { category, subject, message, email: fromEmail } = checked.value;

  /* 1) 티켓 — 실패는 null. 아래 알림·메일은 그대로 나간다. */
  const ticket = await createSupportTicket({
    userEmail: sessionEmail,
    contactEmail: fromEmail,
    category,
    subject,
    message,
    /* IP·UA 는 저장하지 않는다 — 개인정보처리방침에 없는 수집을 만들지 않는다 */
    metadata: { source: "support-form", loggedIn: Boolean(sessionEmail) },
  });
  const ticketNo = ticket ? formatTicketNo(ticket.id) : null;
  const noTag = ticketNo ? ` #${ticketNo}` : "";

  /* 2) 관리자 인박스 — ADMIN_EMAIL 미설정 시 DEFAULT_ADMIN_EMAIL(읽는 쪽과 같은 상수) */
  const adminEmail = process.env.ADMIN_EMAIL ?? DEFAULT_ADMIN_EMAIL;
  await appendInboxNotification({
    userEmail: adminEmail,
    title: `[문의:${category}]${noTag} ${subject}`,
    body: `보낸이: ${fromEmail}${ticket ? `\n접수번호: ${ticketNo}` : "\n(티켓 저장 실패 — 메일 원문으로 처리)"}\n\n${message}`,
    actionUrl: `/admin/support`,
  }).catch(() => {/* ignore send failure */});

  /* 3) 운영 메일 — 수신 주소는 business-info 단일 출처(예전엔 여기 하드코딩). 프로바이더 미설정 시 건너뜀 */
  const notifyEmail = getBusinessInfo().supportEmail || DEFAULT_ADMIN_EMAIL;
  const mail = supportInquiryEmail({ category, subject, message, fromEmail });
  await sendEmail({
    to: notifyEmail,
    replyTo: fromEmail,
    ...mail,
    subject: ticketNo ? `${mail.subject} (${ticketNo})` : mail.subject,
  }).catch(() => {/* 발송 실패해도 접수는 성공 처리 */});

  /* 4) 사용자 접수 확인 — 내 문의 내역으로 */
  if (sessionEmail) {
    await appendInboxNotification({
      userEmail: sessionEmail,
      title: ticketNo ? `문의가 접수되었습니다 (${ticketNo})` : "문의가 접수되었습니다",
      body: `[${category}] ${subject} — ${RESPONSE_TIME}.`,
      actionUrl: `/my/support`,
    }).catch(() => {});
  }

  return NextResponse.json({ ok: true, ticketId: ticket?.id ?? null, ticketNo });
}
