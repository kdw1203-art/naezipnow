import "server-only";
import { getReadOnlySupabase, readOnlyClientHasServiceRole } from "@/lib/newui/supabase-read";
import { decodeComplexId, getComplexById, parseComplexId } from "@/lib/complex/complex-store";
import { kstYm, windowStartYm, type AskingTrade } from "@/lib/complex/asking-check";

/**
 * [1008 · Q] 호가 점검 재료 — 단지의 최근 24개월 매매 실거래(해제 제외·금액>0), 면적·금액·연월·층만.
 *
 * 왜 새 조회인가: 단지 허브 HTML 은 이미 296KB(1007 이월)라 분포 재료를 페이지에 싣지 않는다 —
 * 사용자가 "호가 점검"을 펼칠 때만 GET /api/complex/[id]/trades 가 이걸 부르고 CDN 이 1시간 받는다.
 *
 * 질의 모양(운영 DB 읽기 전용 EXPLAIN ANALYZE, 2026-09-21, 헬리오시티 134행):
 *   Index Only Scan using mt_trade_complex_cov2_idx — Index Cond (region_name, complex_name,
 *   contract_ym ≥ 창 시작), Filter deal_amount_krw > 0, Heap Fetches 1, 실행 0.38ms.
 * 조건은 허브 공용 행(complex-store loadTradeRowsShared)과 같다(매매·해제 제외·금액>0, 주택 유형
 * 필터 없음) — 허브 "면적대별 시세" 표와 같은 표본에서 창만 자른다.
 */

export const ASKING_TRADES_MONTHS = 24;

type Row = {
  contract_ym: string;
  area_m2: number | string | null;
  deal_amount_krw: number | string;
  floor: number | null;
};

export type AskingTradesResult =
  | { kind: "ok"; region: string; name: string; fromYm: string; toYm: string; trades: AskingTrade[] }
  | { kind: "not-found" }
  | { kind: "unconfigured" };

/** kapt.* id 는 대표행의 canonical_id(항상 name-id)로 푼다 — 실거래 조회 키는 (지역, 단지명)이다 */
async function resolveNames(id: string): Promise<{ region: string; name: string } | null> {
  const parsed = parseComplexId(id);
  if (!parsed) return null;
  if (parsed.kind === "name") return { region: parsed.region, name: parsed.name };
  const row = await getComplexById(id);
  return row ? decodeComplexId(row.canonical_id) : null;
}

/** 조회 실패는 던진다(라우트가 503) — 빈 배열은 "거래 없음"이라는 강한 주장이라 위장하지 않는다 */
export async function loadAskingTrades(id: string, nowMs: number): Promise<AskingTradesResult> {
  /* 서비스 롤로만 — 허브 실거래(complex-store · getServiceSupabase)와 같은 권한 경로. 공개 키 폴백은
     표마다 권한이 달라(같은 판의 게임 후보 뷰는 anon 이 "permission denied" — 로컬 실측) 기대지 않는다 */
  const sb = readOnlyClientHasServiceRole() ? getReadOnlySupabase() : null;
  if (!sb) return { kind: "unconfigured" };
  const names = await resolveNames(id);
  if (!names) return { kind: "not-found" };
  const toYm = kstYm(nowMs);
  const fromYm = windowStartYm(toYm, ASKING_TRADES_MONTHS);
  const { data, error } = await sb
    .from("market_transactions")
    .select("contract_ym, area_m2, deal_amount_krw, floor")
    .eq("region_name", names.region)
    .eq("complex_name", names.name)
    .eq("transaction_type", "trade")
    .eq("is_cancelled", false)
    .gt("deal_amount_krw", 0)
    .gte("contract_ym", fromYm)
    .order("contract_ym", { ascending: false })
    .limit(1_000);
  if (error) throw new Error(`market_transactions (호가 점검 ${names.name}) 조회 실패: ${error.message}`);
  const trades: AskingTrade[] = [];
  for (const r of (data as Row[] | null) ?? []) {
    const area = Number(r.area_m2);
    const won = Number(r.deal_amount_krw);
    if (!(area > 0) || !(won > 0) || !/^\d{6}$/.test(String(r.contract_ym))) continue;
    trades.push({
      ym: String(r.contract_ym),
      /* 원값 그대로 — 반올림하면 59.995↑·85.495↑ 가 허브 "면적대별 시세" 표(원값으로 판정)와 다른
         면적대로 갈린다(리뷰 C). 표시 자릿수는 화면이 정한다 */
      areaM2: area,
      priceManwon: Math.round(won / 10_000),
      floor: typeof r.floor === "number" && r.floor > 0 ? r.floor : null,
    });
  }
  return { kind: "ok", region: names.region, name: names.name, fromYm, toYm, trades };
}
