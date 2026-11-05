import "server-only";

import { getServiceSupabase } from "@/lib/supabase/service";
import { kstDay, summarizeCounts, type AggRow, type CountSummary } from "@/lib/metrics/page-count";
import { outageOn } from "@/lib/metrics/known-outages";
import { readPaged } from "@/lib/supabase/read-paged";

/**
 * [1053 · 방문 집계] 관리 › 트래픽 "전체 방문 수" 카드 재료 — public.page_view_daily_agg 최근 14일(service_role).
 * 실패는 실패로 돌려준다(0 으로 꾸미지 않는다).
 */
export async function loadAnonCounts(nowMs: number = Date.now()): Promise<CountSummary> {
  const sb = getServiceSupabase();
  if (!sb) throw new Error("저장소 준비 안 됨");
  const today = kstDay(nowMs);
  const since = kstDay(nowMs - 13 * 86_400_000);
  /* [1106] `.limit(20_000)` 한 번은 PostgREST 상한 1,000행만 돌려준다(14일 670행 · 하루 50~110행씩 늘어 곧 넘는다).
     search-landings 와 같은 방식 — 기본 키 순서로 끝까지 읽는다. */
  let paged;
  try {
    paged = await readPaged<Record<string, unknown>>(
      (from, to) =>
        sb
          .from("page_view_daily_agg")
          .select("day, route, is_landing, ref_host, utm_source, device, n")
          .gte("day", since)
          .order("day", { ascending: true })
          .order("route", { ascending: true })
          .order("is_landing", { ascending: true })
          .order("ref_host", { ascending: true })
          .order("utm_source", { ascending: true })
          .order("device", { ascending: true })
          .range(from, to),
      20_000,
    );
  } catch (e) {
    throw new Error(`방문 수 조회 실패: ${e instanceof Error ? e.message : String(e)}`);
  }
  const rows: AggRow[] = paged.rows.map((r) => ({
    day: String(r.day ?? ""),
    route: String(r.route ?? ""),
    is_landing: r.is_landing === true,
    ref_host: String(r.ref_host ?? ""),
    utm_source: String(r.utm_source ?? ""),
    device: String(r.device ?? ""),
    n: Number(r.n ?? 0),
  }));
  return summarizeCounts(rows, today, (d) => outageOn(d) !== null);
}
