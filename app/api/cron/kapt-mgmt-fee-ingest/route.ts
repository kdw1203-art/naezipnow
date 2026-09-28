/**
 * [1024] GET/POST /api/cron/kapt-mgmt-fee-ingest
 *
 * K-apt 공동주택 관리비(공용관리비 + 개별사용료) → complex_mgmt_fee. 수도권 대장 중 실거래 있는 단지 우선, 1회 200곳.
 * 대상 달은 기본 2개월 전(공개 지연). 커서는 대장 metadata.mgmtFeeYm(병합 RPC 로만 쓴다).
 *
 * 파라미터: ?ym=202607 · ?limit=200(1~500)
 * 보호: lib/cron/authorize.ts. data.go.kr 인증키 미설정이면 0행·skipped(가짜 데이터 없음).
 * 표(complex_mgmt_fee)·후보 뷰는 마이그레이션 20260928125309_1024_complex_mgmt_fee.sql — 미적용이면 upsert 가
 * 실패해 error 로 기록된다(조용히 성공하지 않는다).
 */
import { NextResponse } from "next/server";
import { authorizeCron } from "@/lib/cron/authorize";
import { ingestKaptMgmtFeeBatch } from "@/lib/national-data/kapt-mgmt-fee-ingest";
import { ingestErrorMessage, logIngest } from "@/lib/market/store";
import { withBudget, CRON_WORK_BUDGET_MS } from "@/lib/async/with-budget";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const DATASET = "K-apt 관리비(수도권 단지)";

async function handle(req: Request) {
  const authorized = await authorizeCron(req);
  if (!authorized) {
    return NextResponse.json({ error: "권한이 필요합니다." }, { status: 403 });
  }
  const url = new URL(req.url);
  const ym = url.searchParams.get("ym")?.replace(/\D/g, "").slice(0, 6) || undefined;
  const limitRaw = Number(url.searchParams.get("limit"));
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? limitRaw : undefined;

  const run = await withBudget(
    Promise.resolve().then(() => ingestKaptMgmtFeeBatch({ ym, limit })),
    CRON_WORK_BUDGET_MS,
  );

  if (run.state === "timeout") {
    const message = `시간 초과로 중단 (${Math.round(CRON_WORK_BUDGET_MS / 1000)}초) — 스탬프 없는 단지는 다음 실행이 다시`;
    await logIngest({ source: "kapt-mgmt-fee", dataset: DATASET, origin: "cron-fetch", rows: 0, status: "error", message });
    return NextResponse.json({ ok: false, error: message, timedOut: true, finishedAt: new Date().toISOString() }, { status: 503 });
  }
  if (run.state === "error") {
    const message = ingestErrorMessage(run.error, "관리비 적재 실패");
    await logIngest({ source: "kapt-mgmt-fee", dataset: DATASET, origin: "cron-fetch", rows: 0, status: "error", message });
    return NextResponse.json({ ok: false, error: message, finishedAt: new Date().toISOString() }, { status: 500 });
  }

  const r = run.value;
  const status =
    r.skipped === "no-key" || r.skipped === "no-service"
      ? "skipped"
      : r.failed > 0
        ? "error"
        : r.inserted > 0
          ? "ok"
          : "skipped";
  const message =
    r.skipped === "no-key"
      ? "data.go.kr 인증키 미설정"
      : r.skipped === "no-service"
        ? "Supabase 미설정"
        : r.skipped === "no-rows"
          ? `${r.ym} 대상 단지 없음(전부 시도됨 · 후보=${r.candidateSource})`
          : `${r.ym} 후보=${r.candidateSource} 처리=${r.processed} 적재=${r.inserted} 없음=${r.miss} 실패=${r.failed} 스탬프=${r.stamped}` +
            (r.errors.length ? ` · ${r.errors.join(" / ")}` : "");
  await logIngest({ source: "kapt-mgmt-fee", dataset: DATASET, origin: "cron-fetch", rows: r.inserted, status, message });

  return NextResponse.json({ ok: r.failed === 0, ...r, finishedAt: new Date().toISOString() });
}

export async function GET(req: Request) {
  return handle(req);
}

export async function POST(req: Request) {
  return handle(req);
}
