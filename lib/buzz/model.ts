/* [1139 · 지역 관심도 · 기사 수] 소유자 2026-11-11 "네이버를 통해 3개월 또는 6개월치 관심도, 기사 … 를 분석해서 제시".
   순수 규칙(네트워크 · server-only 없음) — 크론 · 신호 읽기 · node:test 가 같이 쓴다.

   · 관심도 = 네이버 데이터랩 통합검색어 트렌드(월 단위). 값은 **상대 지수**(한 번 조회한 묶음 안의 최대 = 100)라
     지역끼리 견주지 않는다 — 한 지역의 최근 3개월 평균과 직전 3개월 평균만 견준다.
   · 기사 수 = 네이버 뉴스 검색을 최신순으로 읽어 "어제 하루" 기사 수를 날마다 적는다. 뉴스 검색은 기간을 지정할 수 없어
     지난 기간을 거슬러 채울 수 없다 — 쌓인 날만큼만 말한다(100건에서 자르고, 잘린 날은 "100건 이상").
   구글 트렌드는 공식 API 가 없어 쓰지 않는다. */

export const BUZZ_SEARCH_KEY = "naver:search-trend";
export const BUZZ_NEWS_KEY = "naver:news-daily";
export const NEWS_DAY_CAP = 100;
export const NEWS_KEEP_DAYS = 200;

const AMBIGUOUS = new Set(["중구", "동구", "서구", "남구", "북구", "강서구", "고성군"]);

/** 카탈로그 지역 → 검색어 묶음. "성남시 분당구" → 분당구 아파트 · 성남 분당구 아파트 · 분당구 부동산 */
export function buzzKeywords(region: { name: string; city?: string | null }): string[] {
  const full = region.name.replace(/\s+/g, " ").trim().replace(/^(\S+?)시 (?=\S)/, "$1 ");
  const parts = full.split(" ");
  const last = parts[parts.length - 1];
  /* 서울은 카탈로그에 도시 낱말이 없다 — 여러 도시에 있는 구 이름이면 "서울"을 붙인다 */
  const base = parts.length === 1 && !region.city && AMBIGUOUS.has(last) ? `서울 ${last}` : parts.length === 1 ? last : AMBIGUOUS.has(last) ? full : last;
  const short = base.replace(/시$/, "");
  const head = short.length >= 2 ? short : base;
  const out = [`${head} 아파트`, `${head} 부동산`];
  if (parts.length > 1 && base !== full) out.push(`${full} 아파트`);
  return [...new Set(out)];
}

/** 뉴스 검색어 — 묶음의 첫 낱말에서 "아파트"를 뗀 지역 낱말 + 부동산 */
export function buzzNewsQuery(region: { name: string; city?: string | null }): string {
  return buzzKeywords(region)[1];
}

export type SearchPoint = { ym: string; ratio: number };
export type SearchTrendPayload = { fetchedAt: string; regions: Record<string, SearchPoint[]> };
export type NewsDailyPayload = { days: Record<string, Record<string, number>> };

/** 데이터랩 응답 한 묶음 → 월별 점(yyyymm). 형식이 다르면 빈 배열 */
export function parseDatalabGroup(group: unknown): SearchPoint[] {
  const data = (group as { data?: unknown })?.data;
  if (!Array.isArray(data)) return [];
  const out: SearchPoint[] = [];
  for (const d of data as Array<{ period?: unknown; ratio?: unknown }>) {
    const m = /^(\d{4})-(\d{2})/.exec(String(d?.period ?? ""));
    const ratio = Number(d?.ratio);
    if (m && Number.isFinite(ratio)) out.push({ ym: `${m[1]}${m[2]}`, ratio: Math.round(ratio * 100) / 100 });
  }
  return out.sort((a, b) => a.ym.localeCompare(b.ym));
}

/** 최근 3개월 평균 · 직전 3개월 평균 — 이번 달(덜 찬 달)은 뺀다. 완결월이 6개 미만이면 null */
export function searchTrendSummary(points: SearchPoint[] | undefined, nowIso: string): { recent3: number; prior3: number; asOf: string } | null {
  if (!points || points.length === 0) return null;
  const kst = new Date(Date.parse(nowIso) + 9 * 3_600_000);
  const curYm = `${kst.getUTCFullYear()}${String(kst.getUTCMonth() + 1).padStart(2, "0")}`;
  const done = points.filter((p) => p.ym < curYm).sort((a, b) => a.ym.localeCompare(b.ym));
  if (done.length < 6) return null;
  const last6 = done.slice(-6);
  const avg = (xs: SearchPoint[]) => Math.round((xs.reduce((s, x) => s + x.ratio, 0) / xs.length) * 10) / 10;
  return { prior3: avg(last6.slice(0, 3)), recent3: avg(last6.slice(3)), asOf: last6[5].ym };
}

/** 뉴스 검색 결과(최신순) 중 KST 그 날짜에 나온 기사 수. capped = 받은 묶음이 그 날짜를 다 덮지 못함(더 있을 수 있다) */
export function countNewsOnDay(items: unknown, dayKst: string, maxItems: number): { count: number; capped: boolean } {
  if (!Array.isArray(items)) return { count: 0, capped: false };
  let count = 0;
  let sawOlder = false;
  for (const it of items as Array<{ pubDate?: unknown }>) {
    const t = Date.parse(String(it?.pubDate ?? ""));
    if (!Number.isFinite(t)) continue;
    const d = new Date(t + 9 * 3_600_000).toISOString().slice(0, 10);
    if (d === dayKst) count += 1;
    else if (d < dayKst) sawOlder = true;
  }
  return { count: Math.min(count, NEWS_DAY_CAP), capped: !sawOlder && items.length >= maxItems };
}

/** 쌓인 날로 최근 w일 · 직전 w일(w = 최대 30 · 쌓인 날의 절반) — 7일씩도 안 되면 null */
export function newsDailySummary(
  days: NewsDailyPayload["days"] | undefined,
  regionId: string,
  nowIso: string,
): { recent: number; prior: number; windowDays: number; asOf: string } | null {
  if (!days) return null;
  const today = new Date(Date.parse(nowIso) + 9 * 3_600_000).toISOString().slice(0, 10);
  const have = Object.keys(days)
    .filter((d) => d < today && typeof days[d]?.[regionId] === "number")
    .sort();
  const w = Math.min(30, Math.floor(have.length / 2));
  if (w < 7) return null;
  const sum = (ds: string[]) => ds.reduce((s, d) => s + (days[d][regionId] ?? 0), 0);
  return { recent: sum(have.slice(-w)), prior: sum(have.slice(-2 * w, -w)), windowDays: w, asOf: have[have.length - 1] };
}

/** 오래된 날을 버리고 하루를 더한다 */
export function mergeNewsDay(prev: NewsDailyPayload | null, day: string, counts: Record<string, number>): NewsDailyPayload {
  const days = { ...(prev?.days ?? {}), [day]: { ...(prev?.days?.[day] ?? {}), ...counts } };
  const keep = Object.keys(days).sort().slice(-NEWS_KEEP_DAYS);
  return { days: Object.fromEntries(keep.map((d) => [d, days[d]])) };
}
