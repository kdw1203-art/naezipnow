import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { listUpisRecords } from "@/lib/seoul/upis-store";
import { isUpisService } from "@/lib/seoul/upis";
import { logger } from "@/lib/log";

/* [1029] /redevelopment 의 "서울시 도시계획 결정 조서" 칸이 구·종류를 바꿀 때 읽는 API.
   값은 seoul_upis_records(공개 읽기)에서 그대로. 조합(구 26 × 종류 4)이 유계라 CDN 에 하루 캐시한다.
   입력은 정해진 꼴만 받는다(구 이름 한글 2~4자 + "구", 종류는 서비스명 셋). */
export const dynamic = "force-dynamic";
const CACHE = "public, s-maxage=86400, stale-while-revalidate=86400";

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const guRaw = (sp.get("gu") ?? "").trim();
  const gu = /^[가-힣]{1,4}구$/.test(guRaw) ? guRaw : null;
  const serviceRaw = (sp.get("service") ?? "").trim();
  const service = isUpisService(serviceRaw) ? serviceRaw : null;
  const limitRaw = Number(sp.get("limit"));
  const limit = Number.isFinite(limitRaw) && limitRaw >= 1 && limitRaw <= 200 ? Math.floor(limitRaw) : 60;
  try {
    const items = await listUpisRecords({ sigungu: gu, service, limit });
    return NextResponse.json({ ok: true as const, items }, { headers: { "Cache-Control": CACHE } });
  } catch (e) {
    logger.error("[api/seoul/upis] 조서 조회 실패", e);
    return NextResponse.json({ ok: false as const, error: "조회 실패" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
