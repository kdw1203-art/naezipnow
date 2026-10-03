import "server-only";

import { getServiceSupabase } from "@/lib/supabase/service";
import { logger } from "@/lib/log";
import { fetchSeoulOpenApi, isSeoulApiConfigured } from "./openapi-client";
import {
  UPIS_ANNOUNCEMENT_SERVICE,
  UPIS_SERVICES,
  upisAnnouncementToRecord,
  upisRowToRecord,
  type UpisService,
} from "./upis";

/* [1029] 서울 UPIS 결정 조서 적재 — 열린데이터광장 Open API(SEOUL_DATA_API_KEY) → seoul_upis_records · seoul_upis_announcements.
   한 번에 1,000행씩 페이지로 읽고 그 페이지를 바로 upsert 한다(조서관리코드가 기본키 — 같은 행은 덮어쓴다, 지우지 않는다).
   서비스마다 "다음 시작 번호"를 seoul_upis_sync 에 남겨, 시간 예산(크론 함수 상한) 안에 끝나지 않으면 다음 실행이 이어서 읽는다.
   끝까지 읽으면 last_full_at 을 찍고 시작 번호를 1 로 되돌린다(다음 날 전체를 다시 읽어 변경·신설을 반영).
   서비스 순서는 "가장 오래 전에 끝까지 읽은 것"부터 — 한 서비스가 매번 예산을 다 먹어 다른 서비스가 굶지 않게. */

export const UPIS_PAGE_SIZE = 1000;
const UPSERT_CHUNK = 500;

type SyncRow = {
  service: string;
  next_start: number;
  total_count: number | null;
  rows_total: number;
  last_run_at: string | null;
  last_full_at: string | null;
  last_error: string | null;
};

export type UpisServiceResult = {
  service: string;
  fetched: number;
  upserted: number;
  pages: number;
  completed: boolean;
  totalCount: number | null;
  error?: string;
};

export type UpisIngestResult = {
  configured: boolean;
  reason?: "no-key" | "no-db";
  services: UpisServiceResult[];
  elapsedMs: number;
  budgetExhausted: boolean;
};

const ALL_SERVICES: readonly string[] = [...UPIS_SERVICES, UPIS_ANNOUNCEMENT_SERVICE];

function toRecords(service: string, rows: Record<string, unknown>[]): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const rec =
      service === UPIS_ANNOUNCEMENT_SERVICE ? upisAnnouncementToRecord(row) : upisRowToRecord(service as UpisService, row);
    if (!rec) continue;
    /* 같은 페이지 안의 중복 키 — upsert 는 한 문장 안의 중복 키를 거부한다(ON CONFLICT … cannot affect row a second time) */
    const key = String(rec.rpt_mng_cd ?? rec.ancmnt_mng_cd);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(rec);
  }
  return out;
}

function tableFor(service: string): { table: string; pk: string } {
  return service === UPIS_ANNOUNCEMENT_SERVICE
    ? { table: "seoul_upis_announcements", pk: "ancmnt_mng_cd" }
    : { table: "seoul_upis_records", pk: "rpt_mng_cd" };
}

export async function ingestSeoulUpis(opts: { budgetMs?: number; services?: readonly string[] } = {}): Promise<UpisIngestResult> {
  const startedAt = Date.now();
  const budgetMs = opts.budgetMs ?? 90_000;
  const result: UpisIngestResult = { configured: true, services: [], elapsedMs: 0, budgetExhausted: false };

  if (!isSeoulApiConfigured()) {
    return { ...result, configured: false, reason: "no-key", elapsedMs: Date.now() - startedAt };
  }
  const sb = getServiceSupabase();
  if (!sb) {
    return { ...result, configured: false, reason: "no-db", elapsedMs: Date.now() - startedAt };
  }

  const wanted = (opts.services ?? ALL_SERVICES).filter((s) => ALL_SERVICES.includes(s));
  const { data: syncRows, error: syncErr } = await sb.from("seoul_upis_sync").select("*").in("service", wanted);
  if (syncErr) {
    logger.error("[upis-ingest] sync 상태 조회 실패", syncErr);
  }
  const syncBy = new Map<string, SyncRow>();
  for (const r of (syncRows ?? []) as SyncRow[]) syncBy.set(r.service, r);

  /* 가장 오래 전에 끝까지 읽은 서비스부터(한 번도 못 끝낸 것이 맨 앞) */
  const ordered = [...wanted].sort((a, b) => {
    const fa = syncBy.get(a)?.last_full_at ?? "";
    const fb = syncBy.get(b)?.last_full_at ?? "";
    return fa.localeCompare(fb);
  });

  for (const service of ordered) {
    if (Date.now() - startedAt > budgetMs) {
      result.budgetExhausted = true;
      break;
    }
    const sync = syncBy.get(service);
    const { table, pk } = tableFor(service);
    let start = Math.max(1, sync?.next_start ?? 1);
    let totalCount: number | null = sync?.total_count ?? null;
    let rowsTotal = sync?.rows_total ?? 0;
    const r: UpisServiceResult = { service, fetched: 0, upserted: 0, pages: 0, completed: false, totalCount };
    result.services.push(r);

    try {
      while (true) {
        if (Date.now() - startedAt > budgetMs) {
          result.budgetExhausted = true;
          break;
        }
        const end = start + UPIS_PAGE_SIZE - 1;
        const page = await fetchSeoulOpenApi(service, start, end, [], "json", { timeoutMs: 30_000 });
        r.pages++;
        r.fetched += page.rows.length;
        totalCount = page.totalCount || totalCount;
        r.totalCount = totalCount;

        const recs = toRecords(service, page.rows);
        for (let i = 0; i < recs.length; i += UPSERT_CHUNK) {
          const chunk = recs.slice(i, i + UPSERT_CHUNK);
          const { error } = await sb.from(table).upsert(chunk, { onConflict: pk });
          if (error) throw new Error(`${table} upsert: ${error.message}`);
          r.upserted += chunk.length;
        }
        rowsTotal = start === 1 ? r.upserted : rowsTotal + recs.length;

        const reachedEnd = page.rows.length < UPIS_PAGE_SIZE || (totalCount != null && end >= totalCount);
        if (reachedEnd) {
          r.completed = true;
          await sb.from("seoul_upis_sync").upsert(
            {
              service,
              next_start: 1,
              total_count: totalCount,
              rows_total: rowsTotal,
              last_run_at: new Date().toISOString(),
              last_full_at: new Date().toISOString(),
              last_error: null,
            },
            { onConflict: "service" },
          );
          break;
        }
        start = end + 1;
        await sb.from("seoul_upis_sync").upsert(
          { service, next_start: start, total_count: totalCount, rows_total: rowsTotal, last_run_at: new Date().toISOString(), last_error: null },
          { onConflict: "service" },
        );
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      r.error = message.slice(0, 300);
      logger.error(`[upis-ingest] ${service} 적재 실패`, e);
      await sb
        .from("seoul_upis_sync")
        .upsert({ service, next_start: start, total_count: totalCount, rows_total: rowsTotal, last_run_at: new Date().toISOString(), last_error: r.error }, { onConflict: "service" });
    }
  }

  result.elapsedMs = Date.now() - startedAt;
  return result;
}
