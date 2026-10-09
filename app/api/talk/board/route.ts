import { NextResponse } from "next/server";
import { dbUnavailable } from "@/lib/api/db-unavailable";
import { loadTalkBoard } from "@/lib/talk/board";

export const runtime = "nodejs";

/* [1051 · 홈 실시간 토론] 왼쪽 지역 순위 재료 — 수도권 지역마다 지수 전월비 · 매매 신고 건수 · 최근 7일 글 수.
 * 사용자별 값이 없다 → CDN 30초(글 수가 30초 안에 따라온다). 시장 숫자는 서버 10분 캐시. */
export async function GET() {
  try {
    const board = await loadTalkBoard();
    return NextResponse.json(board, {
      headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=120" },
    });
  } catch (e) {
    return dbUnavailable("talk-board", e);
  }
}
