/**
 * [1024] 단지 상세 v2 — 순수 계산(서버·테스트 공용, DOM·DB 없음).
 *
 * 시안(mock1024/complex-d.html)의 섹션마다 "무엇을 어떤 규칙으로 보여 주는가"를 한 곳에 둔다:
 *   · 개요 스트립 8칸(세대·동·준공·주차/세대·승강기·난방·건설사·관리) — 값이 없으면 "—"(지어내지 않는다)
 *   · 타입 탭 — 전용면적 정수 ㎡(tx-extremes areaTypeKey 와 같은 규칙)로 묶어 거래 많은 순 최대 4개
 *   · 월 중앙값 시계열 — 달력으로 이은 달(거래 없는 달은 null), 그 달 거래 수 동봉
 *   · 기간 칩 — 1년은 언제나, 3년·5년·전체는 **데이터가 가진 개월 수**로 켜고 끈다(없는 기간은 "YYYY-MM 부터")
 *   · 갭 — 매매 중앙값 − 전세 중앙값(둘 다 있을 때만)
 *   · 최근 실거래 표 — 타입별 신고가 배지·해제 취소선
 *
 * 값은 전부 만원 정수(HubDeal.man) — 억·만 표기는 화면 부품이 formatEokMan 으로 한다.
 */
import type { HubDeal } from "@/lib/complex/hub-price";
import { areaTypeKey, extremesByType, type TxExtremes } from "@/lib/market/tx-extremes";

/* ── 개요 스트립 ─────────────────────────────────────────────────────── */

export interface OverviewStripSource {
  households: number | null;
  building_count: number | null;
  build_year: number | null;
  parking_per_hh: number | null;
  elevator_count?: number | null;
  heating: string | null;
  builder_name: string | null;
  manage_type?: string | null;
}

export interface OverviewCell {
  key: string;
  label: string;
  /** 없으면 "—" */
  value: string;
  /** 숫자 칸(tabular-nums) */
  num: boolean;
  /** [1028] 이름표 옆 곁말 — 준공 칸의 입주 연차("11년차") */
  note?: string;
}

export const OVERVIEW_EMPTY = "—";

/** 시안 8칸 순서 그대로 — 값이 없어도 칸은 남는다(스트립은 고정 격자) */
/** [1028] 입주 연차 — 준공 해를 1년차로 센다(2016년 준공 → 2026년에 11년차). 준공 해가 올해보다 뒤면 null */
export function builtYearsLabel(buildYear: number | null | undefined, nowYear: number): string | null {
  if (typeof buildYear !== "number" || !Number.isFinite(buildYear) || buildYear < 1900) return null;
  if (!Number.isFinite(nowYear) || buildYear > nowYear) return null;
  return `${nowYear - buildYear + 1}년차`;
}

export function overviewStripCells(row: OverviewStripSource, opts?: { nowYear?: number }): OverviewCell[] {
  const pos = (n: number | null | undefined) => (typeof n === "number" && Number.isFinite(n) && n > 0 ? n : null);
  const text = (s: string | null | undefined) => (typeof s === "string" && s.trim() ? s.trim() : null);
  const hh = pos(row.households);
  const dong = pos(row.building_count);
  const year = pos(row.build_year);
  const parking = typeof row.parking_per_hh === "number" && Number.isFinite(row.parking_per_hh) && row.parking_per_hh > 0 ? row.parking_per_hh : null;
  const elev = pos(row.elevator_count);
  return [
    { key: "households", label: "세대", value: hh ? hh.toLocaleString("ko-KR") : OVERVIEW_EMPTY, num: true },
    { key: "buildings", label: "동", value: dong ? dong.toLocaleString("ko-KR") : OVERVIEW_EMPTY, num: true },
    {
      key: "buildYear",
      label: "준공",
      value: year ? String(year) : OVERVIEW_EMPTY,
      num: true,
      /* [1028] 연차는 올해를 받았을 때만(화면이 한국 시간의 올해를 넘긴다 — 여기서 시계를 읽지 않는다) */
      ...(year && opts?.nowYear ? (builtYearsLabel(year, opts.nowYear) ? { note: builtYearsLabel(year, opts.nowYear)! } : {}) : {}),
    },
    { key: "parking", label: "주차/세대", value: parking ? parking.toFixed(2) : OVERVIEW_EMPTY, num: true },
    { key: "elevator", label: "승강기", value: elev ? elev.toLocaleString("ko-KR") : OVERVIEW_EMPTY, num: true },
    { key: "heating", label: "난방", value: text(row.heating) ?? OVERVIEW_EMPTY, num: false },
    { key: "builder", label: "건설사", value: text(row.builder_name) ?? OVERVIEW_EMPTY, num: false },
    { key: "manage", label: "관리", value: text(row.manage_type) ?? OVERVIEW_EMPTY, num: false },
  ];
}

