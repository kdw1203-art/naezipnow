/**
 * [1006] GET /api/town/news?offset=<n>&limit=30
 *
 * 뉴스룸(/town/news) "더 보기" — 첫 장(NEWS_LIST_FIRST_PAGE)이 HTML 에 실린 뒤,
 * 그 다음 행을 같은 조립기(lib/town/news-list.ts)로 이어 준다. 정렬·같은 사건
 * 접기·요약 한 줄 규칙이 첫 장과 같으므로 붙는 행이 첫 장과 다르지 않다.
 *
 *   offset : 클라이언트가 이미 들고 있는 행 수. 없으면 첫 장 크기.
 *   limit  : 1~100, 기본 30.
 *
 * 응답: { items: NewsRow[], hasMore: boolean, total: number }
 * 조회 실패는 503 — "없음"과 "못 읽음"을 섞지 않는다(board-posts 로더의 규칙).
 * 뉴스는 하루 1회 적재라 오프셋 페이지로 충분하고, 공개 목록이라 페이지(600초)와
 * 같은 호흡으로 공유 캐시한다.
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { applyRateLimit, READ_RATE_LIMIT } from "@/lib/rate-limit";
import { readTownPosts } from "@/lib/newui/board-posts";
import {
  buildNewsRows,
  NEWS_LIST_FIRST_PAGE,
  NEWS_LIST_PAGE,
  pageNewsRows,
} from "@/lib/town/news-list";
import { logger } from "@/lib/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const limited = await applyRateLimit(req, READ_RATE_LIMIT);
  if (limited) return limited;

  const sp = req.nextUrl.searchParams;
  const offsetRaw = Number(sp.get("offset"));
  const offset = Number.isFinite(offsetRaw) && offsetRaw >= 0 ? offsetRaw : NEWS_LIST_FIRST_PAGE;
  const limitRaw = Number(sp.get("limit"));
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(100, limitRaw) : NEWS_LIST_PAGE;

  try {
    const rows = buildNewsRows(await readTownPosts());
    return NextResponse.json(pageNewsRows(rows, offset, limit), {
      headers: { "Cache-Control": "public, s-maxage=600, stale-while-revalidate=86400" },
    });
  } catch (e) {
    logger.error("[api/town/news] 뉴스 조회 실패", e);
    return NextResponse.json(
      { error: "지금은 뉴스를 불러오지 못했어요. 잠시 후 다시 시도해 주세요." },
      { status: 503, headers: { "Retry-After": "10" } },
    );
  }
}
