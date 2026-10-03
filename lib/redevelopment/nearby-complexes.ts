import "server-only";

import { getReadOnlySupabase } from "@/lib/newui/supabase-read";
import { bboxForRadius } from "@/lib/map/geo-haversine";
import { logger } from "@/lib/log";
import {
  ZONE_NEARBY_COMPLEX_RADIUS_M,
  pickNearbyComplexes,
  type ComplexPriceRow,
} from "./zone-detail";

/**
 * [1027] 구역 주변 단지의 실거래 집계 — /redevelopment/[id] 전용.
 *
 * 원천은 지도 시세 색상과 같은 뷰 `map_price_point_source`(단지 좌표 + 국토교통부 매매 실거래 집계,
 * 해제 신고분 제외)다. 지도가 쓰는 값을 그대로 읽는다 — 다만 이 화면은 하루 단위로 캐시되므로(ISR · 집계 갱신 때 비움)
 * 갱신 사이에는 지도와 몇 시간 어긋날 수 있다.
 * 준공연도·세대수는 지도 상세 필터와 같은 RPC `map_complex_attrs` 에서 덧붙인다(실패하면 그 두 칸만 비운다).
 *
 * 조회 실패는 던진다 — 호출부가 "못 불러왔다"와 "주변에 거래 단지가 없다"를 구분해 그린다.
 */

export type NearbyComplex = ComplexPriceRow & {
  buildYear: number | null;
  households: number | null;
};

/** 반경 사각형 안에서 읽어 올 행 수 — 서울 한복판 1km 사각형에 거래 단지가 100곳 안팎이다 */
const SOURCE_LIMIT = 200;

function num(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export async function listNearbyComplexes(
  center: { lat: number; lng: number },
  limit = 8,
): Promise<NearbyComplex[]> {
  const sb = getReadOnlySupabase();
  if (!sb) throw new Error("읽기 전용 DB 클라이언트가 없습니다");
  const box = bboxForRadius(center.lat, center.lng, ZONE_NEARBY_COMPLEX_RADIUS_M);

  const { data, error } = await sb
    .from("map_price_point_source")
    .select("region_name,complex_name,lat,lng,tx_count,avg_per_pyeong_krw,avg_krw,avg_area_m2,first_ym,latest_ym")
    .gte("lat", box.minLat)
    .lte("lat", box.maxLat)
    .gte("lng", box.minLng)
    .lte("lng", box.maxLng)
    .order("tx_count", { ascending: false, nullsFirst: false })
    .limit(SOURCE_LIMIT);
  if (error) throw new Error(`주변 단지 조회 실패 (map_price_point_source): ${error.message}`);

  const rows: ComplexPriceRow[] = ((data ?? []) as Record<string, unknown>[])
    .map((r) => ({
      regionName: String(r.region_name ?? ""),
      complexName: String(r.complex_name ?? ""),
      lat: Number(r.lat),
      lng: Number(r.lng),
      txCount: num(r.tx_count) ?? 0,
      avgPerPyeongKrw: num(r.avg_per_pyeong_krw),
      avgKrw: num(r.avg_krw),
      avgAreaM2: num(r.avg_area_m2),
      firstYm: r.first_ym != null ? String(r.first_ym) : null,
      latestYm: r.latest_ym != null ? String(r.latest_ym) : null,
    }))
    .filter((r) => r.regionName && r.complexName);

  const picked = pickNearbyComplexes(rows, center, ZONE_NEARBY_COMPLEX_RADIUS_M, limit);
  if (picked.length === 0) return [];

  /* 준공·세대수 — 없어도 표는 그린다(두 칸만 "—") */
  const attrs = new Map<string, { buildYear: number | null; households: number | null }>();
  try {
    const { data: a, error: aErr } = await sb.rpc("map_complex_attrs", {
      p_min_lat: box.minLat,
      p_max_lat: box.maxLat,
      p_min_lng: box.minLng,
      p_max_lng: box.maxLng,
      p_limit: 300,
    });
    if (aErr) {
      logger.warn("[redev.zone] map_complex_attrs 실패", { message: aErr.message });
    } else {
      for (const r of (a ?? []) as Record<string, unknown>[]) {
        const key = `${String(r.region_name ?? "")}\u0001${String(r.complex_name ?? "")}`;
        if (!attrs.has(key)) attrs.set(key, { buildYear: num(r.build_year), households: num(r.households) });
      }
    }
  } catch (e) {
    logger.warn("[redev.zone] map_complex_attrs 예외", { message: e instanceof Error ? e.message : String(e) });
  }

  return picked.map((r) => {
    const a = attrs.get(`${r.regionName}\u0001${r.complexName}`);
    return { ...r, buildYear: a?.buildYear ?? null, households: a?.households ?? null };
  });
}
