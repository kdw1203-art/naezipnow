/* [1143 · 게시판 보기] 소유자 2026-11-11 "게시글이 많아지면 찾을 수 있게 페이지 형식으로 · 제목 · 내용 · 키워드 조건 검색".
   순수 규칙 — 주소 인자 읽기 · 검색 조건 · 쪽 번호. /board 가 쓴다(server-only 없음 · node:test 가 그대로 부른다). */

export const BOARD_PAGE_SIZE = 20;
export const BOARD_KINDS = ["story", "news", "notes"] as const;
export type BoardKind = (typeof BOARD_KINDS)[number];
export const BOARD_KIND_LABEL: Record<BoardKind, string> = { story: "동네 글", news: "뉴스", notes: "임장노트" };
export const BOARD_FIELDS = ["all", "title", "content", "tag"] as const;
export type BoardField = (typeof BOARD_FIELDS)[number];
export const BOARD_FIELD_LABEL: Record<BoardField, string> = { all: "제목 + 내용", title: "제목", content: "내용", tag: "키워드" };

export type BoardParams = { kind: BoardKind; field: BoardField; q: string; page: number };

/** 검색어 — PostgREST or() · ilike 를 깨는 글자를 빼고 40자까지 */
export function boardQuery(raw: unknown): string {
  return String(typeof raw === "string" ? raw : "")
    .replace(/[,()%*\\{}"'`]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 40);
}

export function parseBoardParams(sp: Record<string, string | string[] | undefined>): BoardParams {
  const one = (k: string) => (Array.isArray(sp[k]) ? sp[k]?.[0] : sp[k]) as string | undefined;
  const kind = (BOARD_KINDS as readonly string[]).includes(one("kind") ?? "") ? (one("kind") as BoardKind) : "story";
  const field = (BOARD_FIELDS as readonly string[]).includes(one("in") ?? "") ? (one("in") as BoardField) : "all";
  const n = Number.parseInt(one("page") ?? "1", 10);
  return { kind, field, q: boardQuery(one("q")), page: Number.isFinite(n) && n >= 1 ? Math.min(n, 5000) : 1 };
}

/** 표마다 열 이름이 다르다 — 동네 글(posts: body · tags text[]) · 뉴스(board_posts: content · tags jsonb · ai_keywords jsonb)
 *  · [1145] 임장노트(inspection_notes: 제목 = title · apt_name / 내용 = summary · public_summary / 키워드 = region · apt_name) */
export function boardOrFilter(kind: BoardKind, field: BoardField, q: string): string | null {
  if (!q) return null;
  const like = `%${q}%`;
  if (kind === "notes") {
    const title = [`title.ilike.${like}`, `apt_name.ilike.${like}`];
    const content = [`summary.ilike.${like}`, `public_summary.ilike.${like}`];
    if (field === "title") return title.join(",");
    if (field === "content") return content.join(",");
    if (field === "tag") return [`region.ilike.${like}`, `apt_name.ilike.${like}`].join(",");
    return [...title, ...content].join(",");
  }
  const body = kind === "story" ? "body" : "content";
  const tag = kind === "story" ? [`tags.cs.{"${q}"}`] : [`tags.cs.["${q}"]`, `ai_keywords.cs.["${q}"]`];
  if (field === "title") return `title.ilike.${like}`;
  if (field === "content") return `${body}.ilike.${like}`;
  if (field === "tag") return tag.join(",");
  return [`title.ilike.${like}`, `${body}.ilike.${like}`].join(",");
}

export function boardHref(p: Partial<BoardParams>): string {
  const qs = new URLSearchParams();
  if (p.kind && p.kind !== "story") qs.set("kind", p.kind);
  if (p.q) qs.set("q", p.q);
  if (p.field && p.field !== "all") qs.set("in", p.field);
  if (p.page && p.page > 1) qs.set("page", String(p.page));
  const s = qs.toString();
  return s ? `/board?${s}` : "/board";
}

/** 쪽 번호 줄 — 지금 쪽 앞뒤 2쪽 + 처음 · 끝. 빈 틈은 0 */
export function pageWindow(page: number, total: number, size = BOARD_PAGE_SIZE): { pages: number[]; last: number; current: number } {
  const last = Math.max(1, Math.ceil(total / size));
  const current = Math.min(Math.max(1, page), last);
  const set = new Set<number>([1, last]);
  for (let i = current - 2; i <= current + 2; i++) if (i >= 1 && i <= last) set.add(i);
  const sorted = [...set].sort((a, b) => a - b);
  const pages: number[] = [];
  sorted.forEach((n, i) => {
    if (i > 0 && n - sorted[i - 1] > 1) pages.push(0);
    pages.push(n);
  });
  return { pages, last, current };
}
