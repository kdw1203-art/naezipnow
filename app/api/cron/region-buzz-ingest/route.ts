import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { authorizeCron } from "@/lib/cron/authorize";
import { ingestRegionBuzz, isBuzzConfigured } from "@/lib/buzz/ingest";
import { ingestErrorMessage, logIngest } from "@/lib/market/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * [1139] 지역 관심도(네이버 검색어 트렌드 6개월) · 기사 수(어제 하루) 적재 — 매일 한 번.
 * 보호: CRON_SECRET 또는 관리자 세션. 네이버 검색 키가 없으면 skipped(화면은 종전 자료만 쓴다).
 */
export async function GET(req: Request) {
  if (!(await authorizeCron(req))) return NextResponse.json({ error: "권한이 필요합니다." }, { status: 403 });
  const dataset = "네이버 검색어 트렌드 · 뉴스 건수";
  if (!isBuzzConfigured()) {
    await logIngest({ source: "naver-buzz", dataset, origin: "cron-fetch", rows: 0, status: "skipped", message: "NAVER_SEARCH_CLIENT_ID 미설정" });
    return NextResponse.json({ ok: false, skipped: true, reason: "NAVER_SEARCH_CLIENT_ID · NAVER_SEARCH_CLIENT_SECRET 미설정" });
  }
  try {
    const r = await ingestRegionBuzz();
    await logIngest({
      source: "naver-buzz",
      dataset,
      origin: "cron-fetch",
      rows: r.searchRegions + r.newsRegions,
      status: r.ok ? "ok" : r.skipped ? "skipped" : "error",
      message: `검색 ${r.searchRegions}곳 · 기사 ${r.newsRegions}곳(${r.newsDay})${r.failed ? ` · 실패 ${r.failed}` : ""}${r.reason ? ` · ${r.reason}` : ""}`,
    });
    if (r.ok) revalidateTag("buzz");
    return NextResponse.json(r);
  } catch (err) {
    const message = ingestErrorMessage(err, "지역 관심도 적재 실패");
    await logIngest({ source: "naver-buzz", dataset, origin: "cron-fetch", rows: 0, status: "error", message });
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
