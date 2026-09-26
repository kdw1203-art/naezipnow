import "server-only";
import { unstable_cache } from "next/cache";
import { getServiceSupabase } from "@/lib/supabase/service";
import { logger } from "@/lib/log";

/* [950 · 홈 대개편] 커버리지 실수치 — "얼마나 넓게 볼 수 있는가"를 숫자로 말한다.
 *
 * 홈 비판(투자자·사용자 공통): 트랙션·커버리지 숫자가 하나도 없어 "만들어진 것"과
 * "쓰이는 것"을 구분할 수 없었고, 지역 칩 넷(동안구·만안구·의왕시·과천시)이
 * 서비스 범위를 안양 근방으로 오해하게 했다. 실제 범위는 전국 218개 시군구다.
 *
 * 원칙: 전부 실카운트. 조회 실패는 null 이고 화면은 그 줄을 **뺀다**(추정치·
 * 지어낸 수 금지). 세 수치의 원천은 하루 1회 적재라 6시간 캐시면 충분하다.
 *   - 실거래 건수: market_transactions 전체(매매+전월세, 취소 제외)
 *   - 단지 수:     trade_complex_total RPC (사이트맵과 같은 기준)
 *   - 지역 수:     market_region_names RPC (region_name 218개) */

export interface HomeCoverage {
  /** 취소 제외 실거래 행 수 */
  txCount: number | null;
  /** 매매 실거래가 있는 단지 수 */
  complexCount: number | null;
  /** 실거래가 있는 시군구 수 */
  regionCount: number | null;
}

async function loadCoverageUncached(): Promise<HomeCoverage> {
  const sb = getServiceSupabase();
  if (!sb) return { txCount: null, complexCount: null, regionCount: null };
  const [txR, complexR, regionR] = await Promise.allSettled([
    sb
      .from("market_transactions")
      .select("id", { count: "exact", head: true })
      .eq("is_cancelled", false),
    sb.rpc("trade_complex_total"),
    sb.rpc("market_region_names"),
  ]);
  const txCount =
    txR.status === "fulfilled" && !txR.value.error && typeof txR.value.count === "number"
      ? txR.value.count
      : null;
  const complexCount =
    complexR.status === "fulfilled" && !complexR.value.error
      ? Number(complexR.value.data ?? NaN)
      : NaN;
  const regionCount =
    regionR.status === "fulfilled" && !regionR.value.error && Array.isArray(regionR.value.data)
      ? regionR.value.data.length
      : null;
  if (txCount === null || !Number.isFinite(complexCount) || regionCount === null) {
    logger.warn("[home-coverage] 일부 수치 조회 실패", {
      tx: txR.status,
      complex: complexR.status,
      region: regionR.status,
    });
  }
  /* 셋 다 실패면 던진다 — 캐시에 빈 값을 6시간 굳히지 않기 위해서다. */
  if (txCount === null && !Number.isFinite(complexCount) && regionCount === null) {
    throw new Error("[home-coverage] 커버리지 수치를 하나도 읽지 못했습니다");
  }
  return {
    txCount,
    complexCount: Number.isFinite(complexCount) && complexCount > 0 ? complexCount : null,
    regionCount: regionCount && regionCount > 0 ? regionCount : null,
  };
}

  /* [1010] TTL 은 라우트 revalidate 의 뚜껑이다 — Next 는 세그먼트 값과 이 값 중 작은 쪽을 쓴다.
     실측으로 확인됨(.next/prerender-manifest.json): /town/news 는 revalidate 21600 인데 매니페스트가
     3600 이었다(= 그 페이지가 읽는 데이터 캐시 값). 그래서 이 값이 낮으면 라우트 TTL 을 올려도
     아무 효과가 없다. 태그로 비워지는 캐시는 TTL 을 길게 잡아도 신선도 손해가 없다 —
     태그 무효화는 "다음 렌더에서 다시 읽어라"일 뿐 재렌더를 강제하지 않기 때문이다. */
const loadCoverageCached = unstable_cache(loadCoverageUncached, ["home-coverage-v1"], {
  revalidate: 604_800,
  tags: ["market"],
});

/** 실패해도 홈을 죽이지 않는다 — 전부 null 이면 화면은 줄을 생략한다. */
export async function loadHomeCoverage(): Promise<HomeCoverage> {
  try {
    return await loadCoverageCached();
  } catch (e) {
    logger.error("[home-coverage]", e);
    return { txCount: null, complexCount: null, regionCount: null };
  }
}

/** "783,748건" 처럼 세 자리 콤마. 만 단위 축약은 하지 않는다(정확한 수가 신뢰다). */
export function formatCount(n: number): string {
  return n.toLocaleString("ko-KR");
}
