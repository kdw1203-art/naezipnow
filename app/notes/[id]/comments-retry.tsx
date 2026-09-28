"use client";
/* [1023 · 임장노트 ②] 댓글 조회 실패 자리의 "다시 시도" — 노트 상세는 force-dynamic 서버 컴포넌트라 댓글 조회가
   서버(listNoteCommentsForViewer / listPublicNoteCommentsCached)에서 돈다. 클라이언트에서 같은 조회를 다시 돌리는 길은
   router.refresh()(서버 컴포넌트 재실행) 하나다 — 그 조회 함수가 그대로 다시 불린다. 40px 버튼, 재요청 중에는 잠근다. */

import { useTransition } from "react";
import { useRouter } from "next/navigation";

export function CommentsRetry() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      onClick={() => startTransition(() => router.refresh())}
      disabled={pending}
      aria-busy={pending}
      className="btn-outline btn-md shrink-0 disabled:opacity-60"
    >
      {pending ? "불러오는 중…" : "다시 시도"}
    </button>
  );
}
