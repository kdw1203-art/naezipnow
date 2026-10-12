import "server-only";

import { getServiceSupabase } from "@/lib/supabase/service";
import {
  SEARCH_REPORT_KEY_PREFIX,
  readSearchReport,
  searchReportKey,
  type SearchReport,
  type SearchReportEngine,
} from "@/lib/seo/search-report-rules";

/**
 * [1061] 검색엔진 리포트 손 기록 저장소.
 *
 * 자리: public.kv_store_99a854cb(key text PK · value jsonb) — 옛 시제품이 남긴 범용 키·값 표로 지금 코드가
 * 읽는 곳이 없고(service_role 만 접근 · RLS 켜짐 · 정책 없음) 새 표를 만들지 않고도 쓸 수 있다.
 * 키는 `search-report:<engine>:<YYYY-MM-DD>` 로 접두사를 고정해 옛 키(banners:·group: …)와 섞이지 않는다.
 * 같은 엔진·같은 날짜는 덮어쓴다(기록 정정). 지우지 않는다.
 */
const TABLE = "kv_store_99a854cb";

export async function listSearchReports(engine: SearchReportEngine, limit = 12): Promise<SearchReport[]> {
  const sb = getServiceSupabase();
  if (!sb) throw new Error("저장소 준비 안 됨");
  const prefix = `${SEARCH_REPORT_KEY_PREFIX}${engine}:`;
  const { data, error } = await sb
    .from(TABLE)
    .select("key, value")
    .like("key", `${prefix}%`)
    .order("key", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`기록 조회 실패: ${error.message}`);
  const out: SearchReport[] = [];
  for (const row of (data ?? []) as Array<{ key: string; value: unknown }>) {
    const r = readSearchReport(row.value);
    if (r) out.push(r);
  }
  return out;
}

export async function saveSearchReport(report: SearchReport): Promise<void> {
  const sb = getServiceSupabase();
  if (!sb) throw new Error("저장소 준비 안 됨");
  const { error } = await sb
    .from(TABLE)
    .upsert({ key: searchReportKey(report.engine, report.date), value: report }, { onConflict: "key" });
  if (error) throw new Error(`기록 저장 실패: ${error.message}`);
}