/* ── 달 산술 ─────────────────────────────────────────────────────────── */

const YM = /^\d{6}$/;

export function isYm(s: unknown): s is string {
  return typeof s === "string" && YM.test(s);
}

/** ym ± n 개월 */
export function ymAdd(ym: string, n: number): string {
  const y = Number(ym.slice(0, 4));
  const m = Number(ym.slice(4, 6)) - 1 + n;
  const yy = y + Math.floor(m / 12);
  const mm = ((m % 12) + 12) % 12;
  return `${yy}${String(mm + 1).padStart(2, "0")}`;
}

/** first~last 를 달력으로 잇는다(둘 다 포함, 상한 cap) */
export function calendarYms(first: string, last: string, cap = 120): string[] {
  if (!isYm(first) || !isYm(last) || first > last) return [];
  const out: string[] = [];
  let cur = first;
  while (cur <= last && out.length < cap) {
    out.push(cur);
    cur = ymAdd(cur, 1);
  }
  return out;
}

/** "2026-01" — 시안의 캡션 표기 */
export function ymDash(ym: string): string {
  return isYm(ym) ? `${ym.slice(0, 4)}-${ym.slice(4, 6)}` : ym;
}

/* ── 중앙값 ──────────────────────────────────────────────────────────── */

export function medianOf(values: readonly number[]): number | null {
  const xs = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (xs.length === 0) return null;
  const mid = Math.floor(xs.length / 2);
  return xs.length % 2 === 1 ? xs[mid] : Math.round((xs[mid - 1] + xs[mid]) / 2);
}

/* ── 타입 탭 ─────────────────────────────────────────────────────────── */

export interface TypeTab {
  /** 전용면적 정수 ㎡("84") — areaTypeKey */
  key: string;
  areaM2: number;
  /** 기간 안 거래 수 */
  count: number;
}

/** 시안 상한 — 폰 한 줄 */
export const TYPE_TAB_MAX = 4;

/** 거래 많은 순(동수면 작은 면적 먼저), 면적 없는 거래는 빠진다 */
export function typeTabsFromDeals(deals: readonly HubDeal[], max = TYPE_TAB_MAX): TypeTab[] {
  const counts = new Map<string, number>();
  for (const d of deals) {
    const k = areaTypeKey(d.area);
    if (!k) continue;
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([key, count]) => ({ key, areaM2: Number(key), count }))
    .sort((a, b) => b.count - a.count || a.areaM2 - b.areaM2)
    .slice(0, Math.max(0, max));
}

/* ── 월 중앙값 시계열 ────────────────────────────────────────────────── */

export interface MonthSeries {
  /** 그 달 중앙값(만원) — 거래 없으면 null */
  values: (number | null)[];
  /** 그 달 거래 수 */
  counts: number[];
}

/** yms(달력) 위에 그 타입(null = 전 타입)의 월 중앙값·건수 */
export function monthlyMedianSeries(deals: readonly HubDeal[], yms: readonly string[], typeKey: string | null): MonthSeries {
  const buckets = new Map<string, number[]>();
  for (const d of deals) {
    if (!isYm(d.ym) || !Number.isFinite(d.man) || d.man <= 0) continue;
    if (typeKey != null && areaTypeKey(d.area) !== typeKey) continue;
    const b = buckets.get(d.ym);
    if (b) b.push(d.man);
    else buckets.set(d.ym, [d.man]);
  }
  return {
    values: yms.map((ym) => medianOf(buckets.get(ym) ?? [])),
    counts: yms.map((ym) => buckets.get(ym)?.length ?? 0),
  };
}

