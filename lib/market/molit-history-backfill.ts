/**
 * [1024] 수도권 아파트 실거래 **이력 백필** — 2025-12 부터 달을 거꾸로 돌며 빈 (시군구, 계약월)만 채운다.
 *
 * 실측(2026-09-28): market_transactions 는 계약월 2026-01~09 뿐이다. 단지 상세의 3년·5년 기간 칩이
 * 비어 있는 이유가 이것이다. 국토부 API 는 과거 월을 그대로 돌려주므로, 수도권(서울 11·경기 41·인천 28)
 * 시군구 ≈80곳 × 60개월을 하루 40곳씩 채우면 넉 달 안에 2021-01 까지 닿는다.
 *
 * 규칙
 *  · 대상 시군구 = listCapitalSigungu() ∩ lawd_region_map(실거래가 이미 있는 코드) — map 을 못 읽으면 정적 목록.
 *  · (구, 월, 아파트) 에 행이 0 인 조합만(findCoverageGaps) — 이미 있는 달은 건드리지 않는다(이중 계상 없음).
 *  · raw 미저장(keepRaw:false) — 해제 판정은 적재 시 계산돼 is_cancelled 에 남는다.
 *  · 커서(public_data_cache) 는 "지금 보는 달" 하나. 넘길지 여부는 shouldAdvanceMonth(순수) 가 정한다.
 *  · 상한: 1회 40곳(HISTORY_MAX_REGIONS_PER_RUN) · 3개월 · 유형·구당 3페이지(1,000행 × 3).
 */
import { getServiceSupabase } from "@/lib/supabase/service";
import type { SigunguInfo } from "@/lib/national-data/region-codes";
import { ingestMolitTransactions, listCapitalSigungu, type MolitIngestResult } from "@/lib/market/molit-transactions";
import {
  HISTORY_BACKFILL_FLOOR_YM,
  HISTORY_BACKFILL_START_YM,
  HISTORY_CURSOR_KEY,
  HISTORY_MAX_MONTHS_PER_RUN,
  HISTORY_MAX_REGIONS_PER_RUN,
  isBackfillDone,
  isYm,
  shiftYm,
  shouldAdvanceMonth,
  type HistoryCursor,
} from "@/lib/market/molit-core";
import { readCursor, writeCursor } from "@/lib/market/molit-cursor";
import { logIngest } from "@/lib/market/store";
import { logger } from "@/lib/log";

export interface HistoryBackfillResult {
  ok: boolean;
  configured: boolean;
  /** 시작 커서 월 · 끝난 뒤 커서 월 */
  fromYm: string;
  cursorYm: string;
  done: boolean;
  candidates: number;
  months: { ym: string; attempted: number; inserted: number; empty: number; errors: number; advanced: boolean }[];
  attempted: number;
  inserted: number;
  errors: number;
  /** 이번 실행이 적재한 단지(무효화용) — 각 달의 touchedComplexes 를 이어 붙인다 */
  touchedComplexes: { region: string; name: string }[];
  reason?: string;
}

/**
 * 수도권 후보 — 정적 목록 ∩ lawd_region_map. map 은 "실거래가 이미 들어온 코드"라 legal_regions FK 위반이 없다.
 * 읽기에 실패하면 정적 목록으로 간다(둘 다 같은 수도권 집합이고, FK 는 전국 시드로 채워져 있다).
 */
export async function loadCapitalCandidates(): Promise<{ list: SigunguInfo[]; source: "map" | "static" }> {
  const all = listCapitalSigungu();
  const sb = getServiceSupabase();
  if (!sb) return { list: all, source: "static" };
  const { data, error } = await sb.from("lawd_region_map").select("region_code");
  if (error || !data?.length) {
    if (error) logger.warn("[molit-history] lawd_region_map 읽기 실패 — 정적 수도권 목록으로", error.message);
    return { list: all, source: "static" };
  }
  const known = new Set((data as { region_code: string }[]).map((r) => r.region_code));
  const list = all.filter((i) => known.has(i.sigunguCd));
  return { list: list.length > 0 ? list : all, source: list.length > 0 ? "map" : "static" };
}

