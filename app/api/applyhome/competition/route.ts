/**
 * GET /api/applyhome/competition
 * 청약홈 APT 분양정보/경쟁률 (odcloud ApplyhomeInfoCmpetRtSvc)
 */
import { NextResponse } from "next/server";
import { logger } from "@/lib/log";
import { getClientIp, keyRateLimit, tooManyRequests } from "@/lib/rate-limit";
import { fetchAptCompetition } from "@/lib/applyhome/adapters/apt-competition";
import type { ApplyhomeCompetitionEndpoint } from "@/lib/applyhome/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ENDPOINTS: ApplyhomeCompetitionEndpoint[] = [
  "getAPTLttotPblancCmpet",
  "getUrbtyOfctlLttotPblancCmpet",
  "getAptLttotPblancScore",
  "getOPTLttotPblancCmpet",
];

export async function GET(request: Request) {
  /* [1080] 요청마다 공공데이터(청약홈 odcloud) 호출로 이어지는 길 — IP 당 분 30회(KV 고정 창) + CDN 1시간
     (자료는 하루 단위로 바뀐다). 일 한도(data.go.kr)를 방문자 수가 그대로 밀어붙이지 않게. */
  const rl = await keyRateLimit(`applyhome-competition:${getClientIp(request)}`, { max: 30, windowMs: 60_000 });
  if (!rl.ok) return tooManyRequests(Math.max(1, Math.ceil((rl.resetAt - Date.now()) / 1000)));
  const { searchParams } = new URL(request.url);
  const endpointParam = searchParams.get("endpoint") ?? "getAPTLttotPblancCmpet";
  const endpoint = ENDPOINTS.includes(endpointParam as ApplyhomeCompetitionEndpoint)
    ? (endpointParam as ApplyhomeCompetitionEndpoint)
    : "getAPTLttotPblancCmpet";

  try {
    const data = await fetchAptCompetition({
      endpoint,
      page: Number(searchParams.get("page") ?? "1") || 1,
      perPage: Math.min(Number(searchParams.get("perPage") ?? "20") || 20, 50),
      houseManageNo: searchParams.get("houseManageNo") ?? undefined,
      pblancNo: searchParams.get("pblancNo") ?? undefined,
    });
    return NextResponse.json(data, { headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" } });
  } catch (err) {
    /* 업스트림 원문 에러는 서버 로그로만 — 익명 응답에는 일반 문구. */
    logger.warn("[api/applyhome/competition] 조회 실패", err);
    return NextResponse.json(
      { error: "경쟁률 조회가 잠시 실패했습니다. 잠시 후 다시 시도해 주세요.", mode: "error" },
      { status: 502 },
    );
  }
}
