import "server-only";
import { getServiceSupabase } from "@/lib/supabase/service";
import { ACTIVE_REGION_CATALOG } from "@/lib/region/catalog";
import { logger } from "@/lib/log";
import {
  BUZZ_NEWS_KEY,
  BUZZ_SEARCH_KEY,
  NEWS_DAY_CAP,
  buzzKeywords,
  buzzNewsQuery,
  countNewsOnDay,
  mergeNewsDay,
  parseDatalabGroup,
  type NewsDailyPayload,
  type SearchPoint,
} from "./model";

/* [1139] 네이버 데이터랩(검색어 트렌드) · 뉴스 검색 → public_data_cache 두 키.
   키는 장소 검색과 같은 NAVER_SEARCH_CLIENT_ID / NAVER_SEARCH_CLIENT_SECRET(네이버 개발자센터 앱에 "데이터랩(검색어트렌드)" · "검색" 추가).
   하루 호출: 데이터랩 22회(한도 1,000) · 뉴스 107회(한도 25,000). 못 받은 지역은 건너뛴다(값을 지어내지 않는다). */

const DATALAB_URL = "https://openapi.naver.com/v1/datalab/search";
const NEWS_URL = "https://openapi.naver.com/v1/search/news.json";
const TIMEOUT_MS = 8_000;
const DAY_MS = 86_400_000;

function creds(): { id: string; secret: string } | null {
  const id = process.env.NAVER_SEARCH_CLIENT_ID?.trim() ?? "";
  const secret = process.env.NAVER_SEARCH_CLIENT_SECRET?.trim() ?? "";
  return id && secret ? { id, secret } : null;
}

export function isBuzzConfigured(): boolean {
  return creds() !== null;
}

const kstDay = (ms: number) => new Date(ms + 9 * 3_600_000).toISOString().slice(0, 10);

async function fetchSearchTrends(c: { id: string; secret: string }, nowMs: number): Promise<{ regions: Record<string, SearchPoint[]>; failed: number; firstError: string | null }> {
  /* 완결월 6개 + 이번 달 — 7개월 전 1일부터 어제까지 */
  const kst = new Date(nowMs + 9 * 3_600_000);
  const start = new Date(Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth() - 7, 1)).toISOString().slice(0, 10);
  const end = kstDay(nowMs - DAY_MS);
  const regions: Record<string, SearchPoint[]> = {};
  let failed = 0;
  let firstError: string | null = null;
  for (let i = 0; i < ACTIVE_REGION_CATALOG.length; i += 5) {
    const chunk = ACTIVE_REGION_CATALOG.slice(i, i + 5);
    try {
      const res = await fetch(DATALAB_URL, {
        method: "POST",
        headers: { "X-Naver-Client-Id": c.id, "X-Naver-Client-Secret": c.secret, "Content-Type": "application/json" },
        body: JSON.stringify({
          startDate: start,
          endDate: end,
          timeUnit: "month",
          keywordGroups: chunk.map((r) => ({ groupName: r.id, keywords: buzzKeywords(r) })),
        }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
        cache: "no-store",
      });
      if (!res.ok) {
        failed += chunk.length;
        firstError ??= `데이터랩 HTTP ${res.status}`;
        /* 인증 · 권한 오류면 나머지도 같다 — 한도를 태우지 않는다 */
        if (res.status === 401 || res.status === 403) break;
        continue;
      }
      const json = (await res.json()) as { results?: Array<{ title?: string }> };
      for (const g of json.results ?? []) {
        const id = String(g?.title ?? "");
        const pts = parseDatalabGroup(g);
        if (id && pts.length > 0) regions[id] = pts;
      }
    } catch (e) {
      failed += chunk.length;
      firstError ??= e instanceof Error ? e.name : "network";
    }
  }
  return { regions, failed, firstError };
}

