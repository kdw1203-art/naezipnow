/**
 * [1007] R-ONE 적재의 가격 스냅샷 행 구성 — 순수 함수(서버 전용 import 없음, 테스트 대상).
 *
 * ── 왜 따로 뗐나 ──────────────────────────────────────────────────────────
 * ingest.ts 는 `@/lib/market/store`(supabase 서비스 클라이언트) 를 끌고 와서 node:test 가
 * 부르지 못한다. 행을 어떻게 만들고 **무엇을 버리는지**는 순수 규칙이라 여기 둔다.
 *
 * ── 실측(2026-09-20) ──────────────────────────────────────────────────────
 * market_region_price 의 REB 행 중 서울 25개 구가 전부 period='' · per_m2_sale=null 이었고
 * 매일 다시 덮어써졌다. 원인은 둘이 겹친 것이다.
 *   1) 지역 매핑이 동향조사 표의 4단 표기("서울>강북지역>도심권>종로구")를 못 풀어(→
 *      lib/market/region-code.ts [1007]) 가격·지수 행이 서울 구에 하나도 안 붙었고,
 *   2) 그런데 거래현황 표("서울>종로구")는 붙어서 regionIds 에 서울 구가 들어갔고, 예전
 *      코드는 **값이 하나도 없는 지역도** upsert 했다 — 정상이던 서울 행을 빈 행으로 덮었다.
 * 1) 을 고쳐도 2) 가 남아 있으면 다음번 표 하나가 어긋날 때 같은 일이 되풀이된다.
 * 그래서 "가격·지수 값이 전부 없고 period 도 빈 행" 은 만들지 않는다 — 없는 값은 기존
 * 정상 행을 덮지 않고 그대로 둔다(upsert 는 행 단위라 안 보내면 안 바뀐다).
 */
import type { MarketRegionPriceRow } from "@/lib/market/types";

export interface PriceAccEntry {
  regionName: string;
  /** 원자료 기간 식별자(YYYYMM) — 가격 표의 최신 월 */
  period: string;
  perM2Sale?: number;
  avgSale?: number;
  medianSale?: number;
  avgJeonse?: number;
}

export interface MonthlyPoint {
  /** YYYYMM */
  period: string;
  value: number;
}

export interface BuildPriceRowsInput {
  /** regionId → 가격 표(㎡당·평균·중위·전세) 최신 월 값 */
  priceAcc: ReadonlyMap<string, PriceAccEntry>;
  /** `${regionId}|${metric}` → 월간 지표 점들(순서 무관) */
  monthlyByKey: ReadonlyMap<string, readonly MonthlyPoint[]>;
  /** regionId → 표기(시계열에서 본 이름). 가격 표에 이름이 없을 때의 대안 */
  regionNames: ReadonlyMap<string, string>;
}

export interface BuildPriceRowsResult {
  rows: MarketRegionPriceRow[];
  /** 값이 하나도 없어 버린 지역 id — 로그용 */
  skipped: string[];
}

function sortedByPeriod(points: readonly MonthlyPoint[]): MonthlyPoint[] {
  return [...points].sort((a, b) => a.period.localeCompare(b.period));
}

function latestMonthly(
  monthlyByKey: ReadonlyMap<string, readonly MonthlyPoint[]>,
  regionId: string,
  metric: string,
): number | undefined {
  const arr = monthlyByKey.get(`${regionId}|${metric}`);
  if (!arr || arr.length === 0) return undefined;
  return sortedByPeriod(arr)[arr.length - 1]?.value;
}

function latestMonthlyPeriod(
  monthlyByKey: ReadonlyMap<string, readonly MonthlyPoint[]>,
  regionId: string,
  metric: string,
): string | undefined {
  const arr = monthlyByKey.get(`${regionId}|${metric}`);
  if (!arr || arr.length === 0) return undefined;
  return sortedByPeriod(arr)[arr.length - 1]?.period;
}

/** 최신 월 매매지수의 전월 대비 변동률(%, 소수 둘째 자리). 점이 2개 미만이면 undefined. */
function monthlyChange(
  monthlyByKey: ReadonlyMap<string, readonly MonthlyPoint[]>,
  regionId: string,
): number | undefined {
  const arr = monthlyByKey.get(`${regionId}|sale_index`);
  if (!arr || arr.length < 2) return undefined;
  const sorted = sortedByPeriod(arr);
  const cur = sorted[sorted.length - 1].value;
  const prev = sorted[sorted.length - 2].value;
  if (!prev) return undefined;
  return Math.round(((cur - prev) / prev) * 10000) / 100;
}

/**
 * "빈 스냅샷" 판정 — 가격(㎡당·평균·중위·전세) 과 지수 파생값(변동률) 이 전부 없고
 * period 까지 비어 있으면 참. 거래건수·수급·전세가율만 있는 행은 여기서 걸린다:
 * 그 값들은 시계열(market_region_series)에 이미 따로 적재돼 있고, 스냅샷 표의 존재
 * 이유는 "지금 얼마인가" 라서 가격 없는 스냅샷은 정상 행을 덮을 자격이 없다.
 */
export function isEmptyRegionPriceRow(row: MarketRegionPriceRow): boolean {
  const hasPrice =
    typeof row.perM2Sale === "number" ||
    typeof row.avgSale === "number" ||
    typeof row.medianSale === "number" ||
    typeof row.avgJeonse === "number" ||
    typeof row.saleChange === "number";
  return !hasPrice && !row.period;
}

export function buildRegionPriceRows(input: BuildPriceRowsInput): BuildPriceRowsResult {
  const { priceAcc, monthlyByKey, regionNames } = input;
  const regionIds = new Set<string>([...priceAcc.keys()]);
  for (const key of monthlyByKey.keys()) regionIds.add(key.split("|")[0]);

  const rows: MarketRegionPriceRow[] = [];
  const skipped: string[] = [];
  for (const regionId of regionIds) {
    const price = priceAcc.get(regionId);
    /* 기간은 가격 표의 월이 먼저고, 없으면 매매지수의 최신 월. 예전 코드는 지수 배열을
       정렬하지 않고 마지막 원소를 썼다 — 응답 순서에 기대는 것이라 여기서는 정렬해 고른다. */
    const period = price?.period ?? latestMonthlyPeriod(monthlyByKey, regionId, "sale_index") ?? "";
    const regionName = price?.regionName ?? regionNames.get(regionId) ?? regionId;
    const row: MarketRegionPriceRow = {
      source: "reb",
      regionId,
      regionName,
      propertyType: "apt",
      period,
      perM2Sale: price?.perM2Sale,
      avgSale: price?.avgSale,
      medianSale: price?.medianSale,
      avgJeonse: price?.avgJeonse,
      jeonseRatio: latestMonthly(monthlyByKey, regionId, "jeonse_ratio"),
      saleChange: monthlyChange(monthlyByKey, regionId),
      tradeCount: latestMonthly(monthlyByKey, regionId, "trade_count"),
      buySuperiority: latestMonthly(monthlyByKey, regionId, "buy_superiority"),
      jeonseSupply: latestMonthly(monthlyByKey, regionId, "jeonse_supply"),
    };
    if (isEmptyRegionPriceRow(row)) {
      skipped.push(regionId);
      continue;
    }
    rows.push(row);
  }
  return { rows, skipped };
}
