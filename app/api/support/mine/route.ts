import { NextResponse } from "next/server";
import { safeAuth } from "@/lib/safe-auth";
import { listMyTickets } from "@/lib/support/tickets";
import { formatTicketNo } from "@/lib/support/ticket-labels";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/support/mine — 내 문의 목록(로그인 필수). /my/support 클라이언트 갱신용. */
export async function GET() {
  const session = await safeAuth();
  const email = session?.user?.email?.trim().toLowerCase();
  if (!email) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }
  const tickets = await listMyTickets(email, 50);
  return NextResponse.json({
    ok: true,
    tickets: tickets.map((t) => ({ ...t, ticketNo: formatTicketNo(t.id) })),
  });
}
