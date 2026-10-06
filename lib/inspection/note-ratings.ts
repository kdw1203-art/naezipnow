import { getServiceSupabase } from "@/lib/supabase/service";
import { summarizeStars, type RatingSummary } from "@/lib/inspection/note-rating-math";

/* [1043 · 임장노트 참여] 공개 임장노트 독자 평가 저장소 — 서버 전용(service role).
 *
 * 표: note_ratings(supabase/migrations/20261006150529_1043_note_ratings.sql). RLS 켜고 정책 없음 —
 * note_comments 와 같다. 읽기 권한(공개 노트인가)·쓰기 권한(로그인 · 내 노트 아님)은 라우트가 판정한다.
 * 밖으로 나가는 것은 **인원과 평균, 그리고 묻는 사람 자신의 점수**뿐이다. 누가 몇 점을 줬는지는 나가지 않는다. */

type Row = { note_id: string; rater_email: string; stars: number };

/** 로컬(키 없음) 개발용 메모리 폴백 — note-comments 와 같은 태도 */
const memory: Row[] = [];

async function readRows(noteIds: string[]): Promise<Row[]> {
  const ids = [...new Set(noteIds.map((s) => String(s ?? "").trim()).filter(Boolean))];
  if (ids.length === 0) return [];
  const sb = getServiceSupabase();
  if (!sb) return memory.filter((r) => ids.includes(r.note_id));
  const { data, error } = await sb
    .from("note_ratings")
    .select("note_id,rater_email,stars")
    .in("note_id", ids)
    .limit(5000);
  /* 실패를 [] 로 접으면 "평가 없음"이 된다 — 던지고 호출부가 가른다 */
  if (error) throw new Error(`note_ratings 조회 실패: ${error.message}`);
  return (data ?? []) as Row[];
}

export type ViewerRating = RatingSummary & { mine: number | null };

/** 노트 한 편 — 요약 + 묻는 사람의 점수 */
export async function getNoteRating(noteId: string, viewerEmail: string | null): Promise<ViewerRating> {
  const rows = await readRows([noteId]);
  const me = viewerEmail?.trim().toLowerCase() ?? "";
  const mine = me ? (rows.find((r) => String(r.rater_email).toLowerCase() === me)?.stars ?? null) : null;
  return { ...summarizeStars(rows.map((r) => Number(r.stars))), mine: mine != null ? Number(mine) : null };
}

/** 여러 노트 — 목록 카드용 요약(평가가 있는 노트만 담긴다) */
export async function getNoteRatingSummaries(noteIds: string[]): Promise<Map<string, RatingSummary>> {
  const rows = await readRows(noteIds);
  const byNote = new Map<string, number[]>();
  for (const r of rows) {
    const k = String(r.note_id);
    const list = byNote.get(k);
    if (list) list.push(Number(r.stars));
    else byNote.set(k, [Number(r.stars)]);
  }
  const out = new Map<string, RatingSummary>();
  for (const [k, stars] of byNote) out.set(k, summarizeStars(stars));
  return out;
}

/**
 * 평가 남기기 — 한 사람이 한 노트에 한 번. 다시 누르면 점수가 바뀐다(행은 하나).
 * created = 이 사람의 첫 평가인가(작성자 알림을 한 번만 보내려는 값).
 */
export async function rateNote(input: {
  noteId: string;
  raterEmail: string;
  stars: number;
}): Promise<{ created: boolean }> {
  const email = input.raterEmail.trim().toLowerCase();
  const sb = getServiceSupabase();
  if (!sb) {
    const hit = memory.find((r) => r.note_id === input.noteId && r.rater_email === email);
    if (hit) {
      hit.stars = input.stars;
      return { created: false };
    }
    memory.push({ note_id: input.noteId, rater_email: email, stars: input.stars });
    return { created: true };
  }
  const { data: prev, error: readErr } = await sb
    .from("note_ratings")
    .select("id")
    .eq("note_id", input.noteId)
    .eq("rater_email", email)
    .maybeSingle();
  if (readErr) throw new Error(`note_ratings 조회 실패: ${readErr.message}`);
  /* 같은 사람이 두 탭에서 동시에 눌러도 행은 하나 — (note_id, rater_email) 유일 제약에 얹는다 */
  const { error } = await sb
    .from("note_ratings")
    .upsert(
      { note_id: input.noteId, rater_email: email, stars: input.stars, updated_at: new Date().toISOString() },
      { onConflict: "note_id,rater_email" },
    );
  if (error) throw new Error(`note_ratings 저장 실패: ${error.message}`);
  return { created: !prev };
}

/** 여러 노트의 댓글 수(지워진 댓글 제외) — 목록 카드용. 0건인 노트는 담기지 않는다 */
export async function getNoteCommentCounts(noteIds: string[]): Promise<Map<string, number>> {
  const ids = [...new Set(noteIds.map((s) => String(s ?? "").trim()).filter(Boolean))];
  const out = new Map<string, number>();
  if (ids.length === 0) return out;
  const sb = getServiceSupabase();
  if (!sb) return out;
  const { data, error } = await sb
    .from("note_comments")
    .select("note_id")
    .in("note_id", ids)
    .is("deleted_at", null)
    .limit(5000);
  if (error) throw new Error(`note_comments 수 조회 실패: ${error.message}`);
  for (const r of (data ?? []) as { note_id: string }[]) {
    const k = String(r.note_id);
    out.set(k, (out.get(k) ?? 0) + 1);
  }
  return out;
}
