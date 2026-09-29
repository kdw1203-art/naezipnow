/**
 * [1025c · 결정·비서] 관심 단지 30일 줄(/my/assistant) — 순수. 단지 실거래 한 건 단위(lib/complex/hub-price HubDeal:
 * 계약월 ym · 계약일 day · 만원 man · 전용 area · 층 floor) → 마지막 거래 + 최근 30일 새 거래 수 + 스파크 값.
 *
 * 스파크는 30일 안 거래가 **2건 이상**일 때만 값 목록을 낸다(1건·0건은 선이 아니다 — 평평한 가짜 선을 그리지 않는다).
 * 계약일이 없는 행(day null)은 그 달 1일로 본다(창 안에 들어오는 쪽으로 넉넉히 세지 않는다 — 보수적).
 */

export interface DealLike {
  ym: string;
  day: number | null;
  man: number;
  area: number | null;
  floor: number | null;
}

export interface WatchSeries {
  /** 마지막(가장 늦은) 거래 — 없으면 null */
  last: { man: number; ym: string; day: number | null; area: number | null; floor: number | null } | null;
  /** 최근 30일 새 거래 수 */
  count30: number;
  /** 30일 안 거래가 2건 이상일 때 날짜순 만원 값 · 아니면 null */
  spark: number[] | null;
}

export const WATCH_SERIES_DAYS = 30;
const DAY_MS = 86_400_000;

/** 계약월·일 → KST 자정 epoch ms(달·일이 이상하면 NaN) */
export function dealTime(d: Pick<DealLike, "ym" | "day">): number {
  if (!/^\d{6}$/.test(d.ym)) return NaN;
  const day = d.day !== null && Number.isFinite(d.day) && d.day >= 1 && d.day <= 31 ? d.day : 1;
  return Date.parse(`${d.ym.slice(0, 4)}-${d.ym.slice(4)}-${String(day).padStart(2, "0")}T00:00:00+09:00`);
}

export function watchSeriesFromDeals(deals: readonly DealLike[], now: Date = new Date()): WatchSeries {
  const rows = deals
    .map((d) => ({ d, t: dealTime(d) }))
    .filter((x) => Number.isFinite(x.t) && Number.isFinite(x.d.man) && x.d.man > 0)
    .sort((a, b) => a.t - b.t);
  if (rows.length === 0) return { last: null, count30: 0, spark: null };
  const lastRow = rows[rows.length - 1].d;
  const from = now.getTime() - WATCH_SERIES_DAYS * DAY_MS;
  const recent = rows.filter((x) => x.t >= from && x.t <= now.getTime());
  return {
    last: { man: lastRow.man, ym: lastRow.ym, day: lastRow.day, area: lastRow.area, floor: lastRow.floor },
    count30: recent.length,
    spark: recent.length >= 2 ? recent.map((x) => x.d.man) : null,
  };
}

/** "08-29" · 계약일 없으면 "08" */
export function dealDayLabel(d: { ym: string; day: number | null } | null): string {
  if (!d || !/^\d{6}$/.test(d.ym)) return "—";
  const mm = d.ym.slice(4);
  return d.day !== null && d.day >= 1 && d.day <= 31 ? `${mm}-${String(d.day).padStart(2, "0")}` : mm;
}
