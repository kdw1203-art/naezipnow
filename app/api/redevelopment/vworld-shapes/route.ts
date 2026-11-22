/* [1206] 서울 밖 정비구역 참고 경계(브이월드 지구단위계획구역 중 정비사업 이름) — lib/redevelopment/vworld-zone-shapes 머리 주석.
   한 달 서버 캐시 + CDN 하루. 실패하면 빈 목록(지도는 서울 도형 · 1기 신도시 범위만 그린다)을 캐시하지 않고 돌려준다. */
import { NextResponse } from "next/server";
import { getVworldZoneShapes } from "@/lib/redevelopment/vworld-zone-shapes-fetch";
import { VWORLD_ZONE_SHAPES_NOTE } from "@/lib/redevelopment/vworld-zone-shapes";
import { logger } from "@/lib/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET() {
  try {
    const r = await getVworldZoneShapes();
    return NextResponse.json(
      {
        meta: { source: "국토교통부 도시계획정보(UPIS) · 브이월드 LT_C_UPISUQ161", asOf: r.fetchedAt.slice(0, 10), note: VWORLD_ZONE_SHAPES_NOTE },
        zones: r.zones.map(({ n, k, c, a, p }) => ({ n, k, c, a, p })),
      },
      { headers: { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800" } },
    );
  } catch (e) {
    logger.warn("[vworld-shapes] 받기 실패 — 빈 목록", e instanceof Error ? e.message : String(e));
    return NextResponse.json({ meta: { note: VWORLD_ZONE_SHAPES_NOTE }, zones: [] }, { headers: { "Cache-Control": "no-store" } });
  }
}
