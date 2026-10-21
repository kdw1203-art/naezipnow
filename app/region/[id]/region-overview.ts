/**
 * [1009 · H] 지역 화면(/region/[id]) 머리 — 결론 한 줄 · 큰 숫자 넷 · 추세 카드 데이터. 순수 함수(테스트로 잠근다).
 *
 * 왜(2026-09-22 운영 실측):
 *  · 서울 구(강남·마포·송파…)는 부동산원 스냅샷 행(market_region_price)이 period '' · 값 전부 null 로 비어 있다.
 *    그래서 검색 착지 1순위인 /region/gangnam 의 숫자 카드 넷이 "— — — —", 머리 줄은 " 기준 · 출처 …"(기간 빈칸),
 *    첫 문장은 "강남구의  기준 아파트 시세 지표는 아직 수집된 항목이 없습니다"였다. 그런데 같은 부동산원 월간
 *    **시계열**(market_region_series: 매매가격지수 13개월 · 전세가율 13개월)과 국토부 월 집계(거래량·평균가 8개월)는
 *    멀쩡히 있다 — 화면이 스냅샷 한 행만 봤다. 여기서는 있는 원천을 다 모아 숫자를 세운다(없으면 그 칸을 뺀다).
 *  · 거래량 마지막 두 칸을 늘 "신고 진행 중"으로 그렸다. 실제 규칙은 "계약 후 30일" 이라, 오늘(9/22) 기준 7월분은
 *    이미 신고가 끝났고 8월분만 들어오는 중이다. 달마다 **신고 기한이 지났는지**로 가른다(reportingClosed).
 *  · 결론 문장은 실제 값의 변화로만 만든다(lib/format/delta changeSentence) — 값이 없으면 null(문장을 쓰지 않는다).
 */
import { changeLabel, pctChange, pctLabel } from "@/lib/format/delta";
import { formatKrwShort } from "@/lib/market/format";
import { reportingClosed, splitByReporting } from "@/lib/newui/reporting-window";

export type SeriesPoint = { period: string; value: number };
export type VolumePoint = { month: string; count: number; avgDealAmountKrw?: number | null };

/** "2026-07-01" · "2026-07" · "202607" → "202607". 형식이 아니면 null */
export function toYm(period: string | null | undefined): string | null {
  if (!period) return null;
  const d = String(period).replace(/[^0-9]/g, "");
  if (d.length < 6) return null;
  const ym = d.slice(0, 6);
  const m = Number(ym.slice(4, 6));
  return m >= 1 && m <= 12 ? ym : null;
}

/** "202607" → "2026년 7월" */
export function ymLong(ym: string): string {
  return `${ym.slice(0, 4)}년 ${Number(ym.slice(4, 6))}월`;
}

/** "202607" → "26.07" (차트 축·말풍선) */
export function ymShort(ym: string): string {
  return `${ym.slice(2, 4)}.${ym.slice(4, 6)}`;
}

/** "202607" → "7월" */
export function ymMonth(ym: string): string {
  return `${Number(ym.slice(4, 6))}월`;
}

/** yyyymm 에서 n 달 전(음수면 뒤) */
export function shiftYm(ym: string, n: number): string {
  const y = Number(ym.slice(0, 4));
  const m = Number(ym.slice(4, 6));
  const idx = y * 12 + (m - 1) - n;
  const ny = Math.floor(idx / 12);
  const nm = (idx % 12) + 1;
  return `${ny}${String(nm).padStart(2, "0")}`;
}

/* 신고 기한 판정은 lib/newui/reporting-window.ts(홈 지역 카드와 같은 규칙) — 여기서도 그대로 내보낸다 */
export { reportingClosed, splitByReporting };

/** % 변동 → "전월 대비 ▲1.9%" (값이 없으면 null) — 곡선의 두 점 없이 변동률만 있을 때. [1029 · 4] 낱말 꼴 */
export function pctSentence(pct: number | null | undefined, since: string): string | null {
  return pctLabel(pct, since);
}

