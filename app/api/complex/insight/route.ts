/**
 * GET /api/complex/insight?id=&region=&ym=&c=&v= — [1089 · 비용] 단지 화면 "이 단지 결과 요약 · 다요인 분석" 두 판.
 * 화면(ComplexInsightPanels)이 사람이 볼 때만 부른다(useHumanGate — 크롤러는 부르지 않는다).
 * 왜 화면 렌더에서 떼었나: lib/complex/insight-query 머리 주석(단지 ISR 실효 수명 1시간 → 7일).
 * 공개 응답(로그인 무관) — 같은 단지 · 같은 계열이면 같은 주소라 CDN 한 칸에 모인다.
 * CDN: 두 판 중 하나라도 나오면 6시간(+하루 SWR) · 둘 다 없으면 30분(일시적 조회 실패가 오래 굳지 않게).
 */
import { NextResponse } from "next/server";
import { parseInsightQuery } from "@/lib/complex/insight-query";
import { loadComplexInsight } from "@/lib/complex/insight";

export const runtime = "nodejs";
export const maxDuration = 15;

export async function GET(req: Request) {
  const q = parseInsightQuery(new URL(req.url).searchParams);
  if (!q) {
    return NextResponse.json({ error: "단지 · 지역 값이 올바르지 않습니다." }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
  const data = await loadComplexInsight(q);
  const any = data.summary != null || data.signals != null;
  return NextResponse.json(data, {
    headers: {
      "Cache-Control": any
        ? "public, max-age=600, s-maxage=21600, stale-while-revalidate=86400"
        : "public, max-age=60, s-maxage=1800",
    },
  });
}
