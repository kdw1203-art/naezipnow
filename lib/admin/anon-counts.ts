import "server-only";

import { getServiceSupabase } from "@/lib/supabase/service";
import { kstDay, summarizeCounts, type AggRow, type CountSummary } from "@/lib/metrics/page-count";

/**
 * [1053 · 방문 집계] 관리 › 트래픽 "전체 방문 수" 카드 재료 — public.page_view_daily_agg 최근 14일(service_role).
 * 실패는 실패로 돌려준다(0 으로 꾸미지 않는다).
 */
export async function loadAnonCounts(nowMs: number = Date.now()): Promise<CountSummary> {
  const sb = getServiceSupabase();
  if (!sb) throw new Error("저장소 준비 안 됨");
  const today = kstDay(nowMs);
  const since = kstDay(nowMs - 13 * 86_400_000);
  const { data, error } = await sb
    .from("page_view_daily_agg")
    .select("day, route, is_landing, ref_host, utm_source, device, n")
    .gte("day", since)
    .order("day", { ascending: true })
    .limit(20_000);
  if (error) throw new Error(`방문 수 조회 실패: ${error.message}`);
  const rows: AggRow[] = ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
    day: String(r.day ?? ""),
    route: String(r.route ?? ""),
    is_landing: r.is_landing === true,
    ref_host: String(r.ref_host ?? ""),
    utm_source: String(r.utm_source ?? ""),
    device: String(r.device ?? ""),
    n: Number(r.n ?? 0),
  }));
  return summarizeCounts(rows, today);
}
