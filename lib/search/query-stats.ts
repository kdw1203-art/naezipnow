/**
 * [1081 · #29] 사이트 내 검색어 집계 — KV(lib/kv/rest) 월별 카운터.
 *
 * 왜: 사용자가 치는 검색어가 곧 검색엔진 검색어다 — 상위 검색어로 가이드·용어 주제를 정한다. 제로결과(search_zero_results)는
 * 이미 DB 에 남지만 "무엇을 많이 찾는가"는 없었다. 쓰기는 fire-and-forget(응답을 막지 않는다) · KV 없으면 아무 일도 없다.
 * CDN 적중(60초)분은 세지 못한다 — 추세용이지 정확한 총량이 아니다(관리자 화면에 그렇게 적는다).
 * 키: search:top:<YYYYMM>:<정규화 질의>(60일 만료). 질의는 2~40자 · 소문자 · 공백 하나로.
 */
import { kstDayKey, kvAvailable, kvIncrBy, kvPipeline, kvScanKeys } from "@/lib/kv/rest";

const TTL_SECONDS = 60 * 24 * 3600;

export function normalizeQueryForStats(q: string): string | null {
  const s = q.trim().toLowerCase().replace(/\s+/g, " ");
  if (s.length < 2 || s.length > 40) return null;
  if (/[\u0000-\u001f:*?[\]]/.test(s)) return null; // 제어 문자·글롭 기호는 키로 쓰지 않는다
  return s;
}

export function searchStatsMonthKey(now: number = Date.now()): string {
  return kstDayKey(now).slice(0, 6);
}

/** 응답을 막지 않는다 — 호출부는 void 로 부른다 */
export async function recordSearchQuery(q: string, now: number = Date.now()): Promise<void> {
  const key = normalizeQueryForStats(q);
  if (!key || !kvAvailable()) return;
  try {
    await kvIncrBy(`search:top:${searchStatsMonthKey(now)}:${key}`, 1, TTL_SECONDS);
  } catch {
    /* 집계 실패는 조용히 */
  }
}

export type TopQuery = { query: string; count: number };

/** 이번 달(또는 month) 상위 검색어 — KV 없음/실패면 빈 배열 */
export async function topSearchQueries(limit = 30, month: string = searchStatsMonthKey()): Promise<TopQuery[]> {
  if (!kvAvailable()) return [];
  const prefix = `search:top:${month}:`;
  const keys = await kvScanKeys(`${prefix}*`, 3000);
  if (!keys || keys.length === 0) return [];
  const out: TopQuery[] = [];
  for (let i = 0; i < keys.length; i += 100) {
    const slice = keys.slice(i, i + 100);
    const r = await kvPipeline(slice.map((k) => ["GET", k]));
    if (!r) break;
    slice.forEach((k, j) => {
      const n = Number(r[j]);
      if (Number.isFinite(n) && n > 0) out.push({ query: k.slice(prefix.length), count: n });
    });
  }
  return out.sort((a, b) => b.count - a.count || a.query.localeCompare(b.query, "ko")).slice(0, limit);
}
