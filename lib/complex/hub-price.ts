/**
 * [1009 · C] 단지 허브 — 대표 실거래가 · 비교 기준 · 평형별 추이 · 최근 실거래 목록 (순수 함수, 클라이언트 안전).
 *
 * 왜(2026-09-22 운영 DB 읽기 전용 실측, 헬리오시티 2026.01~08 매매 134건):
 *  · 허브 첫 화면의 "최근 실거래 평균"은 그 달 거래의 **면적 혼합 평균**이었다 — 2026.08 = 84㎡ 3건 + 110㎡ 1건 → 30.9억.
 *    같은 화면 아래 "결과 요약"(AI 분석과 같은 근거)은 전용 84㎡ 최근 6건 평균 29.7억을 말했다. 한 화면에 가격이 둘이었다.
 *  · 가격 추이 그래프도 같은 혼합 평균이라, 그 달 팔린 평형 구성만 바뀌어도 선이 출렁였고 거래 1건짜리 달과 20건짜리
 *    달이 같은 무게로 그려졌다.
 * 그래서
 *  · 대표가 = AI 분석과 **같은 함수**(lib/ai/result-series resolveUnitPrice — 가장 많이 거래된 평형의 최근 6건 평균, 최소 3건.
 *    평형으로 못 채우면 가장 많이 거래된 면적대). 두 화면이 같은 숫자를 말한다.
 *  · 비교 기준 = 같은 평형(면적대)의 **그래프 기간 첫 거래들**(가장 이른 최대 6건, 대표가 표본과 겹치지 않게, 최소 3건).
 *    처음엔 "바로 앞 6건"과 비교했는데, 같은 화면의 그래프 머리("26.01 대비")와 방향이 엇갈렸다(헬리오시티 84㎡:
 *    바로 앞 6건 대비 ▲4.0% · 기간 시작 대비 ▼1.2%) — 한 화면이 두 가지 말을 했다. 이제 둘 다 "기간 시작 대비"다.
 *    매매 신고가 2026.01부터 쌓여 "1년 전"은 아직 잴 수 없다(창이 1년을 넘으면 기간 시작이 그만큼 과거로 간다).
 *  · 대표가를 못 세우는 단지(같은 평형·면적대 3건 미만)는 **가장 최근 한 건**을 그대로 적는다(평균인 척하지 않는다).
 *  · 그래프 = 평형마다 따로(네이버 부동산의 평형 탭), 달력으로 이은 달(거래 없는 달은 null), 그 달 거래 수(counts) 동봉.
 * 값을 지어내지 않는다 — 표본이 모자라면 비교·탭을 만들지 않는다(null / 빈 배열).
 */
import {
  PRICE_MIN,
  PRICE_SAMPLE,
  PRICE_WINDOW,
  buildComplexTradeSeries,
  nowYm,
  resolveUnitPrice,
  unitOf,
  type TradeLite,
} from "@/lib/ai/result-series";
import { ymShift } from "@/lib/ai/region-trend";
import { AREA_BANDS, areaBandOf } from "@/lib/market/bands";

export { dealDateLabel } from "@/lib/complex/deal-format";

/** 매매 실거래 한 건 — 공용 행(complex-store getComplexDeals)에서 만든다. 금액은 만원 정수. */
export interface HubDeal {
  /** 계약 연월 YYYYMM */
  ym: string;
  /** 계약일(1~31) — 없으면 null */
  day: number | null;
  /** 거래금액(만원) */
  man: number;
  /** 전용면적(㎡) — 없으면 null(대표가·평형 계산에서만 빠진다) */
  area: number | null;
  /** 층 — 없으면 null */
  floor: number | null;
}

/** 목록·표에 싣는 한 건 — [계약월, 계약일, 만원, 전용㎡, 층] (페이로드를 줄이려 배열로) */
export type DealTuple = [ym: string, day: number | null, man: number, area: number | null, floor: number | null];

const finite = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);

function validDeal(d: HubDeal): boolean {
  return /^\d{6}$/.test(String(d.ym)) && finite(d.man) && d.man > 0;
}

/**
 * 최신순 — lib/ai/result-series 의 latestFirst 와 **같은 비교**(계약월 → 계약일(없으면 뒤) → 금액 큰 쪽 → 면적 큰 쪽).
 * 같은 날 거래의 순서까지 고정해야 "최근 6건"의 경계가 요청마다 바뀌지 않는다(1008 · 리뷰 A-16).
 */
