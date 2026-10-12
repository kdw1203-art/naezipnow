import "server-only";

import { getServiceSupabase } from "@/lib/supabase/service";
import { kstDay } from "@/lib/metrics/page-count";
import { summarizeSearchLandings, type LandingRow, type SearchLandingSummary } from "@/lib/seo/search-engines";

/**
 * [1061] 검색엔진별 착지(우리 측정) — public.page_view_daily_agg 의 첫 화면 줄(is_landing) 최근 56일
 * (비교용 앞 28일 포함). 동의와 무관한 익명 하루 수라 전체 방문의 모집단이다(관리 › 트래픽의
 * "유입 출처" 표는 동의 방문 표본 — 둘이 다른 이유가 여기 있다). 실패는 던진다.
 */
export async function loadSearchLandings(nowMs: number = Date.now(), days = 28): Promise<SearchLandingSummary> {
  const sb = getServiceSupabase();
  if (!sb) throw new Error("저장소 준비 안 됨");
  const today = kstDay(nowMs);
  const since = kstDay(nowMs - (days * 2 - 1) * 86_400_000);
  const { data, error } = await sb
    .from("page_view_daily_agg")
    .select("day, route, ref_host, n")
    .eq("is_landing", true)
    .gte("day", since)
    .order("day", { ascending: true })
    .limit(50_000);
  if (error) throw new Error(`착지 조회 실패: ${error.message}`);
  const rows: LandingRow[] = ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
    day: String(r.day ?? ""),
    route: String(r.route ?? ""),
    ref_host: String(r.ref_host ?? ""),
    n: Number(r.n ?? 0),
  }));
  return summarizeSearchLandings(rows, today, days);
}
