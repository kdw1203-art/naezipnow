import "server-only";
import { getServiceSupabase } from "@/lib/supabase/service";
import { fetchHousingCsi, fetchKeyStatistics, isEcosConfigured } from "@/lib/ecos/client";
import { logger } from "@/lib/log";

/**
 * ECOS 100대 통계지표 → public_data_cache 적재.
 * cache_key = "ecos:key-stats" 에 전체를, "ecos:base-rate" 에 기준금리 요약을 저장.
 */

const CACHE_SOURCE = "ecos";

export type EcosSyncResult = {
  ok: boolean;
  skipped?: boolean;
  reason?: string;
  count?: number;
  baseRate?: string | null;
  /** [1048] 소비자동향조사 CSI 묶음 수(주택가격전망 4 + 금리수준전망 1) — 못 받으면 0 */
  csiSeries?: number;
};

/** 기준금리 후보 이름들 (ECOS 지표명 변동 대비) */
function pickBaseRate(
  stats: { name: string; value: string; cycle: string; unit: string }[],
): { value: string; cycle: string; unit: string } | null {
  const cand = stats.find(
    (s) => s.name.includes("한국은행 기준금리") || s.name.includes("기준금리"),
  );
  return cand ? { value: cand.value, cycle: cand.cycle, unit: cand.unit } : null;
}

export async function syncEcosKeyStats(): Promise<EcosSyncResult> {
  if (!isEcosConfigured()) {
    return { ok: false, skipped: true, reason: "ECOS_API_KEY 미설정" };
  }
  const sb = getServiceSupabase();
  if (!sb) return { ok: false, skipped: true, reason: "Supabase 미설정" };

  const stats = await fetchKeyStatistics();
  if (!stats || stats.length === 0) {
    return { ok: false, skipped: true, reason: "ECOS 응답 없음(인증키 확인)" };
  }

  const baseRate = pickBaseRate(stats);
  const now = new Date();
  const nowIso = now.toISOString();
  // public_data_cache.expires_at 은 NOT NULL — 7일 뒤 만료 (주 1회 갱신)
  const expiresIso = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const rows: Array<{
    source: string;
    cache_key: string;
    payload: Record<string, unknown>;
    fetched_at: string;
    expires_at: string;
  }> = [
    {
      source: CACHE_SOURCE,
      cache_key: "ecos:key-stats",
      payload: { stats, fetchedAt: nowIso },
      fetched_at: nowIso,
      expires_at: expiresIso,
    },
    {
      source: CACHE_SOURCE,
      cache_key: "ecos:base-rate",
      payload: baseRate ?? {},
      fetched_at: nowIso,
      expires_at: expiresIso,
    },
  ];
  /* [1048] 주택가격전망 · 금리수준전망 CSI(다요인 분석 심리·금리 요인) — 실패해도 100대 지표 적재는 그대로 간다.
     못 받은 날은 행을 덮지 않는다(어제 값이 "없음"으로 바뀌지 않게). */
  let csiSeries = 0;
  try {
    const csi = await fetchHousingCsi(now);
    if (csi) {
      csiSeries = Object.keys(csi).length;
      rows.push({
        source: CACHE_SOURCE,
        cache_key: "ecos:housing-csi",
        payload: { series: csi, fetchedAt: nowIso },
        fetched_at: nowIso,
        expires_at: expiresIso,
      });
    }
  } catch (e) {
    logger.warn("[ecos sync] housing csi failed", e);
  }
  const { error } = await sb
    .from("public_data_cache")
    .upsert(rows, { onConflict: "cache_key" });
  if (error) {
    logger.error("[ecos sync] upsert failed", error);
    return { ok: false, reason: error.message };
  }
  return {
    ok: true,
    count: stats.length,
    baseRate: baseRate ? baseRate.value : null,
    csiSeries,
  };
}
