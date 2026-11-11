import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { authorizeCron } from "@/lib/cron/authorize";
import { locateSeoulZones } from "@/lib/redevelopment/zone-locate-run";
import { ingestErrorMessage, logIngest } from "@/lib/market/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const DATASET = "서울 정비구역 지도 위치(대표 지번)";

/** [1152] 서울 정비구역에 대표 지번 좌표를 붙여 지도에 싣는다 — 주 1회(전국 목록 적재 뒤). 보호: CRON_SECRET 또는 관리자 세션. */
export async function GET(req: Request) {
  if (!(await authorizeCron(req))) return NextResponse.json({ error: "권한이 필요합니다." }, { status: 403 });
  try {
    const r = await locateSeoulZones({ budgetMs: 90_000 });
    await logIngest({
      source: "redevelopment",
      dataset: DATASET,
      origin: "cron-fetch",
      rows: r.located + r.kept,
      status: r.ok ? "ok" : r.skipped ? "skipped" : "error",
      message: r.reason ?? `구역 ${r.zones} · 새로 찍음 ${r.located} · 유지 ${r.kept} · 못 찾음 ${r.notFound} · 단지 기준 ${r.byComplex} · 위치 없음 ${r.noAddress} · 정리본과 겹침 ${r.duplicate}${r.budgetExhausted ? " · 예산 소진(다음 실행이 이어서)" : ""}`,
    });
    if (r.ok) {
      revalidatePath("/redevelopment");
      revalidatePath("/redevelopment/seoul");
    }
    return NextResponse.json(r);
  } catch (err) {
    const message = ingestErrorMessage(err, "정비구역 위치 붙이기 실패");
    await logIngest({ source: "redevelopment", dataset: DATASET, origin: "cron-fetch", rows: 0, status: "error", message });
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
