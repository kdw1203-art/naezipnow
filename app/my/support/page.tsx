import type { Metadata } from "next";
import Link from "next/link";
import { PageShell } from "@/app/components/PageShell";
import { GuestGate } from "@/app/components/GuestGate";
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
      <PageShell>
        {/* [v4 · 규칙 3·5] 설명 문장 → 사실 한 줄, 카드 링크 → 1px 선 행 */}
        <GuestGate
          title="로그인하고 내 문의 답변 보기" /* [1012] 규칙 5 — 대상 명시 */
          desc="고객센터 1:1 문의와 운영진 답변"
          pathname="/my/support"
        >
          <ul data-tone="hanji" className="rise-in-1 divide-y divide-line border-y border-line">
            <li>
              <Link href="/support#contact" className="press flex min-h-14 items-center justify-between gap-3 py-3 no-underline">
                <span className="t-body font-bold text-ink">로그인 없이 문의 남기기</span>
                <span aria-hidden="true" className="t-body text-text-3">
                  ›
                </span>
              </Link>
            </li>
          </ul>
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

  /* [v4 · 한 화면 한 가지] 유리 히어로 + 아이콘 버튼 → 제목 + 사실 한 줄(건수·상태) · 채움 파랑 "새 문의 남기기" 하나 →
     문의 1px 선 행(펼침) → 끝 캡션. 바로가기 세 링크는 캡션 줄로 */
  return (
    <PageShell>
      <div className="mx-auto flex w-full max-w-[760px] flex-col gap-6">
        <header aria-labelledby="my-support-hero" className="rise-in flex flex-col gap-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 flex-col gap-0.5">
              <h1 id="my-support-hero" className="t-title text-ink">
                내 문의 내역
              </h1>
              <p className="t-sub text-text-3">
                {tickets.length > 0
                  ? `문의 ${tickets.length}건 · ${TICKET_STATUS_LABEL.open} ${waiting} · ${TICKET_STATUS_LABEL.answered} ${answered}`
                  : "남긴 문의 없음"}{" "}
                · {RESPONSE_TIME}
              </p>
            </div>
            <Link href="/support#contact" className="btn-primary btn-md shrink-0 no-underline">
              새 문의 남기기
            </Link>
          </div>
          <p className="t-caption text-text-3">
            {SUPPORT_HOURS} · 답변은 여기와 이메일({email})로 ·{" "}
            <Link href="/support/faq" className="inline-block py-[5px] font-bold text-primary no-underline">
              자주 묻는 질문 ›
            </Link>{" "}
            <Link href="/notifications" className="inline-block py-[5px] font-bold text-primary no-underline">
              알림함 ›
            </Link>{" "}
            <Link href="/my" className="inline-block py-[5px] font-bold text-primary no-underline">
              마이페이지 ›
            </Link>
          </p>
        </header>

        <TicketList initial={rows} />

        <p className="t-caption leading-[1.6] text-text-3">
          답변 메일에 회신하면 같은 건으로 이어서 처리 · 종료한 문의는 다시 열 수 없음(새 문의로)
        </p>
      </div>
    </PageShell>
  );
}
