import { NextResponse } from "next/server";
import { resolveNaverMapClientId } from "@/lib/map/naver-maps-sdk";

export const runtime = "nodejs";
// 런타임 강제: CI 빌드 환경에서는 NEXT_PUBLIC_* 가 "[SENSITIVE]" 로 마스킹되어
// 번들에 폴백 상수가 박힌다. 런타임(Vercel 함수)에서는 실값이 주입되므로
// 브라우저가 이 엔드포인트로 실제 ncpKeyId 를 받아 SDK 를 로드한다.
// ncpKeyId 는 브라우저 maps.js 요청 URL 에 그대로 노출되는 공개 값이며
// NCP 콘솔의 Web 서비스 URL(도메인) 등록으로 보호된다.
export const dynamic = "force-dynamic";

export async function GET() {
  /* [968 · 23] 브라우저 max-age 를 함께 준다. 예전엔 s-maxage(CDN)만 있어 브라우저는
     매 방문마다 이 JSON 을 다시 받았다 — 그 왕복이 maps.js 로드 앞에 직렬로 놓여
     첫 타일이 그만큼 늦었다. 값은 공개 Client ID 라 1시간 캐시해도 안전하고,
     /map 은 이제 서버가 prop 으로 내려 이 fetch 를 건너뛴다(HomeMiniMap 등은 유지). */
  return NextResponse.json(
    { ncpKeyId: resolveNaverMapClientId() },
    {
      headers: {
        "Cache-Control": "public, max-age=3600, s-maxage=3600, stale-while-revalidate=600",
      },
    },
  );
}
