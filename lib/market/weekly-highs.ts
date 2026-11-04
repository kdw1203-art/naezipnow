import "server-only";

import { logger } from "@/lib/log";
import { detectNewPriceHighs } from "@/lib/market/price-highs";
import type { PriceHighRow } from "@/lib/market/price-record-copy";

/* 주간 신고가 — detect_new_price_highs RPC(p_hours=168)의 얇은 래퍼.
   [1103] 이제 RPC 가 아니라 같은 규칙의 lib/market/price-highs.ts detectNewPriceHighs({ hours: 168 }) 를 부른다.
   [#58] 블로그 팩과 [#62] 소셜 소재가 같은 데이터를 쓴다. 실패는 throw —
   호출부가 그 섹션/소재를 접는다(없는 신고가를 지어내지 않는다). */

export type WeeklyHigh = {
  complexName: string;
  regionName: string;
  areaM2: number;
  priceKrw: number;
  priorMaxKrw: number;
  contractYm: string;
};

export async function getWeeklyPriceHighs(limit = 5): Promise<WeeklyHigh[]> {
  /* [1103] RPC detect_new_price_highs(p_hours=168) → 같은 규칙의 앱 쪽 탐지(lib/market/price-highs.ts 머리 주석 — 57014 의 원인).
     168시간 창은 RPC 에 더 무거웠다(새 매매 14,233행). 실패는 그대로 던진다 — 호출부가 섹션/소재를 접는다. */
  let data: PriceHighRow[];
  try {
    data = await detectNewPriceHighs({ hours: 168, minPrior: 10, margin: 1.03, limit });
  } catch (e) {
    logger.error("[weekly-highs] 신고가 탐지 실패", e);
    throw new Error(`신고가 탐지 실패: ${e instanceof Error ? e.message : String(e)}`);
  }
  return (data as unknown as Array<Record<string, unknown>>)
    .map((r) => ({
      complexName: String(r.complex_name ?? ""),
      regionName: String(r.region_name ?? ""),
      areaM2: Number(r.area) || 0,
      priceKrw: Number(r.deal_amount_krw) || 0,
      priorMaxKrw: Number(r.prior_max) || 0,
      contractYm: String(r.contract_ym ?? ""),
    }))
    .filter((r) => r.complexName && r.priceKrw > 0);
}
