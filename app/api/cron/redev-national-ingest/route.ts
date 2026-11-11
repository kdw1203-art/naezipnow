import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { authorizeCron } from "@/lib/cron/authorize";
import { ingestNationalRedevZones, isNationalRedevConfigured } from "@/lib/redevelopment/national-ingest";
import { NATIONAL_DATASET } from "@/lib/redevelopment/national";
import { ingestErrorMessage, logIngest } from "@/lib/market/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** [1149] 전국 정비구역 목록(국토교통부 · 연 1회 공표) 적재 — 주 1회. 보호: CRON_SECRET 또는 관리자 세션. */
export async function GET(req: Request) {
  if (!(await authorizeCron(req))) return NextResponse.json({ error: "권한이 필요합니다." }, { status: 403 });
  if (!isNationalRedevConfigured()) {
    await logIngest({ source: "redevelopment", dataset: NATIONAL_DATASET, origin: "cron-fetch", rows: 0, status: "skipped", message: "DATA_GO_KR_SERVICE_KEY 미설정" });
    return NextResponse.json({ ok: false, skipped: true, reason: "DATA_GO_KR_SERVICE_KEY 미설정" });
  }
  try {
    const r = await ingestNationalRedevZones();
    await logIngest({
      source: "redevelopment",
      dataset: NATIONAL_DATASET,
      origin: "cron-fetch",
      rows: r.upserted,
      status: r.ok ? "ok" : r.skipped ? "skipped" : "error",
      message: r.reason ?? `받음 ${r.fetched} · 저장 ${r.upserted}${r.total !== null ? ` · 공표 ${r.total}` : ""}`,
    });
    /* [1151] 서울 구별 정비구역 수 지도(하루 캐시)를 바로 새로 그린다 */
    if (r.ok) revalidatePath("/redevelopment/seoul");
    return NextResponse.json(r);
  } catch (err) {
    const message = ingestErrorMessage(err, "전국 정비구역 적재 실패");
    await logIngest({ source: "redevelopment", dataset: NATIONAL_DATASET, origin: "cron-fetch", rows: 0, status: "error", message });
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
