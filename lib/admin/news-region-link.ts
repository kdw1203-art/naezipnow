import "server-only";

import { getServiceSupabase } from "@/lib/supabase/service";
import { logger } from "@/lib/log";
import { resolveNewsRegion, tallyNewsRegions, type NewsRegionInput, type NewsRegionTally } from "@/lib/news/region-link";

/* [개선 #19] 뉴스→지역 연결률 — 자동수집 뉴스가 지역 허브(/region/[id])로 실제로 연결되는 비율.
 * [1040] 재는 법을 뉴스 상세가 링크를 그리는 법(lib/news/region-link resolveNewsRegion)과 같게 맞췄다.
 *   예전: region 열 하나만 카탈로그에 대조 → region 은 시·도("서울"·"경기")라 풀릴 수 없었다(1,000건 중 100건 = 10%).
 *   지금: region → geo.sigungu → geo.places → 태그 → 제목 순으로 시·군·구를 읽는다.
 *   분모도 가른다 — 시·도까지만 있는 기사와 지역 표기가 없는 기사(전국·정책)는 "연결 실패"가 아니다(허브가 시·군·구 단위).
 *   연결률 = 시·군·구 허브 연결 ÷ 전체, 그 옆에 시·도만 · 지역 없음 건수를 함께 적는다. */

export type NewsRegionLinkage = NewsRegionTally & {
  /** 시·군·구를 못 읽은 기사의 region 값 상위 (없음/빈 값은 "(없음)") */
  topUnlinked: Array<{ region: string; count: number }>;
};

const FETCH_CAP = 3000;

function toInput(row: Record<string, unknown>): NewsRegionInput {
  const geo = row.geo && typeof row.geo === "object" ? (row.geo as Record<string, unknown>) : null;
  return {
    region: typeof row.region === "string" ? row.region : null,
    title: typeof row.title === "string" ? row.title : null,
    tags: Array.isArray(row.tags) ? (row.tags as unknown[]).filter((t): t is string => typeof t === "string") : null,
    /* 꼴 검사는 해석기가 한다(sigungu 는 글자·배열 둘 다 온다) — 여기서 거르면 배열이 버려진다 */
    geo: geo ? { sido: geo.sido, sigungu: geo.sigungu, places: geo.places } : null,
  };
}

export async function loadNewsRegionLinkage(): Promise<NewsRegionLinkage | null> {
  const sb = getServiceSupabase();
  if (!sb) return null;
  try {
    const { data, error } = await sb
      .from("board_posts")
      .select("region,title,tags,geo:automation_meta->geo")
      .eq("board_type", "community")
      .eq("is_published", true)
      .eq("is_automated", true)
      .order("created_at", { ascending: false })
      .limit(FETCH_CAP);
    if (error || !Array.isArray(data)) {
      logger.error("[news-region-link] 조회 실패", error ?? "invalid");
      return null;
    }
    const inputs = (data as unknown as Array<Record<string, unknown>>).map(toInput);
    const tally = tallyNewsRegions(inputs);
    const unlinkedCount = new Map<string, number>();
    for (const input of inputs) {
      if (resolveNewsRegion(input).id) continue;
      const key = (input.region ?? "").trim() || "(없음)";
      unlinkedCount.set(key, (unlinkedCount.get(key) ?? 0) + 1);
    }
    const topUnlinked = [...unlinkedCount.entries()]
      .map(([region, count]) => ({ region, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
    return { ...tally, topUnlinked };
  } catch (e) {
    logger.error("[news-region-link]", e);
    return null;
  }
}
