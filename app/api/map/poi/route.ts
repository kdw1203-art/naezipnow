import { NextResponse, type NextRequest } from "next/server";
import { getServiceSupabase } from "@/lib/supabase/service";
import { dbUnavailable } from "@/lib/api/db-unavailable";

/* [943 · #96 지도편] 학교·도시철도역 POI 지도 레이어.
 *
 * 데이터: 공공데이터포털 표준데이터 2종(poi_schools·poi_stations — poi-ingest 크론).
 * 활용신청(오너 패킷 ⑧)이 아직이라 표가 비어 있을 수 있다 — 그때 "이 화면에
 * 학교가 없다"로 그리면 거짓이므로, 표 자체가 비었는지(ready)를 함께 내려보내
 * 클라이언트가 "데이터 준비 중"과 "이 지역에 없음"을 구분해 말하게 한다.
 *
 * 뷰포트 bbox 필수 — 전국 학교 1.2만 곳을 통째로 내리는 API 는 만들지 않는다.
 *
 * [1053] ① 과대 뷰포트(tooWide)는 DB 를 묻기 전에 답한다 — 줌아웃 패닝마다 표 두 개를 세던 것을 없앴다
 *          (그때 ready 는 모름 = null · 화면은 tooWide 를 먼저 보고 "확대 시 표시"라 읽지 않는다).
 *        ② "표가 비었나"는 정확 개수(count exact) 대신 한 줄 확인(limit 1)으로 — 그리고 확인이 **실패**하면
 *          "준비 중"(빈 표)으로 답하지 않고 503 을 낸다(화면은 "학교·지하철 불러오기 실패 · 잠시 후 다시").
 *          못 읽은 것과 없는 것은 다른 사실이다.
 */

export const runtime = "nodejs";
export const revalidate = 21600; // 학교·역 위치는 사실상 정적

const MAX_PER_KIND = 400;

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const num = (k: string) => {
    const v = Number(sp.get(k));
    return Number.isFinite(v) ? v : null;
  };
  const swLat = num("swLat");
  const swLng = num("swLng");
  const neLat = num("neLat");
  const neLng = num("neLng");
  if (swLat === null || swLng === null || neLat === null || neLng === null || swLat >= neLat || swLng >= neLng) {
    return NextResponse.json({ error: "bbox(swLat,swLng,neLat,neLng)가 필요합니다." }, { status: 400 });
  }
  /* 과대 뷰포트(전국 줌아웃)는 POI 를 그릴 줌이 아니다 — 마커 수천 개를 만들
     바에 정직하게 "확대하면 표시" 로 안내한다. */
  const tooWide = neLat - swLat > 0.45 || neLng - swLng > 0.6;
  if (tooWide) {
    return NextResponse.json(
      { schools: [], stations: [], schoolsReady: null, stationsReady: null, tooWide: true },
      { headers: { "Cache-Control": "public, max-age=0, s-maxage=21600" } },
    );
  }

  const sb = getServiceSupabase();
  if (!sb) return dbUnavailable("map/poi", new Error("service client 미구성"));

  /* 뷰포트 조회와 "표에 한 줄이라도 있나"를 함께 — 뷰포트에 줄이 있으면 그것으로 ready 다 */
  const [schoolsR, stationsR, schoolAnyR, stationAnyR] = await Promise.all([
    sb
      .from("poi_schools")
      .select("name, category, lat, lng")
      .gte("lat", swLat).lte("lat", neLat)
      .gte("lng", swLng).lte("lng", neLng)
      .limit(MAX_PER_KIND),
    sb
      .from("poi_stations")
      .select("name, line, lat, lng")
      .gte("lat", swLat).lte("lat", neLat)
      .gte("lng", swLng).lte("lng", neLng)
      .limit(MAX_PER_KIND),
    sb.from("poi_schools").select("id").limit(1),
    sb.from("poi_stations").select("id").limit(1),
  ]);
  const failed = [schoolsR, stationsR, schoolAnyR, stationAnyR].find((r) => r.error);
  if (failed?.error) {
    /* 조회 실패를 "준비 중"(빈 표)이나 "없음"으로 바꾸지 않는다 */
    return dbUnavailable("map/poi", failed.error, "학교·지하철 불러오기 실패");
  }
  const schoolsReady = (schoolsR.data ?? []).length > 0 || (schoolAnyR.data ?? []).length > 0;
  const stationsReady = (stationsR.data ?? []).length > 0 || (stationAnyR.data ?? []).length > 0;

  return NextResponse.json(
    {
      schools: (schoolsR.data ?? []).map((r) => ({
        name: String(r.name),
        category: r.category ? String(r.category) : null,
        lat: Number(r.lat),
        lng: Number(r.lng),
      })),
      stations: (stationsR.data ?? []).map((r) => ({
        name: String(r.name),
        line: r.line ? String(r.line) : null,
        lat: Number(r.lat),
        lng: Number(r.lng),
      })),
      schoolsReady,
      stationsReady,
      tooWide: false,
    },
    {
      headers: {
        /* 표가 아직 비었으면(활용신청 전) 짧게 — 적재 뒤 6시간 동안 "준비 중"이 굳지 않게 */
        "Cache-Control":
          schoolsReady && stationsReady
            ? "public, max-age=0, s-maxage=21600"
            : "public, max-age=0, s-maxage=600",
      },
    },
  );
}