/* ── 기간 칩 ─────────────────────────────────────────────────────────── */

export interface PeriodChip {
  key: "1y" | "3y" | "5y" | "all";
  label: string;
  /** 뒤에서 몇 달(0 = 전체) */
  last: number;
  enabled: boolean;
}

/**
 * 1년은 언제나 켜진다(12개월 이하면 전체가 곧 1년). 3년은 데이터가 12개월을 **넘을** 때, 5년은 36개월을 넘을 때,
 * 전체는 60개월을 넘을 때만 켜진다 — 켜져 있는데 눌러도 그림이 안 바뀌는 칩을 두지 않는다.
 */
export function periodChips(monthCount: number): PeriodChip[] {
  const n = Math.max(0, Math.floor(monthCount));
  return [
    { key: "1y", label: "1년", last: 12, enabled: true },
    { key: "3y", label: "3년", last: 36, enabled: n > 12 },
    { key: "5y", label: "5년", last: 60, enabled: n > 36 },
    { key: "all", label: "전체", last: 0, enabled: n > 60 },
  ];
}

/** "3년·5년·전체는 2026-01 부터" — 꺼진 칩이 있을 때만(없으면 null) */
export function periodCaption(chips: readonly PeriodChip[], firstYm: string | null): string | null {
  const off = chips.filter((c) => !c.enabled).map((c) => c.label);
  if (off.length === 0 || !firstYm) return null;
  return `${off.join("·")}는 ${ymDash(firstYm)} 부터`;
}

/** 칩이 보여 줄 달 구간의 시작 인덱스 */
export function periodStart(total: number, last: number): number {
  if (last <= 0) return 0;
  return Math.max(0, total - last);
}

/* ── 갭 ─────────────────────────────────────────────────────────────── */

/** 매매 중앙값 − 전세 중앙값(만원). 둘 중 하나라도 없으면 null — 0 으로 위장하지 않는다 */
export function gapManwon(tradeMedianMan: number | null | undefined, jeonseMedianMan: number | null | undefined): number | null {
  if (tradeMedianMan == null || jeonseMedianMan == null) return null;
  if (!Number.isFinite(tradeMedianMan) || !Number.isFinite(jeonseMedianMan)) return null;
  if (tradeMedianMan <= 0 || jeonseMedianMan <= 0) return null;
  return Math.round(tradeMedianMan - jeonseMedianMan);
}

/** 최근 n개월(toYm 포함, 달력 기준) 그 타입(null = 전 타입) 매매 중앙값·건수 */
export function recentMedian(
  deals: readonly HubDeal[],
  toYm: string,
  months: number,
  typeKey: string | null,
): { medianMan: number | null; count: number; fromYm: string; toYm: string } {
  const fromYm = ymAdd(toYm, -(Math.max(1, months) - 1));
  const xs: number[] = [];
  for (const d of deals) {
    if (!isYm(d.ym) || d.ym < fromYm || d.ym > toYm) continue;
    if (!Number.isFinite(d.man) || d.man <= 0) continue;
    if (typeKey != null && areaTypeKey(d.area) !== typeKey) continue;
    xs.push(d.man);
  }
  return { medianMan: medianOf(xs), count: xs.length, fromYm, toYm };
}

/* ── 추이 섹션 재료(직렬화 가능 — 클라이언트 부품이 받는다) ───────────── */

export interface ExtremePoint {
  ym: string;
  day: number | null;
  man: number;
  floor: number | null;
  /** [1028] 직거래(국토교통부 거래유형) — 표식이 있을 때만 */
  direct?: boolean;
}

/** [1028] 표식이 붙은 거래(complex-store applyDealMarks) — 표식이 없으면 HubDeal 그대로 */
export type MarkedDeal = HubDeal & { cancelled?: boolean; direct?: boolean; rgst?: string };

