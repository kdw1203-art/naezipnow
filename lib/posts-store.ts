import { isSupabaseConfigured } from "@/lib/supabase/flags";
import {
  appendCommentFile,
  deletePostFile,
  getPostFile,
  incrementViewCountFile,
  loadPostCommentAuthorEmailFile,
  prependPostFile,
  readPostsFile,
  softDeleteCommentFile,
  togglePostLikeFile,
  updatePostFile,
  userHasLikedFile,
} from "@/lib/posts-store-file";
import {
  appendCommentSb,
  countPostBookmarksSb,
  deletePostSb,
  getPostSb,
  incrementViewCountSb,
  loadPostCommentAuthorEmailSb,
  prependPostSb,
  POSTS_READ_LIMIT,
  readPostsSb,
  softDeleteCommentSb,
  adoptCommentSb,
  listPostsByTagSb,
  listRecentPostsByAuthorSb,
  togglePostLikeSb,
  updatePostSb,
  userHasLikedSb,
} from "@/lib/posts-store-supabase";
import type { CommentDeleteActor } from "@/lib/moderation/comment-soft-delete";
import type { Post, PostComment } from "@/lib/types/post";

export { POSTS_READ_LIMIT };

function storageBackendIsSupabase() {
  return isSupabaseConfigured();
}

/**
 * 최신순 글 목록. **전부가 아니라 최신 `limit` 건**이다(기본
 * {@link POSTS_READ_LIMIT}). 총계·비율처럼 전수가 필요한 값은 이 목록의
 * length 로 세면 안 된다 — 상한에 걸리면 조용히 틀린 수를 내놓는다.
 * 그런 곳은 count 질의를 쓴다.
 */
export async function readPosts(
  limit: number = POSTS_READ_LIMIT,
): Promise<Post[]> {
  if (storageBackendIsSupabase()) return readPostsSb(limit);
  /* 파일 백엔드는 애초에 전량을 메모리에 올리므로 상한이 부하 문제는 아니지만,
     두 백엔드가 같은 개수를 돌려주도록 여기서도 똑같이 자른다. */
  return (await readPostsFile()).slice(0, Math.max(1, limit));
}

export async function prependPost(post: Post): Promise<void> {
  if (storageBackendIsSupabase()) {
    await prependPostSb(post);
    return;
  }
  await prependPostFile(post);
}

/**
 * [B32] 도배 판정용 — 한 작성자의 최근 글(제목·본문·작성시각)만.
 * 파일 백엔드는 author_email 을 저장하지 않아 판정할 수 없다 —
 * **빈 배열이 아니라 null** 을 돌려 "확인 안 됨"과 "글 없음"을 구분한다.
 * (빈 배열로 뭉개면 로컬 파일 모드에서 도배 검사를 통과한 것처럼 보인다.)
 */
export async function listRecentPostsByAuthor(
  authorEmail: string,
  sinceIso: string,
): Promise<{ title: string; body: string; createdAt: string }[] | null> {
  if (!storageBackendIsSupabase()) return null;
  return listRecentPostsByAuthorSb(authorEmail, sinceIso);
}

export async function getPost(id: string): Promise<Post | null> {
  return storageBackendIsSupabase() ? getPostSb(id) : getPostFile(id);
}

export async function incrementViewCount(id: string): Promise<Post | null> {
  return storageBackendIsSupabase()
    ? incrementViewCountSb(id)
    : incrementViewCountFile(id);
}

/**
 * 댓글 추가. [1058 · B3] `rejectDuplicate` 를 켜면 같은 작성자가 같은 본문을 60초 안에 다시 달 때 `"duplicate"` —
 * 사람 댓글 라우트만 켠다(관리자 시드 답글은 그대로). 파일 백엔드는 작성자 이메일을 저장하지 않아 판정하지 않는다.
 */
export async function appendComment(id: string, comment: PostComment): Promise<Post | null>;
export async function appendComment(
  id: string,
  comment: PostComment,
  opts: { rejectDuplicate: true },
): Promise<Post | "duplicate" | null>;
export async function appendComment(
  id: string,
  comment: PostComment,
  opts: { rejectDuplicate?: boolean } = {},
): Promise<Post | "duplicate" | null> {
  const result = storageBackendIsSupabase()
    ? await appendCommentSb(id, comment, opts)
    : await appendCommentFile(id, comment, opts);
  return result === "duplicate" && !opts.rejectDuplicate ? null : result;
}

/** [1058 · B3] 댓글 작성자 이메일(서버 전용) — 답글 알림 수신자. 없음·실패·파일 백엔드는 null */
export async function loadPostCommentAuthorEmail(
  postId: string,
  commentId: string,
): Promise<string | null> {
  return storageBackendIsSupabase()
    ? loadPostCommentAuthorEmailSb(postId, commentId)
    : loadPostCommentAuthorEmailFile(postId, commentId);
}

/** [1058 · B2] 글의 저장(북마크) 수 — 못 세면 null(화면은 숫자 없이 "저장"). 파일 백엔드는 북마크 표가 없다 */
export async function countPostBookmarks(postId: string): Promise<number | null> {
  return storageBackendIsSupabase() ? countPostBookmarksSb(postId) : null;
}

/**
 * 댓글 soft-delete. 권한 판정은 백엔드 구현이 한다(lib/moderation/comment-soft-delete.ts).
 * `"forbidden"` = 대상은 있으나 지울 권한이 없음, `null` = 글/댓글 없음.
 */
export async function softDeleteComment(
  postId: string,
  commentId: string,
  actor: CommentDeleteActor,
): Promise<Post | "forbidden" | null> {
  return storageBackendIsSupabase()
    ? softDeleteCommentSb(postId, commentId, actor)
    : softDeleteCommentFile(postId, commentId, actor);
}

/** [#63] 태그로 글 목록 — 파일 백엔드(로컬 개발)는 빈 배열. */
export async function listPostsByTag(tag: string, limit = 50): Promise<Post[]> {
  return storageBackendIsSupabase() ? listPostsByTagSb(tag, limit) : [];
}

/** [#65] 답변 채택 — Supabase 백엔드 전용(파일 백엔드는 로컬 개발용이라 미지원 → null). */
export async function adoptComment(
  postId: string,
  commentId: string,
  actorEmail: string,
): Promise<
  | { post: Post; adoptedAuthorEmail: string | null }
  | "forbidden"
  | "self"
  | null
> {
  return storageBackendIsSupabase()
    ? adoptCommentSb(postId, commentId, actorEmail)
    : null;
}

export async function togglePostLike(
  postId: string,
  userKey: string,
): Promise<{ liked: boolean; likeCount: number } | null> {
  return storageBackendIsSupabase()
    ? togglePostLikeSb(postId, userKey)
    : togglePostLikeFile(postId, userKey);
}

export async function updatePost(
  id: string,
  patch: Partial<Post>,
): Promise<Post | null> {
  return storageBackendIsSupabase()
    ? updatePostSb(id, patch)
    : updatePostFile(id, patch);
}

export async function deletePost(id: string): Promise<boolean> {
  return storageBackendIsSupabase() ? deletePostSb(id) : deletePostFile(id);
}

export async function userHasLikedPost(
  postId: string,
  userKey: string,
): Promise<boolean> {
  if (!userKey) return false;
  return storageBackendIsSupabase()
    ? userHasLikedSb(postId, userKey)
    : userHasLikedFile(postId, userKey);
}
