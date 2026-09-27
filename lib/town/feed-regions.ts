/**
 * [v4] 동네이야기 피드의 지역 줄 — 순수 함수(서버·클라이언트·테스트 공용, server-only 없음).
 *
 * 예전엔 app/town/page.tsx 안의 "우리 동네 홈" 바로가기(동네 홈으로 가는 링크 칩 8개 + "최근 노트·글 기준"
 * 설명)였다. v4 "한 화면 한 가지"에서 칩은 **누르면 상태가 바뀌는 필터만**(v4 규칙 6)이라, 이 줄은
 * 피드를 그 동네 글로 거르는 필터 칩이 됐다. 동네 홈(/town/[region])은 그대로 닿는다 — 페이지 아래
 * "동네 홈 전체" 인덱스, 그리고 지역을 고른 뒤 목록 끝의 "{동네} 동네 홈 보기" 링크.
 *
 * 세는 모수는 **이 피드가 손에 든 카드**다(첫 장 + "더 보기"로 받은 장). 칩 숫자 = 누르면 보이는 행 수.
 */

/* [#64] 노트·글이 실제로 있는 지역 위주 8곳(수동 선정 — 옛 TOWN_HOME_SHORTCUTS 그대로).
   id 는 동네 홈 경로(/town/{id})이자 URL 필터 값(?region={id})이다. */
export const TOWN_FEED_REGIONS = [
  { id: "gangnam", name: "강남구" },
  { id: "nowon", name: "노원구" },
  { id: "mapo", name: "마포구" },
  { id: "songpa", name: "송파구" },
  { id: "seongnam-bundang", name: "성남 분당구" },
  { id: "suwon-yeongtong", name: "수원 영통구" },
  { id: "goyang-deogyang", name: "고양 덕양구" },
  { id: "incheon-yeonsu", name: "인천 연수구" },
] as const;

export type TownFeedRegion = (typeof TOWN_FEED_REGIONS)[number];
export type TownFeedRegionId = TownFeedRegion["id"];

export function isTownFeedRegionId(v: string | null | undefined): v is TownFeedRegionId {
  return typeof v === "string" && TOWN_FEED_REGIONS.some((r) => r.id === v);
}

export function townFeedRegionById(id: string | null | undefined): TownFeedRegion | null {
  return TOWN_FEED_REGIONS.find((r) => r.id === id) ?? null;
}

/**
 * 카드의 region("서울 마포구 아현동")이 이 동네("마포구")인가.
 * [B25] "성남 분당구" 처럼 두 토막인 이름은 두 토막이 **모두** 들어가야 그 동네다
 * ("분당구"만 보면 다른 시의 동명 구가 섞이고, "성남"만 보면 수정구도 걸린다).
 */
export function regionMatches(cardRegion: string | null | undefined, name: string): boolean {
  const r = (cardRegion ?? "").replace(/\s+/g, "");
  if (!r) return false;
  const parts = name.split(/\s+/).filter(Boolean);
  return parts.length > 0 && parts.every((p) => r.includes(p));
}

export type TownRegionChip = { id: TownFeedRegionId; name: string; count: number };

/**
 * 카드 목록 → 지역 칩. 0건인 동네는 싣지 않는다(눌러 보고 빈 목록을 만나는 칩은 만들지 않는다),
 * 많은 순 · 같은 수면 목록 순서(임의 재배열 금지).
 */
export function townRegionChips(cards: ReadonlyArray<{ region?: string | null }>): TownRegionChip[] {
  return TOWN_FEED_REGIONS.map((r, order) => ({
    id: r.id,
    name: r.name as string,
    count: cards.filter((c) => regionMatches(c.region, r.name)).length,
    order,
  }))
    .filter((r) => r.count > 0)
    .sort((a, b) => b.count - a.count || a.order - b.order)
    .map(({ id, name, count }) => ({ id, name, count }));
}

/**
 * 목록 행 메타 줄의 동네 표기 — 세 토막 이상이면 끝의 동·읍·면·리·가 토막을 뗀다
 * ("서울 동대문구 용두동" → "서울 동대문구"). 제목이 대개 동 이름까지 적고 있어 메타에서 또 적지 않는다.
 * 지역이 없다는 뜻인 "전국"·빈 값은 "" — 메타 줄에서 그 칸을 뺀다.
 */
export function feedRegionLabel(region: string | null | undefined): string {
  const tokens = (region ?? "").trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0 || (tokens.length === 1 && tokens[0] === "전국")) return "";
  if (tokens.length >= 3 && /(?:동|읍|면|리|가)$/.test(tokens[tokens.length - 1])) tokens.pop();
  return tokens.join(" ");
}

/** [v4 · 요약본] 목록 행 제목을 짧게 — 소유자 "글자를 요약본으로 간단하게 보이도록".
 *  ① 메타 줄이 이미 동네를 말하므로 제목 앞의 같은 지역 낱말("서울 동대문구 용두동")을 뗀다.
 *  ② Lab 카드(운영진이 실거래로 만든 노트)는 괄호 속 부연("(2023-06 준공, 4,086세대 …)")을 뗀다 —
 *     사람이 쓴 글의 괄호는 뜻일 수 있어 건드리지 않는다.
 *  남는 글이 두 글자 미만이면 원문을 그대로 쓴다(지어내지 않는다). */
export function feedDisplayTitle(
  title: string,
  region: string | null | undefined,
  opts: { lab?: boolean } = {},
): string {
  const original = (title ?? "").trim();
  if (!original) return original;
  const regionTokens = new Set((region ?? "").trim().split(/\s+/).filter(Boolean));
  const tokens = original.split(/\s+/);
  /* Lab 제목은 "시도 시군구 동 단지명(부연)" 꼴이 정해져 있어, 지역 목록에 없더라도 행정 이름 모양이면 뗀다.
     사람 글은 "이동 동선…" 같은 낱말을 지명으로 잘못 뗄 수 있어 이 카드의 지역 낱말만 뗀다. */
  const isAdmin = (t: string) =>
    /^(서울|경기|인천|부산|대구|광주|대전|울산|세종|강원|충북|충남|전북|전남|경북|경남|제주)/.test(t) ||
    /^[가-힣]{1,5}(시|군|구|동|읍|면|리)$/.test(t);
  let i = 0;
  while (i < tokens.length - 1 && (regionTokens.has(tokens[i]) || (opts.lab && isAdmin(tokens[i])))) i += 1;
  let out = tokens.slice(i).join(" ");
  if (opts.lab) {
    /* 괄호가 시작되는 곳에서 끊는다 — 그 뒤는 준공·세대·면적 같은 부연이고, 메타·상세가 따로 말한다 */
    const open = out.search(/[(（]/);
    if (open >= 2) out = out.slice(0, open);
    out = out.trim();
  }
  return out.length >= 2 ? out : original;
}

/** [v4 · 요약본] 작성자 표기 — "내집나우 Lab · AI 임장노트 #12" 처럼 붙은 부연은 첫 마디만 */
export function feedAuthorLabel(author: string | null | undefined): string {
  return (author ?? "").split(" · ")[0].trim();
}
