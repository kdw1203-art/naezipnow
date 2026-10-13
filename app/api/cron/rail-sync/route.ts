/**
 * [1064] 레일포털(철도산업정보센터) 하루 1회 배치 — 도시철도 노선·역 · 역별 환승 · 역별 첫차·막차.
 *
 * 보호: CRON_SECRET · 관리자 세션(lib/cron/authorize).
 * 선행: Vercel 환경변수 `KRIC_SERVICE_KEY`(소유자가 직접 넣는다 — 값은 코드·문서·채팅 어디에도 적지 않는다).
 * 스케줄: .github/workflows/etl.yml 하루 한 번. 공급자가 "1일 1회 GET 또는 배치"를 요청했다 — 더 자주 부르지 않는다.
 * 범위: 도시·광역철도만(일반역·KTX 제외 — 공급자 안내).
 */
import { NextResponse } from "next/server";
import { authorizeCron } from "@/lib/cron/authorize";
import { syncRail } from "@/lib/rail/store";
import { ingestErrorMessage, logIngest } from "@/lib/market/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

async function handle(req: Request) {
  const authorized = await authorizeCron(req);
  if (!authorized) return NextResponse.json({ error: "권한이 필요합니다." }, { status: 403 });

  try {
    const r = await syncRail();
    if (!r.configured) {
      await logIngest({
        source: "rail",
        dataset: "레일포털 도시철도(노선·환승·시각표)",
        origin: "api",
        rows: 0,
        status: "skipped",
        message: "KRIC_SERVICE_KEY 미설정",
      });
      return NextResponse.json({ ok: true, skipped: "no-key" });
    }
    await logIngest({
      source: "rail",
      dataset: "레일포털 도시철도(노선·환승·시각표)",
      origin: "api",
      rows: r.stations + r.transfers + r.timetablesFetched,
      status: r.messages.length > 0 ? "error" : "ok",
      message: r.messages.join(" · ").slice(0, 400) || undefined,
    });
    return NextResponse.json({ ok: r.messages.length === 0, ...r });
  } catch (e) {
    const message = ingestErrorMessage(e);
    await logIngest({
      source: "rail",
      dataset: "레일포털 도시철도(노선·환승·시각표)",
      origin: "api",
      rows: 0,
      status: "error",
      message,
    });
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
