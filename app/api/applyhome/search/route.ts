/**
 * GET /api/applyhome/search
 * 청약홈 경쟁률·특별공급 통합 검색 (지역·단지명 필터)
 */
import { logger } from "@/lib/log";
import { getClientIp, keyRateLimit, tooManyRequests } from "@/lib/rate-limit";
import { NextResponse } from "next/server";
import { searchApplyhome } from "@/lib/applyhome/applyhome-search";
import type { ApplyhomeSearchTab } from "@/lib/applyhome/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TABS: ApplyhomeSearchTab[] = ["competition", "special"];

export async function GET(request: Request) {
  /* [1080] 요청마다 공공데이터(청약홈 odcloud) 호출로 이어지는 길 — IP 당 분 30회(KV 고정 창) + CDN 1시간
     (자료는 하루 단위로 바뀐다). 일 한도(data.go.kr)를 방문자 수가 그대로 밀어붙이지 않게. */
  const rl = await keyRateLimit(`applyhome-search:${getClientIp(request)}`, { max: 30, windowMs: 60_000 });
  if (!rl.ok) return tooManyRequests(Math.max(1, Math.ceil((rl.resetAt - Date.now()) / 1000)));
  const { searchParams } = new URL(request.url);
  const tabParam = searchParams.get("tab") ?? "competition";
  const tab = TABS.includes(tabParam as ApplyhomeSearchTab)
    ? (tabParam as ApplyhomeSearchTab)
    : "competition";

  try {
    const data = await searchApplyhome({
      tab,
      region: searchParams.get("region") ?? undefined,
      q: searchParams.get("q") ?? undefined,
      page: Number(searchParams.get("page") ?? "1") || 1,
      perPage: Math.min(Number(searchParams.get("perPage") ?? "15") || 15, 30),
    });
    return NextResponse.json(data, { headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" } });
  } catch (err) {
    /* 업스트림(청약홈) 원문 에러는 서버 로그로만 — 익명 응답에는 일반 문구. */
    logger.warn("[api/applyhome/search] 조회 실패", err);
    return NextResponse.json(
      { error: "청약 정보 조회가 잠시 실패했습니다. 잠시 후 다시 시도해 주세요.", mode: "error" },
      { status: 502 },
    );
  }
}
