/**
 * GET /api/map/3d?region=서울 강남구&dong=개포동 — [1086] 서울 3D 동네 지도의 우리 데이터(단지·좌표·평당 평균·세대수).
 * 건물 모양·높이는 브라우저가 OpenFreeMap(OpenStreetMap) 벡터 타일에서 직접 받는다 — 여기서는 단지 쪽만.
 * 공개 응답(로그인 무관) · CDN 하루(실거래 적재가 하루 단위) · 없는 동 404 · 서울 밖 404 · 조회 실패 503(no-store).
 */
import { NextResponse } from "next/server";
import { dongFromParam, regionFromSlug } from "@/lib/dong/format";
import { map3dSupported } from "@/lib/map3d/geo";
import { loadMap3D } from "@/lib/map3d/load";
import { logger } from "@/lib/log";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const region = regionFromSlug(sp.get("region") ?? "");
  const dong = dongFromParam(sp.get("dong") ?? "");
  if (!region || !dong) return NextResponse.json({ error: "지역·동 꼴이 아닙니다." }, { status: 400 });
  if (!map3dSupported(region)) return NextResponse.json({ error: "3D 지도는 서울부터 엽니다." }, { status: 404 });
  try {
    const data = await loadMap3D(region, dong);
    if (!data) {
      return NextResponse.json({ error: "이 동의 단지 없음" }, { status: 404, headers: { "Cache-Control": "public, s-maxage=3600" } });
    }
    return NextResponse.json(data, {
      headers: { "Cache-Control": "public, max-age=0, s-maxage=86400, stale-while-revalidate=86400" },
    });
  } catch (e) {
    logger.warnSampled("map3d-load", "[map3d] 조회 실패", { region, dong, message: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: "3D 지도 데이터 불러오기 실패" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
