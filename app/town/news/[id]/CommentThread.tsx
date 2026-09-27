"use client";

import { hasSession } from "@/lib/client/has-session";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CommentForm } from "./PostInteractions";
import { ReportButton } from "@/app/components/ReportButton";
/* [1012] 규칙 8 — 굵기 3단(400/500/700): 이 파일의 font-extrabold(800) 를 전부 font-bold(700) 로 내렸다. */

/* [#65·#66] 댓글 스레드 — 대댓글 1단계 + 글쓴이 채택.
 *
 * 이 상세 페이지는 ISR(공유 캐시)이라 서버 렌더는 뷰어를 모른다. 그래서
 * 채택 버튼 노출 여부만 클라이언트에서 GET /comments/adopt 로 확인한다
 * (세션 쿠키가 있을 때만 — 비로그인 방문자에게 요청을 낭비하지 않는다).
 * 권한 판정의 진실은 항상 서버 POST 가 다시 한다.
 *
 * [967 · 25] 같은 GET 이 ownCommentIds(뷰어가 쓴 댓글 id)도 준다 — 이걸로 "삭제"
 * 를 그린다(이메일은 클라에 오지 않는다). 삭제는 DELETE /comments {commentId}
 * (작성자·글쓴이·관리자만 — 서버가 다시 판정). 신고는 공용 ReportButton 에
 * postId + commentId 를 싣는다(/api/moderation/content-report 가 댓글 신고를 받는다). */

/** [970 · C-34] 처음 펼치는 최상위 댓글 수 — 예전 서버 상한(8)과 같은 수 */
const INITIAL_THREADS = 8;

export type ThreadComment = {
  id: string;
  authorLabel: string;
  body: string;
  createdAt: string;
  parentId?: string | null;
  adopted?: boolean;
};

export function CommentThread({
  postId,
  comments,
  relativeLabels,
}: {
  postId: string;
  comments: ThreadComment[];
  /** 서버에서 계산한 상대시각 라벨 (comment.id → "3시간 전") — 클라 재계산으로 인한 hydration 불일치 방지 */
  relativeLabels: Record<string, string>;
}) {
  const router = useRouter();
  const [isAuthor, setIsAuthor] = useState(false);
  /* [967 · 25] 내 댓글 id — 삭제 버튼 노출 근거. 글쓴이는 모든 댓글을 지울 수 있다 */
  const [ownIds, setOwnIds] = useState<Set<string>>(() => new Set());
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [busyAdopt, setBusyAdopt] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [busyDelete, setBusyDelete] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  /* [970 · C-34] 접기 — 서버는 이제 댓글 전량을 내리고(예전 slice(0,8)), 처음엔 8개
     스레드만 펼친다. 나머지는 "댓글 N개 더 보기"로 여기서 편다(API 변경 없음). */
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    /* [967 · 33] 예전 document.cookie 정규식 판정은 httpOnly 세션 쿠키를 못 봐서
       항상 false — 글쓴이에게도 채택 버튼이 안 보였다. 세션 API 로 판정한다. */
    hasSession()
      .then((authed) => {
        if (cancelled || !authed) return null;
        return fetch(`/api/community/posts/${postId}/comments/adopt`, {
          cache: "no-store",
        });
      })
      .then((r) => (r && r.ok ? r.json() : null))
      .then((d: { isAuthor?: boolean; ownCommentIds?: unknown } | null) => {
        if (cancelled) return;
        if (d?.isAuthor === true) setIsAuthor(true);
        if (Array.isArray(d?.ownCommentIds)) {
          setOwnIds(new Set(d.ownCommentIds.map((x) => String(x))));
        }
      })
      .catch(() => {
        /* 판정 실패 = 버튼 미노출. 채택·삭제 자체는 서버가 지키므로 안전하다. */
      });
    return () => {
      cancelled = true;
    };
  }, [postId]);

  async function adopt(commentId: string) {
    if (busyAdopt) return;
    setBusyAdopt(commentId);
    setError(null);
    try {
      const res = await fetch(`/api/community/posts/${postId}/comments/adopt`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ commentId }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        setError(
          data?.error ?? "채택에 실패했어요. 잠시 후 다시 시도해 주세요.",
        );
        return;
      }
      router.refresh();
    } catch {
      setError("네트워크 오류가 발생했어요.");
    } finally {
      setBusyAdopt(null);
    }
  }

  /* [967 · 25] 삭제 — 인라인 2단계 확인 뒤 DELETE. 성공하면 서버 목록을 다시 받는다
     (soft-delete 라 자리는 "[삭제된 댓글입니다]" 로 남는다 — 답글 문맥 보존). */
  async function remove(commentId: string) {
    if (busyDelete) return;
    setBusyDelete(commentId);
    setError(null);
    try {
      const res = await fetch(`/api/community/posts/${postId}/comments`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ commentId }),
      });
      if (res.status === 401) {
        router.push("/login");
        return;
      }
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        setError(
          data?.error ?? "삭제에 실패했어요. 잠시 후 다시 시도해 주세요.",
        );
        return;
      }
      setConfirmDeleteId(null);
      router.refresh();
    } catch {
      setError("네트워크 오류가 발생했어요.");
    } finally {
      setBusyDelete(null);
    }
  }

  const topLevel = comments.filter((c) => !c.parentId);
  const repliesOf = (id: string) => comments.filter((c) => c.parentId === id);
  // 채택된 댓글을 맨 위로 — 질문 글에서 정답이 먼저 보여야 한다
  const ordered = [...topLevel].sort(
    (a, b) => Number(b.adopted === true) - Number(a.adopted === true),
  );
  const canDelete = (id: string) => isAuthor || ownIds.has(id);
  /* [970 · C-34] 스레드(최상위 + 답글) 단위로 접는다 — 답글만 잘려 문맥이 끊기지 않게 */
  const shown = expanded ? ordered : ordered.slice(0, INITIAL_THREADS);
  const hiddenCount = expanded
    ? 0
    : ordered.slice(INITIAL_THREADS).reduce((n, c) => n + 1 + repliesOf(c.id).length, 0);

  if (comments.length === 0) {
    return (
      <p className="py-2 text-[13px] text-text-3">
        {/* [1012] 규칙 6 — "남겨보세요" 권유 대신 사실. [v4 · 규칙 8] 빈 상태는 짧은 한 줄 */}
        댓글 아직 없음
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {error && (
        <p role="alert" className="text-[12px] font-bold text-danger">
          {error}
        </p>
      )}
      {shown.map((c) => (
        <div key={c.id} className="flex flex-col gap-2">
          <CommentRow
            postId={postId}
            c={c}
            label={relativeLabels[c.id] ?? ""}
            isAuthor={isAuthor}
            busy={busyAdopt === c.id}
            onAdopt={() => void adopt(c.id)}
            onReply={() => setReplyTo(replyTo === c.id ? null : c.id)}
            replying={replyTo === c.id}
            canDelete={canDelete(c.id)}
            confirming={confirmDeleteId === c.id}
            deleting={busyDelete === c.id}
            onAskDelete={() =>
              setConfirmDeleteId(confirmDeleteId === c.id ? null : c.id)
            }
            onConfirmDelete={() => void remove(c.id)}
            onCancelDelete={() => setConfirmDeleteId(null)}
          />
          {repliesOf(c.id).map((r) => (
            <div key={r.id} className="ml-3 border-l-2 border-line pl-3">
              <CommentRow
                postId={postId}
                c={r}
                label={relativeLabels[r.id] ?? ""}
                isAuthor={false}
                busy={false}
                canDelete={canDelete(r.id)}
                confirming={confirmDeleteId === r.id}
                deleting={busyDelete === r.id}
                onAskDelete={() =>
                  setConfirmDeleteId(confirmDeleteId === r.id ? null : r.id)
                }
                onConfirmDelete={() => void remove(r.id)}
                onCancelDelete={() => setConfirmDeleteId(null)}
              />
            </div>
          ))}
          {replyTo === c.id && (
            <div className="ml-3">
              <CommentForm postId={postId} parentId={c.id} compact />
            </div>
          )}
        </div>
      ))}
      {hiddenCount > 0 && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="btn-ghost btn-md w-full"
        >
          댓글 {hiddenCount}개 더 보기
        </button>
      )}
    </div>
  );
}

