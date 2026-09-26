import "server-only";
import { cache } from "react";
import { revalidateTag, unstable_cache } from "next/cache";
import {
  getNote,
  listNotesByAuthorForApt,
  listNotesByAuthorForComplex,
  listPublicNoteCards,
  type InspectionNote,
  type PublicNoteCard,
} from "@/lib/inspection/store-db";
import { listNoteComments, type NoteComment } from "@/lib/inspection/note-comments";
import {
  NOTE_CACHE_REVALIDATE_SEC,
  PUBLIC_NOTES_LIST_TAG,
  tagsToRevalidate,
  type NoteMutation,
} from "@/lib/inspection/note-cache-tags";
import { logger } from "@/lib/log";

/* [969 · 20] 공개 임장노트 상세의 데이터 캐시 — 서버 전용.
 *
 * ── 무엇을 캐시하나 ─────────────────────────────────────────────────────────
 * /notes/[id] 가 공개 노트 한 편을 그리기 위해 하는 서버 조회 가운데 **뷰어와 무관한**
 * 것만 — (1) 노트 행, (2) 같은 작성자·같은 단지의 공개 회차, (3) 댓글 목록, (4) 관련
 * 노트 풀(공개 노트 카드 50장). 세션·소유자 판정·구매 열람·플랜·소프트월은 요청마다
 * 그대로 한다(뷰어별 값이라 캐시하면 새거나 틀린다).
 *
 * ── 비공개 노트는 절대 캐시에 싣지 않는다(두 겹) ──────────────────────────
 *  1) 회차·댓글 로더는 `assertPublic()` 뒤에만 부를 수 있다 — 페이지가 공개 여부를 확인한
 *     뒤에 부르고, 아니면 여기서 던진다.
 *  2) 노트 행 로더는 공개 여부를 **알아내는** 조회라 미리 확인할 수 없다. 그래서 캐시
 *     함수 자체가 공개가 아닌 행을 null 로 바꿔 돌려준다 — 저장되는 것은 "공개 아님"
 *     이라는 null 뿐, 비공개 본문은 한 글자도 실리지 않는다. 회차 로더도 공개 회차만
 *     걸러 저장한다(형제 회차의 비공개 본문도 싣지 않는다).
 *
 * ── 왜 null 을 저장하나(던지지 않고) ────────────────────────────────────────
 * unstable_cache 는 콜백이 던지면 아무것도 저장하지 않지만, 시간 만료(stale) 뒤에는
 * 낡은 값을 먼저 내고 뒤에서 다시 채운다. 그때 콜백이 던지면 낡은 공개 행이 계속
 * 나간다 — 어떤 경로가 태그 비움을 놓친 채 노트를 비공개로 돌렸다면 영원히. null 을
 * 저장하면 다음 방문부터 실조회로 내려가 스스로 고쳐진다.
 *
 * ── 태그 ────────────────────────────────────────────────────────────────────
 * lib/inspection/note-cache-tags.ts 한 곳. 비우는 쪽은 invalidateNoteCache().
 *
 * ── [1007] 노트 id 별 항목은 데이터 캐시에서 뺐다 ───────────────────────────
 * 실측: 공개 노트 34편, /notes/[id] 열람은 하루 200회 미만(24h 상위 24 라우트 밖)이고
 * 그 대부분이 크롤러의 1회성 방문이다. 5분(댓글 1분) TTL 의 id 별 항목(행·회차·댓글)은
 * 방문마다 만료돼 있어 **쓰기 3건 · 읽기 0건**이 반복됐다 — ISR Writes 만 들고 DB 왕복은
 * 그대로였다. 그래서 (1)~(3) 은 React cache() 로 바꿔 **같은 렌더 안**(generateMetadata +
 * 본문)의 중복만 막고, 노트 수와 무관한 공용 한 벌인 (4) 관련 노트 풀만 unstable_cache 로
 * 남긴다. 함수 이름·계약(공개 아니면 null·실패는 던짐·비공개 본문 미노출)은 그대로다.
 * invalidateNoteCache() 의 태그 계약도 그대로 — note:<id> 류 태그는 이제 붙는 항목이 없어
 * 비워도 no-op 이고, public-notes 태그가 (4) 를 비운다. */

function assertPublic(note: Pick<InspectionNote, "id" | "isPublic">, where: string): void {
  if (!note.isPublic) {
    throw new Error(`[note-cache] ${where}: 공개 노트가 아닌데 캐시 로더를 불렀어요 (${note.id})`);
  }
}

/* inspection_notes.id 는 uuid 다. 형식이 아닌 값(/notes/mock-1 같은 봇·오타 링크, 키 없는
   개발 환경의 mem-… id)은 getNote 도 DB 없이 null 을 주므로, 캐시에 null 항목을 하나씩
   남길 이유가 없다 — 캐시를 건너뛴다. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * 공개 노트 행 — [1007] 요청 안 중복 제거(React cache). 예전엔 데이터 캐시(5분, note:<id>).
 * 공개가 아니거나 없으면 null. 호출자는 null 을 "비공개거나 없음" 으로만 읽고 실조회로
 * 내려간다(소유자·구매 열람 판정은 그 뒤). 조회 실패는 던진다.
 */
