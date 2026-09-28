/* [1023 · 임장노트] 상세 "같은 지역 다른 임장노트" 의 정렬 — 같은 단지(aptName) 를 앞줄로.
 *
 * 규칙(docs/review-1022.md 1장 ①): RelatedNotes 는 region 만으로 뽑아 같은 단지의 다른 사람
 * 노트가 같은 지역 노트 사이에 묻혔다. 목록 행에 aptName 이 이미 있으니, aptName 일치를 앞줄
 * ("같은 단지" 캡션), 나머지를 뒤("같은 지역")로 둔다. 각 줄 안의 순서(rankRelatedNotes 결과)는
 * 그대로 — 안정 분할이다. 순수 모듈. */

export type AptOrderable = { aptName?: string | null };

export type RelatedTier = "apt" | "region";

/** 단지명 비교 정규형 — 공백 제거·소문자. 빈 값은 어떤 것과도 같지 않다 */
export function aptKey(s: string | null | undefined): string {
  return String(s ?? "")
    .replace(/\s+/g, "")
    .toLowerCase();
}

export function orderRelatedByApt<T extends AptOrderable>(
  pool: ReadonlyArray<T>,
  currentApt: string | null | undefined,
): Array<{ note: T; tier: RelatedTier }> {
  const key = aptKey(currentApt);
  if (!key) return pool.map((note) => ({ note, tier: "region" as const }));
  const same: Array<{ note: T; tier: RelatedTier }> = [];
  const rest: Array<{ note: T; tier: RelatedTier }> = [];
  for (const note of pool) {
    if (aptKey(note.aptName) === key) same.push({ note, tier: "apt" });
    else rest.push({ note, tier: "region" });
  }
  return [...same, ...rest];
}
