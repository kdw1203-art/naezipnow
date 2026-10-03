/**
 * [1029] 서울 도시계획 결정 조서(UPIS) 적재 크론 — 서울 열린데이터광장 Open API.
 *   정비사업(upisRebuild) · 도시개발(upisUrbanDev) · 지구단위계획(upisDistUnitPlan) · 결정고시(upisAnnouncement)
 *   → seoul_upis_records · seoul_upis_announcements (lib/seoul/upis-ingest.ts)
 * 보호: lib/cron/authorize.ts (CRON_SECRET 헤더 · 관리자 세션). 호출: .github/workflows/etl.yml(매일).
 * 키: SEOUL_DATA_API_KEY(열린데이터광장 일반 인증키 — 다른 서울시 자료와 같은 키). 없으면 no-op(reason:"no-key").
 * 예전(~1028)에는 종료된 데이터셋(OA-2253 정비사업 현황)을 SEOUL_OPENAPI_KEY + SEOUL_OPENAPI_SERVICE 로 기다리던
 * 자리였다 — 그 두 환경변수는 더 쓰지 않는다.
 * 쿼리: ?services=upisRebuild,upisAnnouncement (일부만) · ?budget=60000 (ms)
 */
import { NextResponse } from "next/server";
import { authorizeCron } from "@/lib/cron/authorize";
import { ingestSeoulUpis } from "@/lib/seoul/upis-ingest";
import { ingestErrorMessage, logIngest } from "@/lib/market/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

async function handle(req: Request) {
  const authorized = await authorizeCron(req);
  if (!authorized) {
    return NextResponse.json({ error: "권한이 필요합니다." }, { status: 403 });
  }
  const sp = new URL(req.url).searchParams;
  const servicesRaw = (sp.get("services") ?? "").trim();
  const services = servicesRaw ? servicesRaw.split(",").map((s) => s.trim()).filter(Boolean) : undefined;
  const budgetRaw = Number(sp.get("budget"));
  const budgetMs = Number.isFinite(budgetRaw) && budgetRaw >= 5_000 && budgetRaw <= 100_000 ? budgetRaw : 90_000;

  try {
    const result = await ingestSeoulUpis({ budgetMs, services });
    const upserted = result.services.reduce((a, s) => a + s.upserted, 0);
    const failed = result.services.filter((s) => s.error);
    const summary = result.services
      .map((s) => `${s.service}=${s.upserted}${s.completed ? "✓" : ""}${s.error ? "✗" : ""}`)
      .join(" ");
    await logIngest({
      source: "redevelopment",
      dataset: "서울 UPIS 결정 조서",
      origin: "cron-fetch",
      rows: upserted,
      status: !result.configured ? "skipped" : failed.length > 0 && upserted === 0 ? "error" : "ok",
      message: result.reason ?? `${summary}${result.budgetExhausted ? " · 예산 소진(다음 실행이 이어서)" : ""}`,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = ingestErrorMessage(err, "UPIS 적재 실패");
    await logIngest({
      source: "redevelopment",
      dataset: "서울 UPIS 결정 조서",
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
