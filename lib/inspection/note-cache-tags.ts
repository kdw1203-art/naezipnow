/* [969 · 20] 공개 임장노트 데이터 캐시 태그 — 순수 함수(유닛 테스트: tests/unit/note-cache-969.test.ts).
 *
 * ── 왜 ──────────────────────────────────────────────────────────────────────
 * /notes/[id] 는 소유자(비공개 열람·수정·삭제)와 공개 뷰어를 같은 라우트가 받아
 * force-dynamic 이고 세션을 읽는다 — 페이지 HTML(ISR)은 캐시할 수 없다. 대신
 * "누가 보든 같은" 서버 조회(공개 노트 행·공개 회차 목록·댓글 목록·관련 노트 풀)만
 * unstable_cache 에 묶고(lib/inspection/note-cache.ts), 노트가 바뀌는 모든 지점에서
 * 여기 태그로 비운다. 태그 문자열은 캐시를 만들 때와 비울 때 **반드시 같은 함수**로
 * 만든다 — 손으로 적으면 한 글자 차이로 영원히 안 비워진다.
 *
 * ── 태그 ────────────────────────────────────────────────────────────────────
 *  note:<id>           노트 행 + 그 노트 기준 공개 회차 목록. 내용·공개 여부·삭제·(요청대로)
 *                      댓글 변경에도 비운다.
 *  note-comments:<id>  댓글 목록(60초). 댓글 작성·삭제·노트 삭제에 비운다.
 *  public-notes        공개 노트 "목록" 성격의 캐시(관련 노트 풀·공개 회차). 노트 내용·
 *                      공개 여부·삭제가 바뀌면 비운다 — 다른 노트의 관련 목록에 제목·점수가
 *                      낡은 채 5분간 남지 않게. 수정은 하루 몇 건, 열람은 그 수백 배라
 *                      "수정 때마다 통째로 비움" 이 싸다.
 *
 * 비공개 노트는 어느 태그로도 캐시에 실리지 않는다(note-cache.ts 의 두 겹 가드). */

/** 공개 노트 행·공개 회차 목록·관련 노트 풀의 revalidate(초) */
export const NOTE_CACHE_REVALIDATE_SEC = 300;
/** 댓글 목록의 revalidate(초) — 새 댓글이 태그 비움을 놓쳐도 1분이면 보인다 */
export const NOTE_COMMENTS_CACHE_REVALIDATE_SEC = 60;
/** 공개 노트 목록 성격의 캐시(관련 노트 풀·공개 회차)에 함께 붙이는 태그 */
export const PUBLIC_NOTES_LIST_TAG = "public-notes";

function cleanId(id: string): string {
  return String(id ?? "").trim();
}

/** 노트 한 건의 태그 — `note:<id>` */
export function noteTag(id: string): string {
  return `note:${cleanId(id)}`;
}

/** 노트 한 건의 댓글 목록 태그 — `note-comments:<id>` */
export function noteCommentsTag(id: string): string {
  return `note-comments:${cleanId(id)}`;
}

/** 노트 행 캐시에 붙이는 태그 */
export function noteCacheTags(id: string): string[] {
  return [noteTag(id)];
}

/** 그 노트 기준 공개 회차 목록 캐시에 붙이는 태그 — 형제 회차의 공개 여부가 바뀌면 목록 태그로도 비워진다 */
export function noteVisitsCacheTags(id: string): string[] {
  return [noteTag(id), PUBLIC_NOTES_LIST_TAG];
}

/** 댓글 목록 캐시에 붙이는 태그 — note:<id> 로도 비워진다(노트 삭제 시 함께) */
export function noteCommentsCacheTags(id: string): string[] {
  return [noteTag(id), noteCommentsTag(id)];
}

/**
 * 노트에 일어난 변경의 종류.
 *  content   제목·본문·점수·공개 여부 등 행 자체(PATCH·세션 동기화·신고 숨김·탈퇴 비공개·공개 생성)
 *  metadata  목록·관련 노트에 안 보이는 소유자용 부가 정보(AI 분석 결과·카드 구성)
 *  delete    노트 삭제
 *  comment   댓글 작성·삭제
 */
export type NoteMutation = "content" | "metadata" | "delete" | "comment";

/** 변경 종류별로 비워야 할 태그 — 중복 없이, 순서 고정(테스트가 그대로 비교한다) */
export function tagsToRevalidate(id: string, mutation: NoteMutation): string[] {
  switch (mutation) {
    case "content":
      return [noteTag(id), PUBLIC_NOTES_LIST_TAG];
    case "metadata":
      return [noteTag(id)];
    case "delete":
      return [noteTag(id), noteCommentsTag(id), PUBLIC_NOTES_LIST_TAG];
    case "comment":
      /* 댓글 변경에 note:<id> 까지 비우는 것은 요청 사양(항목 20) — 댓글 수를 노트 행 쪽에
         싣게 되는 날 빠뜨리지 않도록. 행 캐시 한 건 다시 채우는 비용은 조회 1회다. */
      return [noteCommentsTag(id), noteTag(id)];
  }
}

/** 로그·테스트용: 태그가 이 모듈이 만든 형태인지 */
export function isNoteCacheTag(tag: string): boolean {
  return /^note(-comments)?:\S+$/.test(tag) || tag === PUBLIC_NOTES_LIST_TAG;
}
