import type { Metadata } from "next";
import Link from "next/link";
import { PageShell } from "@/app/components/PageShell";
import { GuestGate } from "@/app/components/GuestGate";
import { Icon } from "@/app/components/Icon";
import { safeAuth } from "@/lib/safe-auth";
import { listMyTickets } from "@/lib/support/tickets";
import { formatTicketNo, TICKET_STATUS_LABEL } from "@/lib/support/ticket-labels";
import { RESPONSE_TIME, SUPPORT_HOURS } from "@/lib/support/constants";
import { formatKstDateTime } from "@/lib/format/kst";
import { TicketList, type TicketView } from "./TicketList";

/**
 * [1000] 내 문의 내역 — /my/support.
 *
 * 970 까지 "문의 내역을 화면에서 따로 보여 주는 기능은 아직 없어요" 가 사실이었다.
 * 이제 접수가 support_tickets 행이 되므로 여기서 내 문의·답변을 본다.
 * 실데이터만 — 없으면 정직한 빈 상태. 게스트는 GuestGate.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "내 문의 내역 | 내집나우",
  description: "고객센터에 남긴 1:1 문의와 답변을 한곳에서 확인해요.",
  robots: { index: false, follow: false },
};

export default async function MySupportPage() {
  const session = await safeAuth();
  const email = session?.user?.email?.trim().toLowerCase();

  if (!email) {
    return (
      <PageShell breadcrumb="마이 › 내 문의">
        <GuestGate
          title="로그인하고 내 문의를 확인하세요"
          desc="고객센터에 남긴 1:1 문의와 운영진 답변이 여기에 모여요."
          pathname="/my/support"
        >
          <Link
            href="/support#contact"
            className="rise-in-1 card flex items-center justify-between rounded-[14px] px-4 py-[13px] t-body font-semibold text-text-1 no-underline"
          >
            <span>로그인 없이 문의 남기기</span>
            <span className="text-text-3">›</span>
          </Link>
        </GuestGate>
      </PageShell>
    );
  }

  const tickets = await listMyTickets(email, 50);
  const rows: TicketView[] = tickets.map((t) => ({
    id: t.id,
    ticketNo: formatTicketNo(t.id),
    category: t.category,
    subject: t.subject,
    message: t.message,
    status: t.status,
    createdLabel: formatKstDateTime(t.createdAt),
    adminReply: t.adminReply,
    repliedLabel: t.repliedAt ? formatKstDateTime(t.repliedAt) || null : null,
  }));
  const waiting = tickets.filter((t) => t.status === "open").length;
  const answered = tickets.filter((t) => t.status === "answered").length;

  return (
    <PageShell title="내 문의 내역" breadcrumb="마이 › 내 문의">
      <div className="mx-auto flex w-full max-w-[860px] flex-col gap-4">
        {/* 히어로 — 유리판 */}
        <section
          aria-labelledby="my-support-hero"
          className="rise-in lg-glass flex flex-col gap-4 rounded-lg px-5 py-5"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex min-w-0 flex-col gap-1">
              <span id="my-support-hero" className="t-sub font-bold text-text-3">
                1:1 문의
              </span>
              <span className="t-section text-ink">
                {tickets.length > 0
                  ? `문의 ${tickets.length}건 · ${TICKET_STATUS_LABEL.open} ${waiting} · ${TICKET_STATUS_LABEL.answered} ${answered}`
                  : "남긴 문의가 없어요"}
              </span>
              <span className="t-sub text-text-2">
                {SUPPORT_HOURS} · {RESPONSE_TIME} — 답변은 여기와 이메일({email})로 드려요.
              </span>
            </div>
            <Link href="/support#contact" className="btn-primary btn-md shrink-0 no-underline">
              <Icon name="mail" size={15} className="mr-1.5" />
              새 문의 남기기
            </Link>
          </div>
          <div className="lg-hairline" />
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            <Link href="/support/faq" className="inline-block py-[5px] t-sub font-semibold text-primary no-underline">
              자주 묻는 질문 ›
            </Link>
            <Link href="/notifications" className="inline-block py-[5px] t-sub font-semibold text-primary no-underline">
              알림함 ›
            </Link>
            <Link href="/my" className="inline-block py-[5px] t-sub font-semibold text-primary no-underline">
              마이페이지 ›
            </Link>
          </div>
        </section>

        <TicketList initial={rows} />

        <p className="px-1 t-caption leading-[1.6] text-text-3">
          답변 메일에 회신하면 같은 건으로 이어서 처리돼요. 종료한 문의는 다시 열 수 없고, 새 문의로 남겨 주세요.
        </p>
      </div>
    </PageShell>
  );
}
