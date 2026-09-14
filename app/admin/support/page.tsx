import Link from "next/link";
import type { Metadata } from "next";
import { listTicketsForAdmin } from "@/lib/support/tickets";
import {
  formatTicketNo,
  isTicketStatus,
  TICKET_STATUS_LABEL,
  TICKET_STATUSES,
  type TicketStatus,
} from "@/lib/support/ticket-labels";
import { formatKstDateTime } from "@/lib/format/kst";
import { ReplyForm } from "./ReplyForm";

/**
 * [1000] 고객 문의 콘솔 — /admin/support.
 * 접근 제어는 app/admin/layout.tsx 가 한다(canAccessAdminConsole → 아니면 redirect).
 * 답변 API(/api/admin/support/[id]/reply)는 isAdminApiRequest 로 따로 막는다.
 * 다크 셸 규칙(관리자 콘솔): 카드는 반투명 흰 면, 글자는 white/#c9d2e0/#9aa6b8.
 */

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "고객 문의 | 내집나우 관리자",
  robots: { index: false, follow: false },
};

const darkCard =
  "flex flex-col gap-3 rounded-[20px] border border-[rgba(255,255,255,.08)] bg-[rgba(255,255,255,.03)] p-5";

const STATUS_TONE_DARK: Record<TicketStatus, string> = {
  open: "bg-[rgba(126,162,255,.16)] text-ai-accent",
  answered: "bg-[rgba(76,175,130,.16)] text-[#4caf82]",
  closed: "bg-[rgba(255,255,255,.08)] text-[#9aa6b8]",
};

export default async function AdminSupportPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const sp = await searchParams;
  const status = isTicketStatus(sp.status) ? sp.status : undefined;
  const { tickets, failed } = await listTicketsForAdmin({ status, limit: 100 });
  const counts = await (async () => {
    /* 필터 칩의 숫자 — 필터가 걸려 있으면 전체 목록을 한 번 더 읽어 센다(100건 상한). */
    const all = status ? (await listTicketsForAdmin({ limit: 100 })).tickets : tickets;
    return {
      all: all.length,
      open: all.filter((t) => t.status === "open").length,
      answered: all.filter((t) => t.status === "answered").length,
      closed: all.filter((t) => t.status === "closed").length,
    };
  })();

  const chip = (active: boolean) =>
    `whitespace-nowrap rounded-full px-3.5 py-[7px] t-sub font-bold no-underline ${
      active
        ? "bg-[rgba(126,162,255,.18)] !text-ai-accent"
        : "bg-[rgba(255,255,255,.05)] !text-[#9aa6b8] hover:!text-[#c9d2e0]"
    }`;

  return (
    <>
      <div className="rise-in flex flex-wrap items-baseline justify-between gap-2">
        <span className="t-title text-white">고객 문의</span>
        <span className="t-sub text-[#9aa6b8]">
          support_tickets · 최근 100건 · 답변은 알림함 + 이메일로 전달
        </span>
      </div>

      <nav aria-label="문의 상태 필터" className="rise-in-1 flex flex-wrap gap-1.5">
        <Link href="/admin/support" className={chip(!status)} aria-current={!status ? "page" : undefined}>
          전체 {counts.all}
        </Link>
        {TICKET_STATUSES.map((s) => (
          <Link
            key={s}
            href={`/admin/support?status=${s}`}
            className={chip(status === s)}
            aria-current={status === s ? "page" : undefined}
          >
            {TICKET_STATUS_LABEL[s]} {counts[s]}
          </Link>
        ))}
      </nav>

      {failed ? (
        <div className="rise-in-2 rounded-[14px] border border-[#7a2a2a] bg-[#2a1616] px-4 py-4 t-body leading-relaxed text-[#ffb4a8]">
          문의 목록을 불러오지 못했어요 — 문의가 없다는 뜻이 아닙니다. 서비스 역할 키·support_tickets
          테이블을 확인하세요. 그동안 접수된 문의는 운영 메일함과 관리자 알림함에도 남아 있어요.
        </div>
      ) : tickets.length === 0 ? (
        <div className="rise-in-2 rounded-[14px] border border-[rgba(255,255,255,.08)] bg-[rgba(255,255,255,.03)] px-4 py-8 text-center">
          <p className="t-body font-bold text-white">
            {status ? `${TICKET_STATUS_LABEL[status]} 상태의 문의가 없어요` : "아직 접수된 문의가 없어요"}
          </p>
          <p className="mt-1 t-sub text-[#9aa6b8]">
            /support 의 1:1 문의 폼으로 접수되면 여기에 쌓입니다.
          </p>
        </div>
      ) : (
        <div className="rise-in-2 flex flex-col gap-3">
          {tickets.map((t) => {
            const no = formatTicketNo(t.id);
            return (
              <article key={t.id} className={darkCard} aria-labelledby={`adm-ticket-${t.id}`}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-md chip-pad t-caption font-extrabold ${STATUS_TONE_DARK[t.status]}`}>
                    {TICKET_STATUS_LABEL[t.status]}
                  </span>
                  <span className="rounded-md bg-[rgba(255,255,255,.08)] chip-pad t-caption font-extrabold text-[#c9d2e0]">
                    {t.category}
                  </span>
                  <span className="t-caption tabular-nums text-[#9aa6b8]">#{no}</span>
                  <span className="ml-auto t-caption text-[#9aa6b8]">
                    접수 {formatKstDateTime(t.createdAt) || "—"}
                  </span>
                </div>
                <div className="flex flex-col gap-1">
                  <h2 id={`adm-ticket-${t.id}`} className="t-section text-white">
                    {t.subject}
                  </h2>
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5 t-sub text-[#9aa6b8]">
                    <a href={`mailto:${t.contactEmail}?subject=${encodeURIComponent(`[내집나우 문의 ${no}] ${t.subject}`)}`} className="!text-[#c9d2e0]">
                      {t.contactEmail}
                    </a>
                    <span>{t.userEmail ? `회원 · ${t.userEmail}` : "비회원"}</span>
                  </div>
                </div>
                <p className="whitespace-pre-wrap rounded-[10px] bg-[rgba(255,255,255,.05)] px-3.5 py-3 t-body leading-[1.7] text-[#e6ebf3]">
                  {t.message}
                </p>
                {t.adminReply && (
                  <div className="rounded-[10px] border-l-[3px] border-ai-accent bg-[rgba(126,162,255,.08)] px-3.5 py-3">
                    <div className="mb-1 t-caption font-extrabold uppercase tracking-wide text-ai-accent">
                      답변{t.repliedAt ? ` · ${formatKstDateTime(t.repliedAt)}` : ""}
                      {t.repliedBy ? ` · ${t.repliedBy}` : ""}
                    </div>
                    <p className="whitespace-pre-wrap t-body leading-[1.7] text-white">{t.adminReply}</p>
                  </div>
                )}
                {t.status === "closed" ? (
                  <span className="t-sub text-[#9aa6b8]">문의자가 종료한 건이에요 — 추가 답변은 메일로만.</span>
                ) : (
                  <ReplyForm ticketId={t.id} existingReply={t.adminReply} />
                )}
              </article>
            );
          })}
        </div>
      )}
    </>
  );
}