function CommentRow({
  postId,
  c,
  label,
  isAuthor,
  busy,
  onAdopt,
  onReply,
  replying,
  canDelete,
  confirming,
  deleting,
  onAskDelete,
  onConfirmDelete,
  onCancelDelete,
}: {
  postId: string;
  c: ThreadComment;
  label: string;
  isAuthor: boolean;
  busy: boolean;
  onAdopt?: () => void;
  onReply?: () => void;
  replying?: boolean;
  canDelete: boolean;
  confirming: boolean;
  deleting: boolean;
  onAskDelete: () => void;
  onConfirmDelete: () => void;
  onCancelDelete: () => void;
}) {
  return (
    /* [1012] 규칙 3 — 댓글 아바타 그라데이션 → 단색(--divider).
       [v4 · 규칙 7] 그 빈 원(글자도 사진도 없는 32px 장식 칸)도 뺐다 — 댓글은 이름 · 시각 한 줄 + 본문 */
    <div className="flex">
      <div className="flex flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs font-bold text-ink">
            {c.authorLabel}
          </span>
          {/* [v4 · 규칙 6] 면 있는 배지 → 의미색 굵은 글자(피드의 "추천글"과 같은 방식) */}
          {c.adopted && <span className="text-[12px] font-bold text-success">채택된 답변</span>}
          <span className="text-[10px] text-text-3">{label}</span>
        </div>
        <p className="text-[13px] leading-[1.55] text-text-1">{c.body}</p>
        <div className="flex flex-wrap items-center gap-3">
          {onReply && (
            <button
              type="button"
              onClick={onReply}
              className="text-[12px] font-bold text-text-3"
            >
              {replying ? "답글 닫기" : "답글"}
            </button>
          )}
          {isAuthor && !c.adopted && onAdopt && (
            <button
              type="button"
              onClick={onAdopt}
              disabled={busy}
              className="text-[12px] font-bold text-primary disabled:opacity-50"
            >
              {busy ? "채택 중…" : "채택하기 (+30P)"}
            </button>
          )}
          {/* [967 · 25] 삭제(내 댓글·글쓴이) — 확인은 같은 줄에서 펼친다 */}
          {canDelete && !confirming && (
            <button
              type="button"
              onClick={onAskDelete}
              className="text-[12px] font-bold text-text-3 hover:text-danger"
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
              <span className="text-[12px] font-bold text-ink">
                이 댓글을 삭제할까요?
              </span>
              <button
                type="button"
                onClick={onConfirmDelete}
                disabled={deleting}
                className="rounded-md bg-danger px-2 py-0.5 text-[12px] font-bold text-on-dark disabled:opacity-60"
              >
                {deleting ? "삭제 중…" : "삭제"}
              </button>
              <button
                type="button"
                onClick={onCancelDelete}
                disabled={deleting}
                className="text-[12px] font-bold text-text-2"
              >
                취소
              </button>
            </span>
          )}
          {/* [967 · 25] 신고 — 남의 댓글에만(내 댓글·글쓴이 자신의 글은 삭제로 충분하다) */}
          {!canDelete && <ReportButton postId={postId} commentId={c.id} />}
        </div>
      </div>
    </div>
  );
}
