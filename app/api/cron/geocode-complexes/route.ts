/**
 * GET /api/cron/geocode-complexes?limit=150
 * 실거래 단지(market_transactions)를 거래량 많은 순으로 네이버(NCP) 지오코딩 →
 * complex_geocode 캐시에 좌표 저장. 지도에서 개별 단지를 정확한 위치에 표시하기 위함.
 * 보호: lib/cron/authorize.ts (CRON_SECRET 헤더 · 관리자 세션)
 */
import { NextResponse } from "next/server";
import { backfillGeocode } from "@/lib/map/complex-geocode";
import { isNaverMapsRestConfigured } from "@/lib/map/naver-maps-rest";
import { authorizeCron } from "@/lib/cron/authorize";
import { logIngest } from "@/lib/market/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const authorized = await authorizeCron(req);
  if (!authorized) {
    return NextResponse.json({ error: "권한이 필요합니다." }, { status: 403 });
  }

  if (!isNaverMapsRestConfigured()) {
    await logIngest({
      source: "geocode",
      dataset: "단지 좌표 지오코딩",
      origin: "cron-fetch",
      rows: 0,
      status: "skipped",
      message: "NAVER Maps REST API 미설정",
    });
    return NextResponse.json(
      { ok: false, skipped: true, message: "NAVER Maps REST API 미설정" },
      { status: 200 },
    );
  }

  const limit = Math.min(1000, Math.max(1, Number(url.searchParams.get("limit") ?? 150)));
  try {
    const result = await backfillGeocode(limit);
    const processed = result.processed ?? 0;
    const okCount = result.ok ?? 0;
    const errCount = result.errors ?? 0;
    // status: 좌표 성공이 있으면 ok. 성공 0 + 오류가 있으면 error(원인 표기) — 예전엔
    // 전부 "skipped" 로 뭉개져 NAVER 키·API 오류가 조용히 묻혔다.
    /* [1043] 대상이 있었고 오류 없이 끝났으면(전부 "주소 없음"이어도) ok 다 — 예전엔 그 실행이 "skipped"(안 돌았다)로 적혔다.
       오류가 성공보다 많으면 error 로 적는다(성공 1 · 오류 199 를 ok 라고 부르지 않는다). */
    const status =
      errCount > okCount ? "error" : okCount > 0 || processed > 0 ? "ok" : "skipped";
    await logIngest({
      source: "geocode",
      dataset: "단지 좌표 지오코딩",
      origin: "cron-fetch",
      rows: okCount,
      status,
      message: `처리=${processed} 성공=${okCount}(거래 단서 ${result.hinted ?? 0}) 못찾음=${Math.max(0, processed - okCount - errCount)} 오류=${errCount}${
        result.errorSample ? ` · ${result.errorSample}` : ""
      }`,
    });
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "지오코딩 실패";
    await logIngest({
      source: "geocode",
      dataset: "단지 좌표 지오코딩",
      origin: "cron-fetch",
      rows: 0,
      status: "error",
      message,
    });
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