async function fetchNewsDay(c: { id: string; secret: string }, day: string): Promise<{ counts: Record<string, number>; failed: number; firstError: string | null }> {
  const counts: Record<string, number> = {};
  let failed = 0;
  let firstError: string | null = null;
  let stop = false;
  const one = async (r: (typeof ACTIVE_REGION_CATALOG)[number]) => {
    if (stop) return;
    try {
      const url = `${NEWS_URL}?query=${encodeURIComponent(buzzNewsQuery(r))}&display=${NEWS_DAY_CAP}&start=1&sort=date`;
      const res = await fetch(url, {
        headers: { "X-Naver-Client-Id": c.id, "X-Naver-Client-Secret": c.secret },
        signal: AbortSignal.timeout(TIMEOUT_MS),
        cache: "no-store",
      });
      if (!res.ok) {
        failed += 1;
        firstError ??= `뉴스 검색 HTTP ${res.status}`;
        if (res.status === 401 || res.status === 403) stop = true;
        return;
      }
      const json = (await res.json()) as { items?: unknown };
      counts[r.id] = countNewsOnDay(json.items, day, NEWS_DAY_CAP).count;
    } catch (e) {
      failed += 1;
      firstError ??= e instanceof Error ? e.name : "network";
    }
  };
  for (let i = 0; i < ACTIVE_REGION_CATALOG.length; i += 5) await Promise.all(ACTIVE_REGION_CATALOG.slice(i, i + 5).map(one));
  return { counts, failed, firstError };
}

export type BuzzIngestResult = { ok: boolean; skipped?: boolean; reason?: string; searchRegions: number; newsRegions: number; newsDay: string; failed: number };

export async function ingestRegionBuzz(now = Date.now()): Promise<BuzzIngestResult> {
  const day = kstDay(now - DAY_MS);
  const empty = { searchRegions: 0, newsRegions: 0, newsDay: day, failed: 0 };
  const c = creds();
  if (!c) return { ok: false, skipped: true, reason: "NAVER_SEARCH_CLIENT_ID · NAVER_SEARCH_CLIENT_SECRET 미설정", ...empty };
  const sb = getServiceSupabase();
  if (!sb) return { ok: false, skipped: true, reason: "Supabase 미설정", ...empty };

  const [trend, news] = await Promise.all([fetchSearchTrends(c, now), fetchNewsDay(c, day)]);
  const nowIso = new Date(now).toISOString();
  const rows: Array<{ source: string; cache_key: string; payload: Record<string, unknown>; fetched_at: string; expires_at: string }> = [];
  /* 못 받은 날은 행을 덮지 않는다(어제 값이 "없음"으로 바뀌지 않게) */
  if (Object.keys(trend.regions).length > 0) {
    rows.push({
      source: "naver",
      cache_key: BUZZ_SEARCH_KEY,
      payload: { fetchedAt: nowIso, regions: trend.regions },
      fetched_at: nowIso,
      expires_at: new Date(now + 40 * DAY_MS).toISOString(),
    });
  }
  if (Object.keys(news.counts).length > 0) {
    const { data, error } = await sb.from("public_data_cache").select("payload").eq("cache_key", BUZZ_NEWS_KEY).maybeSingle();
    if (error) throw new Error(`public_data_cache(${BUZZ_NEWS_KEY}) 조회 실패: ${error.message}`);
    const prev = (data?.payload ?? null) as NewsDailyPayload | null;
    rows.push({
      source: "naver",
      cache_key: BUZZ_NEWS_KEY,
      payload: mergeNewsDay(prev && typeof prev.days === "object" ? prev : null, day, news.counts),
      fetched_at: nowIso,
      expires_at: new Date(now + 400 * DAY_MS).toISOString(),
    });
  }
  if (rows.length > 0) {
    const { error } = await sb.from("public_data_cache").upsert(rows, { onConflict: "cache_key" });
    if (error) {
      logger.error("[buzz] upsert failed", error);
      return { ok: false, reason: error.message, ...empty };
    }
  }
  const failed = trend.failed + news.failed;
  const reason = trend.firstError ?? news.firstError ?? undefined;
  return { ok: rows.length > 0, reason, searchRegions: Object.keys(trend.regions).length, newsRegions: Object.keys(news.counts).length, newsDay: day, failed };
}
