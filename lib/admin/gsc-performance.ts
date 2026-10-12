import "server-only";

import { unstable_cache } from "next/cache";
import { fetchGscPerformance, isGscConfigured, type GscPerformance } from "@/lib/seo/gsc-search-analytics";
import { logger } from "@/lib/log";

/* [1061] 관리 › 검색 유입 — 서치콘솔 실적을 1시간 캐시로. 세 상태를 구분해 돌려준다:
 * not_configured(키·속성 미설정) · failed(조회 실패 — 데이터 없음과 다르다) · ok. */

export type GscLoaded =
  | { state: "not_configured" }
  | { state: "failed"; detail: string }
  | { state: "ok"; data: GscPerformance };

const cachedFetch = unstable_cache(async () => fetchGscPerformance(), ["gsc-performance-28d"], { revalidate: 3600 });

export async function loadGscPerformance(): Promise<GscLoaded> {
  if (!isGscConfigured()) return { state: "not_configured" };
  try {
    return { state: "ok", data: await cachedFetch() };
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    logger.warn("[admin/search] 서치콘솔 실적 조회 실패", detail);
    return { state: "failed", detail };
  }
}