const loadPublicNoteRow = cache(async (noteId: string): Promise<InspectionNote | null> => {
  const note = await getNote(noteId);
  /* 두 번째 가드 — 비공개 행은 본문 대신 null 로 바꿔 돌려준다 */
  return note && note.isPublic ? note : null;
});

export async function getPublicNoteCached(id: string): Promise<InspectionNote | null> {
  if (!UUID_RE.test(id)) return null;
  const note = await loadPublicNoteRow(id);
  /* 어떤 경로로든 비공개 행이면 쓰지 않는다(방어) */
  return note && note.isPublic ? note : null;
}

/**
 * 같은 작성자·같은 단지의 **공개** 회차 목록 — [1007] 요청 안 중복 제거(React cache).
 * 예전엔 데이터 캐시(5분, note:<id> + public-notes). 비소유자 뷰어용이다(소유자는 비공개
 * 회차도 봐야 하므로 실조회). 공개 노트에서만 부른다. 방문일 오름차순(store-db 정렬 그대로).
 * 조회 실패는 던진다.
 */
const loadPublicVisitGroup = cache(
  async (authorEmail: string, complexId: string, apt: string): Promise<InspectionNote[]> => {
    const rows = complexId
      ? await listNotesByAuthorForComplex(authorEmail, complexId)
      : await listNotesByAuthorForApt(authorEmail, apt);
    /* 비공개 회차는 돌려주지 않는다 — 화면도 비소유자에겐 공개 회차만 그린다 */
    return rows.filter((r) => r.isPublic);
  },
);

export async function listPublicVisitGroupCached(note: InspectionNote): Promise<InspectionNote[]> {
  assertPublic(note, "listPublicVisitGroupCached");
  const complexId =
    typeof note.metadata?.complexId === "string" ? note.metadata.complexId.trim() : "";
  const apt = note.aptName?.trim() ?? "";
  if (!complexId && !apt) return [];
  /* React cache() 키는 메모리 안 인자 비교라 이메일이 어디에도 직렬화되지 않는다 */
  return loadPublicVisitGroup(note.authorEmail, complexId, apt);
}

/**
 * 공개 노트의 댓글 목록 — [1007] 요청 안 중복 제거(React cache). 예전엔 데이터 캐시(60초,
 * note:<id> + note-comments:<id>). 비로그인 뷰어용이다. 로그인 뷰어는 "내 댓글" 판정에
 * author_email 이 필요한데 그 값은 공개 응답 모양(NoteComment)에 설계상 없으므로
 * 실조회(listNoteCommentsForViewer)로 간다. 공개 노트에서만 부른다. 조회 실패는 던진다.
 */
const loadPublicNoteComments = cache((noteId: string): Promise<NoteComment[]> => listNoteComments(noteId));

export async function listPublicNoteCommentsCached(note: InspectionNote): Promise<NoteComment[]> {
  assertPublic(note, "listPublicNoteCommentsCached");
  return loadPublicNoteComments(note.id);
}

/**
 * 관련 노트 풀 — 최신 공개 노트 카드 50장(5분, public-notes). 노트 id 와 무관한 전역
 * 한 벌이다: 노트마다 한 벌씩 두면 50장 목록이 노트 수만큼 복제되고, 다른 노트가 공개될
 * 때 비워야 하는 것도 어차피 "목록" 이라 note:<id> 로는 잡히지 않는다.
 * 전체 행(jsonb 5개) 대신 카드 컬럼만 읽는다 — RelatedNotes 가 그리는 것은 제목·지역·
 * 단지명·점수뿐이다. 조회 실패는 던진다(호출부가 섹션만 접는다).
 */
export const listRelatedNotePoolCached: () => Promise<PublicNoteCard[]> = unstable_cache(
  () => listPublicNoteCards(50),
  ["related-notes-pool-v1"],
  { revalidate: NOTE_CACHE_REVALIDATE_SEC, tags: [PUBLIC_NOTES_LIST_TAG] },
);

/**
 * 노트가 바뀐 직후 부른다 — 변경 종류에 맞는 태그를 비운다(note-cache-tags.ts).
 * 요청 밖(크론·잡 러너)에서는 revalidateTag 가 던지므로 삼키고 경고만 남긴다 —
 * 그 경우 5분 시간 만료가 안전망이다. [1007] 이후 실제로 항목이 붙어 있는 태그는
 * public-notes(관련 노트 풀)뿐이지만, 호출부 계약을 바꾸지 않으려 태그 목록은 그대로 비운다.
 */
export function invalidateNoteCache(id: string, mutation: NoteMutation): void {
  const noteId = String(id ?? "").trim();
  if (!noteId) return;
  try {
    for (const tag of tagsToRevalidate(noteId, mutation)) revalidateTag(tag);
  } catch (e) {
    logger.warn("[note-cache] 태그 비움 실패(무시)", mutation, noteId, e);
  }
}

/**
 * `[note-timing]` 로그 게이트 — NOTE_TIMING_LOG=1 이면 전부, 아니면 20건 중 1건만.
 * console.info 를 쓰는 이유는 [complex-timing] 과 같다(logger.info 는 운영에서 침묵).
 */
export function shouldLogNoteTiming(): boolean {
  return process.env.NOTE_TIMING_LOG === "1" || Math.random() < 0.05;
}
