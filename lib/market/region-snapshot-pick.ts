/**
 * [1007] 지역 시세 스냅샷 — 같은 지역의 여러 출처 행 중 **어느 행을 쓸지** 고르는 순수 규칙.
 *
 * ── 왜 (실측 2026-09-20) ────────────────────────────────────────────────
 * market_region_price 의 서울 25개 구 REB 행이 period='' · per_m2_sale=null 인 채로 매일
 * 덮어써졌는데(원인·수정은 lib/reb/price-rows.ts), getRegionSnapshot / getAllRegionSnapshots
 * 는 **출처 우선순위(reb > kb > crawl)만** 보고 값이 있는지는 안 봤다. 그래서 같은 지역에
 * kb 행이 멀쩡히 있어도 빈 reb 행이 이겼고, /analysis 허브 티저는 "스냅샷 없음" 을 매
 * 요청 던졌다(unstable_cache 가 실패를 저장하지 않아 요청마다 DB 조회 + 오류 로그).
 *
 * 규칙: 값이 있는 행(per_m2_sale 또는 avg_sale) > 값이 없는 행 · 같으면 출처 순(reb>kb>crawl).
 * 빈 행만 있으면 그중 출처 순으로 하나를 돌려준다 — "없다" 로 위장하지 않고, 호출부가
 * perM2Sale 유무로 판단할 수 있게 한다(예전과 같은 계약).
 *
 * store.ts 는 server-only(supabase 서비스 클라이언트) 라 node:test 가 못 부른다 — 규칙은 여기.
 */
import type { MarketSource, RegionMarketSnapshot } from "./types";

/** market_region_price 에서 읽는 열(PostgREST 행). 숫자 열은 null 로 올 수 있다. */
export interface RegionPriceDbRow {
  source: string;
  region_id: string;
  region_name: string;
  period: string | null;
  per_m2_sale: number | null;
  avg_sale: number | null;
  median_sale: number | null;
  jeonse_ratio: number | null;
  sale_change: number | null;
  trade_count: number | null;
  buy_superiority: number | null;
  jeonse_supply: number | null;
}

const SOURCE_PRIORITY: Record<string, number> = { reb: 2, kb: 1, crawl: 0 };

export function sourcePriority(source: string): number {
  return SOURCE_PRIORITY[source] ?? 0;
}

function isPositiveNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v) && v > 0;
}

/** "값이 있는 행" — ㎡당 매매가 또는 평균 매매가가 양수. */
export function snapshotRowHasValue(row: Pick<RegionPriceDbRow, "per_m2_sale" | "avg_sale">): boolean {
  return isPositiveNumber(row.per_m2_sale) || isPositiveNumber(row.avg_sale);
}

/** 두 행 중 나은 쪽이 a 면 true. 값 유무 → 출처 순. 둘 다 같으면 먼저 온 쪽(a)을 지킨다. */
export function isBetterSnapshotRow(a: RegionPriceDbRow, b: RegionPriceDbRow): boolean {
  const av = snapshotRowHasValue(a);
  const bv = snapshotRowHasValue(b);
  if (av !== bv) return av;
  return sourcePriority(a.source) >= sourcePriority(b.source);
}

/** 같은 지역의 후보 행들 중 하나. 빈 배열이면 null. */
export function pickBestSnapshotRow(rows: readonly RegionPriceDbRow[]): RegionPriceDbRow | null {
  let best: RegionPriceDbRow | null = null;
  for (const row of rows) {
    if (!best || !isBetterSnapshotRow(best, row)) best = row;
  }
  return best;
}

export function snapshotFromRow(row: RegionPriceDbRow): RegionMarketSnapshot {
  return {
    regionId: String(row.region_id),
    regionName: String(row.region_name),
    source: String(row.source) as MarketSource,
    period: String(row.period ?? ""),
    perM2Sale: row.per_m2_sale ?? undefined,
    avgSale: row.avg_sale ?? undefined,
    medianSale: row.median_sale ?? undefined,
    jeonseRatio: row.jeonse_ratio ?? undefined,
    saleChangeMonthly: row.sale_change ?? undefined,
    tradeCount: row.trade_count ?? undefined,
    buySuperiority: row.buy_superiority ?? undefined,
    jeonseSupply: row.jeonse_supply ?? undefined,
  };
}

/**
 * 전 지역 행 → region_id 별 최선의 스냅샷 맵. 입력 순서에 기대지 않는다
 * (같은 지역의 reb/kb 행이 어떤 순서로 와도 결과가 같다).
 */
export function pickBestSnapshotMap(rows: readonly RegionPriceDbRow[]): Map<string, RegionMarketSnapshot> {
  const bestRow = new Map<string, RegionPriceDbRow>();
  for (const row of rows) {
    const id = String(row.region_id);
    const cur = bestRow.get(id);
    if (!cur || !isBetterSnapshotRow(cur, row)) bestRow.set(id, row);
  }
  const map = new Map<string, RegionMarketSnapshot>();
  for (const [id, row] of bestRow) map.set(id, snapshotFromRow(row));
  return map;
}
