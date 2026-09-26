/**
 * GET /api/cron/reb-ingest
 * 한국부동산원(R-ONE) Open API → market_* 테이블 적재. Vercel Cron(3일 주기) 또는 수동 호출.
 * 보호: CRON_SECRET 또는 관리자 세션.
 */
import { NextResponse } from "next/server";
import { ingestReb } from "@/lib/reb/ingest";
import { isRebConfigured } from "@/lib/reb/client";
import { authorizeCron } from "@/lib/cron/authorize";
import { ingestErrorMessage, logIngest } from "@/lib/market/store";
import { invalidateAfterIngest } from "@/lib/cache/invalidate";
import {
  invalidateChangedMarketRegions,
  invalidateMarketAnalysisRoutes,
  invalidateRebChangedRegions,
  readRebRegionFingerprints,
  type MarketInvalidateSummary,
} from "@/lib/region/invalidate-market";
import { withBudget, CRON_WORK_BUDGET_MS } from "@/lib/async/with-budget";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/* ── [1010] 지역·실거래 축의 "쓰기 지점 비움" ──────────────────────────────
   왜 하필 이 크론인가: 이 축의 ISR TTL 을 7일로 늘렸고(/region/[id] · /tx/[region] ·
   /tx/[region]/[kind]/[band] · /region/[id]/report/[ym]), 그 라우트들은 **동적
   세그먼트라 SOURCE_MAP 이 비우지 못한다**. 하루 1회 도는 크론 중 이 축의
   집계를 대표하는 자리가 여기다(Vercel 크론 00:50 UTC, molit 적재 00:40 바로 뒤).

   실측 근거(2026-09-20~22): /tx/[region]/[kind]/[band] 하루 2,092 렌더 ·
   /region/[id] 870 렌더인데 사람 방문은 그 몇십 분의 일이다. 하루에 실제로
   바뀌는 지역은 molit 회전 슬라이스(16~24 시군구)뿐이라, 바뀐 곳만 비우면
   나머지는 7일 내내 CDN HIT 이고 신선도 손해는 0 이다.

   REB 쪽은 값이 실제로 달라진 지역만 고른다 — 부동산원 공표는 주간·월간인데
   이 크론은 매일 돌기 때문에, 매일 전부 비우면 TTL 을 늘린 의미가 사라진다. */
async function invalidateAfterRebRun(
  before: ReadonlyMap<string, string>,
): Promise<{ reb: { changed: number; paths: number }; tx: MarketInvalidateSummary }> {
  const after = await readRebRegionFingerprints();
  const reb = invalidateRebChangedRegions(before, after);
  const tx = await invalidateChangedMarketRegions();
  invalidateMarketAnalysisRoutes();
  return { reb, tx };
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const authorized = await authorizeCron(req);
  if (!authorized) {
    return NextResponse.json({ error: "권한이 필요합니다." }, { status: 403 });
  }

  if (!isRebConfigured()) {
    return NextResponse.json(
      { ok: false, skipped: true, message: "REB_OPENAPI_KEY 미설정" },
      { status: 200 },
    );
  }

  const monthPages = Number(url.searchParams.get("monthPages") ?? "3") || 3;
  const weekPages = Number(url.searchParams.get("weekPages") ?? "4") || 4;

  /* [1010] 적재 **전** 지문 — 적재 뒤와 비교해 "값이 정말 달라진 지역" 만 고른다.
     실측 103행짜리 조회라 수집 시간에 영향이 없다. */
  const rebBefore = await readRebRegionFingerprints();

  /* F3(#147) — 성공 로그는 ingestReb() 안에서 남는다. 실패는 여기서만 남길 수 있다.
     상한을 두는 이유: maxDuration=300 을 다 태우고 죽으면 아래 logIngest 까지
     못 가서 실행 흔적이 통째로 사라진다(= 어드민 신선도 화면에서 "안 돌았다"로
     보인다). 270초에 스스로 접으면 "잘렸다"는 사실을 남길 수 있다. */
  const run = await withBudget(
    Promise.resolve().then(() => ingestReb({ monthPages, weekPages })),
    CRON_WORK_BUDGET_MS,
  );

  if (run.state === "timeout") {
    const message = `시간 초과로 중단 (${Math.round(CRON_WORK_BUDGET_MS / 1000)}초) — 다음 실행에서 이어서`;
    await logIngest({
      source: "reb",
      dataset: "all",
      origin: "cron-fetch",
      rows: 0,
      status: "error",
      message,
    });
    /* [OPT-10] 수집이 실제로 끝난 순간에만 캐시를 비운다 — 시간 추측 제거 */
    invalidateAfterIngest("reb");
    /* [1010] 중간에 접혔어도 거기까지는 DB 에 들어갔다 — 그만큼은 화면도 바뀐다.
       지문 비교라서 "부분 적재" 도 정확히 그 지역만 비운다. */
    const invalidated = await invalidateAfterRebRun(rebBefore);
    return NextResponse.json(
      { ok: false, error: message, timedOut: true, invalidated },
      { status: 503 },
    );
  }

  if (run.state === "error") {
    const message = ingestErrorMessage(run.error, "REB 수집 실패");
    await logIngest({
      source: "reb",
      dataset: "all",
      origin: "cron-fetch",
      rows: 0,
      status: "error",
      message,
    });
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }

  /* [1010] 적재 성공 직후에만 비운다. invalidateAfterIngest("reb") 는 ingestReb()
     안에서 부르지 않으므로(성공 경로에 원래 없었다) 여기서 태그·고정 경로도 함께. */
  invalidateAfterIngest("reb");
  const invalidated = await invalidateAfterRebRun(rebBefore);
  return NextResponse.json({ ...run.value, invalidated });
}