export async function backfillMolitHistory(opts: {
  /** 커서 대신 이 달부터(수동 재시작) */
  ym?: string;
  maxRegions?: number;
  maxMonths?: number;
  now?: Date;
} = {}): Promise<HistoryBackfillResult> {
  const now = opts.now ?? new Date();
  const maxRegions = Math.max(1, Math.min(60, opts.maxRegions ?? HISTORY_MAX_REGIONS_PER_RUN));
  const maxMonths = Math.max(1, Math.min(12, opts.maxMonths ?? HISTORY_MAX_MONTHS_PER_RUN));

  const cursor = await readCursor<HistoryCursor>(HISTORY_CURSOR_KEY);
  const startYm = isYm(opts.ym) ? opts.ym : isYm(cursor?.ym) ? cursor.ym : HISTORY_BACKFILL_START_YM;

  const result: HistoryBackfillResult = {
    ok: true,
    configured: true,
    fromYm: startYm,
    cursorYm: startYm,
    done: false,
    candidates: 0,
    months: [],
    attempted: 0,
    inserted: 0,
    errors: 0,
    touchedComplexes: [],
  };

  if (!getServiceSupabase()) {
    return { ...result, ok: false, configured: false, reason: "Supabase 미설정" };
  }
  if (isBackfillDone(startYm)) {
    result.done = true;
    result.reason = `하한 ${HISTORY_BACKFILL_FLOOR_YM} 까지 완료 — 더 받을 달이 없습니다`;
    await logIngest({
      source: "molit",
      dataset: "아파트 실거래 이력 백필(수도권)",
      origin: "cron-fetch",
      rows: 0,
      status: "skipped",
      message: result.reason,
    });
    return result;
  }

  const { list: candidates, source } = await loadCapitalCandidates();
  result.candidates = candidates.length;
  const codes = candidates.map((c) => c.sigunguCd);

  let ym = startYm;
  let regionsLeft = maxRegions;
  let monthsSeen = 0;
  let stopReason: string | undefined;

  while (monthsSeen < maxMonths && regionsLeft > 0 && !isBackfillDone(ym)) {
    const limit = regionsLeft;
    const r: MolitIngestResult = await ingestMolitTransactions({
      yyyymm: ym,
      codes,
      gapsFirst: true,
      sliceSize: limit,
      keepRaw: false,
      types: ["apartment"],
      maxPages: 3,
      now,
    });
    monthsSeen += 1;
    result.attempted += r.attempted;
    result.inserted += r.inserted;
    result.errors += r.errors;
    result.touchedComplexes.push(...r.touchedComplexes);
    regionsLeft -= r.attempted;
    if (!r.configured) result.configured = false;

    const advanced = shouldAdvanceMonth({
      configured: r.configured,
      aborted: r.aborted,
      errors: r.errors,
      attempted: r.attempted,
      inserted: r.inserted,
      limit,
    });
    result.months.push({
      ym,
      attempted: r.attempted,
      inserted: r.inserted,
      empty: r.empty,
      errors: r.errors,
      advanced,
    });
    if (!advanced) {
      if (!r.configured) stopReason = "MOLIT 인증키 미설정 또는 API 응답 없음 — 커서를 넘기지 않음";
      else if (r.aborted || r.errors > 0) stopReason = r.reason ?? `오류 ${r.errors}건 — 같은 달을 다음 실행이 다시 봄`;
      /* 상한만큼 봤고 오류가 없다 = 이 달에 빈 곳이 더 있을 수 있다 → 커서는 그대로, 다음 실행이 이어서 */
      break;
    }
    ym = shiftYm(ym, -1);
  }

  result.cursorYm = ym;
  result.done = isBackfillDone(ym);
  result.ok = result.errors === 0 && result.configured;
  if (stopReason) result.reason = stopReason;

  /* 커서는 "넘겼을 때만" 바뀐다(위 루프). 키가 없어 한 건도 못 받은 실행이 커서를 앞당기면 그 달은 영영 빈다. */
  if (ym !== startYm || result.done) {
    await writeCursor(HISTORY_CURSOR_KEY, {
      ym,
      updatedAt: now.toISOString(),
      ...(result.done ? { done: true } : {}),
    } satisfies HistoryCursor);
  }

  await logIngest({
    source: "molit",
    dataset: "아파트 실거래 이력 백필(수도권)",
    origin: "cron-fetch",
    rows: result.inserted,
    status: !result.configured ? "skipped" : result.errors > 0 ? "error" : result.inserted > 0 ? "ok" : "skipped",
    message:
      `커서 ${startYm}→${ym}${result.done ? "(완료)" : ""} 후보=${candidates.length}(${source}) ` +
      `달=${result.months.map((m) => `${m.ym}:시도${m.attempted}/적재${m.inserted}${m.advanced ? "/넘김" : ""}`).join(" ")} ` +
      `시도=${result.attempted} 적재=${result.inserted} 오류=${result.errors} raw=미저장` +
      (stopReason ? ` — ${stopReason.slice(0, 200)}` : ""),
  });

  return result;
}
