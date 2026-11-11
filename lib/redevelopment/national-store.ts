import "server-only";
import { getServiceSupabase } from "@/lib/supabase/service";

/* [1150] 서울 자치구별 정비구역 수(국토교통부 공표 목록) — 표가 없거나(sql 215 전) 비었거나 못 읽으면 null(그 지도를 그리지 않는다). */
export async function loadSeoulNationalCounts(): Promise<Map<string, number> | null> {
  const sb = getServiceSupabase();
  if (!sb) return null;
  try {
    const { data, error } = await sb.from("redev_national_zones").select("sigungu").like("sido", "서울%").limit(3000);
    if (error || !data || data.length === 0) return null;
    const m = new Map<string, number>();
    for (const r of data as Array<{ sigungu: string }>) m.set(r.sigungu, (m.get(r.sigungu) ?? 0) + 1);
    return m;
  } catch {
    return null;
  }
}
