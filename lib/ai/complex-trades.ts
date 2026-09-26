import "server-only";
/**
 * [1008 · W] 단지 매매 실거래 행(평형 단위 계산 재료) — AI 결과 화면의 "최근 실거래가"와 가격 그래프가
 * **같은 행**을 읽게 하는 단일 조회. 계산은 순수 함수 lib/ai/result-series.ts.
 *
 * 조건은 관심단지 대표가(lib/market/complex-price.ts)와 같다: 매매 · 해제 제외 · 아파트 · 금액>0 ·
 * 면적 있음 · 최신순. 부분 인덱스 mt_trade_complex_cov2_idx(region_name, complex_name, contract_ym DESC
 * INCLUDE property_type, contract_day, deal_amount_krw, area_m2) 로 **Index Only Scan** —
 * EXPLAIN ANALYZE 실측(2026-09-21, 헬리오시티 134행): 0.39ms · shared hit 18.
 *
 * 예전 두 조회(대표가 resolveComplexPrice 200행 + 그래프 getTransactionHistoryWithBands 전 행)를
 * 하나로 합쳤다 — 그래프는 면적대 월 집계만 돌려받아 평형을 가를 수 없었다(result-series.ts 머리말).
 * 캐시는 부르는 쪽(live-context 의 단지 축 캐시)이 정한다. 실패는 던진다 — 축 조립이 null 로 접는다.
 */
import { getServiceSupabase } from "@/lib/supabase/service";
import type { TradeLite } from "@/lib/ai/result-series";

/** 한 단지에서 읽는 최대 행 수 — 36개월 그래프에 충분(운영 최다 단지도 월 50건 안팎) */
export const TRADE_ROW_CAP = 600;

export interface ComplexTrades {
  rows: TradeLite[];
  /** 상한까지 읽었다 — 가장 이른 달은 일부만 읽혔을 수 있다 */
  capped: boolean;
}

export async function loadComplexTrades(region: string, name: string): Promise<ComplexTrades | null> {
  const sb = getServiceSupabase();
  if (!sb || !region || !name) return null;
  const { data, error } = await sb
    .from("market_transactions")
    .select("contract_ym, contract_day, deal_amount_krw, area_m2")
    .eq("region_name", region)
    .eq("complex_name", name)
    .eq("transaction_type", "trade")
    .eq("is_cancelled", false)
    .eq("property_type", "apartment")
    .gt("deal_amount_krw", 0)
    .not("area_m2", "is", null)
    .order("contract_ym", { ascending: false })
    .order("contract_day", { ascending: false, nullsFirst: false })
    /* [1008 · 리뷰 A-16] 같은 날 거래 순서를 확정 — 상한(600행) 경계에서도 요청마다 같은 행을 읽게 */
    .order("deal_amount_krw", { ascending: false })
    .order("area_m2", { ascending: false })
    .limit(TRADE_ROW_CAP);
  if (error) throw new Error(`[complex-trades] ${name} 매매 조회 실패: ${error.message}`);
  const list = (data ?? []) as Array<{
    contract_ym: string | null;
    contract_day: number | string | null;
    deal_amount_krw: number | string | null;
    area_m2: number | string | null;
  }>;
  const rows: TradeLite[] = [];
  for (const r of list) {
    const ym = String(r.contract_ym ?? "").trim();
    const krw = Number(r.deal_amount_krw);
    const area = Number(r.area_m2);
    const day = r.contract_day == null ? null : Number(r.contract_day);
    if (!/^\d{6}$/.test(ym) || !Number.isFinite(krw) || krw <= 0 || !Number.isFinite(area) || area <= 0) continue;
    rows.push({ ym, day: Number.isFinite(day) ? day : null, man: Math.round(krw / 10_000), area });
  }
  return { rows, capped: list.length >= TRADE_ROW_CAP };
}
