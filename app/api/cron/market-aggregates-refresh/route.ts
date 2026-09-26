/**
 * 실거래 집계 MV 재계산 크론.
 *
 * 왜 별도 크론인가: `market_transactions` 에 쓰는 경로가 MOLIT 크론 하나가 아니다.
 * 플랫폼 ETL, 관리자 CSV 업로드(`POST /api/admin/molit-csv`)도 같은 표에 적재한다.
 * MOLIT 크론 뒤에만 갱신을 붙여 두면 다른 경로로 들어온 실거래가 `/tx` 랜딩과
 * 지도 시세 색상에 영영 반영되지 않는다. 하루 한 번(실측 8.75초) 재계산해
 * "어떤 경로로 들어왔든 하루 안에는 화면에 반영된다"를 보장한다.
 *
 * 보호: lib/cron/authorize.ts (CRON_SECRET 헤더 · 관리자 세션)
 */
import { NextResponse } from "next/server";
import { authorizeCron } from "@/lib/cron/authorize";
import { refreshMarketAggregates } from "@/lib/market/refresh-aggregates";
import {
  invalidateChangedMarketRegions,
  invalidateMarketAnalysisRoutes,
} from "@/lib/region/invalidate-market";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

async function handle(req: Request) {
  const authorized = await authorizeCron(req);
  if (!authorized) {
    return NextResponse.json({ error: "권한이 필요합니다." }, { status: 403 });
  }

  const result = await refreshMarketAggregates();

  /* [1010] 집계가 실제로 다시 계산된 직후가, 동적 세그먼트 화면을 비울 **가장 정확한**
     자리다. /tx/[region]·/tx/[region]/[kind]/[band]·/region/[id]·/region/[id]/report/[ym]
     의 숫자는 전부 여기서 갱신되는 MV 에서 나오고, 그 라우트들은 동적 세그먼트라
     SOURCE_MAP(고정 경로)이 닿지 못한다. TTL 은 7일로 늘렸으므로 이 비움이 신선도를
     책임진다(1010 브리프 원칙 1).

     주의(사실 기록): 이 HTTP 경로는 2026-08-10 에 스케줄러에서 빠졌다 — 집계 갱신
     본체는 pg_cron 'market-aggregates-daily'(09:00·19:00 UTC, DB 내부)가 돈다.
     그래서 여기 비움은 **수동·관리자 호출 때만** 실행된다. 매일 도는 배선은
     app/api/cron/reb-ingest/route.ts 에 있다(Vercel 크론 00:50 UTC). 둘 다
     같은 함수를 부르므로 두 번 불려도 중복 경로가 한 번으로 접힌다.

     갱신이 실패했으면 비우지 않는다 — 직전 집계가 그대로 남아 있으므로 화면도
     그대로다. 비우면 같은 HTML 을 다시 그리는 값만 치른다. */
  const invalidated = result.ok
    ? {
        ...(await invalidateChangedMarketRegions()),
        analysisPaths: invalidateMarketAnalysisRoutes().revalidated,
      }
    : null;

  // 갱신 실패는 500 으로 드러낸다 — 조용히 성공처럼 보이면 오래된 집계가
  // 그대로 서비스되는 것을 아무도 눈치채지 못한다.
  return NextResponse.json(
    { ...result, invalidated, finishedAt: new Date().toISOString() },
    { status: result.ok ? 200 : 500 },
  );
}

export async function GET(req: Request) {
  return handle(req);
}

export async function POST(req: Request) {
  return handle(req);
}
