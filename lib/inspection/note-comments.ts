import { getServiceSupabase } from "@/lib/supabase/service";
import {
  canDeleteComment,
  softDeleteCommentBody,
} from "@/lib/moderation/comment-soft-delete";

/* [967 · 12] 공개 임장노트 댓글 저장소 — 서버 전용(service role).
 *
 * 표: note_comments(supabase/migrations/20260906050000_note_comments.sql).
 * RLS 는 켜져 있고 정책이 없어 오직 이 모듈만 닿는다 — 읽기 권한(공개 노트 여부)과
 * 쓰기 권한(로그인·소유자)은 라우트가 판정하고, 여기서는 "누가 지울 수 있나"
 * 한 가지만 판정한다(커뮤니티 댓글과 같은 규칙: 작성자 본인·노트 소유자·관리자).
 *
 * 응답으로 나가는 NoteComment 에는 author_email 이 없다. 표시명은 라우트가
 * 저장 시점에 마스킹해 넣은 author_label 을 그대로 쓴다. 지워진 댓글은 자리만
 * 남기고 본문·이름을 가린다(lib/moderation/comment-soft-delete 의 마스킹과 동일). */

export type NoteComment = {
  id: string;
  noteId: string;
  authorLabel: string;
  body: string;
  createdAt: string;
  parentId: string | null;
  /** soft-delete 된 댓글 — 본문·이름은 이미 가려져 있다 */
  deleted: boolean;
};

type Row = {
  id: string;
  note_id: string;
  author_email: string;
  author_label: string;
  body: string;
  parent_id: string | null;
  deleted_at: string | null;
  created_at: string;
};

export const NOTE_COMMENT_MAX_LEN = 1000;

/** 로컬(키 없음) 개발용 메모리 폴백 — store-db 의 memory 노트와 같은 태도 */
const memory: Row[] = [];

const SELECT = "id,note_id,author_email,author_label,body,parent_id,deleted_at,created_at";

function toPublic(r: Row): NoteComment {
  const deleted = Boolean(r.deleted_at);
  return {
    id: String(r.id),
    noteId: String(r.note_id),
    authorLabel: deleted ? "익명" : String(r.author_label ?? ""),
    body: deleted ? softDeleteCommentBody() : String(r.body ?? ""),
    createdAt: String(r.created_at ?? ""),
    parentId: r.parent_id != null ? String(r.parent_id) : null,
    deleted,
  };
}

async function readRows(noteId: string): Promise<Row[]> {
  const sb = getServiceSupabase();
  if (!sb) return memory.filter((r) => r.note_id === noteId);
  const { data, error } = await sb
    .from("note_comments")
    .select(SELECT)
    .eq("note_id", noteId)
    .order("created_at", { ascending: true })
    .limit(500);
  /* 실패를 [] 로 접으면 "댓글이 없다" 가 된다 — 조회 실패는 던지고 화면이 구분한다 */
  if (error) throw new Error(`note_comments 조회 실패: ${error.message}`);
  return (data ?? []) as Row[];
}

/** 공개 응답용 목록(오래된 순). 지워진 댓글은 마스킹된 채 자리만 남는다. */
export async function listNoteComments(noteId: string): Promise<NoteComment[]> {
  const rows = await readRows(noteId);
  return rows.map(toPublic);
}

/**
 * 뷰어 기준 목록 — 댓글과 함께 "내 댓글 id" 를 준다. 클라이언트는 이메일을 받지
 * 않고도 삭제 버튼을 그릴 수 있다(권한의 진실은 여전히 서버 DELETE 가 다시 본다).
 */
export async function listNoteCommentsForViewer(
  noteId: string,
  viewerEmail: string | null,
): Promise<{ comments: NoteComment[]; ownCommentIds: string[] }> {
  const rows = await readRows(noteId);
  const me = viewerEmail?.trim().toLowerCase() ?? "";
  return {
    comments: rows.map(toPublic),
    ownCommentIds: me
      ? rows
          .filter((r) => !r.deleted_at && String(r.author_email).toLowerCase() === me)
          .map((r) => String(r.id))
      : [],
  };
}

