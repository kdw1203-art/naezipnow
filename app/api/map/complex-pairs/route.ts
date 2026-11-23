/* [1212] 지도 단지 패널의 "같은 동 비교" — 이 단지가 낀 비교 조합(화이트리스트 complex_pair_mv · 같은 동 · 양쪽 12개월 20건 이상).
   누르면 지도 위 비교 팝업(/api/map/complex-pair)이 열린다. 조합 목록은 하루 한 번 바뀌어 CDN 6시간 · 실패는 빈 목록(곁다리). */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { unstable_cache } from "next/cache";
import { applyRateLimit, READ_RATE_LIMIT } from "@/lib/rate-limit";
import { decodeComplexId } from "@/lib/complex/complex-store";
import { buildComplexPairSlug, listComplexPairs } from "@/lib/market/complex-pairs";
import { logger } from "@/lib/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CACHE = { "Cache-Control": "public, s-maxage=21600, stale-while-revalidate=86400" };

/** 조합 목록 한 벌을 6시간 데이터 캐시에 — 단지마다 MV 를 다시 읽지 않는다 */
const cachedPairs = unstable_cache(
  async () =>
    (await listComplexPairs()).map((p) => ({
      region: p.regionName,
      dong: p.dong,
      a: p.complexA,
      b: p.complexB,
      slug: buildComplexPairSlug(p.complexA, p.complexB, p.region.id),
      n: p.pairTradeCount,
    })),
  ["map-complex-pairs-v1"],
  { revalidate: 21600 },
);

export async function GET(req: NextRequest) {
  const limited = await applyRateLimit(req, READ_RATE_LIMIT);
  if (limited) return limited;
  const complexId = new URL(req.url).searchParams.get("complexId")?.trim() ?? "";
  const decoded = complexId ? decodeComplexId(complexId) : null;
  if (!decoded) return NextResponse.json({ ok: true, pairs: [] }, { headers: CACHE });
  try {
    const all = await cachedPairs();
    const pairs = all
      .filter((p) => p.region === decoded.region && (p.a === decoded.name || p.b === decoded.name))
      .sort((x, y) => y.n - x.n)
      .slice(0, 3)
      .map((p) => ({ slug: p.slug, other: p.a === decoded.name ? p.b : p.a, dong: p.dong }));
    return NextResponse.json({ ok: true, pairs }, { headers: CACHE });
  } catch (e) {
    logger.warn("[complex-pairs] 조합 목록 실패", { message: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ ok: false, pairs: [] }, { status: 503 });
  }
}
