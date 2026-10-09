import "server-only";

import { unstable_cache } from "next/cache";
import { getReadOnlySupabase } from "@/lib/newui/supabase-read";
import { bboxForRadius } from "@/lib/map/geo-haversine";
import { logger } from "@/lib/log";
import {
  AREA_RADIUS_M,
  overpassQuery,
  parseOverpass,
  pickSimilarComplexes,
  type AreaComplex,
  type AreaOffice,
  type AreaStation,
  type ComplexCandidate,
  type OsmElement,
} from "@/lib/map/area-pick";

/**
 * [1047 · 단지 위치 지도] 반경 안의 유사 단지(우리 표) · 역 · 관공서(OpenStreetMap). 규칙은 lib/map/area-pick(순수).
 * 각 원천은 따로 실패한다 — 하나가 실패해도 나머지는 그린다(호출부가 missing 으로 받는다).
 */

/* 공개 Overpass 서버는 가끔 바쁘다(시간 초과 · 429) — 세 곳을 차례로 묻고, 성공한 결과는 서버 캐시에 30일 둔다(아래) */
const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
];
const OVERPASS_TIMEOUT_MS = 7_000;

function num(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export async function loadAreaComplexes(
  center: { lat: number; lng: number },
  self: { name: string; buildYear?: number | null },
): Promise<AreaComplex[]> {
  const sb = getReadOnlySupabase();
  if (!sb) throw new Error("읽기 전용 DB 클라이언트가 없습니다");
  const box = bboxForRadius(center.lat, center.lng, AREA_RADIUS_M);
  const { data, error } = await sb
    .from("map_price_point_source")
    .select("region_name,complex_name,lat,lng,avg_per_pyeong_krw,tx_count")
    .gte("lat", box.minLat)
    .lte("lat", box.maxLat)
    .gte("lng", box.minLng)
    .lte("lng", box.maxLng)
    .order("tx_count", { ascending: false, nullsFirst: false })
    .limit(200);
  if (error) throw new Error(`주변 단지 조회 실패: ${error.message}`);

  const attrs = new Map<string, { buildYear: number | null; households: number | null }>();
  try {
    const { data: a, error: aErr } = await sb.rpc("map_complex_attrs", {
      p_min_lat: box.minLat,
      p_max_lat: box.maxLat,
      p_min_lng: box.minLng,
      p_max_lng: box.maxLng,
      p_limit: 300,
    });
    if (!aErr) {
      for (const r of (a ?? []) as Record<string, unknown>[]) {
        const key = `${String(r.region_name ?? "")}\u0001${String(r.complex_name ?? "")}`;
        if (!attrs.has(key)) attrs.set(key, { buildYear: num(r.build_year), households: num(r.households) });
      }
    } else {
      logger.warn("[area-map] map_complex_attrs 실패", { message: aErr.message });
    }
  } catch (e) {
    logger.warn("[area-map] map_complex_attrs 예외", { message: e instanceof Error ? e.message : String(e) });
  }

  const rows: ComplexCandidate[] = ((data ?? []) as Record<string, unknown>[])
    .map((r) => {
      const regionName = String(r.region_name ?? "");
      const complexName = String(r.complex_name ?? "");
      const at = attrs.get(`${regionName}\u0001${complexName}`);
      return {
        regionName,
        complexName,
        lat: Number(r.lat),
        lng: Number(r.lng),
        avgPerPyeongKrw: num(r.avg_per_pyeong_krw),
        buildYear: at?.buildYear ?? null,
        households: at?.households ?? null,
      };
    })
    .filter((r) => r.regionName && r.complexName && Number.isFinite(r.lat) && Number.isFinite(r.lng));
  return pickSimilarComplexes(rows, { name: self.name, lat: center.lat, lng: center.lng, buildYear: self.buildYear ?? null });
}

/** 성공만 캐시한다(실패는 던지므로 캐시에 남지 않는다) — 역·관공서는 한 달에 몇 번 바뀌지 않는다 */
export const loadAreaOsmCached = unstable_cache(
  (lat: number, lng: number) => loadAreaOsm({ lat, lng }),
  ["area-osm-v1"],
  { revalidate: 2_592_000 },
);

export async function loadAreaOsm(center: { lat: number; lng: number }): Promise<{ stations: AreaStation[]; offices: AreaOffice[] }> {
  const body = new URLSearchParams({ data: overpassQuery(center.lat, center.lng) }).toString();
  let lastErr: unknown = null;
  for (const url of OVERPASS_ENDPOINTS) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": "naezipnow.com complex-area-map (+https://naezipnow.com)",
        },
        body,
        signal: AbortSignal.timeout(OVERPASS_TIMEOUT_MS),
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as { elements?: OsmElement[] };
      return parseOverpass(Array.isArray(json.elements) ? json.elements : [], center);
    } catch (e) {
      lastErr = e;
    }
  }
  throw new Error(`OpenStreetMap 조회 실패: ${lastErr instanceof Error ? lastErr.message : String(lastErr)}`);
}