export type RegionOverviewInput = {
  name: string;
  /** market_region_price 최선 행 — 서울 구는 값이 비어 있을 수 있다 */
  snapshot: {
    period: string;
    avgSale?: number;
    jeonseRatio?: number;
    saleChangeMonthly?: number;
  } | null;
  /** 부동산원 월간 매매가격지수(오름차순) */
  indexSeries: readonly SeriesPoint[];
  /** 부동산원 월간 전세가율(오름차순, %) */
  jeonseSeries: readonly SeriesPoint[];
  /** 국토부 월 집계(오름차순) — 거래 건수·평균가 */
  volume: readonly VolumePoint[];
  now: Date;
};

export type RegionOverview = {
  index: { value: number; ym: string; momPct: number | null; yoyPct: number | null } | null;
  jeonse: { value: number; ym: string | null; ppChange: number | null } | null;
  /** 신고가 끝난 마지막 달 */
  volume: { ym: string; count: number; momPct: number | null } | null;
  /** 아직 신고가 들어오는 달(잠정) — 그래프에서 빼고 따로 적는다 */
  volumeOpen: Array<{ ym: string; count: number }>;
  /** 평균 매매가(원) — reb: 부동산원 스냅샷 · tx: 국토부 신고 월평균(신고가 끝난 달) */
  avgPrice: { krw: number; ym: string | null; basis: "reb" | "tx"; trades: number | null } | null;
  /** 결론 한 줄 — "매매가격지수 · 전월 대비 ▲0.6%"([1029 · 4] 낱말 꼴). 만들 값이 없으면 null */
  headline: string | null;
  /** 결론의 출처·시점 — "강남구 · 2026년 7월 · 한국부동산원 매매가격지수" */
  headlineCaption: string | null;
  /** 둘째 줄 — "1년 전 대비 ▲6.3%" */
  subline: string | null;
  /** 부동산원 수치(지수·전세가율·평균가 중 하나라도)가 있는가 */
  hasReb: boolean;
  /** [1081 · #14] 데이터로만 쓴 지역 요약 2~4문장 — 지수·평균가·거래·전세가율 중 **있는 것만**. 없으면 빈 배열 */
  narrative: string[];
  /** [1081 · #25] 인용 가능한 한 문장(출처·기준월 포함) — AI 검색·요약이 그대로 가져갈 수 있는 사실 문장. 만들 값이 없으면 null */
  citeLine: string | null;
};

function finite(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n);
}

/** 시계열 → (yyyymm, 값) 오름차순 · 값 없는 점과 같은 달 중복(뒤가 이긴다) 정리 */
function normSeries(series: readonly SeriesPoint[]): Array<{ ym: string; value: number }> {
  const byYm = new Map<string, number>();
  for (const p of series) {
    const ym = toYm(p.period);
    if (!ym || !finite(p.value)) continue;
    byYm.set(ym, p.value);
  }
  return [...byYm.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([ym, value]) => ({ ym, value }));
}