/** [1028] 최근 실거래가 신고가보다 몇 % 낮은가(음수) — 같거나 높으면·재료가 없으면 null */
export function belowHighPct(latestMan: number | null | undefined, highMan: number | null | undefined): number | null {
  if (latestMan == null || highMan == null) return null;
  if (!Number.isFinite(latestMan) || !Number.isFinite(highMan) || latestMan <= 0 || highMan <= 0) return null;
  if (latestMan >= highMan) return null;
  return ((latestMan - highMan) / highMan) * 100;
}

export interface TrendTypeSeries {
  key: string;
  areaM2: number;
  count: number;
  values: (number | null)[];
  counts: number[];
  /** 기간 안 신고가·신저가 — 한 건뿐이면 둘 다 null */
  high: ExtremePoint | null;
  low: ExtremePoint | null;
  /** 이 타입의 가장 최근 계약 */
  latest: ExtremePoint | null;
}

export interface RentTrendSeries {
  /** 전세 보증금 중앙값(만원) */
  jeonse: MonthSeries;
  /** 월세 — 월세액 중앙값(만원)·그 달 보증금 중앙값(만원) */
  wolse: MonthSeries & { deposits: (number | null)[] };
}

export interface TxTrendData {
  /** 달력으로 이은 달(과거 → 최신) */
  yms: string[];
  firstYm: string | null;
  types: TrendTypeSeries[];
  defaultKey: string | null;
  /** 전 타입(면적 없는 거래 포함) 매매 */
  all: MonthSeries;
  rent: RentTrendSeries | null;
  chips: PeriodChip[];
  caption: string | null;
}

export interface RentMonthInput {
  month: string;
  jeonseCount: number;
  jeonseMedianDepositKrw: number | null;
  wolseCount: number;
  wolseMedianDepositKrw: number | null;
  wolseMedianMonthlyKrw: number | null;
}

function toPoint(d: MarkedDeal | null): ExtremePoint | null {
  if (!d) return null;
  return { ym: d.ym, day: d.day ?? null, man: d.man, floor: d.floor ?? null, ...(d.direct ? { direct: true } : {}) };
}

function latestOf(deals: readonly HubDeal[]): HubDeal | null {
  let best: HubDeal | null = null;
  for (const d of deals) {
    if (!isYm(d.ym)) continue;
    const key = Number(d.ym) * 100 + (d.day ?? 0);
    const bk = best ? Number(best.ym) * 100 + (best.day ?? 0) : -1;
    if (!best || key > bk) best = d;
  }
  return best;
}

/** 원 → 만원 정수(null 은 그대로) */
export function krwToMan(krw: number | null | undefined): number | null {
  return krw == null || !Number.isFinite(krw) || krw <= 0 ? null : Math.round(krw / 10_000);
}

/**
 * 추이 섹션 재료 — 매매(타입별)·전월세(전 타입 — 전월세 원표본에 면적이 없다).
 * 달 축: 가장 이른 계약월(매매·전월세 중 이른 쪽) ~ nowYm(이번 달, 신고 중이라 비어 있을 수 있다).
 */
