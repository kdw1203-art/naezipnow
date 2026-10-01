import { complexFacts, complexPlace, type ComplexPreview } from "@/lib/search/complex-preview";

/* [1026d · 검색] 응답의 intent(검색 범위·조건 칩) · areas(지역 줄) · related(연관 검색)를 싣는다 — 지역 줄이 맨 위.
   [1008 · S] 헤더 검색(HeaderSearch)·홈 검색(HomeHeroSearch)이 같이 쓰는 통합 검색 응답 → 목록 한 줄.
   예전엔 두 파일이 같은 flatten 을 각자 들고 있었다(한쪽만 고치면 두 화면이 다른 말을 한다).
   단지 줄에는 미리보기 값(읍면동·세대수·6개월 거래)과 "비슷한 이름" 표시를 싣는다 — 같은 이름 단지 가르기. */

/** [1026d] 검색 범위(어디를 · 어떤 조건으로) — 서버 lib/search/intent-server SearchIntentInfo 와 같은 모양 */
export interface IntentJson {
  mode: "filter" | "area" | "name";
  scope: { label: string; kind: string; q: string; lat: number | null; lng: number | null } | null;
  chips: { key: string; label: string; token: string }[];
  unsupported: { key: string; label: string; token: string }[];
  total: number | null;
}
/** [1026d] 지역 줄 */
export interface AreaJson {
  key: string;
  kind: string;
  label: string;
  q: string;
  complexCount: number;
  recentTradeCount: number;
  lat: number | null;
  lng: number | null;
}
/** [1026d] 연관 검색("마포구 신축" 23곳) */
export interface RelatedJson {
  q: string;
  label: string;
  count: number;
  /** [1026e] cond · dong · sgg · brand */
  kind?: string;
}

/** [1026e] 연관 검색어 한 낱말(다음 낱말 · 낱말 완성) */
export interface NextWordJson {
  kind?: string;
  word: string;
  label: string;
  count: number;
}

export interface UnifiedJson {
  intent?: IntentJson | null;
  areas?: AreaJson[];
  related?: RelatedJson[];
  /** [1026e] 띄어 쓴 뒤 붙일 낱말 · 마지막 낱말 완성 */
  next?: NextWordJson[];
  complete?: NextWordJson[];
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
  /** [1026d] 단지 원본 — 패널(동적 청크)이 음영 주소 줄을 여기서 만든다 */
  preview?: ComplexPreview;
  /** [1026d] 지역 줄 */
  area?: AreaJson;
  /** [1026e] 연관 검색어 줄 — 누르면 이 말로 입력을 바꾸고 이어서 고른다(이동하지 않는다) */
  keyword?: string;
  kwCount?: number;
  /** 검색어 뒤에 붙은 낱말(굵게) */
  kwWord?: string;
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
    preview: c,
  };
}

/** [1026d] 지역 줄 → 목록 한 줄(누르면 그 지역 검색) */
export function areaItem(a: AreaJson): FlatItem {
  return { key: `area-${a.key}`, label: "지역", title: a.label, meta: "", href: `/search?q=${encodeURIComponent(a.q)}`, area: a };
}

/** [1026e] 연관 검색어 줄 */
export function keywordItem(k: { q: string; word: string; label: string; count: number }): FlatItem {
  return { key: `kw-${k.q}`, label: k.label, title: k.q, meta: "", href: `/search?q=${encodeURIComponent(k.q)}`, keyword: k.q, kwCount: k.count, kwWord: k.word };
}

/** [1026d] 음영 자동완성 후보 — 목록 순서 그대로(지역은 다시 검색할 말, 단지는 이름) */
export function ghostCandidates(items: readonly FlatItem[]): string[] {
  return items.filter((it) => it.area || it.complex).map((it) => (it.area ? it.area.q : it.title));
}

export function flattenUnified(r: UnifiedJson): FlatItem[] {
  /* [1026d] 지역 줄 먼저(최대 3) · 조건·지역 검색이면 단지를 5줄까지 */
  const cx = r.intent && r.intent.mode !== "name" ? 5 : PER_GROUP;
  const out: FlatItem[] = [
    ...(r.areas ?? []).slice(0, 3).map(areaItem),
    ...(r.complexes ?? []).slice(0, cx).map(complexItem),
  ];
  const push = (kind: string, label: string, id: string, title: string, meta: string, base: string) =>
    out.push({ key: `${kind}-${id}`, label, title, meta, href: `${base}/${encodeURIComponent(id)}` });
  (r.listings ?? []).slice(0, PER_GROUP).forEach((l) => push("listing", "매물", l.id, l.title, l.price, "/listings"));
  (r.notes ?? []).slice(0, PER_GROUP).forEach((n) => push("note", "노트", n.id, n.title, "", "/notes"));
  (r.stories ?? []).slice(0, PER_GROUP).forEach((p) => push("story", "이야기", p.id, p.title, p.region || p.author, "/town/story"));
  (r.news ?? []).slice(0, PER_GROUP).forEach((n) => push("news", "뉴스", n.id, n.title, n.source, "/town/news"));
  return out;
}
