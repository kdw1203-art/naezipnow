import { NextResponse } from "next/server";
import { safeAuth } from "@/lib/safe-auth";
import { closeTicket, getMyTicket } from "@/lib/support/tickets";
import { formatTicketNo } from "@/lib/support/ticket-labels";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/support/[id]/close — 내 문의 종료(로그인 · 본인 티켓만).
 * 이미 종료된 건은 그대로 200(멱등). 남의 티켓·없는 id 는 404 로 같은 얼굴이다.
 */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await safeAuth();
  const email = session?.user?.email?.trim().toLowerCase();
  if (!email) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }
  const { id } = await ctx.params;
  const key = String(id ?? "").trim();
  if (!key || key.length > 64) {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }
  const mine = await getMyTicket(key, email);
  if (!mine) {
    return NextResponse.json({ error: "문의를 찾을 수 없습니다." }, { status: 404 });
  }
  if (mine.status === "closed") {
    return NextResponse.json({ ok: true, ticket: { ...mine, ticketNo: formatTicketNo(mine.id) } });
  }
  const closed = await closeTicket({ id: key, byUser: email });
  if (!closed) {
    return NextResponse.json({ error: "종료 처리에 실패했습니다. 잠시 후 다시 시도해 주세요." }, { status: 500 });
  }
  return NextResponse.json({ ok: true, ticket: { ...closed, ticketNo: formatTicketNo(closed.id) } });
}
