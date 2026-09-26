/**
 * GET /api/complex/[id]/trades — [1008 · Q] 호가 점검 재료.
 *
 * 단지 허브에서 사용자가 "호가 점검"을 **펼칠 때만** 부른다(페이지 로드·봇은 부르지 않는다).
 * 응답: { fromYm, toYm, trades: [[계약연월, 전용㎡, 만원, 층|null], …] } — 최근 24개월 매매·해제 제외·
 * 금액>0, 최신순. 개인화 없음 → CDN 1시간(+하루 stale). 레이트리밋은 다른 읽기 API 와 같은 READ_RATE_LIMIT.
 */
import { NextResponse, type NextRequest } from "next/server";
import { applyRateLimit, READ_RATE_LIMIT } from "@/lib/rate-limit";
import { dbUnavailable } from "@/lib/api/db-unavailable";
import { pureIdFromParam } from "@/lib/seo/complex-slug";
import { tradeToTuple } from "@/lib/complex/asking-check";
import { loadAskingTrades } from "@/lib/complex/asking-trades";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CDN_CACHE = "public, s-maxage=3600, stale-while-revalidate=86400";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const limited = await applyRateLimit(req, READ_RATE_LIMIT);
  if (limited) return limited;

  const { id } = await params;
  let pure: string;
  try {
    pure = pureIdFromParam(decodeURIComponent(id ?? ""));
  } catch {
    return NextResponse.json({ error: "단지 id 가 올바르지 않습니다." }, { status: 400 });
  }
  if (!pure) return NextResponse.json({ error: "단지 id 가 필요합니다." }, { status: 400 });

  let res: Awaited<ReturnType<typeof loadAskingTrades>>;
  try {
    res = await loadAskingTrades(pure, Date.now());
  } catch (e) {
    return dbUnavailable("complex-asking-trades", e);
  }
  if (res.kind === "unconfigured") {
    return NextResponse.json({ error: "데이터 소스 미설정" }, { status: 503 });
  }
  if (res.kind === "not-found") {
    return NextResponse.json({ error: "단지를 찾지 못했습니다." }, { status: 404 });
  }
  return NextResponse.json(
    { fromYm: res.fromYm, toYm: res.toYm, trades: res.trades.map(tradeToTuple) },
    { headers: { "Cache-Control": CDN_CACHE } },
  );
}
