/**
 * [1080] 이벤트 표 보존 기간 — 하루 1회(vercel.json).
 *
 * 왜: 방문마다 page_view_events 에 한 행(view) + leave 갱신, 표본 세션마다 web_vitals 묶음 insert 가 쌓이는데
 * 지우는 곳이 없었다(인덱스 3개만). 방문자 수에 정비례해 표·인덱스가 커지고 DB 용량(Pro 8GB)을 압박한다.
 * 집계(page_view_agg · bump_page_view_agg RPC)는 따로 쌓이므로 원본 행은 `TRAFFIC_RETENTION_DAYS`(기본 90일)만 둔다.
 *
 * 방식: 기준 시각보다 오래된 행의 id 를 2,000개씩 읽어 그 id 로 지운다(한 번의 큰 delete 가 표를 잠그지 않게).
 * 시간 예산 40초 안에서 표마다 최대 20묶음 — 못 다 지운 것은 다음 날 이어서. 멱등.
 * 보호: lib/cron/authorize.ts (CRON_SECRET · 관리자 세션).
 */
import { NextResponse } from "next/server";
import { authorizeCron } from "@/lib/cron/authorize";
import { getServiceSupabase } from "@/lib/supabase/service";
import { logger } from "@/lib/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BATCH = 2000;
const MAX_BATCHES_PER_TABLE = 20;
const TIME_BUDGET_MS = 40_000;
const DEFAULT_DAYS = 90;

const TABLES: ReadonlyArray<{ name: string; timeCol: string; idCol: string }> = [
  { name: "page_view_events", timeCol: "occurred_at", idCol: "id" },
  { name: "web_vitals", timeCol: "created_at", idCol: "id" },
];

function retentionDays(): number {
  const raw = Number(process.env.TRAFFIC_RETENTION_DAYS?.trim());
  return Number.isFinite(raw) && raw >= 7 ? Math.floor(raw) : DEFAULT_DAYS;
}

export async function GET(req: Request) {
  if (!(await authorizeCron(req))) {
    return NextResponse.json({ error: "권한이 필요합니다." }, { status: 403 });
  }
  const sb = getServiceSupabase();
  if (!sb) return NextResponse.json({ ok: true, deleted: {}, note: "Supabase 미설정" });

  const days = retentionDays();
  const cutoff = new Date(Date.now() - days * 24 * 3600_000).toISOString();
  const started = Date.now();
  const deleted: Record<string, number> = {};
  const errors: string[] = [];

  for (const t of TABLES) {
    deleted[t.name] = 0;
    for (let batch = 0; batch < MAX_BATCHES_PER_TABLE; batch += 1) {
      if (Date.now() - started > TIME_BUDGET_MS) break;
      const { data, error } = await sb
        .from(t.name)
        .select(t.idCol)
        .lt(t.timeCol, cutoff)
        .order(t.timeCol, { ascending: true })
        .limit(BATCH);
      if (error) {
        errors.push(`${t.name}: ${error.message}`);
        break;
      }
      const rows = (data ?? []) as unknown as Array<Record<string, unknown>>;
      const ids = rows.map((r) => r[t.idCol]).filter((v) => v !== null && v !== undefined) as Array<string | number>;
      if (ids.length === 0) break;
      const { error: delError } = await sb.from(t.name).delete().in(t.idCol, ids);
      if (delError) {
        errors.push(`${t.name}: ${delError.message}`);
        break;
      }
      deleted[t.name] += ids.length;
      if (ids.length < BATCH) break;
    }
  }

  if (errors.length) logger.warn("[cron/events-retention] 일부 실패", errors.join(" · ").slice(0, 300));
  return NextResponse.json({ ok: errors.length === 0, days, cutoff, deleted, ms: Date.now() - started, errors });
}