export type AddNoteCommentResult =
  | { ok: true; comment: NoteComment }
  | { ok: false; reason: "empty" | "too_long" | "parent_missing" | "parent_nested" };

export async function addNoteComment(input: {
  noteId: string;
  authorEmail: string;
  authorLabel: string;
  body: string;
  parentId?: string | null;
}): Promise<AddNoteCommentResult> {
  const body = input.body.trim();
  if (body.length < 1) return { ok: false, reason: "empty" };
  if (body.length > NOTE_COMMENT_MAX_LEN) return { ok: false, reason: "too_long" };

  /* 답글은 1단계만 — 존재하는 최상위(지워지지 않은) 댓글에만 단다. 조용히 최상위로
     강등하면 "왜 엉뚱한 데 달렸지" 가 되므로 실패로 알린다(커뮤니티 댓글과 같은 판단). */
  let parentId: string | null = null;
  const wanted = input.parentId?.trim() ?? "";
  if (wanted) {
    const rows = await readRows(input.noteId);
    const parent = rows.find((r) => String(r.id) === wanted);
    if (!parent || parent.deleted_at) return { ok: false, reason: "parent_missing" };
    if (parent.parent_id) return { ok: false, reason: "parent_nested" };
    parentId = String(parent.id);
  }

  const sb = getServiceSupabase();
  if (!sb) {
    const row: Row = {
      id: `mem-${Date.now().toString(36)}-${memory.length}`,
      note_id: input.noteId,
      author_email: input.authorEmail.trim().toLowerCase(),
      author_label: input.authorLabel,
      body,
      parent_id: parentId,
      deleted_at: null,
      created_at: new Date().toISOString(),
    };
    memory.push(row);
    return { ok: true, comment: toPublic(row) };
  }
  const { data, error } = await sb
    .from("note_comments")
    .insert({
      note_id: input.noteId,
      author_email: input.authorEmail.trim().toLowerCase(),
      author_label: input.authorLabel,
      body,
      parent_id: parentId,
    })
    .select(SELECT)
    .single();
  if (error || !data) throw new Error(`note_comments 저장 실패: ${error?.message ?? "빈 응답"}`);
  return { ok: true, comment: toPublic(data as Row) };
}

export type NoteCommentDeleteActor = {
  email: string;
  isAdmin?: boolean;
  /** 노트 소유자 이메일 — 라우트가 getNote 로 읽어 넘긴다 */
  noteOwnerEmail?: string | null;
};

/**
 * soft-delete. `"forbidden"` = 있으나 권한 없음, `null` = 그런 댓글 없음.
 * 이미 지워진 댓글은 그대로 성공으로 본다(멱등).
 */
export async function softDeleteNoteComment(
  noteId: string,
  commentId: string,
  actor: NoteCommentDeleteActor,
): Promise<NoteComment | "forbidden" | null> {
  const rows = await readRows(noteId);
  const target = rows.find((r) => String(r.id) === commentId);
  if (!target) return null;
  const allowed = canDeleteComment(
    { authorEmail: target.author_email },
    { email: actor.email, isAdmin: actor.isAdmin, postOwnerEmail: actor.noteOwnerEmail ?? null },
  );
  if (!allowed) return "forbidden";
  if (target.deleted_at) return toPublic(target);

  const now = new Date().toISOString();
  const sb = getServiceSupabase();
  if (!sb) {
    target.deleted_at = now;
    return toPublic(target);
  }
  const { data, error } = await sb
    .from("note_comments")
    .update({ deleted_at: now })
    .eq("id", commentId)
    .eq("note_id", noteId)
    .select(SELECT)
    .maybeSingle();
  if (error) throw new Error(`note_comments 삭제 실패: ${error.message}`);
  return data ? toPublic(data as Row) : null;
}
