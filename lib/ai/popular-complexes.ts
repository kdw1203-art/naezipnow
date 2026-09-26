import "server-only";
import { unstable_cache } from "next/cache";
import { getServiceSupabase } from "@/lib/supabase/service";
import { encodeComplexId } from "@/lib/complex/complex-store";
import { regionIdForName } from "@/lib/region/catalog";
import { logger } from "@/lib/log";

/**
 * [1008 · W] 첫 방문 "거래 많은 단지로 둘러보기" — 단지를 아직 안 고른 사람에게 실제로 거래가 많은
 * 단지 몇 곳을 바로 누를 수 있게 준다(이름을 몰라도 결과 화면을 먼저 볼 수 있게).
 *
 * 재료: complex_tx_stats_base(매일 갱신되는 단지 단위 매트뷰) · recent_trade_count(최근 6개월 매매) 내림차순.
 * 인덱스 complex_tx_stats_recent_idx 로 수 ms(EXPLAIN 실측 3.1ms, 지역 필터 포함). 한 도시에 몰리지 않게
 * 도시(지역명 앞 낱말 — 창원·수원·서울…)당 1곳만(실측 상위 10곳 중 창원·수원이 5곳). 페이지(ISR 1시간)가 부르고 결과는 6시간 데이터 캐시 — 사용자·봇 조회로 늘지 않는다.
 * 실패·0행이면 빈 배열(화면은 그 줄을 그리지 않는다 — 지어낸 예시 단지를 쓰지 않는다).
 */
export type ActiveComplex = {
  id: string;
  name: string;
  region: string;
  /** 최근 6개월 매매 건수 */
  recentTrades: number;
};

async function load(limit: number): Promise<ActiveComplex[]> {
  const sb = getServiceSupabase();
  if (!sb) return [];
  const { data, error } = await sb
    .from("complex_tx_stats_base")
    .select("region_name, complex_name, recent_trade_count")
    .gt("recent_trade_count", 0)
    .order("recent_trade_count", { ascending: false })
    .limit(80);
  if (error) throw new Error(`complex_tx_stats_base(거래 많은 단지) 조회 실패: ${error.message}`);
  const out: ActiveComplex[] = [];
  const seenCity = new Set<string>();
  for (const r of (data ?? []) as Array<{ region_name: string | null; complex_name: string | null; recent_trade_count: number | null }>) {
    const region = (r.region_name ?? "").trim();
    const name = (r.complex_name ?? "").trim();
    const city = region.split(/\s+/)[0];
    if (!region || !name || seenCity.has(city)) continue;
    /* [1008 · 리뷰 A-21] 지역 통계(한국부동산원 id)가 풀리는 지역만 — 안 풀리면 결과 화면의 지역 칸이
       전부 "자료 없음"이라 첫 방문 예시로 부적절하다 */
    if (!regionIdForName(region)) continue;
    seenCity.add(city);
    out.push({ id: encodeComplexId(region, name), name, region, recentTrades: Number(r.recent_trade_count ?? 0) });
    if (out.length >= limit) break;
  }
  return out;
}

/* [1010] 6시간 → 1일. 키가 고정("ai-active-complexes-v2")이라 모든 요청이 한 벌을
   공유하고, 이미 market 태그가 붙어 있어 실거래 적재 직후 revalidateTag("market")
   (lib/cache/invalidate.ts SOURCE_MAP.molit)이 즉시 비운다 — TTL 은 안전망이다.
   유일한 소비처인 /analysis/ai/[tool] 이 하루 1,512회 렌더되던 자리라(2026-09-20~22
   실측), 6시간 눈금은 그만큼 데이터 캐시 쓰기를 만들고 있었다. */
const loadCached = unstable_cache(load, ["ai-active-complexes-v2"], { revalidate: 86_400, tags: ["market"] });

export async function getActiveComplexes(limit = 6): Promise<ActiveComplex[]> {
  try {
    return await loadCached(limit);
  } catch (e) {
    logger.warnSampled("ai-active-complexes", "[popular-complexes] 거래 많은 단지 조회 실패 — 빠른 선택 줄을 숨긴다", e);
    return [];
  }
}
