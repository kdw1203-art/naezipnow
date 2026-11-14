import { NextResponse } from "next/server";
import { authorizeCron } from "@/lib/cron/authorize";
import { loadSourceFreshness } from "@/lib/admin/source-freshness";
import { logger } from "@/lib/log";
import { loadIngestLogSummary24h } from "@/lib/admin/data-health-extras";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/* [개선 #44, 2026-08-22] 데이터 신선도 감시 크론.
 *
 * 실측 배경: 입주물량이 한 달째 정지했는데 아무 경보가 없었다 — 크론 실패가
 * 로그에만 남는 "조용한 부패". 이 라우트가 매일 소스별 최신 적재 시각을 재서
 * 임계를 넘긴 소스를 **오류 로그**로 승격한다(logger.error 는 운영 오류
 * 수집·주간 브리핑이 이미 읽는 채널이다). 이메일·푸시 채널이 붙으면(로드맵
 * #8·#38) 이 판정 결과를 그쪽으로도 흘린다 — 판정은 lib/admin/data-freshness
 * 한 곳이라 채널만 늘리면 된다.
 */
export async function GET(req: Request) {
  if (!(await authorizeCron(req))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const rows = await loadSourceFreshness();
  const stale = rows.filter((r) => r.stale);
  for (const r of stale) {
    logger.error(
      `[freshness-watch] ${r.label}(${r.key}) 적재 정지 — 마지막 ${
        r.lastAt ?? "확인 불가"
      } (임계 ${r.thresholdHours}h). 경로: ${r.pipeline}`,
    );
  }
  /* [1177] 지난 24시간 적재 오류도 사유와 함께 올린다 — 세종(36110)이 지역 표에 없어 실거래 1,634행이
     매번 버려지던 것이 적재 기록에만 남고 어디에도 울리지 않았다(운영 2026-11-14). */
  const ingest = (await loadIngestLogSummary24h()) ?? [];
  const failing = ingest.filter((r) => r.error > 0);
  for (const r of failing) {
    logger.error(`[freshness-watch] 적재 오류 ${r.source} — 24시간 ${r.error}회 · ${r.lastError ?? "사유 없음"}`);
  }
  return NextResponse.json({
    ok: true,
    ingestErrors: failing.map((r) => ({ source: r.source, error: r.error, reason: r.lastError ?? null })),
    checked: rows.length,
    stale: stale.map((r) => ({ key: r.key, lastAt: r.lastAt, ageHours: r.ageHours })),
  });
}
