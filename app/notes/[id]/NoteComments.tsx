"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ReportButton } from "@/app/components/ReportButton";
import { CharCount } from "@/app/components/ui/CharCount";
import { useSoftSignup } from "@/app/components/soft-signup/SoftSignupProvider";
import { useToast } from "@/app/components/toast/ToastProvider";

/* [967 · 12] 임장노트 댓글 — app/town/news/[id]/CommentThread 를 본떴다(1단계 답글).
 *
 * 노트 상세는 force-dynamic 이라 서버가 뷰어를 안다 — 댓글 목록·상대시각·"내 댓글"
 * 판정을 서버가 계산해 props 로 준다(커뮤니티 스레드는 ISR 이라 클라이언트가 GET 으로
 * 다시 물었지만, 여기서는 그 왕복이 필요 없다). 상대시각을 클라에서 다시 계산하면
 * hydration 이 어긋나므로 라벨은 서버 것을 그대로 쓴다. 등록·삭제 뒤에는
 * router.refresh() 로 서버 목록을 다시 받는다 — 권한의 진실은 늘 서버 API 다.
 *
 * 삭제 권한: 내 댓글(ownCommentIds) 또는 노트 소유자·관리자(canModerate). 확인은
 * 댓글 줄 안에서 2단계 인라인으로(confirm 없음). 신고는 공용 ReportButton 에
 * postId=노트 id + commentId 를 그대로 싣는다 — /api/moderation/content-report 가
 * 노트 댓글도 target_note_id 로 받도록 고쳤다. */

export type NoteCommentView = {
  id: string;
  authorLabel: string;
  body: string;
  createdAt: string;
  parentId: string | null;
  deleted: boolean;
};

const MAX_LEN = 1000;

export function NoteComments({
  noteId,
  comments,
  relativeLabels,
  ownCommentIds,
  canModerate,
  loggedIn,
}: {
  noteId: string;
  comments: NoteCommentView[];
  /** 서버에서 계산한 상대시각(comment.id → "3시간 전") — 클라 재계산 금지 */
  relativeLabels: Record<string, string>;
  /** 뷰어가 쓴 댓글 id — 이메일 대신 이것만 내려온다 */
  ownCommentIds: string[];
  /** 노트 소유자·관리자 — 모든 댓글을 지울 수 있다 */
  canModerate: boolean;
  loggedIn: boolean;
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const own = new Set(ownCommentIds);

  async function remove(commentId: string) {
    if (busyId) return;
    setBusyId(commentId);
    setError(null);
    try {
      const res = await fetch(`/api/inspection/notes/${noteId}/comments`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ commentId }),
      });
      if (res.status === 401) {
        router.push("/login");
        return;
      }
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(data?.error ?? "삭제에 실패했어요. 잠시 후 다시 시도해 주세요");
        return;
      }
      setConfirmId(null);
      showToast("댓글을 삭제했어요");
      router.refresh();
    } catch {
      setError("네트워크 오류가 발생했어요");
    } finally {
      setBusyId(null);
    }
  }

  const live = comments.filter((c) => !c.deleted || comments.some((r) => r.parentId === c.id));
  const topLevel = live.filter((c) => !c.parentId);
  const repliesOf = (id: string) => live.filter((c) => c.parentId === id);
  const visibleCount = comments.filter((c) => !c.deleted).length;

  return (
    <div className="flex flex-col gap-3">
      <div className="t-body font-extrabold text-ink">댓글 {visibleCount}</div>
      {error && (
        <p role="alert" className="t-sub font-bold text-danger">
          {error}
        </p>
      )}
      {topLevel.length === 0 ? (
        <p className="py-1 t-body text-text-3">첫 댓글을 남겨 보세요</p>
      ) : (
        topLevel.map((c) => (
          <div key={c.id} className="flex flex-col gap-2">
            <CommentRow
              noteId={noteId}
              c={c}
              label={relativeLabels[c.id] ?? ""}
              canDelete={!c.deleted && (own.has(c.id) || canModerate)}
              confirming={confirmId === c.id}
              busy={busyId === c.id}
              onAskDelete={() => setConfirmId(confirmId === c.id ? null : c.id)}
              onConfirmDelete={() => void remove(c.id)}
              onCancelDelete={() => setConfirmId(null)}
              onReply={
                loggedIn && !c.deleted
                  ? () => setReplyTo(replyTo === c.id ? null : c.id)
                  : undefined
              }
              replying={replyTo === c.id}
            />
            {repliesOf(c.id).map((r) => (
              <div key={r.id} className="ml-9 border-l-2 border-line pl-3">
                <CommentRow
                  noteId={noteId}
                  c={r}
                  label={relativeLabels[r.id] ?? ""}
                  canDelete={!r.deleted && (own.has(r.id) || canModerate)}
                  confirming={confirmId === r.id}
                  busy={busyId === r.id}
                  onAskDelete={() => setConfirmId(confirmId === r.id ? null : r.id)}
                  onConfirmDelete={() => void remove(r.id)}
                  onCancelDelete={() => setConfirmId(null)}
                />
              </div>
            ))}
            {replyTo === c.id && (
              <div className="ml-9">
                <NoteCommentForm
                  noteId={noteId}
                  parentId={c.id}
                  onDone={() => setReplyTo(null)}
                />
              </div>
            )}
          </div>
        ))
      )}
      <NoteCommentForm noteId={noteId} loggedIn={loggedIn} />
    </div>
  );
}

