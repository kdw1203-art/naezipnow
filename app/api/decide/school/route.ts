/**
 * [1025 · 결정·비서] GET /api/decide/school?lat=&lng= — 결정 카드 "학교" 축의 재료.
 *
 * 단지 좌표 기준 도보권(1,200m) 학교 중 가장 가까운 한 곳(lib/poi/store getNearbyPoi — 단지 상세 ComplexNearbyPoi 와 같은 조회).
 *  · available=false : poi_schools 표에 행이 하나도 없다(자료 미적재) → 화면은 학교 축을 "자료 없음" 으로 끈다.
 *  · available=true · nearest=null : 자료는 있는데 도보권에 학교가 없다 → 그 후보만 값 없음.
 * 조회 실패는 503(없음과 다르다). 공개 데이터라 세션 없이 읽되 읽기 상한(READ_RATE_LIMIT)을 건다.
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { applyRateLimit, READ_RATE_LIMIT } from "@/lib/rate-limit";
import { dbUnavailable } from "@/lib/api/db-unavailable";
import { getNearbyPoi } from "@/lib/poi/store";
import { getServiceSupabase } from "@/lib/supabase/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function schoolsTableHasRows(): Promise<boolean> {
  const sb = getServiceSupabase();
  if (!sb) return false;
  const { data, error } = await sb.from("poi_schools").select("name").limit(1);
  if (error) throw new Error(`poi_schools 존재 확인 실패: ${error.message}`);
  return Array.isArray(data) && data.length > 0;
}

export async function GET(req: NextRequest) {
  const limited = await applyRateLimit(req, READ_RATE_LIMIT);
  if (limited) return limited;
  const lat = Number(req.nextUrl.searchParams.get("lat"));
  const lng = Number(req.nextUrl.searchParams.get("lng"));
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return NextResponse.json({ error: "lat·lng 가 필요합니다." }, { status: 400 });
  }
  try {
    const poi = await getNearbyPoi(lat, lng);
    const nearest = poi.schools[0] ?? null;
    const available = nearest ? true : await schoolsTableHasRows();
    return NextResponse.json(
      {
        available,
        count: poi.schools.length,
        nearest: nearest ? { name: nearest.name, category: nearest.category, distanceM: nearest.distanceM } : null,
      },
      { headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=600" } },
    );
  } catch (err) {
    return dbUnavailable("decide/school", err, "지금은 학교 자료를 불러올 수 없습니다.");
  }
}