export function buildRegionOverview(input: RegionOverviewInput): RegionOverview {
  const idx = normSeries(input.indexSeries);
  const jr = normSeries(input.jeonseSeries);
  const vol = input.volume
    .filter((v) => toYm(v.month) !== null && finite(v.count))
    .map((v) => ({ ...v, month: toYm(v.month) as string }))
    .sort((a, b) => a.month.localeCompare(b.month));
  const { closed, open } = splitByReporting(vol, input.now);

  /* ── 매매가격지수 ── */
  let index: RegionOverview["index"] = null;
  if (idx.length > 0) {
    const last = idx[idx.length - 1];
    const prev = idx.find((p) => p.ym === shiftYm(last.ym, 1));
    const yearAgo = idx.find((p) => p.ym === shiftYm(last.ym, 12));
    index = {
      value: last.value,
      ym: last.ym,
      momPct: prev ? pctChange(last.value, prev.value) : null,
      yoyPct: yearAgo ? pctChange(last.value, yearAgo.value) : null,
    };
  }

  /* ── 전세가율 — 시계열이 우선(서울 구는 스냅샷이 비어 있다), 없으면 스냅샷 ── */
  let jeonse: RegionOverview["jeonse"] = null;
  if (jr.length > 0) {
    const last = jr[jr.length - 1];
    const prev = jr.find((p) => p.ym === shiftYm(last.ym, 1));
    jeonse = { value: last.value, ym: last.ym, ppChange: prev ? last.value - prev.value : null };
  } else if (input.snapshot && finite(input.snapshot.jeonseRatio)) {
    jeonse = { value: input.snapshot.jeonseRatio, ym: toYm(input.snapshot.period), ppChange: null };
  }

  /* ── 거래량 — 신고가 끝난 마지막 달 · 직전 달(연속일 때만) 대비 ── */
  let volume: RegionOverview["volume"] = null;
  if (closed.length > 0) {
    const last = closed[closed.length - 1];
    const prev = closed.find((v) => v.month === shiftYm(last.month, 1));
    volume = {
      ym: last.month,
      count: last.count,
      momPct: prev && prev.count > 0 ? pctChange(last.count, prev.count) : null,
    };
  }
  const volumeOpen = open.map((v) => ({ ym: v.month, count: v.count }));

  /* ── 평균 매매가 ── */
  let avgPrice: RegionOverview["avgPrice"] = null;
  const snap = input.snapshot;
  if (snap && finite(snap.avgSale) && snap.avgSale > 0) {
    avgPrice = { krw: snap.avgSale, ym: toYm(snap.period), basis: "reb", trades: null };
  } else {
    const lastClosed = closed[closed.length - 1];
    if (lastClosed && finite(lastClosed.avgDealAmountKrw) && lastClosed.avgDealAmountKrw > 0) {
      avgPrice = { krw: lastClosed.avgDealAmountKrw, ym: lastClosed.month, basis: "tx", trades: lastClosed.count };
    }
  }

  /* ── 결론 한 줄 — 지수(부동산원) > 스냅샷 변동률 > 거래량(국토부) 순. 셋 다 없으면 null ── */
  let headline: string | null = null;
  let headlineCaption: string | null = null;
  let subline: string | null = null;
  if (index && idx.length >= 2) {
    const prev = idx.find((p) => p.ym === shiftYm(index.ym, 1));
    const s = prev ? changeLabel({ curr: index.value, base: prev.value, since: "전월 대비", unit: "index" }) : null;
    if (s) {
      headline = `매매가격지수 · ${s}`;
      headlineCaption = `${input.name} · ${ymLong(index.ym)} · 한국부동산원 매매가격지수`;
      const yearAgo = idx.find((p) => p.ym === shiftYm(index.ym, 12));
      subline = yearAgo
        ? changeLabel({ curr: index.value, base: yearAgo.value, since: "1년 전 대비", unit: "index" })
        : null;
    }
  }
  if (!headline && snap && finite(snap.saleChangeMonthly) && toYm(snap.period)) {
    const s = pctSentence(snap.saleChangeMonthly, "전월 대비");
    if (s) {
      headline = `매매가격지수 · ${s}`;
      headlineCaption = `${input.name} · ${ymLong(toYm(snap.period) as string)} · 한국부동산원`;
    }
  }
  if (!headline && closed.length >= 2) {
    const last = closed[closed.length - 1];
    const prev = closed.find((v) => v.month === shiftYm(last.month, 1));
    const s = prev ? changeLabel({ curr: last.count, base: prev.count, since: "전월 대비", unit: "count" }) : null;
    if (s) {
      headline = `아파트 매매 신고 · ${s}`;
      headlineCaption = `${input.name} · ${ymLong(last.month)} · 국토교통부 실거래 신고`;
    }
  }

  const hasReb = index !== null || (jeonse !== null) || avgPrice?.basis === "reb";
  const narrative = buildRegionNarrative(input.name, { index, jeonse, volume, volumeOpen, avgPrice, hasReb });
  const citeLine = buildRegionCiteLine(input.name, { index, volume, avgPrice });
  return { index, jeonse, volume, volumeOpen, avgPrice, headline, headlineCaption, subline, hasReb, narrative, citeLine };
}

