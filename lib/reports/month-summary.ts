/**
 * [1009 · H 리뷰] 월간 리포트 목록의 달별 요약 — 순수 함수(테스트로 잠근다).
 * [1009 · 통합] app/reports 에서 lib 로 옮겼다 — listReportMonths(목록·RSS·사이트맵·llms-full·IndexNow 공용)가 쓴다.
 * 행(지역 × 달) → 달마다 지역 수 · 거래 합계 · 마지막 갱신 시각. 최신 달이 앞.
 */
import type { ReportMonthSummary } from "@/lib/reports/monthly";

export type MonthRow = { month: unknown; transaction_count: unknown; updated_at: unknown };

function validYm(ym: string): boolean {
  return /^\d{6}$/.test(ym) && Number(ym.slice(4)) >= 1 && Number(ym.slice(4)) <= 12;
}

export function summarizeReportMonths(rows: readonly MonthRow[]): ReportMonthSummary[] {
  const byYm = new Map<string, ReportMonthSummary>();
  for (const r of rows) {
    const ym = String(r.month ?? "");
    if (!validYm(ym)) continue;
    const cur = byYm.get(ym) ?? { ym, regionCount: 0, txCount: 0, updatedAt: null };
    cur.regionCount += 1;
    cur.txCount += Number(r.transaction_count ?? 0) || 0;
    const u = r.updated_at ? String(r.updated_at) : null;
    if (u && (!cur.updatedAt || u > cur.updatedAt)) cur.updatedAt = u;
    byYm.set(ym, cur);
  }
  return [...byYm.values()].sort((a, b) => b.ym.localeCompare(a.ym));
}
