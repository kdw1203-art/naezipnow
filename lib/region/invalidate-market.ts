import "server-only";

import { revalidatePath } from "next/cache";
import { getReadOnlySupabase } from "@/lib/newui/supabase-read";
import { getServiceSupabase } from "@/lib/supabase/service";
import { logger } from "@/lib/log";
import {
  invalidatePathList,
  invalidateRegionCodes,
  type InvalidateStats,
} from "@/lib/cache/invalidate";
import { REGION_CATALOG } from "@/lib/region/catalog";
import {
  catalogIdsForTxRegionNames,
  diffRegionFingerprints,
  nationalReportPaths,
  rebSnapshotFingerprint,
  regionReportPaths,
  txPathsForChangedCells,
  type ChangedBandCell,
} from "@/lib/region/changed-region-paths";

/**
 * [1010] 지역·실거래·리포트 축의 "쓰기 지점 비움".
 *
 * ── 왜 ───────────────────────────────────────────────────────────────────
 * 이 축의 ISR TTL 을 6~24시간에서 7일(일부 1일)로 늘린다. 1010 브리프 원칙 1 은
 * "TTL 을 올리는 모든 라우트는 그 화면을 바꾸는 쓰기 지점에서 즉시 비우는 코드가
 * 반드시 함께 있어야 한다" 이다. 고정 경로(/tx · /analysis · /reports)는
 * lib/cache/invalidate.ts 의 SOURCE_MAP.molit 이 이미 비운다. **동적 세그먼트**
 * (/region/[id] · /tx/[region]/… · /reports/[ym] · /region/[id]/report/[ym])는
 * 비우는 코드가 아예 없었다 — 이 파일이 그 자리다.
 *
 * ── 언제 불리나 ──────────────────────────────────────────────────────────
 * 하루 1회 적재·집계 직후. 실제 배선(2026-09-25 기준 스케줄):
 *   · app/api/cron/reb-ingest/route.ts            (Vercel 크론 00:50 UTC, 매일)
 *   · app/api/cron/market-aggregates-refresh/route.ts (집계 MV 수동/관리자 호출)
 *   · app/api/cron/market-temperature-snapshot/route.ts (GH Actions 06:00 UTC, 매일)
 *   · app/api/cron/supply-ingest/route.ts         (GH Actions 06:00 UTC, 새 입주물량이 있을 때만)
 * 실거래 적재 크론(molit-transactions-ingest)에는 손대지 않았다 — 다른 담당자
 * 영역이라, 그쪽에서 불러야 더 정확한 부분은 보고서에 적는다.
 *
 * ── 실패는 삼킨다 ────────────────────────────────────────────────────────
 * 재검증 실패가 수집 결과를 되돌리면 안 된다. 실패하면 경고만 남기고 7일 TTL 이
 * 안전망으로 남는다(lib/cache/invalidate.ts 와 같은 태도).
 */

/**
 * 실거래 변경 조회 창(시간).
 *
 * 왜 48시간인가: 구간 집계(tx_band_landing_source)의 `last_data_at` 은
 * `max(created_at)` 이고, 그 뷰의 원본 MV 는 **DB 안 pg_cron**
 * ('market-aggregates-daily', 09:00·19:00 UTC)이 갱신한다. 앱 크론(00:50 UTC)이
 * 보는 MV 는 전날 19:00 판이므로, 전날 00:40 의 molit 적재까지만 담겨 있다.
 * 24시간 창으로는 그 적재를 놓치고, 36시간이면 겨우 걸친다 — 경계 산수에
 * 기대지 않으려고 48시간으로 둔다. 하루치를 두 번 비우는 손해(그 지역이 하루 더
 * 재생성되는 것)는 있지만, 놓치는 손해(틀린 숫자가 7일 고정)는 없다.
 */
export const TX_CHANGE_LOOKBACK_HOURS = 48;

/** 신고 지연(계약 후 30일)으로 값이 계속 바뀌는 완결 월 수 */
const RECENT_REPORT_MONTHS = 3;

export type MarketInvalidateSummary = {
  /** 실거래가 바뀐 지역 수(카탈로그 id 기준) */
  changedRegions: number;
  /** 비운 /tx 경로 수 */
  txPaths: number;
  /** 비운 /region · /embed/region 경로 수 */
  regionPaths: number;
  /** 비운 리포트 경로 수 */
  reportPaths: number;
  /** 조회 실패 사유(있으면) — 실패해도 호출부를 죽이지 않는다 */
  error?: string;
};

