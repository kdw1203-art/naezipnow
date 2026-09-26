import { NextResponse } from "next/server";
import { authorizeCron } from "@/lib/cron/authorize";
import { isCodefConfigured } from "@/lib/codef/client";
import { syncKbPriceQuote } from "@/lib/codef/sync";
import { invalidateComplexByNames } from "@/lib/complex/complex-invalidate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * CODEF KB 시세정보 동기화 크론.
 * 보호: CRON_SECRET 또는 관리자 세션 (reb-ingest 와 동일 패턴).
 * CODEF 자격 증명이 없으면 즉시 skipped (정상 폴백).
 *
 * 사용: POST body 또는 쿼리로 대상 단지 지정 가능.
 *  - 기본: 아직 대상 목록이 코드에 없으므로 { skipped:true } (설정 후 확장)
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const authorized = await authorizeCron(req);
  if (!authorized) {
    return NextResponse.json({ error: "권한이 필요합니다." }, { status: 403 });
  }

  if (!isCodefConfigured()) {
    return NextResponse.json({
      ok: false,
      skipped: true,
      reason:
        "CODEF 자격 증명(CODEF_CLIENT_ID/SECRET) 미설정 — 설정 후 KB 시세가 자동 적재됩니다.",
    });
  }

  // 단건 테스트용: ?complex=단지명&serial=단지일련번호
  const complexName = url.searchParams.get("complex")?.trim();
  const serial = url.searchParams.get("serial")?.trim();
  if (complexName && serial) {
    const regionName = url.searchParams.get("region")?.trim() || undefined;
    const result = await syncKbPriceQuote({
      complexName,
      regionName,
      query: { complexNo: serial, searchGbn: "0" },
    });
    /* [1010] KB 시세 행은 /complex/tx/[slug] 의 "KB 시세" 섹션에 서버 렌더로 실린다.
       그 라우트 TTL 이 7일이 됐으므로 적재 직후 그 단지 화면을 비운다(지역을 넘겼을 때만 —
       단지 id 는 (지역, 단지명)으로만 만들 수 있고, 모르면 찍지 않는다). */
    if (result.ok && regionName) invalidateComplexByNames(regionName, complexName);
    return NextResponse.json(result);
  }

  return NextResponse.json({
    ok: true,
    skipped: true,
    reason:
      "대상 단지 목록 미지정 — ?complex=&serial= 로 단건 테스트하거나 대상 목록을 구성하세요.",
  });
}