/* ───────────── [1081] 데이터 기반 서술 · 인용 문장 ───────────── */

type NarrativeFacts = Pick<RegionOverview, "index" | "jeonse" | "volume" | "volumeOpen" | "avgPrice" | "hasReb">;

/** 지수·평균가·거래·전세가율을 **한 사실 = 한 문장**으로 — 숫자 외 서술(학군·교통 등)은 적지 않는다(데이터에 없는 말은 없다).
 *  문장을 잘게 두는 이유: 머리 문단(lead)이 이미 말한 수는 narrativeComplement 가 문장째 버린다 — 새 사실만 남는다. */
export function buildRegionNarrative(name: string, f: NarrativeFacts): string[] {
  const out: string[] = [];
  if (f.index) {
    const mom = f.index.momPct !== null ? pctLabel(f.index.momPct, "전월 대비") : null;
    out.push(`${name} 아파트 매매가격지수는 ${ymLong(f.index.ym)} 기준 ${f.index.value.toFixed(1)}${mom ? `(${mom})` : ""}로, 한국부동산원 월간 지수입니다.`);
    if (f.index.yoyPct !== null) out.push(`매매가격지수는 ${pctLabel(f.index.yoyPct, "1년 전 대비")}입니다.`);
  }
  if (f.avgPrice) {
    const when = f.avgPrice.ym ? `${ymLong(f.avgPrice.ym)} ` : "";
    const basis =
      f.avgPrice.basis === "reb"
        ? "한국부동산원 집계"
        : `국토교통부 신고${f.avgPrice.trades ? ` ${f.avgPrice.trades.toLocaleString("ko-KR")}건` : ""} 평균`;
    out.push(`${when}평균 매매가는 ${formatKrwShort(f.avgPrice.krw)}(${basis})입니다.`);
  }
  if (f.volume) {
    out.push(`${ymLong(f.volume.ym)} 매매 신고는 ${f.volume.count.toLocaleString("ko-KR")}건입니다.`);
    if (f.volume.momPct !== null) out.push(`${ymLong(f.volume.ym)} 매매 신고는 ${pctLabel(f.volume.momPct, "전월 대비")}입니다.`);
    if (f.volumeOpen.length > 0) {
      out.push(`${f.volumeOpen.map((o) => `${ymLong(o.ym)} ${o.count.toLocaleString("ko-KR")}건`).join(" · ")}은 아직 신고가 들어오는 중입니다.`);
    }
  }
  if (f.jeonse) {
    out.push(`전세가율은 ${f.jeonse.value.toFixed(1)}%입니다.`);
    if (f.jeonse.ppChange !== null) {
      out.push(`전세가율은 전월 대비 ${f.jeonse.ppChange >= 0 ? "▲" : "▼"}${Math.abs(f.jeonse.ppChange).toFixed(1)}%p입니다.`);
    }
  }
  if (!f.hasReb && out.length > 0) out.push("한국부동산원 지수·평균가 기록이 없는 지역이라 국토교통부 실거래 신고만 집계합니다.");
  return out;
}

/** 머리 문단(lead)이 이미 말한 수는 뺀다(같은 수 두 번 금지) — 숫자+단위 토큰("27.8억"·"80건"·"43.6%")이 lead 에 있으면 그 문장을 버린다.
 *  지수 값 문장은 lead 가 "매매가격지수"를 말했으면 버린다(lead 는 소수 둘째 자리라 토큰이 안 잡힌다). 1년 전 대비 문장은 남는다. */
