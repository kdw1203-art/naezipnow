import "server-only";
/**
 * [1024] 단지 관리비 조회 — complex_mgmt_fee 최근 12개월(+전년 동월 비교분 1개월).
 *
 * 계약: 표가 없거나(마이그레이션 미적용) 조회가 실패하면 **null** — 화면(담당 R)은 null 이면 관리비 카드를
 * 생략한다. 행이 0 이면 빈 배열(단지는 있으나 아직 적재 전 — 카드는 마찬가지로 생략). 지어내지 않는다.
 */
import { getServiceSupabase } from "@/lib/supabase/service";
import { logger } from "@/lib/log";
import { summarizeMgmtFee, type ComplexMgmtFeeRow, type ComplexMgmtFeeSummary } from "@/lib/complex/mgmt-fee-core";

export { summarizeMgmtFee, sortMgmtFeeDesc } from "@/lib/complex/mgmt-fee-core";
export type { ComplexMgmtFeeRow, ComplexMgmtFeeSummary } from "@/lib/complex/mgmt-fee-core";

export async function getComplexMgmtFees(
  kaptCode: string,
  months = 12,
  signal?: AbortSignal,
): Promise<ComplexMgmtFeeRow[] | null> {
  const code = kaptCode.trim();
  if (!code) return null;
  const sb = getServiceSupabase();
  if (!sb) return null;
  /* 전년 동월 비교(summarizeMgmtFee.yoyPct)를 위해 13개월까지 읽는다 */
  let q = sb
    .from("complex_mgmt_fee")
    .select("ym,common_krw,individual_krw,total_krw,per_m2_krw")
    .eq("kapt_code", code)
    .order("ym", { ascending: false })
    .limit(Math.max(1, Math.min(36, months)) + 1);
  if (signal) q = q.abortSignal(signal);
  const { data, error } = await q;
  if (error) {
    /* 표 부재(42P01)·권한·타임아웃 모두 "지금은 모른다" — 카드를 그리지 않는다 */
    logger.warn(`[mgmt-fee] ${code} 조회 실패(카드 생략)`, error.message);
    return null;
  }
  return ((data ?? []) as Record<string, unknown>[])
    .map((r) => ({
      ym: String(r.ym ?? ""),
      commonKrw: r.common_krw == null ? null : Number(r.common_krw),
      individualKrw: r.individual_krw == null ? null : Number(r.individual_krw),
      totalKrw: Number(r.total_krw),
      perM2Krw: r.per_m2_krw == null ? null : Number(r.per_m2_krw),
    }))
    .filter((r) => /^\d{6}$/.test(r.ym) && Number.isFinite(r.totalKrw));
}

/** 조회 + 요약 한 번에 — 없으면 null(카드 생략) */
export async function getComplexMgmtFeeSummary(
  kaptCode: string,
  signal?: AbortSignal,
): Promise<ComplexMgmtFeeSummary | null> {
  const rows = await getComplexMgmtFees(kaptCode, 12, signal);
  if (!rows || rows.length === 0) return null;
  return summarizeMgmtFee(rows);
}
