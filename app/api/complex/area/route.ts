/**
 * GET /api/complex/area?lat=&lng=&name=&by= — [1047] 단지 위치 지도의 주변 정보(반경 1km).
 *   · similar  유사 단지(우리 표 · 평당 실거래가 · 준공 연도가 닮은 순)
 *   · stations 역 · offices 관공서(OpenStreetMap — 화면에 출처 표시)
 * 공개 응답(로그인 무관) · CDN 캐시 7일(좌표는 약 11m 로 반올림해 같은 단지 요청이 한 칸에 모인다).
 * 원천 하나가 실패해도 나머지는 낸다 — 못 읽은 원천은 missing 에 적는다("없음"과 구분).
 */
import { NextResponse } from "next/server";
import { isKoreaCoord, roundCoord, AREA_RADIUS_M, type AreaData } from "@/lib/map/area-pick";
import { loadAreaComplexes, loadAreaOsmCached } from "@/lib/map/area-load";
import { logger } from "@/lib/log";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const lat = roundCoord(Number(sp.get("lat")));
  const lng = roundCoord(Number(sp.get("lng")));
  const name = (sp.get("name") ?? "").trim().slice(0, 60);
  const by = Number(sp.get("by"));
  if (!isKoreaCoord(lat, lng)) {
    return NextResponse.json({ error: "좌표가 범위를 벗어났습니다." }, { status: 400 });
  }
  const center = { lat, lng };
  const [cx, osm] = await Promise.allSettled([
    loadAreaComplexes(center, { name, buildYear: Number.isFinite(by) && by > 1900 ? by : null }),
    loadAreaOsmCached(center.lat, center.lng),
  ]);
  const missing: string[] = [];
  if (cx.status === "rejected") {
    missing.push("similar");
    logger.warn("[area-map] 유사 단지 실패", { message: String(cx.reason) });
  }
  if (osm.status === "rejected") {
    missing.push("osm");
    logger.warn("[area-map] OSM 실패", { message: String(osm.reason) });
  }
  const data: AreaData = {
    center,
    radiusM: AREA_RADIUS_M,
    similar: cx.status === "fulfilled" ? cx.value : [],
    stations: osm.status === "fulfilled" ? osm.value.stations : [],
    offices: osm.status === "fulfilled" ? osm.value.offices : [],
    missing,
  };
  /* 둘 다 실패면 짧게(5분) — 일시 장애가 7일 동안 빈 지도로 굳지 않게 */
  const cache =
    missing.length === 0
      ? "public, max-age=3600, s-maxage=604800, stale-while-revalidate=86400"
      : "public, max-age=60, s-maxage=300";
  return NextResponse.json(data, { headers: { "Cache-Control": cache } });
}