export function narrativeComplement(narrative: readonly string[], lead: string): string[] {
  return narrative.filter((s) => {
    if (s.includes("매매가격지수는") && !s.includes("1년 전 대비") && lead.includes("매매가격지수")) return false;
    const tokens = s.match(/\d[\d,.]*(?:억|건|%p?)/g) ?? [];
    return !tokens.some((t) => lead.includes(t));
  });
}

/** 출처·기준월이 든 한 문장 — "강남구 아파트 2026년 9월 매매가격지수 98.5(전월 대비 ▼1.6%) · 평균 매매가 27.8억 · 매매 신고 80건 — 출처 …" */
export function buildRegionCiteLine(name: string, f: Pick<RegionOverview, "index" | "volume" | "avgPrice">): string | null {
  const parts: string[] = [];
  let ym: string | null = null;
  if (f.index) {
    ym = f.index.ym;
    const mom = f.index.momPct !== null ? pctLabel(f.index.momPct, "전월 대비") : null;
    parts.push(`매매가격지수 ${f.index.value.toFixed(1)}${mom ? `(${mom})` : ""}`);
  }
  if (f.avgPrice) {
    ym = ym ?? f.avgPrice.ym;
    parts.push(`평균 매매가 ${formatKrwShort(f.avgPrice.krw)}`);
  }
  if (f.volume) {
    ym = ym ?? f.volume.ym;
    parts.push(`매매 신고 ${f.volume.count.toLocaleString("ko-KR")}건`);
  }
  if (parts.length === 0 || !ym) return null;
  const sources = [f.index || f.avgPrice?.basis === "reb" ? "한국부동산원" : null, f.volume || f.avgPrice?.basis === "tx" ? "국토교통부 실거래" : null].filter(Boolean).join("·");
  return `${name} 아파트 ${ymLong(ym)} 기준 ${parts.join(" · ")} — 출처 ${sources}, 집계 내집나우(naezipnow.com)`;
}

/* ───────────── 추세 카드(ScrubLine) 데이터 ───────────── */

export type TrendKey = "index" | "jeonse" | "volume";

export type TrendDataset = {
  key: TrendKey;
  /** 탭 이름 */
  tab: string;
  values: number[];
  labels: string[];
  fullLabels: string[];
};

/** 시계열 → 차트 데이터(최근 max 개, 오름차순). 값 2개 미만이면 null(선이 아니다) */
export function seriesToTrend(
  key: TrendKey,
  tab: string,
  series: readonly SeriesPoint[],
  max = 36,
): TrendDataset | null {
  const pts = normSeries(series).slice(-max);
  if (pts.length < 2) return null;
  return {
    key,
    tab,
    values: pts.map((p) => p.value),
    labels: pts.map((p) => ymShort(p.ym)),
    fullLabels: pts.map((p) => ymLong(p.ym)),
  };
}

/** 월별 건수 → 차트 데이터 — **신고가 끝난 달만**(잠정 달은 선에서 뺀다). 2개 미만이면 null */
export function countsToTrend(
  key: TrendKey,
  tab: string,
  rows: readonly { month: string; count: number }[],
  now: Date,
): TrendDataset | null {
  const clean = rows
    .filter((r) => toYm(r.month) !== null && finite(r.count))
    .map((r) => ({ month: toYm(r.month) as string, count: r.count }))
    .sort((a, b) => a.month.localeCompare(b.month));
  const { closed } = splitByReporting(clean, now);
  if (closed.length < 2) return null;
  return {
    key,
    tab,
    values: closed.map((r) => r.count),
    labels: closed.map((r) => ymShort(r.month)),
    fullLabels: closed.map((r) => ymLong(r.month)),
  };
}

/** 추세 카드의 기간 탭 — 18칸 이상일 때만 "1년 | 전체"(12칸과 14칸은 같은 그림이다) */
export function trendRanges(length: number): Array<{ key: string; label: string; last: number }> | undefined {
  return length >= 18
    ? [
        { key: "1y", label: "1년", last: 12 },
        { key: "all", label: "전체", last: 0 },
      ]
    : undefined;
}