export function compareLatest(
  a: { ym: string; day: number | null; man: number; area: number | null },
  b: { ym: string; day: number | null; man: number; area: number | null },
): number {
  return (
    b.ym.localeCompare(a.ym) ||
    (b.day ?? -1) - (a.day ?? -1) ||
    b.man - a.man ||
    (b.area ?? -1) - (a.area ?? -1)
  );
}

/** 대표가·그래프 재료(면적 있는 거래만) */
export function toTradeLite(deals: readonly HubDeal[] | null | undefined): TradeLite[] {
  const out: TradeLite[] = [];
  for (const d of deals ?? []) {
    if (!validDeal(d) || !finite(d.area) || d.area <= 0) continue;
    out.push({ ym: d.ym, day: finite(d.day) ? d.day : null, man: d.man, area: d.area });
  }
  return out;
}

export interface HubBaseWindow {
  /** 기간 첫 거래들의 평균(만원, 반올림) */
  avgManwon: number;
  count: number;
  firstYm: string;
  latestYm: string;
}

export interface HubHeadline {
  /** rep = 평형(면적대) 최근 N건 평균 · single = 가장 최근 한 건 */
  kind: "rep" | "single";
  /** 만원 — rep 는 평균(반올림), single 은 그 거래 금액 */
  priceManwon: number;
  /** rep: unit(평형) | band(면적대) */
  basis: "unit" | "band" | null;
  /** 평형 키(㎡ 정수) — 면적 단위 설정(평)으로 바꿔 그리려면 숫자가 필요하다 */
  unitM2: number | null;
  /** 면적대 라벨(AREA_BANDS) — basis band */
  bandLabel: string | null;
  /** rep: 평균에 든 거래 수(3~6) · single: 1 */
  sampleSize: number;
  firstYm: string;
  latestYm: string;
  /** single 일 때 그 거래 */
  deal: HubDeal | null;
  /** 비교 기준 — 같은 평형(면적대)의 그래프 기간 첫 거래들(대표가 표본과 겹치지 않게). 3건 미만이면 null(비교하지 않는다) */
  base: HubBaseWindow | null;
}

function ymRange(rows: readonly { ym: string }[]): { firstYm: string; latestYm: string } {
  const yms = rows.map((r) => r.ym).sort();
  return { firstYm: yms[0], latestYm: yms[yms.length - 1] };
}

/** 상한에 걸려 읽을 때 빠지는 달 — buildComplexTradeSeries 와 같은 규칙(달이 둘 이상일 때 가장 이른 달) */
function cappedDropYm(lite: readonly TradeLite[]): string | null {
  const yms = new Set(lite.map((r) => r.ym));
  if (yms.size < 2) return null;
  return [...yms].sort()[0];
}

/** 그래프 창의 첫 달 — buildComplexTradeSeries 와 같은 기준(마지막 거래 달과 지난달 중 늦은 달에서 36개월) */
function windowFloorYm(lite: readonly TradeLite[], now: Date): string {
  const lastData = lite.reduce((m, r) => (r.ym > m ? r.ym : m), "000000");
  const prevMonth = ymShift(nowYm(now), -1);
  const lastYm = lastData > prevMonth ? lastData : prevMonth;
  return ymShift(lastYm, -(HUB_SERIES_MONTHS - 1));
}

/**
 * 첫 화면 대표 실거래가 — AI 분석과 같은 규칙. 거래가 한 건도 없으면 null.
 * 비교 기준은 같은 평형의 그래프 기간 첫 거래들(가장 이른 최대 6건, 대표가 표본과 겹치지 않게, 3건 이상).
 */
