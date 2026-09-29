/**
 * [1025] 1회 160곳 · 하루 2회 — 상한 상수는 lib/market/molit-core.ts
 * [1024] GET/POST /api/cron/molit-history-backfill
 *
 * 수도권(서울·경기·인천) 아파트 실거래 **이력 백필** — 2025-12 부터 달을 거꾸로, 빈 (시군구, 계약월)만, raw 미저장.
 * 커서(어느 달을 보는가)는 public_data_cache 에 남고, 행 유무 자체가 진짜 커서라 중간에 끊겨도 이중 계상이 없다.
 *
 * 파라미터
 *   ?ym=202412     이 달부터(커서 무시 — 수동 재시작)
 *   ?regions=160   1회 시군구 상한(1~200, 기본 160 = ≤960회 · [1025] 크론 하루 2회 02:40·14:40 UTC)
 *   ?months=3      1회 최대 월 수(1~12)
 *
 * 보호: lib/cron/authorize.ts. MOLIT 인증키 미설정이면 0행·skipped(가짜 데이터 없음).
 * 예산: CRON_WORK_BUDGET_MS — 초과 시 503 + 기록. 단지 화면 무효화는 적재된 단지만(일일 크론과 같은 헬퍼).
 */
import { NextResponse } from "next/server";
import { authorizeCron } from "@/lib/cron/authorize";
import { backfillMolitHistory } from "@/lib/market/molit-history-backfill";
import { ingestErrorMessage, logIngest } from "@/lib/market/store";
import { invalidateComplexIds } from "@/lib/cache/invalidate";
import { complexCacheIdsFromNames } from "@/lib/complex/complex-invalidate";
import { withBudget, CRON_WORK_BUDGET_MS } from "@/lib/async/with-budget";
import { logger } from "@/lib/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const DATASET = "아파트 실거래 이력 백필(수도권)";

async function handle(req: Request) {
  const authorized = await authorizeCron(req);
  if (!authorized) {
    return NextResponse.json({ error: "권한이 필요합니다." }, { status: 403 });
  }
  const url = new URL(req.url);
  const num = (key: string): number | undefined => {
    const raw = url.searchParams.get(key);
    if (!raw) return undefined;
    const n = Number(raw);
    return Number.isFinite(n) ? n : undefined;
  };
  const ym = url.searchParams.get("ym")?.replace(/\D/g, "").slice(0, 6) || undefined;

  const run = await withBudget(
    Promise.resolve().then(() =>
      backfillMolitHistory({ ym, maxRegions: num("regions"), maxMonths: num("months") }),
    ),
    CRON_WORK_BUDGET_MS,
  );

  if (run.state === "timeout") {
    const message = `시간 초과로 중단 (${Math.round(CRON_WORK_BUDGET_MS / 1000)}초) — 커서는 그대로, 다음 실행에서 이어서`;
    await logIngest({ source: "molit", dataset: DATASET, origin: "cron-fetch", rows: 0, status: "error", message });
    return NextResponse.json({ ok: false, error: message, timedOut: true, finishedAt: new Date().toISOString() }, { status: 503 });
  }
  if (run.state === "error") {
    const message = ingestErrorMessage(run.error, "이력 백필 실패");
    await logIngest({ source: "molit", dataset: DATASET, origin: "cron-fetch", rows: 0, status: "error", message });
    return NextResponse.json({ ok: false, error: message, finishedAt: new Date().toISOString() }, { status: 500 });
  }

  /* 과거 달이 채워지면 그 단지의 3년·5년 그래프가 달라진다 — 적재된 단지만 비운다(상한 2,000 경로). */
  let revalidated = 0;
  if (run.value.inserted > 0) {
    try {
      const ids: string[] = [];
      for (const c of run.value.touchedComplexes) ids.push(...complexCacheIdsFromNames(c.region, c.name));
      revalidated = invalidateComplexIds(ids, { budget: 2_000 }).revalidated;
    } catch (e) {
      logger.warn("[molit-history] 단지 재검증 실패(무시)", e);
    }
  }

  const { touchedComplexes, ...payload } = run.value;
  return NextResponse.json({
    ...payload,
    touched: touchedComplexes.length,
    touchedRevalidated: revalidated,
    finishedAt: new Date().toISOString(),
  });
}

export async function GET(req: Request) {
  return handle(req);
}

export async function POST(req: Request) {
  return handle(req);
}
