/**
 * [개선 #21] 입주 예정 물량 자동 인제스트 크론.
 * 출처: 청약홈 분양정보 상세(getAPTLttotPblancDetail)의 입주예정월.
 * 보호: lib/cron/authorize.ts (CRON_SECRET 헤더 · 관리자 세션)
 * DATA_GO_KR_SERVICE_KEY 미설정 시 no-op(reason:"no-key") — 기존 데이터 유지.
 * 스케줄: .github/workflows/etl.yml (매일 06:00 UTC) — vercel.json 에 두지 않는다.
 */
import { NextResponse } from "next/server";
import { authorizeCron } from "@/lib/cron/authorize";
import { ingestApplyhomeSupply } from "@/lib/market/supply-ingest";
import { backfillSupplyGeocode } from "@/lib/market/supply-geocode";
import { ingestErrorMessage, logIngest } from "@/lib/market/store";
import { invalidateAfterIngest } from "@/lib/cache/invalidate";
import { invalidateAllRegionPages } from "@/lib/region/invalidate-market";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

async function handle(req: Request) {
  const authorized = await authorizeCron(req);
  if (!authorized) {
    return NextResponse.json({ error: "권한이 필요합니다." }, { status: 403 });
  }

  try {
    const result = await ingestApplyhomeSupply();
    await logIngest({
      source: "supply",
      dataset: "청약홈 분양공고 입주예정월",
      origin: "cron-fetch",
      rows: result.upserted + result.migrated,
      status: !result.configured ? "skipped" : "ok",
      message:
        result.reason ??
        `조회=${result.fetched} 업서트=${result.upserted} 이관=${result.migrated} 입주월없음/과거=${result.skippedNoMoveIn} 재공고제외=${result.skippedDupAnnouncement} 기존키제외=${result.skippedExistingKey} 페이지=${result.pagesFetched}`,
    });
    /* [994] 청약 공고·경쟁률 저장은 별도 소스로 로그 — 신선도 표·/data-sources 가 따로 본다 */
    if (result.configured) {
      await logIngest({
        source: "applyhome",
        dataset: "청약홈 분양공고·경쟁률",
        origin: "cron-fetch",
        rows: result.announcementsUpserted + result.competitionUpserted,
        status: result.announcementsUpserted > 0 ? "ok" : "error",
        message: `공고 업서트=${result.announcementsUpserted} 경쟁률 업서트=${result.competitionUpserted} (상세 ${result.fetched}행 중)`,
      });
    }
    /* [OPT-10] 수집이 실제로 끝난 순간에만 캐시를 비운다 — 시간 추측 제거 */
    invalidateAfterIngest("supply");
    /* [1010] 지역 페이지(/region/[id])의 "입주 예정 물량" 섹션도 이 적재로 바뀐다.
       그 라우트의 TTL 을 6시간 → 7일로 늘렸으므로(1010 브리프 원칙 1) 여기 비움이
       없으면 새 입주물량이 최대 7일 안 보인다.
       **새 행이 실제로 들어온 날에만** 부른다: 이 적재는 매일 돌지만 청약홈 분양공고는
       하루 0~몇 건이고, upsert 결과(upserted+migrated)가 0 이면 화면은 그대로다.
       어느 지역인지는 SupplyIngestResult 가 알려주지 않아 카탈로그 전량을 비운다 —
       드물게(공고가 있는 날에만) 도는 비용이라 감당할 만하다. */
    const supplyChanged = result.upserted + result.migrated > 0;
    if (supplyChanged) invalidateAllRegionPages();
    /* [#74] 좌표 점진 백필(일 25건) — 지도 레이어용. 실패해도 인제스트 성공은 유지. */
    let geocode: Awaited<ReturnType<typeof backfillSupplyGeocode>> | { error: string } | null =
      null;
    try {
      geocode = await backfillSupplyGeocode(25);
    } catch (e) {
      geocode = { error: e instanceof Error ? e.message : "지오코딩 실패" };
    }
    return NextResponse.json({
      ok: true,
      mode: result.configured ? "live" : "mock",
      ...result,
      geocode,
    });
  } catch (err) {
    const message = ingestErrorMessage(err, "입주물량 적재 실패");
    await logIngest({
      source: "supply",
      dataset: "청약홈 분양공고 입주예정월",
      origin: "cron-fetch",
      rows: 0,
      status: "error",
      message,
    });
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export async function GET(req: Request) {
  return handle(req);
}

export async function POST(req: Request) {
  return handle(req);
}
