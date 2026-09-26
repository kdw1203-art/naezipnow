/**
 * N11 — 시장 온도 주간 스냅샷 크론.
 *
 * 매 실행마다 대상 지역 전체의 현재 온도를 계산해 **이번 주 행**에 upsert 한다.
 * 하루 두 번 돌아도 결과는 그 주의 행 하나뿐이고, 주가 바뀌면 지난주 값이
 * 그대로 굳는다. 저장값의 정의는 "그 주에 마지막으로 관측한 온도"다.
 *
 * 순서 주의: 반드시 market-aggregates-refresh **뒤에** 부른다. 거래량 항은
 * market_region_monthly 를 읽는데, 그 표가 갱신되기 전에 온도를 재면 어제
 * 집계로 이번 주 값을 굳히게 된다.
 *
 * 보호: lib/cron/authorize.ts (CRON_SECRET 헤더 · 관리자 세션)
 */
import { NextResponse } from "next/server";
import { authorizeCron } from "@/lib/cron/authorize";
import { runTemperatureSnapshot } from "@/lib/market/temperature-archive";
import { invalidateTemperatureRegions } from "@/lib/region/invalidate-market";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

async function handle(req: Request) {
  const authorized = await authorizeCron(req);
  if (!authorized) {
    return NextResponse.json({ error: "권한이 필요합니다." }, { status: 403 });
  }

  const result = await runTemperatureSnapshot();

  /* [1010] 온도 화면의 쓰기 지점이 여기다 — /analysis/temperature/[region] 의 TTL 을
     1시간에서 1일로 늘렸으므로(크롤러 재방문 ≈2.2일 대비 1시간은 방문마다 재렌더였다),
     스냅샷이 실제로 갱신된 순간에 비운다. 지역 상세는 동적 세그먼트라 라우트 전체
     비움을 쓴다 — 62곳이라 셀 단위로 고르는 것보다 이쪽이 싸다.
     upsert 가 실패했으면(result.ok=false) 화면도 안 바뀌었으니 비우지 않는다. */
  if (result.ok) invalidateTemperatureRegions();

  /* 일부 지역이 "지수 시계열 없음"으로 건너뛰는 건 실패가 아니다(근거가 없는
     것이지 조회가 깨진 게 아니다). 반대로 upsert 실패나 계산 중 예외는 500 으로
     드러낸다 — 조용히 200 을 주면 아카이브에 구멍이 뚫린 걸 아무도 모른다. */
  return NextResponse.json(
    { ...result, finishedAt: new Date().toISOString() },
    { status: result.ok ? 200 : 500 },
  );
}

export async function GET(req: Request) {
  return handle(req);
}

export async function POST(req: Request) {
  return handle(req);
}
