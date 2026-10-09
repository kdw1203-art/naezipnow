/**
 * [1048 · 다요인 분석] 뉴스 제목의 방향 낱말 세기 — 순수(단위 시험 대상).
 *
 * 소유자 지시(2026-10-09): "AI 분석에 심리지수 · 부동산 뉴스 · 관심도 · 거래량 · 추이 · 추세 · 매물수 등 여러 요인을 고려".
 *
 * 뉴스에는 호재/악재 표시가 없다(수집기 점수는 관심·중요도뿐). 그래서 **제목에 실제로 적힌 낱말만** 센다 —
 * 문장 뜻을 짐작하지 않는다. 같은 제목에 오름 낱말과 내림 낱말이 함께 있으면(예: "규제 완화") 둘 다 센다.
 * 화면에는 "제목 낱말 기준"이라고 늘 적는다.
 *
 * 매물: 매물 수를 모으는 원천이 없다(포털 매물 자료는 이용 허락 필요). 대신 지역 기사 제목의
 * "매물 늘어 · 쌓여 · 급매" / "매물 줄어 · 품귀 · 잠김" 을 매물 흐름의 단서로 따로 센다.
 */

/** 가격·수요가 오르는 쪽 낱말 */
export const NEWS_UP_WORDS = [
  "상승",
  "신고가",
  "최고가",
  "반등",
  "강세",
  "오름",
  "올라",
  "뛰고",
  "뛰어",
  "급등",
  "껑충",
  "호재",
  "개통",
  "착공",
  "흥행",
  "완판",
  "품귀",
  "완화",
  "금리 인하",
  "금리인하",
  "회복",
] as const;

/** 가격·수요가 내리는 쪽 낱말 */
export const NEWS_DOWN_WORDS = [
  "하락",
  "내려",
  "내렸",
  "급락",
  "약세",
  "떨어",
  "빠졌",
  "뚝",
  "미분양",
  "침체",
  "위축",
  "관망",
  "급매",
  "절벽",
  "규제 강화",
  "금리 인상",
  "금리인상",
  "가격 인하",
  "연체",
  "경매",
  "유찰",
  "무산",
  "깡통",
  "전세사기",
] as const;

/** 매물이 늘어난다는 단서 */
const LISTING_UP = /매물[^…·,]{0,12}(늘|증가|쌓|적체)|급매|매물\s?폭탄/;
/** 매물이 줄어든다는 단서 */
const LISTING_DOWN = /매물[^…·,]{0,12}(줄|감소|잠김|실종|품귀)|품귀/;

export type TitleTone = {
  up: string[];
  down: string[];
  /** 매물 흐름 단서 — up(늘어남) · down(줄어듦) · null(언급 없음) */
  listing: "up" | "down" | null;
};

export function titleTone(title: string): TitleTone {
  const t = String(title ?? "");
  const up = NEWS_UP_WORDS.filter((w) => t.includes(w));
  const down = NEWS_DOWN_WORDS.filter((w) => t.includes(w));
  const listing = LISTING_UP.test(t) ? "up" : LISTING_DOWN.test(t) ? "down" : null;
  return { up: [...up], down: [...down], listing };
}

export type NewsToneSummary = {
  /** 본 기사 수 */
  total: number;
  /** 오름 낱말이 더 많은 기사 수 */
  upCount: number;
  /** 내림 낱말이 더 많은 기사 수 */
  downCount: number;
  /** 많이 나온 낱말(최대 4) */
  topWords: string[];
  /** 매물 늘어남 · 줄어듦 단서 기사 수 */
  listingUp: number;
  listingDown: number;
};

/** 기사 제목 묶음 → 방향 집계. 한 기사는 한 방향에만 센다(낱말 수가 같으면 어느 쪽도 아님). */
export function summarizeNewsTone(titles: readonly string[]): NewsToneSummary {
  let upCount = 0;
  let downCount = 0;
  let listingUp = 0;
  let listingDown = 0;
  const freq = new Map<string, number>();
  for (const title of titles) {
    const tone = titleTone(title);
    if (tone.up.length > tone.down.length) upCount += 1;
    else if (tone.down.length > tone.up.length) downCount += 1;
    if (tone.listing === "up") listingUp += 1;
    if (tone.listing === "down") listingDown += 1;
    for (const w of [...tone.up, ...tone.down]) freq.set(w, (freq.get(w) ?? 0) + 1);
  }
  const topWords = [...freq.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 4)
    .map(([w]) => w);
  return { total: titles.length, upCount, downCount, topWords, listingUp, listingDown };
}

/** 우리가 만든 자동 글(실거래 집계 · 시장 브리핑 · 신고가)은 뉴스가 아니다 — 방향 세기에서 뺀다 */
export function isOwnGeneratedPost(post: { title?: string | null; sourceName?: string | null }): boolean {
  const src = String(post.sourceName ?? "");
  if (src.includes("내집나우") || src.includes("국토교통부 실거래")) return true;
  const title = String(post.title ?? "");
  return /시장 브리핑 —|^오늘의 신고가|아파트 실거래·시세 —/.test(title);
}
