import { NextResponse } from "next/server";
import { isAdminApiRequest } from "@/lib/admin/api-auth";
import { safeAuth } from "@/lib/safe-auth";
import { appendInboxNotification } from "@/lib/notifications/inbox";
import { sendEmail } from "@/lib/email/send";
import { supportReplyEmail } from "@/lib/email/support-templates";
import { getBusinessInfo } from "@/lib/brand/business-info";
import { replyToTicket } from "@/lib/support/tickets";
import { formatTicketNo, TICKET_REPLY_MAX } from "@/lib/support/ticket-labels";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/admin/support/[id]/reply — 문의 답변 (관리자).
 * body: { reply }
 *   1) support_tickets 갱신(status=answered · admin_reply · replied_at/by)
 *   2) 문의자 인박스 알림(user_email 있을 때) → /my/support
 *   3) contact_email 로 답변 메일(프로바이더 미설정 시 건너뜀 — 결과를 응답에 적는다)
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!(await isAdminApiRequest())) {
    return NextResponse.json({ error: "관리자 권한이 필요합니다." }, { status: 403 });
  }
  const session = await safeAuth();
  const actorEmail = session?.user?.email?.trim().toLowerCase() || "admin";

  const { id } = await ctx.params;
  const key = String(id ?? "").trim();
  if (!key || key.length > 64) {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }

  const body = (await req.json().catch(() => null)) as { reply?: unknown } | null;
  const reply = typeof body?.reply === "string" ? body.reply.trim() : "";
  if (reply.length < 2) {
    return NextResponse.json({ error: "답변 내용을 2자 이상 입력해 주세요." }, { status: 400 });
  }
  if (reply.length > TICKET_REPLY_MAX) {
    return NextResponse.json(
      { error: `답변은 ${TICKET_REPLY_MAX.toLocaleString("ko-KR")}자까지 보낼 수 있어요.` },
      { status: 400 },
    );
  }

  const ticket = await replyToTicket({ id: key, reply, repliedBy: actorEmail });
  if (!ticket) {
    return NextResponse.json({ error: "문의를 찾을 수 없거나 저장에 실패했습니다." }, { status: 404 });
  }
  const ticketNo = formatTicketNo(ticket.id);

  if (ticket.userEmail) {
    await appendInboxNotification({
      userEmail: ticket.userEmail,
      title: `문의에 답변이 도착했어요 (${ticketNo})`,
      body: `[${ticket.category}] ${ticket.subject} — 내 문의 내역에서 답변을 확인하세요.`,
      actionUrl: "/my/support",
    }).catch(() => {});
  }

  const mailResult = await sendEmail({
    to: ticket.contactEmail,
    replyTo: getBusinessInfo().supportEmail,
    ...supportReplyEmail({ ticketNo, subject: ticket.subject, reply, message: ticket.message }),
  }).catch(() => ({ sent: false as const, reason: "발송 오류" }));

  return NextResponse.json({
    ok: true,
    ticket: { ...ticket, ticketNo },
    emailSent: mailResult.sent,
    emailReason: mailResult.sent ? null : mailResult.reason,
  });
}
