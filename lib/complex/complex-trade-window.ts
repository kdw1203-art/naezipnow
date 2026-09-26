import "server-only";

import { getReadOnlySupabase } from "@/lib/newui/supabase-read";
import { decodeComplexId, KAPT_COMPLEX_ID_PREFIX } from "@/lib/complex/complex-store";
import { logger } from "@/lib/log";
import { currentYm, ymMonthsBefore, type TradeSample } from "@/lib/complex/complex-facts";

/* [1006 · B] 최근 N개월 매매 **원표본** — 지도 단지 패널의 12개월 건수·중앙값·면적대 중앙값·
 * 단지 전세가율(6개월) 재료.
 *
 * 왜 새 조회인가: getTransactionHistory 는 월별 평균·최저·최고로 접어서 돌려주고
 * getAreaBands 는 최근 400건을 면적대 평균으로 접는다. 둘 다 **중앙값**을 만들 수 없다
 * (평균은 한 건의 특이 거래에 끌려간다 — 그래서 요약 문장은 중앙값을 말한다).
 * 창을 계약월로 자르므로 대단지(헬리오시티 9,510세대)도 12개월이면 수백 행이다.
 *
 * 없음(0행)은 [] , 못 읽음은 throw — 호출부가 sideFailures 로 구분한다. */

const ROW_CAP = 2000;

/* 이번 달은 KST 기준 — 서버(UTC) 월로 자르면 KST 월초 0~9시에 창이 한 달 어긋난다 */
function ymMonthsAgo(n: number): string {
  return ymMonthsBefore(currentYm(), n);
}

/**
 * canonical(name-)id → 최근 monthsBack+1 개 캘린더 월의 매매 원표본(최신 먼저).
 * kapt id 는 실거래 조회 키가 아니다(complex-store 의 decodeComplexIdForQuery 주석) — null.
 * Supabase 미설정도 null(조회 실패가 아니라 미설정).
 */
export async function getTradeWindowSamples(
  complexId: string,
  monthsBack = 11,
  signal?: AbortSignal,
): Promise<TradeSample[] | null> {
  if (complexId.startsWith(KAPT_COMPLEX_ID_PREFIX)) {
    logger.warn(`[complex-trade-window] kapt id(${complexId})로는 조회할 수 없습니다 — canonical_id 를 넘기세요.`);
    return null;
  }
  const dec = decodeComplexId(complexId);
  if (!dec) return null;
  const sb = getReadOnlySupabase();
  if (!sb) return null;

  const from = ymMonthsAgo(monthsBack);
  let q = sb
    .from("market_transactions")
    .select("contract_ym, deal_amount_krw, area_m2")
    .eq("complex_name", dec.name)
    .eq("region_name", dec.region)
    .eq("transaction_type", "trade")
    .eq("is_cancelled", false)
    /* 전월세 로더(complex-rent.ts)와 같은 필터 — 전세가율 분모에 오피스텔이 섞이면 안 된다 */
    .eq("property_type", "apartment")
    .gt("deal_amount_krw", 0)
    .gte("contract_ym", from)
    .order("contract_ym", { ascending: false })
    .limit(ROW_CAP);
  if (signal) q = q.abortSignal(signal);
  const { data, error } = await q;
  if (error) {
    throw new Error(`market_transactions(매매 창 ${dec.name}) 조회 실패: ${error.message}`);
  }
  const rows =
    (data as { contract_ym: string; deal_amount_krw: number; area_m2: number | null }[] | null) ??
    [];
  const out: TradeSample[] = [];
  for (const r of rows) {
    const ym = String(r.contract_ym ?? "");
    const amt = Number(r.deal_amount_krw);
    if (!/^\d{6}$/.test(ym) || !Number.isFinite(amt) || amt <= 0) continue;
    const area = r.area_m2 == null ? null : Number(r.area_m2);
    out.push({ ym, amountKrw: amt, areaM2: area != null && Number.isFinite(area) ? area : null });
  }
  return out;
}
