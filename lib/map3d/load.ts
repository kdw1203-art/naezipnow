/**
 * [1086 · 서울 3D] 3D 동네 지도의 우리 데이터 — 동의 단지(이름·세대수·준공·최근 거래) + 좌표·평당 평균(실거래 집계) + 주변 단지.
 *
 * 원천(이미 있는 것만 · DB 변경 없음):
 *  · 동의 단지 목록 — RPC search_complexes_filtered(lib/dong/landing loadDongComplexes · 동 페이지와 같은 원천)
 *  · 좌표·평당 평균·거래 수·기간 — map_price_point_source(지도 화면과 같은 원천 · 국토교통부 신고 · 해제 제외)
 *  · 주변 단지 세대수·준공 — RPC map_complex_attrs(단지 위치 지도와 같은 원천)
 * 규칙: 동의 단지가 0곳이거나 좌표가 하나도 없으면 null("없다" → 404) · 조회 실패는 던진다(5xx).
 */
import "server-only";
import { getReadOnlySupabase } from "@/lib/newui/supabase-read";
import { bboxForRadius } from "@/lib/map/geo-haversine";
import { loadDongComplexes } from "@/lib/dong/landing";
import { complexHrefFromNames } from "@/lib/seo/complex-slug";
import { logger } from "@/lib/log";
import { distanceM, medianCenter, type Map3DComplex, type Map3DPayload } from "./geo";

export type { Map3DPayload } from "./geo";

export const MAP3D_NEIGHBOR_RADIUS_M = 1600;

type PointRow = {
  region_name: string;
  complex_name: string;
  lat: number | string | null;
  lng: number | string | null;
  tx_count: number | string | null;
  avg_per_pyeong_krw: number | string | null;
  first_ym: string | null;
  latest_ym: string | null;
};

const num = (v: unknown): number | null => {
  const x = typeof v === "string" ? Number(v) : v;
  return typeof x === "number" && Number.isFinite(x) ? x : null;
};

export async function loadMap3D(region: string, dong: string): Promise<Map3DPayload | null> {
  const sb = getReadOnlySupabase();
  if (!sb) throw new Error("3D 지도 데이터를 읽을 수단이 없습니다(Supabase 미설정)");

  const dongComplexes = await loadDongComplexes(region, dong);
  if (dongComplexes.length === 0) return null;
  const byName = new Map(dongComplexes.map((c) => [c.name, c]));

  const { data, error } = await sb
    .from("map_price_point_source")
    .select("region_name,complex_name,lat,lng,tx_count,avg_per_pyeong_krw,first_ym,latest_ym")
    .eq("region_name", region)
    .limit(3000);
  if (error) throw new Error(`map_price_point_source(${region}) 조회 실패 — ${error.message}`);
  const rows = ((data ?? []) as PointRow[])
    .map((r) => ({ ...r, latN: num(r.lat), lngN: num(r.lng) }))
    .filter((r) => r.latN !== null && r.lngN !== null);

  const inDongRows = rows.filter((r) => byName.has(r.complex_name));
  const center = medianCenter(inDongRows.map((r) => ({ lat: r.latN as number, lng: r.lngN as number })));
  if (!center) return null;

  /* 주변 단지(같은 지역 · 반경 1.6km) 세대수 — 실패해도 이름표는 그린다(세대수는 칠하기 반경에만 쓴다) */
  const attrs = new Map<string, { households: number | null; buildYear: number | null }>();
  try {
    const box = bboxForRadius(center.lat, center.lng, MAP3D_NEIGHBOR_RADIUS_M);
    const { data: a, error: aErr } = await sb.rpc("map_complex_attrs", {
      p_min_lat: box.minLat,
      p_max_lat: box.maxLat,
      p_min_lng: box.minLng,
      p_max_lng: box.maxLng,
      p_limit: 600,
    });
    if (aErr) logger.warnSampled("map3d-attrs", "[map3d] map_complex_attrs 실패", { message: aErr.message });
    for (const r of (a ?? []) as Record<string, unknown>[]) {
      const key = `${String(r.region_name ?? "")}\u0001${String(r.complex_name ?? "")}`;
      if (!attrs.has(key)) attrs.set(key, { households: num(r.households), buildYear: num(r.build_year) });
    }
  } catch (e) {
    logger.warnSampled("map3d-attrs", "[map3d] map_complex_attrs 예외", { message: e instanceof Error ? e.message : String(e) });
  }

  const complexes: Map3DComplex[] = [];
  let from: string | null = null;
  let to: string | null = null;
  for (const r of rows) {
    const lat = r.latN as number;
    const lng = r.lngN as number;
    const own = byName.get(r.complex_name);
    if (!own && distanceM(center, { lat, lng }) > MAP3D_NEIGHBOR_RADIUS_M) continue;
    const at = attrs.get(`${r.region_name}\u0001${r.complex_name}`);
    if (own) {
      if (r.first_ym && (!from || r.first_ym < from)) from = r.first_ym;
      if (r.latest_ym && (!to || r.latest_ym > to)) to = r.latest_ym;
    }
    complexes.push({
      href: complexHrefFromNames(r.region_name, r.complex_name),
      name: r.complex_name,
      region: r.region_name,
      lat,
      lng,
      households: own?.households ?? at?.households ?? null,
      buildYear: own?.buildYear ?? at?.buildYear ?? null,
      avgPerPyeongKrw: num(r.avg_per_pyeong_krw),
      txCount: num(r.tx_count) ?? 0,
      inDong: Boolean(own),
    });
  }
  /* 이 동 단지 먼저(거래 많은 순) · 주변은 그 뒤 */
  complexes.sort((a, b) => Number(b.inDong) - Number(a.inDong) || b.txCount - a.txCount || (a.name < b.name ? -1 : 1));
  return { region, dong, center, complexes, period: { from, to } };
}