export function hubHeadline(
  deals: readonly HubDeal[] | null | undefined,
  now: Date = new Date(),
  opts: { capped?: boolean } = {},
): HubHeadline | null {
  const lite = toTradeLite(deals);
  const price = resolveUnitPrice(lite);
  if (price) {
    const match =
      price.basis === "unit"
        ? (r: TradeLite) => unitOf(r.area) === price.unitM2
        : (r: TradeLite) => areaBandOf(r.area)?.slug === price.bandSlug;
    /* resolveUnitPrice 와 같은 창(최근 200건)·같은 정렬·같은 매칭 — cur 가 대표가 표본과 같다(테스트가 잠근다) */
    const sorted = [...lite].sort(compareLatest);
    const cur = sorted.slice(0, PRICE_WINDOW).filter(match).slice(0, PRICE_SAMPLE);
    /* 기간 첫 거래들 — 그래프 창(36개월) 안 같은 평형 거래 중 대표가 표본을 뺀 나머지의 가장 이른 쪽 */
    const floor = windowFloorYm(lite, now);
    /* [1009 · C 리뷰] 읽기 상한(COMPLEX_DEALS_ROW_CAP)에 걸렸으면 가장 이른 달은 일부만 읽혔다 — 그래프
       (buildComplexTradeSeries)는 그 달을 통째로 뺀다. 비교 기준도 같은 달을 빼야 "기간 첫 거래"가 두 곳에서 같은 기간이다. */
    const dropYm = opts.capped ? cappedDropYm(lite) : null;
    const rest = sorted
      .filter((r) => match(r) && r.ym >= floor && r.ym !== dropYm)
      .filter((r) => !cur.includes(r));
    const early = rest.slice(-PRICE_SAMPLE);
    const base: HubBaseWindow | null =
      early.length >= PRICE_MIN
        ? {
            avgManwon: Math.round(early.reduce((s, r) => s + r.man, 0) / early.length),
            count: early.length,
            ...ymRange(early),
          }
        : null;
    const band = price.basis === "band" ? AREA_BANDS.find((b) => b.slug === price.bandSlug) : null;
    return {
      kind: "rep",
      priceManwon: Math.round(price.priceKrw / 10_000),
      basis: price.basis,
      unitM2: price.unitM2,
      bandLabel: band?.label ?? null,
      sampleSize: cur.length,
      firstYm: price.firstYm,
      latestYm: price.latestYm,
      deal: null,
      base,
    };
  }
  /* 대표가를 못 세움(같은 평형·면적대 3건 미만) — 가장 최근 한 건을 평균인 척하지 않고 그대로 */
  const latestDeal = [...(deals ?? [])].filter(validDeal).sort(compareLatest)[0];
  if (!latestDeal) return null;
  return {
    kind: "single",
    priceManwon: latestDeal.man,
    basis: null,
    unitM2: finite(latestDeal.area) && latestDeal.area > 0 ? unitOf(latestDeal.area) : null,
    bandLabel: null,
    sampleSize: 1,
    firstYm: latestDeal.ym,
    latestYm: latestDeal.ym,
    deal: latestDeal,
    base: null,
  };
}

/* ── 평형별 추이(그래프) ─────────────────────────────────────────────── */

export interface HubSeriesTab {
  /** "u84" · "b60-85" */
  key: string;
  kind: "unit" | "band";
  unitM2: number | null;
  bandLabel: string | null;
  /** 월평균(만원) — 그 달 이 평형 거래가 없으면 null */
  values: (number | null)[];
  /** 그 달 이 평형 거래 수 */
  counts: number[];
  /** 창 안 이 평형 거래 수 */
  total: number;
}

export interface HubSeries {
  /** 달력으로 이은 달(과거 → 최신) */
  yms: string[];
  /** 대표 평형이 첫 탭 */
  tabs: HubSeriesTab[];
  defaultKey: string;
  /** 읽기 상한에 걸려 가장 이른 달을 버렸는가 */
  truncated: boolean;
  /** [1009 · C 리뷰] 첫 화면 대표가와 **같은 평형(면적대)** 의 탭 — 대표가가 한 건(single)이거나 그 탭이 안 서면 null.
      compare=false 면 첫 화면이 "비교할 거래가 아직 적어요"라고 말한 평형이다 — 그 탭 그래프도 기간 등락을 보이지 않는다. */
  rep: { key: string; basis: "unit" | "band"; sampleSize: number; compare: boolean } | null;
}

/** 그래프 창(개월) — 기간 탭 "1년/전체"는 12개월을 넘을 때만 생긴다 */
export const HUB_SERIES_MONTHS = 36;
/** 평형 탭 상한 — 모바일 한 줄에 들어오는 수 */
export const HUB_MAX_TABS = 4;
/** 탭이 되려면 값 있는 달이 이만큼 — 한 점짜리 선은 추세가 아니다 */
export const HUB_MIN_PRICED_MONTHS = 2;
/** 그래프의 "적은 표본" 경계(ScrubLine fewBelow) — 그 달 거래가 이보다 적으면 속 빈 점 */
export const HUB_FEW_BELOW = 3;
/** [1009 · C 리뷰] 탭이 되려면 거래 3건 이상인 달이 이만큼 — 하나뿐이면 비교할 짝이 없어 머리 등락이 1~2건짜리 달에 끌려갔다
    (리뷰 실측: 풍림아이원 84㎡ 달별 [3,0,1,1,2,0,1] → 머리 "10.9억 ▲18.5%"가 1건짜리 8월 · 3개 구 231곳 중 77곳이 이 모양) */
