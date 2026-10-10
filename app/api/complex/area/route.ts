/**
 * GET /api/complex/area?lat=&lng=&name=&by= — [1047] 단지 위치 지도의 주변 정보(반경 1km).
 * [1053] 두 쪽으로 나눈다(규칙 · 이유는 lib/map/area-parts):
 *   · 기본(main)   similar 유사 단지(우리 표 · 평당 실거래가 · 준공 연도가 닮은 순)
 *                  stations 역(공공데이터 poi_stations — 표가 통째로 비었을 때만 stationSource "osm" 으로 넘긴다)
 *                  DB 만 읽는다 — 관공서(Overpass)를 기다리지 않는다. offices 는 pending.
 *   · part=osm     offices 관공서(OpenStreetMap — 화면에 출처 표시) · st=1 이면 역도(공공 표가 빈 동안만)
 *                  화면이 main 을 받은 뒤 따로 부른다. 실패는 missing ["offices"](+ st=1 이면 "stations") — 역 · 유사 단지와 섞지 않는다.
 * 공개 응답(로그인 무관) · 좌표는 약 11m 로 반올림해 같은 단지 요청이 CDN 한 칸에 모인다.
 * CDN 캐시: 다 읽음 7일 · 공공 역 표가 비어 넘김 하루 · 못 읽은 원천이 있으면 5분(areaCacheControl).
 */
import { NextResponse } from "next/server";
import { isKoreaCoord, roundCoord, AREA_RADIUS_M } from "@/lib/map/area-pick";
import { areaCacheControl, mainPending, parseAreaPart, type AreaPartKey, type AreaResponse } from "@/lib/map/area-parts";
import { loadAreaComplexes, loadAreaOsmCached, loadAreaStations } from "@/lib/map/area-load";
import { logger } from "@/lib/log";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const lat = roundCoord(Number(sp.get("lat")));
  const lng = roundCoord(Number(sp.get("lng")));
  if (!isKoreaCoord(lat, lng)) {
    return NextResponse.json({ error: "좌표가 범위를 벗어났습니다." }, { status: 400 });
  }
  const center = { lat, lng };
  const part = parseAreaPart(sp.get("part"));
  const missing: AreaPartKey[] = [];
  let data: AreaResponse;

  if (part === "osm") {
    /* 관공서(+ 공공 역 표가 빈 동안의 역) — Overpass. 성공만 30일 서버 캐시(loadAreaOsmCached) */
    const withStations = sp.get("st") === "1";
    let osm: Awaited<ReturnType<typeof loadAreaOsmCached>> | null = null;
    try {
      osm = await loadAreaOsmCached(center.lat, center.lng);
    } catch (e) {
      missing.push(...(withStations ? (["stations", "offices"] as const) : (["offices"] as const)));
      logger.warn("[area-map] OSM 실패", { message: String(e) });
    }
    data = {
      part,
      center,
      radiusM: AREA_RADIUS_M,
      similar: [],
      stations: withStations && osm ? osm.stations : [],
      offices: osm ? osm.offices : [],
      stationSource: withStations ? "osm" : null,
      pending: [],
      missing,
    };
  } else {
    /* 유사 단지 · 공공 역 — 둘 다 DB. Overpass 는 여기서 부르지 않는다 */
    const name = (sp.get("name") ?? "").trim().slice(0, 60);
    const by = Number(sp.get("by"));
    const [cx, st] = await Promise.allSettled([
      loadAreaComplexes(center, { name, buildYear: Number.isFinite(by) && by > 1900 ? by : null }),
      loadAreaStations(center),
    ]);
    if (cx.status === "rejected") {
      missing.push("similar");
      logger.warn("[area-map] 유사 단지 실패", { message: String(cx.reason) });
    }
    if (st.status === "rejected") {
      missing.push("stations");
      logger.warn("[area-map] 공공 역 실패", { message: String(st.reason) });
    }
    /* 못 읽었으면 원천을 공공으로 둔다 — 실패를 OpenStreetMap 대체로 덮지 않는다("다시 불러오기"가 main 을 다시 부른다) */
    const stationSource = st.status === "fulfilled" ? st.value.source : "public";
    data = {
      part,
      center,
      radiusM: AREA_RADIUS_M,
      similar: cx.status === "fulfilled" ? cx.value : [],
      stations: st.status === "fulfilled" && st.value.source === "public" ? st.value.stations : [],
      /* 예전 화면(배포 사이 낡은 번들)이 data.offices 를 돌기 때문에 빈 배열을 둔다 — 관공서는 pending */
      offices: [],
      stationSource,
      pending: mainPending(stationSource),
      missing,
    };
  }

  return NextResponse.json(data, { headers: { "Cache-Control": areaCacheControl(data) } });
}
