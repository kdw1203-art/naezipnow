/**
 * [967 · 19] GET /api/town/feed?before=<ISO>&limit=30&seen=<n>
 *
 * 동네이야기 피드 "더 보기" — `before` 보다 오래된 카드를 최신순으로 limit 개.
 * 카드 모양은 서버가 첫 장에 그리는 것과 같다(lib/town/feed.ts 를 같이 쓴다).
 *
 *   before : 마지막으로 받은 카드의 createdAt(ISO 또는 epoch ms). 없으면 400.
 *   limit  : 1~100, 기본 30.
 *   seen   : 클라이언트가 이미 들고 있는 카드 수 — 노트 스캔 창 계산에만 쓴다
 *            (lib/town/feed.ts 헤더). 없으면 40(첫 장 크기).
 *
 * 응답: { items: FeedCard[], hasMore: boolean, loadFailed: boolean }
 *   loadFailed 는 한쪽 소스가 실패했다는 뜻 — 화면이 "마지막이에요" 대신
 *   "일부를 못 불러왔어요"라고 말할 수 있게 같이 내려보낸다.
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { applyRateLimit, READ_RATE_LIMIT } from "@/lib/rate-limit";
import { pageTownFeed, TOWN_FEED_FIRST_PAGE, TOWN_FEED_PAGE } from "@/lib/town/feed";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseBefore(raw: string | null): number | null {
  if (!raw) return null;
  const asNum = Number(raw);
  const t = Number.isFinite(asNum) && /^\d+$/.test(raw) ? asNum : Date.parse(raw);
  return Number.isFinite(t) && t > 0 ? t : null;
}

export async function GET(req: NextRequest) {
  const limited = await applyRateLimit(req, READ_RATE_LIMIT);
  if (limited) return limited;

  const sp = req.nextUrl.searchParams;
  const before = parseBefore(sp.get("before"));
  if (before === null) {
    return NextResponse.json({ error: "before(ISO 시각)가 필요합니다." }, { status: 400 });
  }
  const limitRaw = Number(sp.get("limit"));
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(100, limitRaw) : TOWN_FEED_PAGE;
  const seenRaw = Number(sp.get("seen"));
  const seen = Number.isFinite(seenRaw) && seenRaw >= 0 ? seenRaw : TOWN_FEED_FIRST_PAGE;

  const page = await pageTownFeed({ before, limit, seen });
  return NextResponse.json(page, {
    /* 공개 피드라 짧은 공유 캐시 — 페이지(revalidate 120)와 같은 호흡 */
    headers: { "Cache-Control": "public, s-maxage=120, stale-while-revalidate=300" },
  });
}
