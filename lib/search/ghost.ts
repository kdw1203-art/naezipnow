/**
 * [1026d · 검색] 입력칸 음영 자동완성 — 친 글자 뒤에 첫 후보의 나머지를 흐리게 잇는다(Tab · → · 눌러서 채움).
 * 헤더 검색(전 페이지 첫 묶음)이 부른다 — 작게 유지할 것. 그리는 부분은 app/search/GhostText(동적 청크).
 */

/** 앞쪽 후보(최대 4개) 가운데 친 글자로 시작하는 첫 이름의 나머지 — 없으면 "".
 *  [1026e] 띄어 쓴 뒤에도 잇는다 — 연관 검색어("마포 " → "마포 신축")가 후보 맨 앞에 온다. */
export function ghostRest(typed: string, candidates: readonly string[]): string {
  if (!typed || /\s{2,}$/.test(typed)) return "";
  const t = typed.toLowerCase();
  for (const c of candidates.slice(0, 4)) {
    if (c && c.length > typed.length && c.toLowerCase().startsWith(t)) return c.slice(typed.length);
  }
  return "";
}

/** [1026e] 연관 검색어 한 낱말(서버 lib/search/query-intent NextWord 와 같은 모양) */
export interface KwWord {
  word: string;
  label: string;
  count: number;
}

/**
 * [1026e · 연관 검색어] 드롭다운 맨 위 검색어 줄 — 띄어 썼으면 다음 낱말("마포 " → 마포 신축 · 마포 아현동 · 마포 래미안),
 * 아니면 마지막 낱말 완성("마포 래" → 마포 래미안). 받아 온 검색어와 지금 입력이 같을 때만(치는 중의 낡은 답은 안 쓴다).
 */
export function keywordPhrases(
  raw: string,
  searched: string,
  next: readonly KwWord[],
  complete: readonly KwWord[],
  max = 5,
): Array<KwWord & { q: string }> {
  const cur = raw.replace(/\s+/g, " ");
  const base = searched.replace(/\s+/g, " ").trim();
  if (!base || cur.trim() !== base) return [];
  if (cur.endsWith(" ")) return next.slice(0, max).map((w) => ({ ...w, q: `${base} ${w.word}` }));
  const i = base.lastIndexOf(" ");
  return i < 0 ? [] : complete.slice(0, max).map((w) => ({ ...w, q: `${base.slice(0, i)} ${w.word}` }));
}