export function buildTxTrendData(
  deals: readonly HubDeal[],
  rentMonths: readonly RentMonthInput[] | null,
  nowYm: string,
  maxTypes = TYPE_TAB_MAX,
): TxTrendData | null {
  const valid = deals.filter((d) => isYm(d.ym) && Number.isFinite(d.man) && d.man > 0);
  const rentValid = (rentMonths ?? []).filter((m) => isYm(m.month));
  const yAll = [...valid.map((d) => d.ym), ...rentValid.map((m) => m.month)].sort();
  if (yAll.length === 0) return null;
  const firstYm = yAll[0];
  const lastYm = isYm(nowYm) && nowYm > yAll[yAll.length - 1] ? nowYm : yAll[yAll.length - 1];
  const yms = calendarYms(firstYm, lastYm);
  if (yms.length === 0) return null;

  const ext = extremesByType(valid);
  const types: TrendTypeSeries[] = typeTabsFromDeals(valid, maxTypes).map((t) => {
    const e: TxExtremes<HubDeal> | undefined = ext.get(t.key);
    const own = valid.filter((d) => areaTypeKey(d.area) === t.key);
    const s = monthlyMedianSeries(valid, yms, t.key);
    return {
      key: t.key,
      areaM2: t.areaM2,
      count: t.count,
      values: s.values,
      counts: s.counts,
      high: e && !e.single ? toPoint(e.high) : null,
      low: e && !e.single ? toPoint(e.low) : null,
      latest: toPoint(latestOf(own)),
    };
  });

  let rent: RentTrendSeries | null = null;
  if (rentValid.length > 0) {
    const byYm = new Map(rentValid.map((m) => [m.month, m]));
    rent = {
      jeonse: {
        values: yms.map((ym) => {
          const m = byYm.get(ym);
          return m && m.jeonseCount > 0 ? krwToMan(m.jeonseMedianDepositKrw) : null;
        }),
        counts: yms.map((ym) => byYm.get(ym)?.jeonseCount ?? 0),
      },
      wolse: {
        values: yms.map((ym) => {
          const m = byYm.get(ym);
          return m && m.wolseCount > 0 ? krwToMan(m.wolseMedianMonthlyKrw) : null;
        }),
        deposits: yms.map((ym) => {
          const m = byYm.get(ym);
          return m && m.wolseCount > 0 ? krwToMan(m.wolseMedianDepositKrw) : null;
        }),
        counts: yms.map((ym) => byYm.get(ym)?.wolseCount ?? 0),
      },
    };
  }

  /* 기간 칩은 매매 데이터의 개월 수(첫 계약월 ~ 이번 달)로 정한다 */
  const chips = periodChips(yms.length);
  return {
    yms,
    firstYm,
    types,
    defaultKey: types[0]?.key ?? null,
    all: monthlyMedianSeries(valid, yms, null),
    rent,
    chips,
    caption: periodCaption(chips, firstYm),
  };
}

/* ── 최근 실거래 표 ──────────────────────────────────────────────────── */

export interface RecentDealRow {
  ym: string;
  day: number | null;
  man: number;
  /** 타입 키(정수 ㎡) — 면적 없으면 null */
  typeM2: number | null;
  floor: number | null;
  /** 그 타입의 기간 안 신고가(한 건뿐인 타입은 배지 없음) */
  high: boolean;
  /** 해제 신고 — 취소선(getComplexDeals 는 해제분을 읽지 않으므로 지금은 언제나 false, 규칙만 잠근다) */
  cancelled: boolean;
  /** [1028] 직거래(국토교통부 거래유형) */
  direct: boolean;
  /** [1028] 등기 완료 — 등기일 원문("26.09.18"), 없으면 null */
  rgst: string | null;
}

/** 최신순 n건 + 타입별 신고가 배지 */
export function recentDealRows(
  deals: readonly MarkedDeal[],
  n = 10,
): RecentDealRow[] {
  const valid = deals.filter((d) => isYm(d.ym) && Number.isFinite(d.man) && d.man > 0);
  /* 신고가는 해제되지 않은 거래끼리 */
  const ext = extremesByType(valid.filter((d) => !d.cancelled));
  return [...valid]
    .sort(
      (a, b) =>
        b.ym.localeCompare(a.ym) || (b.day ?? -1) - (a.day ?? -1) || b.man - a.man || (b.area ?? -1) - (a.area ?? -1),
    )
    .slice(0, Math.max(0, n))
    .map((d) => {
      const k = areaTypeKey(d.area);
      const e = k ? ext.get(k) : undefined;
      return {
        ym: d.ym,
        day: d.day ?? null,
        man: d.man,
        typeM2: k ? Number(k) : null,
        floor: d.floor ?? null,
        high: Boolean(e && !e.single && e.high === d && !d.cancelled),
        cancelled: Boolean(d.cancelled),
        direct: Boolean(d.direct),
        rgst: d.rgst ? d.rgst : null,
      };
    });
}
