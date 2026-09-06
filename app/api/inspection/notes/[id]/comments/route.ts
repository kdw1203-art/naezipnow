import { NextResponse, type NextRequest } from "next/server";
import { safeAuth } from "@/lib/safe-auth";
import { isAdmin } from "@/lib/auth/is-admin";
import { getNote, type InspectionNote } from "@/lib/inspection/store-db";
import {
  addNoteComment,
  listNoteCommentsForViewer,
  softDeleteNoteComment,
  NOTE_COMMENT_MAX_LEN,
} from "@/lib/inspection/note-comments";
import { appendInboxNotification } from "@/lib/notifications/inbox";
import { applyRateLimit, rateLimit, tooManyRequests, WRITE_RATE_LIMIT } from "@/lib/rate-limit";
import { dbUnavailable } from "@/lib/api/db-unavailable";
import { logger } from "@/lib/log";

export const runtime = "nodejs";

/* [967 · 12] 임장노트 댓글 — GET(공개 노트면 누구나) · POST(로그인) · DELETE(작성자·소유자·관리자).
 *
 * 노트 조회 실패와 "없음" 을 구분한다(../route.ts 의 loadNote 와 같은 이유):
 * 실패를 404 로 내보내면 있는 노트를 지워졌다고 답하는 셈이다. */
async function loadNote(id: string) {
  try {
    return { ok: true as const, note: await getNote(id) };
  } catch (e) {
    return { ok: false as const, res: dbUnavailable("inspection-note", e) };
  }
}

function isOwnerOf(note: InspectionNote, email: string | null): boolean {
  return Boolean(email && note.authorEmail && note.authorEmail.toLowerCase() === email);
}

/** 댓글 표시명 — 커뮤니티 댓글(app/api/community/posts/[id]/comments)과 같은 마스킹 */
function commentAuthorLabel(name: string | null | undefined, email: string): string {
  return name?.trim() || `${email.split("@")[0]?.slice(0, 2) || "이웃"}** 이웃`;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const [session, loaded] = await Promise.all([safeAuth(), loadNote(id)]);
  if (!loaded.ok) return loaded.res;
  const note = loaded.note;
  if (!note) return NextResponse.json({ error: "없음" }, { status: 404 });
  const email = session?.user?.email?.trim().toLowerCase() ?? null;
  /* 비공개 노트의 댓글은 소유자만 — 존재 여부까지 숨기는 상세 페이지와 달리
     여기서는 403 으로 답한다(../route.ts GET 과 같은 정책) */
  if (!note.isPublic && !isOwnerOf(note, email)) {
    return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });
  }
  try {
    const { comments, ownCommentIds } = await listNoteCommentsForViewer(id, email);
    return NextResponse.json(
      { comments, ownCommentIds },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return dbUnavailable("note-comments", e);
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const limited = await applyRateLimit(req, WRITE_RATE_LIMIT);
  if (limited) return limited;

  const session = await safeAuth();
  const email = session?.user?.email?.trim().toLowerCase() ?? null;
  if (!email) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }
  /* IP 상한(위)과 별개로 계정당 상한 — 한 계정이 여러 노트에 도배하는 경로를 막는다
     (app/api/experts/register 와 같은 키 기반 슬라이딩 윈도우) */
  const rlUser = rateLimit(`note-comment:${email}`, { limit: 10, windowMs: 60_000 });
  if (!rlUser.ok) return tooManyRequests(rlUser.retryAfterSec);

  const { id } = await params;
  const loaded = await loadNote(id);
  if (!loaded.ok) return loaded.res;
  const note = loaded.note;
  if (!note) return NextResponse.json({ error: "없음" }, { status: 404 });
  const isOwner = isOwnerOf(note, email);
  /* 댓글은 공개 노트에만 — 비공개 노트는 소유자 본인만(메모 용도) 남길 수 있다 */
  if (!note.isPublic && !isOwner) {
    return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "JSON 본문이 필요합니다." }, { status: 400 });
  }
  const text = String(body.body ?? "");
  const parentId = typeof body.parentId === "string" ? body.parentId : null;

  let result: Awaited<ReturnType<typeof addNoteComment>>;
  try {
    result = await addNoteComment({
      noteId: id,
      authorEmail: email,
      authorLabel: commentAuthorLabel(session?.user?.name, email),
      body: text,
      parentId,
    });
  } catch (e) {
    return dbUnavailable("note-comment-add", e);
  }
  if (!result.ok) {
    const msg =
      result.reason === "empty"
        ? "댓글 내용을 입력해 주세요."
        : result.reason === "too_long"
          ? `댓글은 ${NOTE_COMMENT_MAX_LEN}자까지 쓸 수 있어요.`
          : result.reason === "parent_nested"
            ? "답글에는 다시 답글을 달 수 없어요."
            : "답글 대상 댓글을 찾을 수 없어요.";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  /* 소유자에게 인앱 알림 — 착지점은 상세의 #comments. 본인 댓글은 알리지 않는다.
     알림 실패가 댓글 성공을 바꾸지 않는다(fail-soft). */
  if (!isOwner && note.authorEmail) {
    const title = (note.aptName?.trim() || note.title).slice(0, 30);
    void appendInboxNotification({
      userEmail: note.authorEmail,
      title: "임장노트에 댓글이 달렸어요",
      body: `"${title}"에 ${result.comment.authorLabel}님이 댓글을 남겼어요.`,
      actionUrl: `/notes/${id}#comments`,
    }).catch((e) => logger.error("[note-comment-notify]", e));
  }

  return NextResponse.json({ comment: result.comment }, { status: 201 });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await safeAuth();
  const email = session?.user?.email?.trim().toLowerCase() ?? null;
  if (!email) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }
  const { id } = await params;
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "JSON 본문이 필요합니다." }, { status: 400 });
  }
  const commentId = String(body.commentId ?? "").trim();
  if (!commentId) {
    return NextResponse.json({ error: "commentId가 필요합니다." }, { status: 400 });
  }
  const loaded = await loadNote(id);
  if (!loaded.ok) return loaded.res;
  const note = loaded.note;
  if (!note) return NextResponse.json({ error: "없음" }, { status: 404 });

  let result: Awaited<ReturnType<typeof softDeleteNoteComment>>;
  try {
    result = await softDeleteNoteComment(id, commentId, {
      email,
      isAdmin: isAdmin(session),
      noteOwnerEmail: note.authorEmail || null,
    });
  } catch (e) {
    return dbUnavailable("note-comment-delete", e);
  }
  if (result === "forbidden") {
    return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 });
  }
  if (!result) {
    return NextResponse.json({ error: "댓글을 찾을 수 없어요." }, { status: 404 });
  }
  return NextResponse.json({ ok: true, comment: result });
}
