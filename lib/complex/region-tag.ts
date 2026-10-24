/**
 * [1089 · 비용 · 신선도] 단지 화면의 "실거래 지역" 캐시 태그 — 순수 함수(단지 화면 · 실거래 적재 크론 · tests/unit/review-1089).
 *
 * 1089 전에는 단지 화면이 결과 요약 · 다요인 분석의 캐시를 통해 "market" 태그를 물려받아, 실거래 · 부동산원 · KB 적재가
 * 하루 세 번 2.4만 쪽을 통째로 비웠다(화면 수명도 1시간이었다). 그 판을 화면 밖으로 옮기면 단지 화면은 바뀐 단지만
 * 비우는 길(invalidateComplexIds · 하루 500곳 × 4경로 상한) 하나만 남는데, 적재가 하루 3,000곳 넘게 건드리는 날(10/20 실측
 * 3,224곳)엔 나머지 단지의 새 실거래가 7일 늦게 보인다. 그래서 단지 화면에 **실거래 지역 태그**를 하나 붙이고, 적재가
 * 건드린 지역(하루 수십 곳)만 태그로 비운다 — 빠뜨리는 단지 없이, 바뀌지 않은 지역은 그대로 둔다.
 *
 * 지역 표기는 단지 id 안의 지역(이름 id = base64url("지역\u0001단지명") — 실거래 region_name 과 같은 값)을 그대로 쓴다.
 * 헤더(x-next-cache-tags)에 실리므로 ASCII 로 바꾼다(encodeURIComponent).
 */
export const COMPLEX_REGION_TAG_PREFIX = "cx-r:";

export function complexRegionTag(region: string | null | undefined): string | null {
  const r = (typeof region === "string" ? region : "").trim().replace(/\s+/g, " ");
  if (!r || r.length > 40) return null;
  return `${COMPLEX_REGION_TAG_PREFIX}${encodeURIComponent(r)}`;
}

/** 적재가 건드린 단지들 → 비울 지역 태그(중복 제거 · 상한) */
export function complexRegionTagsFor(touched: Iterable<{ region: string }>, max = 300): string[] {
  const out = new Set<string>();
  for (const c of touched) {
    const t = complexRegionTag(c.region);
    if (t) out.add(t);
    if (out.size >= max) break;
  }
  return [...out];
}