type LandingRow = {
  region_name: string | null;
  band_kind: string | null;
  band_key: string | null;
};

/**
 * 최근 `hours` 시간 안에 새 실거래가 들어온 구간 셀.
 *
 * 집계 뷰(1,723행 실측 2026-07-26)를 조건 하나로 읽는다 — market_transactions
 * (708,720행)를 직접 훑지 않는다. 그쪽은 anon statement_timeout(3초)에 걸린다.
 */
async function listChangedBandCells(hours: number): Promise<ChangedBandCell[]> {
  const sb = getReadOnlySupabase();
  if (!sb) throw new Error("tx_band_landing_source 를 읽을 수단이 없습니다");
  const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
  const { data, error } = await sb
    .from("tx_band_landing_source")
    .select("region_name, band_kind, band_key")
    .gte("last_data_at", cutoff)
    /* 전량이 1,723행이라 상한은 사실상 닿지 않는다. 그래도 적어 두는 이유는
       조용한 절단을 남기지 않기 위해서다(lib/market/tx-bands.ts 의 교훈). */
    .limit(4000);
  if (error) {
    throw new Error(
      `tx_band_landing_source 변경분 조회 실패 — ${error.message}` +
        `${error.code ? ` [${error.code}]` : ""}`,
    );
  }
  const rows = (data ?? []) as LandingRow[];
  return rows.map((r) => ({
    regionName: r.region_name ?? "",
    bandKind: r.band_kind ?? "",
    bandKey: r.band_key ?? "",
  }));
}

/**
 * 실거래가 바뀐 지역만 비운다 — /tx/{지역}, /tx/{지역}/{축}/{구간},
 * /region/{id}, /embed/region/{id}, /region/{id}/report(+최근 완결 월).
 *
 * 하루 1회 적재 직후에만 부른다. 예산(각 호출 800)을 넘기면 남은 경로는 7일 TTL 이 받는다.
 */
export async function invalidateChangedMarketRegions(
  opts: { lookbackHours?: number } = {},
): Promise<MarketInvalidateSummary> {
  const summary: MarketInvalidateSummary = {
    changedRegions: 0,
    txPaths: 0,
    regionPaths: 0,
    reportPaths: 0,
  };
  let cells: ChangedBandCell[];
  try {
    cells = await listChangedBandCells(opts.lookbackHours ?? TX_CHANGE_LOOKBACK_HOURS);
  } catch (e) {
    /* 조회 실패를 "바뀐 게 없다" 로 바꾸지 않는다 — 사유를 그대로 올려서
       호출부 응답에 남긴다(lib/market/tx-bands.ts 가 42501 을 하루 동안
       "데이터 없음" 으로 위장했던 사고와 같은 규칙). */
    summary.error = e instanceof Error ? e.message : String(e);
    logger.warn("[invalidate-market] 실거래 변경분 조회 실패", summary.error);
    return summary;
  }

  if (cells.length === 0) return summary;

  const txPaths = txPathsForChangedCells(cells);
  summary.txPaths = invalidatePathList(txPaths, { label: "tx-region" }).revalidated;

  const regionIds = catalogIdsForTxRegionNames(cells.map((c) => c.regionName));
  summary.changedRegions = regionIds.length;
  if (regionIds.length > 0) {
    summary.regionPaths = invalidateRegionCodes(regionIds).revalidated;
    summary.reportPaths = invalidatePathList(
      regionReportPaths(regionIds, RECENT_REPORT_MONTHS),
      { label: "region-report" },
    ).revalidated;
  }
  return summary;
}

/**
 * 한국부동산원(REB) 스냅샷 지문 — region_id → 지문.
 *
 * /region/[id] 머리의 큰 숫자(㎡당 매매가·평균·중위·전세가율·전월비·거래건수)와
 * 기준월이 여기서 온다. 적재 **전후**로 떠서 값이 달라진 지역만 비운다.
 */
export async function readRebRegionFingerprints(): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const sb = getServiceSupabase();
  if (!sb) return out;
  const { data, error } = await sb
    .from("market_region_price")
    .select("region_id, period, per_m2_sale, avg_sale, median_sale, jeonse_ratio, sale_change, trade_count")
    .eq("source", "reb")
    /* 실측 103행(카탈로그 전량) — 상한은 안전장치일 뿐이다 */
    .limit(2000);
  if (error) {
    logger.warn("[invalidate-market] REB 스냅샷 지문 조회 실패(무시)", error.message);
    return out;
  }
  type RebPriceRow = {
    region_id?: string | null;
    period?: string | null;
    per_m2_sale?: number | string | null;
    avg_sale?: number | string | null;
    median_sale?: number | string | null;
    jeonse_ratio?: number | string | null;
    sale_change?: number | string | null;
    trade_count?: number | string | null;
  };
  for (const row of (data ?? []) as RebPriceRow[]) {
    const id = typeof row.region_id === "string" ? row.region_id.trim() : "";
    if (!id) continue;
    out.set(id, rebSnapshotFingerprint(row));
  }
  return out;
}

