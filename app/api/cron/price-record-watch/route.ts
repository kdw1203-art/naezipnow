/**
 * [#81] 신고가 자동 소식 크론 — 하루 1회, 하루 최대 1건 발행(멱등).
 * 보호: lib/cron/authorize.ts (CRON_SECRET 헤더 · 관리자 세션)
 * 스케줄: .github/workflows/etl.yml — molit 인제스트 **뒤에** 호출해야
 * 그날 유입분이 탐지 창에 들어온다.
 */
import { NextResponse } from "next/server";
import { authorizeCron } from "@/lib/cron/authorize";
import { runPriceRecordWatch } from "@/lib/market/price-record-watch";
import { ingestErrorMessage, logIngest } from "@/lib/market/store";
import { invalidateAfterIngest } from "@/lib/cache/invalidate";
import { invalidateNewsHubs } from "@/lib/town/invalidate-town";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

async function handle(req: Request) {
  const authorized = await authorizeCron(req);
  if (!authorized) {
    return NextResponse.json({ error: "권한이 필요합니다." }, { status: 403 });
  }
  try {
    const result = await runPriceRecordWatch();
    await logIngest({
      source: "news",
      dataset: "신고가 자동 소식",
      origin: "cron-fetch",
      rows: result.posted ? 1 : 0,
      status: result.posted ? "ok" : "skipped",
      message:
        result.reason ?? `탐지=${result.detected} 발행=${result.posted ? "1건" : "0건"}`,
    });
    /* [1007] 신고가 소식이 실제로 실렸을 때만 뉴스룸·동네 피드·동네 홈(6시간 ISR)을 비운다 */
    if (result.posted) invalidateAfterIngest("news");
    /* [1010] 신고가 알림 글이 실리면 뉴스 주제 허브 20곳과 동네 데이터 캐시도 바뀐다 */
    if (result.posted) invalidateNewsHubs();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = ingestErrorMessage(err, "신고가 탐지 실패");
    await logIngest({
      source: "news",
      dataset: "신고가 자동 소식",
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
