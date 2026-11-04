/** KOSIS Open API → market_region_series 적재 (보조지표). */
import { upsertSeries, logIngest } from "@/lib/market/store";
import type { MarketSeriesRow } from "@/lib/market/types";
import { KOSIS_TABLES } from "./stat-tables";
import { fetchKosisTable, isKosisConfigured } from "./client";
import {
  kosisIngestMessage,
  kosisIngestStatus,
  kosisPeriodToDate,
  type KosisTableOutcome,
} from "./parse";

export interface KosisIngestResult {
  ok: boolean;
  skipped?: boolean;
  seriesRows: number;
  byTable: Record<string, number>;
  /** [1104] 표별 응답 수 · 매핑 수 · KOSIS 오류 코드 */
  outcomes?: KosisTableOutcome[];
  message?: string;
}

export async function ingestKosis(
  opts: { recentCount?: number } = {},
): Promise<KosisIngestResult> {
  if (!isKosisConfigured()) {
    await logIngest({ source: "kosis", dataset: "all", origin: "api", rows: 0, status: "skipped", message: "KOSIS_API_KEY 미설정" });
    return { ok: false, skipped: true, seriesRows: 0, byTable: {} };
  }

  const allSeries: MarketSeriesRow[] = [];
  const byTable: Record<string, number> = {};
  const outcomes: KosisTableOutcome[] = [];

  for (const table of KOSIS_TABLES) {
    // [1104] fetchKosisTable 은 던지지 않고 실패 코드를 돌려준다 — 예전엔 실패가 "0건"으로 묻혔다
    const r = await fetchKosisTable(table, opts);
    byTable[table.label] = r.rows.length;
    outcomes.push({ label: table.label, received: r.received, matched: r.rows.length, unmatched: r.unmatched, error: r.error });
    for (const row of r.rows) {
      allSeries.push({
        source: "kosis",
        regionId: row.region.id,
        regionName: row.region.name,
        // [1104] 시도 표(인허가 · 착공 · 보급률)는 시도 단위로 — 시군구에 붙이지 않는다
        level: row.region.level,
        propertyType: "apt", // 지역 단위 보조지표 — property_type 은 중립 placeholder
        metric: table.metric,
        periodType: "monthly", // 시계열 저장은 monthly로 통일(연간=1월1일)
        period: kosisPeriodToDate(row.period),
        value: row.value,
      });
    }
  }

  const seriesRows = await upsertSeries(allSeries);
  const status = kosisIngestStatus(seriesRows, outcomes);
  const message = kosisIngestMessage(seriesRows, outcomes);
  await logIngest({
    source: "kosis",
    dataset: "인구·세대·미분양·주택보급률",
    origin: "api",
    rows: seriesRows,
    status,
    message,
  });

  return {
    ok: seriesRows > 0,
    seriesRows,
    byTable,
    outcomes,
    message,
  };
}