/**
 * REB 적재 전후 지문이 달라진 지역만 비운다.
 * 부동산원 공표가 없던 날은 0곳이다 — 그날은 아무것도 재생성하지 않는다.
 */
export function invalidateRebChangedRegions(
  before: ReadonlyMap<string, string>,
  after: ReadonlyMap<string, string>,
): { changed: number; paths: number } {
  const changed = diffRegionFingerprints(before, after);
  if (changed.length === 0) return { changed: 0, paths: 0 };
  const stats = invalidateRegionCodes(changed);
  return { changed: changed.length, paths: stats.revalidated };
}

/**
 * 동적 세그먼트가 아닌데 SOURCE_MAP 이 아직 비우지 않는 집계 화면들.
 *
 * lib/cache/invalidate.ts 의 SOURCE_MAP.molit 은 `/ · /analysis · /analysis/accuracy ·
 * /analysis/price · /analysis/gap · /analysis/temperature · /tx · /map ·
 * /data/records · /reports` 를 비운다. 그 목록에 없지만 같은 원천(실거래·집계)으로
 * 그려지는 화면이 아래다. 그 파일은 이번 작업에서 수정 금지(통합자 소유)라
 * 여기서 대신 부른다 — 통합자가 SOURCE_MAP 에 합치면 이 함수는 지워도 된다.
 *
 * `revalidatePath(route, "page")` 는 그 라우트의 **모든** 경로를 비운다. 여기 있는
 * 것은 경로 수가 적어(도구 12개 · 지역 온도 62곳 · 계절 4개) 라우트 전체 비움이
 * 셀 단위로 고르는 것보다 싸다. /tx 구간(1,403개)에 같은 방법을 쓰지 않는 이유는
 * lib/region/changed-region-paths.ts txPathsForChangedCells 주석에 적어 두었다.
 */
export function invalidateMarketAnalysisRoutes(): InvalidateStats {
  const paths = [
    /* 실거래 집계로 그리는 분석 화면 중 SOURCE_MAP 에 없는 것 */
    "/analysis/scenario",
    "/analysis/timing",
    /* 전국 월간 리포트 — 신고 지연이 계속 값을 바꾸는 최근 완결 월만 */
    ...nationalReportPaths(RECENT_REPORT_MONTHS),
  ];
  const stats = invalidatePathList(paths, { label: "market-analysis" });
  /* 동적 세그먼트는 라우트 전체 비움. 실패는 삼킨다(요청 밖 호출에서 던질 수 있다). */
  for (const route of ["/analysis/ai/[tool]", "/reports/season/[slug]"]) {
    try {
      revalidatePath(route, "page");
    } catch (e) {
      logger.warn("[invalidate-market] 라우트 재검증 실패(무시)", route, e);
    }
  }
  return stats;
}

/**
 * 지역 페이지 전부(/region/{id} · /embed/region/{id}) 비움 — 카탈로그 103곳.
 *
 * "어느 지역이 바뀌었는지" 를 원천이 알려주지 않을 때만 쓴다. 지금 호출부는
 * 입주물량 적재 하나이고, 거기서도 **새 공고가 실제로 들어온 날에만** 부른다
 * (청약홈 분양공고는 하루 0~몇 건이다). 매일 무조건 부르면 TTL 을 7일로 늘린
 * 효과가 사라지므로, 호출부에서 조건 없이 부르지 말 것.
 */
export function invalidateAllRegionPages(): InvalidateStats {
  return invalidateRegionCodes(REGION_CATALOG.map((r) => r.id));
}

/** 시장 온도 스냅샷 직후 — 지역별 온도 상세(62곳)는 동적 세그먼트라 라우트 전체로 비운다. */
export function invalidateTemperatureRegions(): void {
  try {
    revalidatePath("/analysis/temperature/[region]", "page");
    revalidatePath("/analysis/temperature");
  } catch (e) {
    logger.warn("[invalidate-market] 온도 지역 재검증 실패(무시)", e);
  }
}
