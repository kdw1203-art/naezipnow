/**
 * [1024] GET/POST /api/cron/molit-nonapt-ingest
 *
 * 비아파트(오피스텔·연립다세대·단독다가구) 실거래 → market_transactions — 수도권 · 최근 12개월 · raw 미저장.
 * A) 최근월(당월/전월 교대)을 수도권 시군구 12곳씩 일수 슬라이스로 다시 받고, B) 빈 (구, 월, 유형)을 커서로 메운다.
 * 집계 뷰·RPC 는 property_type='apartment' 조건이 있어 아파트 시세에 섞이지 않는다(tests/unit/data-1024 가 잠근다).
 *
 * 파라미터
 *   ?types=officetel,rowhouse   유형 그룹만(기본 셋 다)
 *   ?recent=12 · ?gaps=30 · ?months=3   슬라이스·빈달 상한
 *   ?skipRecent=1               A 단계 생략(수동 백필)
 *
 * 보호: lib/cron/authorize.ts. MOLIT 인증키 미설정이면 0행·skipped(가짜 데이터 없음).
 */
import { NextResponse } from "next/server";
import { authorizeCron } from "@/lib/cron/authorize";
import { ingestMolitNonApt } from "@/lib/market/molit-nonapt";
import { listTargetTypeKeys } from "@/lib/market/molit-transactions";
import { ingestErrorMessage, logIngest } from "@/lib/market/store";
import { withBudget, CRON_WORK_BUDGET_MS } from "@/lib/async/with-budget";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const DATASET = "비아파트 실거래(수도권 · 오피스텔·연립다세대·단독다가구)";

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
  const known = new Set(listTargetTypeKeys().filter((k) => k !== "apartment"));
  const types = (url.searchParams.get("types") ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter((s) => known.has(s));

  const run = await withBudget(
    Promise.resolve().then(() =>
      ingestMolitNonApt({
        types: types.length ? types : undefined,
        recentSlice: num("recent"),
        gapRegions: num("gaps"),
        gapMonths: num("months"),
        skipRecent: url.searchParams.get("skipRecent") === "1",
      }),
    ),
    CRON_WORK_BUDGET_MS,
  );

  if (run.state === "timeout") {
    const message = `시간 초과로 중단 (${Math.round(CRON_WORK_BUDGET_MS / 1000)}초) — 다음 실행에서 이어서`;
    await logIngest({ source: "molit", dataset: DATASET, origin: "cron-fetch", rows: 0, status: "error", message });
    return NextResponse.json({ ok: false, error: message, timedOut: true, finishedAt: new Date().toISOString() }, { status: 503 });
  }
  if (run.state === "error") {
    const message = ingestErrorMessage(run.error, "비아파트 실거래 적재 실패");
    await logIngest({ source: "molit", dataset: DATASET, origin: "cron-fetch", rows: 0, status: "error", message });
    return NextResponse.json({ ok: false, error: message, finishedAt: new Date().toISOString() }, { status: 500 });
  }

  /* 비아파트 행은 단지 허브(/complex)·아파트 집계 화면을 바꾸지 않는다 — /rent/[region] 은 revalidate 6h(담당 S).
     그래서 여기서는 캐시를 비우지 않는다. */
  const { touchedComplexes, ...payload } = run.value;
  return NextResponse.json({ ...payload, touched: touchedComplexes.length, finishedAt: new Date().toISOString() });
}

export async function GET(req: Request) {
  return handle(req);
}

export async function POST(req: Request) {
  return handle(req);
}
