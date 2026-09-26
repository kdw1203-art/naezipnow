/**
 * [1007] 지역 스냅샷(REB 시세)이 없을 때의 **실거래 월 집계 폴백** — 순수 규칙.
 *
 * 홈은 이미 "지역 스냅샷 실패 → market_region_monthly 마지막 월 집계" 로 내려간다
 * (lib/newui/home-region-fallback.ts · regionCardsFromMonthly). /analysis 허브 가격 티저도
 * 같은 원천·같은 문턱(거래 10건 미만인 달은 부분 집계라 건너뜀)을 쓴다. 다만 카드가
 * 아니라 "숫자 한 줄 + 캡션" 이라 여기서는 값만 고르고 문구는 호출부가 만든다.
 *
 * 문구 규칙(공통 규칙 "시세 표현은 실거래만 있는 곳에서 금지"): 이 값은 신고 실거래
 * 평균이지 시세가 아니다. 호출부는 "실거래 평균(기준월)" 로 적고 출처를 단다.
 */
import { FALLBACK_MIN_TRADES, type MonthlyRow } from "@/lib/newui/home-region-fallback";

export interface MonthlyAveragePick {
  /** YYYYMM */
  month: string;
  /** 신고 건수 */
  count: number;
  /** 평균 매매가(원) */
  avgWon: number;
}

function numOrUndefined(v: number | string | null | undefined): number | undefined {
  if (v === null || v === undefined) return undefined;
  if (typeof v === "string" && v.trim() === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * 해당 지역 이름의 행 중 **거래 건수가 minTrades 이상인 가장 최근 달** 하나.
 * 입력 순서에 기대지 않는다. 없으면 null(지어내지 않는다).
 */
export function pickLatestMonthlyAverage(
  rows: readonly MonthlyRow[],
  monthlyRegionName: string,
  opts: { minTrades?: number } = {},
): MonthlyAveragePick | null {
  const minTrades = opts.minTrades ?? FALLBACK_MIN_TRADES;
  let best: MonthlyAveragePick | null = null;
  for (const r of rows) {
    if (r.region_name !== monthlyRegionName) continue;
    const month = typeof r.month === "string" ? r.month : "";
    if (!/^\d{6}$/.test(month)) continue;
    const count = numOrUndefined(r.transaction_count);
    if (count === undefined || count < minTrades) continue;
    const avgWon = numOrUndefined(r.avg_deal_amount_krw);
    if (avgWon === undefined || avgWon <= 0) continue;
    if (best && best.month >= month) continue;
    best = { month, count, avgWon };
  }
  return best;
}

/** "202608" → "26.08" — 허브 캡션의 짧은 기준월. 형식이 다르면 null. */
export function shortMonthLabel(month: string | null | undefined): string | null {
  if (!month || !/^\d{6}$/.test(month)) return null;
  return `${month.slice(2, 4)}.${month.slice(4, 6)}`;
}
