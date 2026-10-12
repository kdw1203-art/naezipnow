import { normalizeForDupe } from "@/lib/community/flood-guard";
import type { PostComment } from "@/lib/types/post";

/* [1058 · B3·B4] 댓글 저장 규칙 — 순수 함수(저장 백엔드·DB 없이 테스트).
 *
 *  · comment_count 는 **지워지지 않은** 댓글 수다. 예전엔 appendCommentSb 가 comments.length 를
 *    적고 소프트 삭제는 줄이지 않아, 지운 댓글도 "댓글 N"에 남았다.
 *  · 같은 사람이 같은 말을 60초 안에 다시 달면 도배다(글 쓰기의 lib/community/flood-guard 와 같은 정규화).
 *  · updated_at 은 낙관적 동시성의 버전이다 — 새 값은 반드시 이전 값보다 **뒤**여야 같은 밀리초 충돌이 없다. */

/** 지워지지 않은 댓글 수 — posts.comment_count 에 저장하는 값 */
export function liveCommentCount(
  comments: ReadonlyArray<Pick<PostComment, "deletedAt">>,
): number {
  return comments.reduce((n, c) => n + (c.deletedAt ? 0 : 1), 0);
}

/** 같은 본문을 다시 달 수 없는 기간 */
export const COMMENT_DUPE_WINDOW_MS = 60_000;

/**
 * 같은 작성자(이메일)가 창 안에 같은 본문(정규화)을 이미 달았으면 그 댓글을 돌려준다.
 * 지워진 댓글·작성자 없는 댓글(옛 비로그인)은 비교하지 않는다.
 */
export function findDuplicateComment(
  comments: ReadonlyArray<Pick<PostComment, "authorEmail" | "body" | "createdAt" | "deletedAt">>,
  draft: { authorEmail: string; body: string },
  now: number,
  windowMs: number = COMMENT_DUPE_WINDOW_MS,
): Pick<PostComment, "authorEmail" | "body" | "createdAt" | "deletedAt"> | null {
  const email = draft.authorEmail.trim().toLowerCase();
  if (!email) return null;
  const body = normalizeForDupe(draft.body);
  if (!body) return null;
  const cutoff = now - windowMs;
  for (const c of comments) {
    if (c.deletedAt) continue;
    const author = String(c.authorEmail ?? "").trim().toLowerCase();
    if (!author || author !== email) continue;
    const at = Date.parse(String(c.createdAt ?? "")) || 0;
    if (at < cutoff) continue;
    if (normalizeForDupe(String(c.body ?? "")) === body) return c;
  }
  return null;
}

/** 이전 updated_at 보다 반드시 뒤인 ISO 시각 — 낙관적 동시성 버전(같은 밀리초면 1ms 뒤) */
export function nextUpdatedAt(prev: string | null | undefined, now: number = Date.now()): string {
  const prevMs = prev ? Date.parse(prev) : NaN;
  const ms = Number.isFinite(prevMs) && now <= prevMs ? prevMs + 1 : now;
  return new Date(ms).toISOString();
}
