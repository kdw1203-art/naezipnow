/* [1204 · 1기 신도시 구역 범위] 선도지구 · 2차 후보의 근사 범위(단지 좌표 볼록 껍질) — lib/redevelopment/newtown-shapes 머리 주석.
   단지 좌표(complex_geocode)는 서비스 키로만 읽힌다(표 RLS). 결과는 공개 집계라 하루 공유 캐시. */
import { NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/service";
import { SPECIAL_ZONES } from "@/lib/redevelopment/special-zones";
import { newtownZoneShapes, NEWTOWN_SHAPES_NOTE } from "@/lib/redevelopment/newtown-shapes";
import { logger } from "@/lib/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const zones = SPECIAL_ZONES.filter((z) => (z.typeKey === "newtown_lead" || z.typeKey === "newtown_cand") && z.complexes?.length);
  const sb = getServiceSupabase();
  if (!sb || zones.length === 0) {
    return NextResponse.json({ meta: { note: NEWTOWN_SHAPES_NOTE }, zones: [] });
  }
  const names = [...new Set(zones.flatMap((z) => z.complexes ?? []))];
  const { data, error } = await sb.from("complex_geocode").select("region_name,complex_name,lat,lng").in("complex_name", names).not("lat", "is", null);
  if (error) {
    logger.warn("[newtown-shapes] complex_geocode 조회 실패", error.message);
    return NextResponse.json({ meta: { note: NEWTOWN_SHAPES_NOTE }, zones: [] }, { status: 200, headers: { "Cache-Control": "no-store" } });
  }
  const table = new Map<string, [number, number]>();
  for (const r of (data ?? []) as Array<{ region_name: string; complex_name: string; lat: number; lng: number }>) {
    table.set(`${String(r.region_name).replace(/\s+/g, "")}|${r.complex_name}`, [r.lng, r.lat]);
  }
  const shapes = newtownZoneShapes(zones, (rk, cn) => table.get(`${rk}|${cn}`) ?? null);
  return NextResponse.json(
    { meta: { source: "complex_geocode(실거래 주소 지오코딩)", note: NEWTOWN_SHAPES_NOTE }, zones: shapes },
    { headers: { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=86400" } },
  );
}
