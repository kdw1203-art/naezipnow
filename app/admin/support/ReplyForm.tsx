"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { TICKET_REPLY_MAX } from "@/lib/support/ticket-labels";

/**
 * [1000] 관리자 답변 폼 — POST /api/admin/support/[id]/reply.
 * 성공하면 router.refresh() 로 서버 목록을 다시 그린다(상태 칩·답변 블록이 서버 렌더).
 * 메일 발송 결과(프로바이더 미설정 등)는 숨기지 않고 한 줄로 적는다.
 */
export function ReplyForm({
  ticketId,
  existingReply,
}: {
  ticketId: string;
  existingReply: string | null;
}) {
  const router = useRouter();
  const [reply, setReply] = useState(existingReply ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [open, setOpen] = useState(!existingReply);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    const text = reply.trim();
    if (text.length < 2) {
      setError("답변 내용을 2자 이상 입력해 주세요.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/support/${encodeURIComponent(ticketId)}/reply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reply: text }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        emailSent?: boolean;
        emailReason?: string | null;
      };
      if (!res.ok || !data.ok) {
        setError(data.error ?? "답변 저장에 실패했습니다.");
        return;
      }
      setNotice(
        data.emailSent
          ? "답변을 저장하고 이메일로 보냈어요."
          : `답변을 저장했어요 · 이메일은 보내지 못했어요(${data.emailReason ?? "원인 미상"}) — 알림함에는 남았어요.`,
      );
      setOpen(false);
      router.refresh();
    } catch {
      setError("네트워크 오류가 발생했습니다.");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        {notice && <span className="t-sub text-[#8fd3a8]">{notice}</span>}
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded-[9px] bg-[rgba(126,162,255,.15)] px-3.5 py-[9px] t-sub font-extrabold text-ai-accent"
        >
          {existingReply ? "답변 수정 · 다시 보내기" : "답변 쓰기"}
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-2">
      <textarea
        value={reply}
        onChange={(e) => setReply(e.target.value)}
        rows={4}
        maxLength={TICKET_REPLY_MAX}
        aria-label="답변 내용"
        placeholder="문의자에게 보낼 답변을 적어 주세요. 저장과 동시에 알림함·이메일로 전달됩니다."
        className="w-full resize-y rounded-[10px] border border-[rgba(255,255,255,.12)] bg-[rgba(255,255,255,.05)] px-3.5 py-3 t-body leading-[1.6] text-white outline-none placeholder:text-[#6f7b8e] focus:border-ai-accent"
      />
      {error && (
        <p role="alert" className="t-sub font-semibold text-ai-danger">
          {error}
        </p>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="t-caption tabular-nums text-[#9aa6b8]">
          {reply.length.toLocaleString("ko-KR")} / {TICKET_REPLY_MAX.toLocaleString("ko-KR")}
        </span>
        <div className="flex items-center gap-2">
          {existingReply && (
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setReply(existingReply);
                setError(null);
              }}
              disabled={busy}
              className="rounded-[9px] px-3.5 py-[9px] t-sub font-bold text-[#9aa6b8]"
            >
              취소
            </button>
          )}
          <button
            type="submit"
            disabled={busy}
            className="rounded-[9px] bg-primary px-4 py-[9px] t-sub font-extrabold text-white disabled:cursor-not-allowed"
          >
            {busy ? "보내는 중…" : "답변 보내기"}
          </button>
        </div>
      </div>
    </form>
  );
}