function CommentRow({
  noteId,
  c,
  label,
  canDelete,
  confirming,
  busy,
  onAskDelete,
  onConfirmDelete,
  onCancelDelete,
  onReply,
  replying,
}: {
  noteId: string;
  c: NoteCommentView;
  label: string;
  canDelete: boolean;
  confirming: boolean;
  busy: boolean;
  onAskDelete: () => void;
  onConfirmDelete: () => void;
  onCancelDelete: () => void;
  onReply?: () => void;
  replying?: boolean;
}) {
  return (
    <div className="flex gap-2.5">
      <div className="h-8 w-8 shrink-0 rounded-full bg-gradient-to-br from-line to-bg" aria-hidden="true" />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="t-sub font-extrabold text-ink">{c.authorLabel}</span>
          <span className="t-caption text-text-3">{label}</span>
        </div>
        <p
          className={`whitespace-pre-wrap break-words text-[13px] leading-[1.55] ${
            c.deleted ? "text-text-3" : "text-text-1"
          }`}
        >
          {c.body}
        </p>
        {!c.deleted && (
          <div className="flex flex-wrap items-center gap-3">
            {onReply && (
              <button type="button" onClick={onReply} className="t-sub font-bold text-text-3">
                {replying ? "답글 닫기" : "답글"}
              </button>
            )}
            {canDelete && !confirming && (
              <button
                type="button"
                onClick={onAskDelete}
                className="t-sub font-bold text-text-3 hover:text-danger"
              >
                삭제
              </button>
            )}
            {canDelete && confirming && (
              <span
                role="alertdialog"
                aria-label="댓글 삭제 확인"
                className="inline-flex flex-wrap items-center gap-1.5 rounded-lg bg-danger-soft px-2 py-1"
              >
                <span className="t-sub font-bold text-ink">이 댓글을 삭제할까요?</span>
                <button
                  type="button"
                  onClick={onConfirmDelete}
                  disabled={busy}
                  className="rounded-md bg-danger px-2 py-0.5 t-sub font-bold text-on-dark disabled:opacity-60"
                >
                  {busy ? "삭제 중…" : "삭제"}
                </button>
                <button
                  type="button"
                  onClick={onCancelDelete}
                  disabled={busy}
                  className="t-sub font-bold text-text-2"
                >
                  취소
                </button>
              </span>
            )}
            {/* 내 댓글은 신고 대상이 아니다 — 남의 댓글에만 */}
            {!canDelete && <ReportButton postId={noteId} commentId={c.id} />}
          </div>
        )}
      </div>
    </div>
  );
}

function NoteCommentForm({
  noteId,
  parentId,
  loggedIn = true,
  onDone,
}: {
  noteId: string;
  parentId?: string;
  loggedIn?: boolean;
  onDone?: () => void;
}) {
  const router = useRouter();
  const { promptSignup } = useSoftSignup();
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const askLogin = () =>
    promptSignup({
      action: "note_comment",
      title: "댓글을 남기려면 로그인이 필요해요",
      benefit: "로그인하면 댓글이 계정에 남아 노트 작성자에게 알림이 가요.",
    });

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!loggedIn) {
      askLogin();
      return;
    }
    const text = body.trim();
    if (text.length < 1) {
      setError("댓글 내용을 입력해 주세요");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/inspection/notes/${noteId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: text, ...(parentId ? { parentId } : {}) }),
      });
      if (res.status === 401) {
        askLogin();
        return;
      }
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(data?.error ?? "댓글 등록에 실패했어요. 잠시 후 다시 시도해 주세요");
        return;
      }
      setBody("");
      onDone?.();
      router.refresh();
    } catch {
      setError("네트워크 오류가 발생했어요. 잠시 후 다시 시도해 주세요");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-1.5">
      <div className="field-focus flex items-end gap-2 rounded-xl bg-bg px-3.5 py-2">
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onFocus={() => {
            if (!loggedIn) askLogin();
          }}
          maxLength={MAX_LEN}
          rows={parentId ? 1 : 2}
          aria-label={parentId ? "답글 내용" : "댓글 내용"}
          placeholder={parentId ? "답글 남기기…" : "이 노트에 댓글 남기기…"}
          className="min-w-0 flex-1 resize-none bg-transparent py-[6px] text-[13px] leading-[1.5] text-ink outline-none placeholder:text-text-3"
        />
        <button
          type="submit"
          disabled={busy || (loggedIn && body.trim().length === 0)}
          className="shrink-0 pb-1 t-sub font-bold text-primary disabled:opacity-40"
        >
          {busy ? "등록 중…" : "등록"}
        </button>
      </div>
      <div className="flex items-center justify-between px-1">
        {error ? (
          <p role="alert" className="t-sub font-bold text-danger">
            {error}
          </p>
        ) : (
          <span />
        )}
        <CharCount value={body} max={MAX_LEN} />
      </div>
    </form>
  );
}
