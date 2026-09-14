"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { Icon } from "@/app/components/Icon";
import { EmptyState } from "@/app/components/ui/EmptyState";
import {
  TICKET_STATUS_LABEL,
  TICKET_STATUS_TONE,
  type TicketCategory,
  type TicketStatus,
} from "@/lib/support/ticket-labels";
import { RESPONSE_TIME } from "@/lib/support/constants";

/**
 * [1000] 내 문의 목록 — 서버가 직렬화해 넘긴 행만 그린다(서버 전용 모듈 import 없음).
 * 접기/펼치기 · "문의 종료"(POST /api/support/[id]/close) · 종료 뒤 목록 재조회(/api/support/mine).
 */
export type TicketView = {
  id: string;
  ticketNo: string;
  category: TicketCategory;
  subject: string;
  message: string;
  status: TicketStatus;
  /** KST 표기 완료 문자열 — 서버가 만든다(시간대 어긋남 방지) */
  createdLabel: string;
  adminReply: string | null;
  repliedLabel: string | null;
};

type ApiTicket = Omit<TicketView, "createdLabel" | "repliedLabel"> & {
  createdAt: string;
  repliedAt: string | null;
};

function kstLabel(iso: string | null): string {
  if (!iso) return "";
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  /* 클라이언트 재조회 뒤에만 쓰는 포맷 — 시간대는 KST 로 고정 */
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(t));
  const get = (k: string) => parts.find((p) => p.type === k)?.value ?? "";
  return `${get("year")}.${get("month")}.${get("day")} ${get("hour")}:${get("minute")}`;
}

export function TicketList({ initial }: { initial: TicketView[] }) {
  const [tickets, setTickets] = useState<TicketView[]>(initial);
  const [openId, setOpenId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/support/mine", { cache: "no-store" });
      const data = (await res.json().catch(() => null)) as { ok?: boolean; tickets?: ApiTicket[] } | null;
      if (!res.ok || !data?.ok || !Array.isArray(data.tickets)) return;
      setTickets(
        data.tickets.map((t) => ({
          id: t.id,
          ticketNo: t.ticketNo,
          category: t.category,
          subject: t.subject,
          message: t.message,
          status: t.status,
          createdLabel: kstLabel(t.createdAt),
          adminReply: t.adminReply,
          repliedLabel: kstLabel(t.repliedAt),
        })),
      );
    } catch {
      /* 재조회 실패는 조용히 — 화면의 낙관적 상태를 유지한다 */
    }
  }, []);

  async function close(id: string) {
    setError(null);
    setBusyId(id);
    try {
      const res = await fetch(`/api/support/${encodeURIComponent(id)}/close`, { method: "POST" });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setError(data.error ?? "종료 처리에 실패했습니다. 잠시 후 다시 시도해 주세요.");
        return;
      }
      setTickets((cur) => cur.map((t) => (t.id === id ? { ...t, status: "closed" } : t)));
      void refresh();
    } catch {
      setError("네트워크 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setBusyId(null);
    }
  }

  if (tickets.length === 0) {
    return (
      <EmptyState
        title="아직 남긴 문의가 없어요"
        desc={`궁금한 점은 1:1 문의로 남겨 주세요. ${RESPONSE_TIME}.`}
        action={{ label: "새 문의 남기기", href: "/support#contact" }}
      />
    );
  }

  return (
    <div className="flex flex-col gap-2.5">
      {error && (
        <p role="alert" className="rounded-[10px] bg-danger-soft px-3 py-2 t-sub font-semibold text-ink">
          {error}
        </p>
      )}
      {tickets.map((t, i) => {
        const open = openId === t.id;
        const panelId = `ticket-panel-${t.id}`;
        const canClose = t.status !== "closed";
        return (
          <article
            key={t.id}
            className={`card rounded-2xl ${i < 3 ? `rise-in-${i + 1}` : ""}`}
            aria-labelledby={`ticket-title-${t.id}`}
          >
            <button
              type="button"
              onClick={() => setOpenId(open ? null : t.id)}
              aria-expanded={open}
              aria-controls={panelId}
              className="flex w-full min-h-10 items-start gap-3 px-4 py-3.5 text-left"
            >
              <span className="flex min-w-0 flex-1 flex-col gap-1.5">
                <span className="flex flex-wrap items-center gap-1.5">
                  <span className="chip chip-soft chip-pad t-caption font-extrabold">{t.category}</span>
                  <span className={`chip chip-pad t-caption font-extrabold ${TICKET_STATUS_TONE[t.status]}`}>
                    {TICKET_STATUS_LABEL[t.status]}
                  </span>
                  <span className="t-caption tabular-nums text-text-3">#{t.ticketNo}</span>
                </span>
                <span id={`ticket-title-${t.id}`} className="t-body font-bold leading-[1.45] text-ink">
                  {t.subject}
                </span>
                <span className="t-sub text-text-3">접수 {t.createdLabel || "—"}</span>
              </span>
              <span
                aria-hidden="true"
                className={`mt-0.5 shrink-0 t-section leading-none text-text-3 transition-transform ${
                  open ? "rotate-90" : ""
                }`}
              >
                ›
              </span>
            </button>

            <div id={panelId} hidden={!open} className="flex flex-col gap-3 px-4 pb-4">
              <div className="lg-hairline" />
              <div className="flex flex-col gap-1">
                <span className="t-caption font-extrabold uppercase tracking-wide text-text-3">내 문의</span>
                <p className="whitespace-pre-wrap t-body leading-[1.7] text-text-1">{t.message}</p>
              </div>
              {t.adminReply ? (
                <div className="lg-glass flex flex-col gap-1 rounded-lg px-4 py-3.5">
                  <span className="flex items-center gap-1.5 t-caption font-extrabold uppercase tracking-wide text-primary">
                    <Icon name="messages-square" size={13} />
                    내집나우 답변{t.repliedLabel ? ` · ${t.repliedLabel}` : ""}
                  </span>
                  <p className="whitespace-pre-wrap t-body leading-[1.7] text-ink">{t.adminReply}</p>
                </div>
              ) : t.status === "open" ? (
                <p className="rounded-[10px] bg-bg px-3.5 py-3 t-sub leading-[1.6] text-text-2">
                  아직 답변 전이에요. {RESPONSE_TIME} — 답변이 오면 알림함과 이메일로도 알려 드려요.
                </p>
              ) : null}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Link
                  href={`/support?category=${encodeURIComponent(t.category)}#contact`}
                  className="inline-block py-[5px] t-sub font-semibold text-primary no-underline"
                >
                  같은 건으로 추가 문의 ›
                </Link>
                {canClose && (
                  <button
                    type="button"
                    onClick={() => close(t.id)}
                    disabled={busyId === t.id}
                    className="btn-ghost btn-md"
                  >
                    {busyId === t.id ? "종료 중…" : "문의 종료"}
                  </button>
                )}
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}
