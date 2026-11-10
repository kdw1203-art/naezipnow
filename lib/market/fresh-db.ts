import "server-only";
import { getReadOnlySupabase } from "@/lib/newui/supabase-read";

/* [1133 · 수집 시작 전] 새로 만든 DB(실거래 0건)에서는 "스냅샷 0행 = 조회 이상" 이라는 전제가 깨진다.
   홈 지역 동향 · AI 분석 지역 시세판이 그 전제로 "불러오기 실패"를 말하고 있었다 — 못 읽은 것이 아니라 아직 아무것도 수집하지 않은 것이다.
   실거래 표가 정말로 0건인지(머리 조회 한 번)만 본다. 조회가 실패하면 false — 실패는 실패로 남긴다(빈 것으로 위장하지 않는다).
   한 건이라도 들어오면 예전 규칙(0행 = 이상)으로 돌아간다. */
export async function isCollectingFromEmpty(table: "market_transactions" | "market_region_price" | "market_region_series" = "market_transactions"): Promise<boolean> {
  try {
    const sb = getReadOnlySupabase();
    if (!sb) return false;
    /* [1136] 표마다 본다 — 실거래는 먼저 들어오고 가격지수(부동산원) 표는 하루 뒤에 찬다. 실거래가 생겼다고 지수 표의 0행을 "조회 이상"으로 되돌리면
       수집 첫날 내내 "불러오기 실패"가 뜬다(2026-11-10 운영: 실거래 43,991건 · 지역 가격 표 0행). 그 표가 정말로 비었는지를 머리 조회로 확인한다. */
    const { count, error } = await sb.from(table).select("*", { count: "exact", head: true }).limit(1);
    return !error && count === 0;
  } catch {
    return false;
  }
}

export const COLLECTING_LINE = "가격지수 · 지역 가격 수집 전 · 값 없음";
