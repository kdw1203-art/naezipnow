"use client";
/* [1012] 규칙 8 — 굵기 800 이상 금지: 이 파일의 font-extrabold/black 4곳을 font-bold(700)로 바꿨다. */

import Link from "next/link";
import { useCallback, useState } from "react";
import {
  TICKET_STATUS_LABEL,
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

/* [v4 · 규칙 6] 상태는 칩(면) 대신 같은 색 글자 — lib/support/ticket-labels 의 TICKET_STATUS_TONE(면+글자)과 같은 색 계열 */
const STATUS_TEXT: Record<TicketView["status"], string> = {
  open: "text-primary",
  answered: "text-success",
  closed: "text-text-3",
};

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
    /* [v4 · 규칙 8] 그림 카드 → 한 줄(새 문의 버튼은 머리에 있다) */
    return <p className="border-y border-line py-3 t-sub text-text-3">남긴 문의 없음 · 1:1 문의 {RESPONSE_TIME}</p>;
  }

  return (
    /* [v4 · 규칙 5] 카드 쌓기 → 1px 선 행 */
    <div data-tone="hanji" className="flex flex-col divide-y divide-line border-y border-line">
      {error && (
        <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 t-sub font-semibold text-ink">
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
            className={i < 3 ? `rise-in-${i + 1}` : undefined}
            aria-labelledby={`ticket-title-${t.id}`}
          >
            <button
              type="button"
              onClick={() => setOpenId(open ? null : t.id)}
              aria-expanded={open}
              aria-controls={panelId}
              className="flex w-full min-h-14 items-start gap-3 py-3 text-left"
            >
              <span className="flex min-w-0 flex-1 flex-col gap-1.5">
                {/* [v4 · 규칙 6] 분류·상태 칩 → 메타 한 줄 글자(상태는 색 글자) */}
                <span id={`ticket-title-${t.id}`} className="t-body font-bold leading-[1.45] text-ink">
                  {t.subject}
                </span>
                <span className="t-sub text-text-3">
                  <b className={`font-bold ${STATUS_TEXT[t.status]}`}>{TICKET_STATUS_LABEL[t.status]}</b> ·{" "}
                  {t.category} · 접수 {t.createdLabel || "—"} · <span className="tabular-nums">#{t.ticketNo}</span>
                </span>
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

            <div id={panelId} hidden={!open} className="flex flex-col gap-3 pb-4">
              <div className="flex flex-col gap-1">
                <span className="t-caption font-bold uppercase tracking-wide text-text-3">내 문의</span>
                <p className="whitespace-pre-wrap t-body leading-[1.7] text-text-1">{t.message}</p>
              </div>
              {t.adminReply ? (
                <div className="flex flex-col gap-1 border-l-2 border-primary pl-3">
                  <span className="flex items-center gap-1.5 t-caption font-bold uppercase tracking-wide text-primary">
                    내집나우 답변{t.repliedLabel ? ` · ${t.repliedLabel}` : ""}
                  </span>
                  <p className="whitespace-pre-wrap t-body leading-[1.7] text-ink">{t.adminReply}</p>
                </div>
              ) : t.status === "open" ? (
                <p className="t-sub leading-[1.6] text-text-3">답변 전 · {RESPONSE_TIME} · 답변 오면 알림함·이메일 알림</p>
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
