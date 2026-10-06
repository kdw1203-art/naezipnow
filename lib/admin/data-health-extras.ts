import "server-only";

import { getServiceSupabase } from "@/lib/supabase/service";
import { logger } from "@/lib/log";

/* [#97] 데이터 헬스 통합 — 신선도 표(기존) 옆에 붙는 보조 지표 2종.
 *  · 지오코딩 커버리지: 단지 마스터 대비 좌표 확보율(지도 표시 가능 비율)
 *  · 최근 24시간 수집 로그 요약: 소스별 ok/skipped/error 건수
 * 조회 실패는 null — "0%"·"0건"으로 위장하지 않는다. */

export type GeocodeCoverage = { complexes: number; geocoded: number; pct: number };

/* [1043] 예전 조회는 complex_geocode 에 없는 열(complex_id)을 세어 늘 실패 → null → 카드가 한 번도 그려지지 않았다.
   모집단도 달랐다(K-apt 대장 행 수 ÷ 좌표 행 전체). 관리 › 데이터의 진행률과 같은 함수(public.geocode_coverage)에서 읽는다 —
   분모 = 거래가 있는 아파트 단지, 분자 = 그 가운데 좌표가 있는 단지. */
export async function loadGeocodeCoverage(): Promise<GeocodeCoverage | null> {
  const sb = getServiceSupabase();
  if (!sb) return null;
  try {
    const { data, error } = await sb.rpc("geocode_coverage");
    const row = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | null;
    const complexes = Number(row?.complexes);
    const geocoded = Number(row?.with_coord);
    if (error || !Number.isFinite(complexes) || !Number.isFinite(geocoded)) {
      logger.error("[data-health] 지오코딩 커버리지 조회 실패", error);
      return null;
    }
    return {
      complexes,
      geocoded,
      pct: complexes > 0 ? Math.floor((Math.min(geocoded, complexes) / complexes) * 1000) / 10 : 0,
    };
  } catch (e) {
    logger.error("[data-health] 지오코딩 커버리지", e);
    return null;
  }
}

export type IngestLogSummaryRow = {
  source: string;
  ok: number;
  skipped: number;
  error: number;
  lastMessage: string | null;
};

export async function loadIngestLogSummary24h(): Promise<IngestLogSummaryRow[] | null> {
  const sb = getServiceSupabase();
  if (!sb) return null;
  try {
    const { data, error } = await sb
      .from("market_ingest_log")
      .select("source, status, message, created_at")
      .gte("created_at", new Date(Date.now() - 24 * 3600_000).toISOString())
      .order("created_at", { ascending: false })
      .limit(400);
    if (error || !Array.isArray(data)) {
      logger.error("[data-health] 수집 로그 조회 실패", error ?? "invalid");
      return null;
    }
    const map = new Map<string, IngestLogSummaryRow>();
    for (const r of data as Array<Record<string, unknown>>) {
      const source = String(r.source ?? "기타");
      const row =
        map.get(source) ?? { source, ok: 0, skipped: 0, error: 0, lastMessage: null };
      const status = String(r.status ?? "");
      if (status === "ok") row.ok += 1;
      else if (status === "skipped") row.skipped += 1;
      else if (status === "error") row.error += 1;
      if (row.lastMessage === null && r.message) row.lastMessage = String(r.message).slice(0, 120);
      map.set(source, row);
    }
    return [...map.values()].sort((a, b) => b.error - a.error || b.ok - a.ok);
  } catch (e) {
    logger.error("[data-health] 수집 로그 요약", e);
    return null;
  }
}
