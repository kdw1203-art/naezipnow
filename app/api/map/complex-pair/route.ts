/* [1211] 단지 vs 단지 비교 — 지도 팝업이 읽는다(예전 /complex/compare/[slug] 화면의 숫자 그대로 · lib/market/complex-pair-stats).
   화이트리스트에 없는 조합은 404 · 조회 실패는 503(없음과 못 읽음을 섞지 않는다). 하루 한 번 바뀌는 실거래라 CDN 6시간. */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { applyRateLimit, READ_RATE_LIMIT } from "@/lib/rate-limit";
import { loadComplexPairStats } from "@/lib/market/complex-pair-stats";
import { logger } from "@/lib/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CACHE = { "Cache-Control": "public, s-maxage=21600, stale-while-revalidate=86400" };

export async function GET(req: NextRequest) {
  const limited = await applyRateLimit(req, READ_RATE_LIMIT);
  if (limited) return limited;
  const slug = new URL(req.url).searchParams.get("slug")?.trim() ?? "";
  if (!slug || slug.length > 300) return NextResponse.json({ ok: false, error: "slug 가 필요합니다" }, { status: 400 });
  try {
    const stats = await loadComplexPairStats(slug);
    if (!stats) return NextResponse.json({ ok: false, error: "비교할 수 없는 조합" }, { status: 404, headers: CACHE });
    return NextResponse.json({ ok: true, pair: stats }, { headers: CACHE });
  } catch (e) {
    logger.warn("[complex-pair] 조회 실패", { slug, message: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ ok: false, error: "불러오기 실패" }, { status: 503 });
  }
}
