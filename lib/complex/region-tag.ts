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

/* ── [1091] 지역 안 묶음(bucket) 태그 — 지역 태그보다 가늘게 비운다 ───────────────────────────────────────
   1089 의 지역 태그는 실거래가 들어온 **지역의 단지 전부**를 비웠다. 운영 실측(2026-10-18~23 · 하루 · market_transactions):
   새 행이 생긴 단지는 그 지역 단지의 3~41%(날 평균 17%)인데 100% 가 비워졌다 — 바뀌지 않은 단지 수천 쪽이 다음 크롤 때 다시 만들어진다.
   단지 이름의 해시로 지역을 BUCKETS 묶음으로 나눠, 화면은 제 묶음 태그를 하나 더 붙이고 적재는 건드린 묶음만 비운다.
   같은 실측으로 어림하면(묶음 32 · 이름 해시가 고르게 퍼진다고 보고) 바뀐 단지가 적은 날은 지역 단지의 45~71% 가 캐시에 남고,
   많은 날(3,224곳)은 5% 만 남는다 — 그래서 크론은 id 비움이 상한에 걸린 날에만 이 태그를 쓴다(route 주석).
   묶음이 너무 많이 건드려진 날(revalidateTag 호출 상한을 넘는 날)은 예전처럼 지역 태그로 물러선다 — 빠뜨리는 단지는 없다. */
export const COMPLEX_BUCKETS = 32;
/** 하루 revalidateTag 호출 상한(묶음) — 넘으면 지역 태그로 물러선다(단지 id 비움 상한 2,000 과 같은 눈금) */
export const COMPLEX_BUCKET_TAG_MAX = 1_000;

/** FNV-1a 32비트 — 단지 이름(유니코드 코드포인트) → 묶음 번호. 서버 · 크론이 같은 함수를 쓴다 */
export function complexBucket(name: string, buckets = COMPLEX_BUCKETS): number {
  let h = 0x811c9dc5;
  for (const ch of name.trim().replace(/\s+/g, " ")) {
    h ^= ch.codePointAt(0) ?? 0;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h % buckets;
}

export function complexBucketTag(region: string | null | undefined, name: string | null | undefined): string | null {
  const base = complexRegionTag(region);
  const n = (typeof name === "string" ? name : "").trim();
  if (!base || !n) return null;
  return `${base}:${complexBucket(n)}`;
}

/**
 * 적재가 건드린 단지들 → 비울 태그. 묶음 태그 수가 상한 안이면 묶음 태그(가늘게), 넘으면 지역 태그(넓게 · 호출 수는 지역 수).
 * 반환값은 revalidateTag 에 그대로 넘긴다.
 */
export function complexInvalidationTagsFor(touched: Iterable<{ region: string; name: string }>): { tags: string[]; mode: "bucket" | "region" } {
  const buckets = new Set<string>();
  const regions = new Set<string>();
  for (const c of touched) {
    const r = complexRegionTag(c.region);
    if (!r) continue;
    regions.add(r);
    const b = complexBucketTag(c.region, c.name);
    if (b) buckets.add(b);
  }
  if (buckets.size <= COMPLEX_BUCKET_TAG_MAX) return { tags: [...buckets], mode: "bucket" };
  return { tags: [...regions].slice(0, 300), mode: "region" };
}
