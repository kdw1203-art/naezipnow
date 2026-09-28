/* [1023 · 임장노트] 피드 검색칸 — 단지·지역·제목 클라이언트 필터(추가 조회 없음).
 *
 * 규칙(docs/review-1022.md 1장 ①): 타이핑 → 손에 든 목록(서버 첫 페이지 + "더 보기" 로 붙인
 * 카드 = allNotes)을 `title · region · aptName` 으로 거른다. 공백·대소문자는 무시하고, 초성
 * 검색은 하지 않는다. 데스크톱 왼쪽 레일 지역 칩과는 AND — 둘 다 걸린 카드만 남는다.
 * 순수 모듈 — 화면·서버 어디서도 부를 수 있고 node:test 로 검증한다. */

export type SearchableNote = {
  title: string;
  region?: string | null;
  aptName?: string | null;
};

/** 검색어·대상 문자열의 정규형 — 공백 전부 제거 + 소문자. 빈 문자열이면 "" */
export function normalizeQuery(s: string | null | undefined): string {
  return String(s ?? "")
    .replace(/\s+/g, "")
    .toLowerCase();
}

/** 검색어가 비어 있으면 모두 통과. 아니면 제목·지역·단지명 중 하나라도 부분 일치 */
export function matchesNoteQuery(n: SearchableNote, query: string | null | undefined): boolean {
  const q = normalizeQuery(query);
  if (!q) return true;
  return [n.title, n.region, n.aptName].some((v) => normalizeQuery(v).includes(q));
}

export function filterNotesByQuery<T extends SearchableNote>(
  notes: ReadonlyArray<T>,
  query: string | null | undefined,
): T[] {
  const q = normalizeQuery(query);
  if (!q) return [...notes];
  return notes.filter((n) => matchesNoteQuery(n, q));
}
