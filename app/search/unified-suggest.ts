import { complexFacts, complexPlace, type ComplexPreview } from "@/lib/search/complex-preview";

/* [1008 · S] 헤더 검색(HeaderSearch)·홈 검색(HomeHeroSearch)이 같이 쓰는 통합 검색 응답 → 목록 한 줄.
   예전엔 두 파일이 같은 flatten 을 각자 들고 있었다(한쪽만 고치면 두 화면이 다른 말을 한다).
   단지 줄에는 미리보기 값(읍면동·세대수·6개월 거래)과 "비슷한 이름" 표시를 싣는다 — 같은 이름 단지 가르기. */

export interface UnifiedJson {
  complexes?: ComplexPreview[];
  listings?: { id: string; title: string; price: string }[];
  notes?: { id: string; title: string }[];
  /** [1007 · P2] 이웃 글 — /town/story/ (뉴스와 다른 상세). 옛 응답엔 없을 수 있어 선택 */
  stories?: { id: string; title: string; author: string; region: string }[];
  news?: { id: string; title: string; source: string }[];
  /** 전 그룹 0건일 때만 오는 "비슷한 이름" 단지 제안 */
  suggestions?: ComplexPreview[];
  failed?: string[];
}

export interface FlatItem {
  key: string;
  label: string;
  title: string;
  meta: string;
  href: string;
  /** 단지 줄 둘째 줄("1,710세대 · 6개월 거래 120건") */
  facts?: string;
  fuzzy?: boolean;
  complex?: boolean;
}

const PER_GROUP = 3;

export function complexItem(c: ComplexPreview): FlatItem {
  return {
    key: `complex-${c.id}`,
    label: "단지",
    title: c.name,
    meta: complexPlace(c),
    href: `/complex/${encodeURIComponent(c.id)}`,
    facts: complexFacts(c).join(" · "),
    fuzzy: c.fuzzy === true,
    complex: true,
  };
}

export function flattenUnified(r: UnifiedJson): FlatItem[] {
  const out: FlatItem[] = (r.complexes ?? []).slice(0, PER_GROUP).map(complexItem);
  const push = (kind: string, label: string, id: string, title: string, meta: string, base: string) =>
    out.push({ key: `${kind}-${id}`, label, title, meta, href: `${base}/${encodeURIComponent(id)}` });
  (r.listings ?? []).slice(0, PER_GROUP).forEach((l) => push("listing", "매물", l.id, l.title, l.price, "/listings"));
  (r.notes ?? []).slice(0, PER_GROUP).forEach((n) => push("note", "노트", n.id, n.title, "", "/notes"));
  (r.stories ?? []).slice(0, PER_GROUP).forEach((p) => push("story", "이야기", p.id, p.title, p.region || p.author, "/town/story"));
  (r.news ?? []).slice(0, PER_GROUP).forEach((n) => push("news", "뉴스", n.id, n.title, n.source, "/town/news"));
  return out;
}