export const HUB_MIN_SOLID_MONTHS = 2;

function tabFrom(
  kind: "unit" | "band",
  unitM2: number | null,
  bandSlug: string | null,
  lite: readonly TradeLite[],
  now: Date,
  capped: boolean,
): { tab: HubSeriesTab; yms: string[]; truncated: boolean } | null {
  const s = buildComplexTradeSeries(lite, {
    unitM2: kind === "unit" ? unitM2 : null,
    bandSlug: kind === "band" ? bandSlug : null,
    now,
    monthsBack: HUB_SERIES_MONTHS,
    capped,
  });
  if (!s || s.pricedMonths < HUB_MIN_PRICED_MONTHS) return null;
  /* 모든 달이 1~2건이면(속 빈 점뿐) 선이 한두 건의 우연을 추세처럼 보인다 — 하네스 실측: 3건짜리 단지가
     "▼ 9.7%" 머리를 달았다. [1009 · C 리뷰] 3건 이상인 달이 **둘 이상** 있어야 탭을 만든다 — 하나뿐이면 그 달과
     1~2건짜리 달을 견주게 된다(HUB_MIN_SOLID_MONTHS 주석). 한 건 단위 목록은 그대로 보인다. */
  if (s.months.filter((m) => m.n >= HUB_FEW_BELOW).length < HUB_MIN_SOLID_MONTHS) return null;
  const band = kind === "band" ? AREA_BANDS.find((b) => b.slug === bandSlug) : null;
  return {
    tab: {
      key: kind === "unit" ? `u${unitM2}` : `b${bandSlug}`,
      kind,
      unitM2: kind === "unit" ? unitM2 : null,
      bandLabel: band?.label ?? null,
      values: s.months.map((m) => m.avgMan),
      counts: s.months.map((m) => m.n),
      total: s.months.reduce((acc, m) => acc + m.n, 0),
    },
    yms: s.months.map((m) => m.ym),
    truncated: s.truncated,
  };
}

/**
 * 평형별 월평균 추이 — 대표 평형(없으면 대표 면적대)이 첫 탭, 이어서 거래 많은 평형(최대 4탭).
 * 모든 탭은 같은 달 축을 쓴다(buildComplexTradeSeries 가 전체 거래로 축을 정한다). 탭이 하나도 안 서면 null.
 */
export function hubSeries(
  deals: readonly HubDeal[] | null | undefined,
  opts: { now: Date; headline?: HubHeadline | null; capped?: boolean },
): HubSeries | null {
  const lite = toTradeLite(deals);
  if (lite.length === 0) return null;
  const capped = Boolean(opts.capped);
  const tabs: HubSeriesTab[] = [];
  /* 탭마다 같은 달 축이다(전체 거래로 정해진다) — 첫 탭의 축을 쓴다 */
  const acc: { yms: string[] | null; truncated: boolean } = { yms: null, truncated: false };
  const push = (r: ReturnType<typeof tabFrom>) => {
    if (!r || tabs.some((t) => t.key === r.tab.key)) return;
    tabs.push(r.tab);
    acc.yms ??= r.yms;
    acc.truncated = acc.truncated || r.truncated;
  };

  const h = opts.headline;
  if (h?.kind === "rep" && h.basis === "band") {
    const slug = AREA_BANDS.find((b) => b.label === h.bandLabel)?.slug ?? null;
    if (slug) push(tabFrom("band", null, slug, lite, opts.now, capped));
  } else if (h?.unitM2 != null) {
    push(tabFrom("unit", h.unitM2, null, lite, opts.now, capped));
  }
  /* 대표가와 같은 평형(면적대) 탭 — 위에서 섰으면 첫 탭이다. 한 건(single)은 평균이 아니라 "같은 평형 최근 N건"이 아니다 */
  const repTab = h?.kind === "rep" ? tabs[0] : undefined;
  const rep =
    h?.kind === "rep" && repTab && repTab.kind === (h.basis === "band" ? "band" : "unit")
      ? { key: repTab.key, basis: repTab.kind, sampleSize: h.sampleSize, compare: h.base != null }
      : null;

  /* 거래 많은 평형 순(동수면 작은 평형 먼저) — 창 안 거래 수로 센다 */
  const byUnit = new Map<number, number>();
  for (const r of lite) byUnit.set(unitOf(r.area), (byUnit.get(unitOf(r.area)) ?? 0) + 1);
  const units = [...byUnit.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0]).map(([u]) => u);
  for (const u of units) {
    if (tabs.length >= HUB_MAX_TABS) break;
    push(tabFrom("unit", u, null, lite, opts.now, capped));
  }
  if (tabs.length === 0 || !acc.yms) return null;
  return { yms: acc.yms, tabs, defaultKey: tabs[0].key, truncated: acc.truncated, rep };
}

/** 기간 탭 — 12개월 이하면 탭 없음(전체 = 1년), 넘으면 1년 · 전체 */
export function hubRanges(monthCount: number): { key: string; label: string; last: number }[] {
  if (monthCount <= 12) return [];
  return [
    { key: "1y", label: "1년", last: 12 },
    { key: "all", label: monthCount >= HUB_SERIES_MONTHS ? "3년" : "전체", last: 0 },
  ];
}

/* ── 최근 실거래 목록 ────────────────────────────────────────────────── */

/**
 * [1009 · C 리뷰] 행 묶음에서 가장 최근 **계약** 한 건 — compareLatest 와 같은 순서(계약월 → 계약일(없으면 뒤) → 금액 큰 쪽 →
 * 면적 큰 쪽). 공용 로더는 계약월로만 정렬해 같은 달 안 순서가 DB 반환 순서였다 — 리뷰 실측: 헬리오시티 60~85㎡ "최근"이
 * 8/1 계약 28억 9,000만이었는데 실제 최신은 8/15 29억(목록 첫 줄).
 */
export function latestTradeRow<
  T extends { contract_ym: string | number; contract_day?: number | null; deal_amount_krw: number | string; area_m2?: number | null },
>(rows: readonly T[]): T | null {
  let best: T | null = null;
  for (const r of rows) {
    if (!best) {
      best = r;
      continue;
    }
    const c = compareLatest(
      { ym: String(r.contract_ym), day: finite(r.contract_day) ? r.contract_day : null, man: Number(r.deal_amount_krw), area: finite(r.area_m2) ? r.area_m2 : null },
      { ym: String(best.contract_ym), day: finite(best.contract_day) ? best.contract_day : null, man: Number(best.deal_amount_krw), area: finite(best.area_m2) ? best.area_m2 : null },
    );
    if (c < 0) best = r;
  }
  return best;
}

/** 최근 n건(최신순) — 목록·표용 배열 */
export function recentDealTuples(deals: readonly HubDeal[] | null | undefined, n = 60): DealTuple[] {
  return [...(deals ?? [])]
    .filter(validDeal)
    .sort(compareLatest)
    .slice(0, n)
    .map((d) => [
      d.ym,
      finite(d.day) ? d.day : null,
      d.man,
      finite(d.area) && d.area > 0 ? d.area : null,
      /* 지하층(음수)은 그대로 — 0 만 "모름" */
      finite(d.floor) && d.floor !== 0 ? d.floor : null,
    ]);
}

/** 비교 기준 문구 — "2026.01 거래 6건 평균보다" · "2026.01~02 거래 6건 평균보다" */
export function baseSince(b: HubBaseWindow): string {
  const f = ymDot(b.firstYm);
  const l = b.latestYm.slice(0, 4) === b.firstYm.slice(0, 4) ? b.latestYm.slice(4, 6) : ymDot(b.latestYm);
  return `${b.firstYm === b.latestYm ? f : `${f}~${l}`} 거래 ${b.count}건 평균보다`;
}

/** [1009 · C] 비교 기준의 짧은 꼴 — "26.01" · "26.01~04" · "25.11~26.02"(공유 카드 등락 줄 "▼ 0.8% · 26.01~04 대비") */
export function baseShortLabel(b: HubBaseWindow): string {
  const f = ymShortDot(b.firstYm);
  if (b.firstYm === b.latestYm) return f;
  const l = b.latestYm.slice(0, 4) === b.firstYm.slice(0, 4) ? b.latestYm.slice(4, 6) : ymShortDot(b.latestYm);
  return `${f}~${l}`;
}

/** "26.08" — 그래프 축 */
export function ymShortDot(ym: string): string {
  return `${ym.slice(2, 4)}.${ym.slice(4, 6)}`;
}

/** "2026년 8월" — 그래프 머리 */
export function ymLongKo(ym: string): string {
  return `${ym.slice(0, 4)}년 ${Number(ym.slice(4, 6))}월`;
}

/** "2026.08" */
export function ymDot(ym: string): string {
  return `${ym.slice(0, 4)}.${ym.slice(4, 6)}`;
}
