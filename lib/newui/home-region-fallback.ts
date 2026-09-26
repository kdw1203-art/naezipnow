/**
 * [1002] 홈 지역 시세 카드 — 순수 변환 모음(서버 전용 import 없음).
 *
 * 두 가지가 여기 산다.
 *  1. 카드 4장이 공유하는 규칙: 어느 지역을 보여 주는지(CARD_REGIONS), 원→"32.5억"
 *     (formatEok), 변동률→"▲ 1.2%"/"변동 미상"(deltaOf), "202608"→"8월"(periodLabelOf).
 *     예전엔 home-data.ts(server-only) 안에만 있어 테스트가 못 불렀다.
 *  2. **마지막 월 집계 폴백** — `market_region_price` 스냅샷 조회가 실패하거나 0건일 때
 *     `market_region_monthly`(신고 실거래 월 집계)의 마지막 온전한 달로 같은 모양의
 *     카드를 만든다. 소유자가 빈 홈("지역 시세를 지금 불러오지 못했어요")을 여러 번
 *     봤다 — 스냅샷이 없어도 월 집계는 남아 있고, 그건 **실제 값**이다. 다만 시점이
 *     오래됐으니 카드에 `stale` 을 찍고 화면이 "마지막 집계"라고 적게 한다.
 *
 * 폴백에서 지어내지 않는 것:
 *  - 당월은 부분 집계다(예: 202609 에 거래 4건). `minTrades`(기본 10) 미만인 달은
 *    건너뛰고 그 다음 달을 쓴다 — 4건 평균을 "이달 시세"로 내보내지 않는다.
 *  - 변동률이 null 이면 DELTA_UNKNOWN. 0.0% 로 위장하지 않는다(deltaOf 규칙 그대로).
 *  - 행이 하나도 없는 지역은 카드를 만들지 않는다(빈 카드·"—" 카드 없음).
 */
import { formatKrwWon } from "@/lib/format/krw";
import { DELTA_UNKNOWN } from "@/lib/newui/delta-label";
import { reportingClosed } from "@/lib/newui/reporting-window";
import { indexMoMByRegion, type IndexRow } from "@/lib/newui/home-briefing";
import type { DeltaTone, HomeRegionCard } from "@/lib/newui/home-data";

/** 홈 시세 카드로 보여줄 지역 (내부 region id — seoul-districts 기준) */
export interface CardRegionTarget {
  id: string;
  name: string;
  city: string;
}

export const CARD_REGIONS: readonly CardRegionTarget[] = [
  { id: "gangnam", name: "강남구", city: "서울" },
  { id: "mapo", name: "마포구", city: "서울" },
  { id: "songpa", name: "송파구", city: "서울" },
  { id: "namyangju", name: "남양주", city: "경기" },
];

/**
 * 카드 id → `market_region_monthly.region_name`.
 * 월 집계 표는 스냅샷의 region id 가 아니라 "서울 강남구" 같은 이름으로 적재돼 있다.
 * CARD_REGIONS 와 같은 파일에 두는 이유: 한쪽에만 지역을 더하면 폴백 카드가 조용히
 * 한 장 빠진다(tests/unit/home-1002.test.ts 가 두 표의 키가 맞는지 잠근다).
 */
export const CARD_REGION_MONTHLY_NAMES: Record<string, string> = {
  gangnam: "서울 강남구",
  mapo: "서울 마포구",
  songpa: "서울 송파구",
  namyangju: "남양주시",
};

/** 원 단위 평균 매매가 → "32.5억" 형식
 *  [967 · 31] 본체는 lib/format/krw.ts "eok" 스타일(AI 코멘트 formatEokWon 과 같은 얼굴) */
export function formatEok(won: number): string {
  return formatKrwWon(won, { style: "eok", below: "eok", empty: false });
}

export function deltaOf(changePct: number | undefined): { delta: string; tone: DeltaTone } {
  if (typeof changePct !== "number" || !Number.isFinite(changePct)) {
    /* 예전엔 "— 0.0%" 였다. 변동률을 못 구한 지역과 정말로 보합인 지역이
       화면에서 **완전히 같은 모양**(회색 0.0%)이라, 모른다는 사실이 "변동
       없음"이라는 없는 사실로 바뀌어 있었다. 지도 말풍선도 이 문자열에서
       숫자를 뽑아 momPct=0 으로 썼다. 모르면 모른다고 적는다. */
    return { delta: DELTA_UNKNOWN, tone: "flat" };
  }
  const arrow = changePct > 0 ? "▲" : changePct < 0 ? "▼" : "—";
  const tone: DeltaTone = changePct > 0.1 ? "up" : changePct < -0.1 ? "down" : "flat";
  return { delta: `${arrow} ${Math.abs(changePct).toFixed(1)}%`, tone };
}

/** "202607" → "7월" — 기준월 표시용. 형식이 다르면 null(없는 시점을 지어내지 않는다). */
export function periodLabelOf(period: string | null | undefined): string | null {
  if (!period || !/^\d{6}$/.test(period)) return null;
  return `${Number(period.slice(4, 6))}월`;
}

/** `market_region_monthly` 에서 폴백에 필요한 컬럼만. numeric/bigint 는 문자열로 올 수 있다. */
export interface MonthlyRow {
  region_name: string | null;
  /** "YYYYMM" */
  month: string | null;
  transaction_count: number | string | null;
  /** 원 단위 */
  avg_deal_amount_krw: number | string | null;
  trend_delta_pct: number | string | null;
}

/** null·""·비수치는 undefined — `Number(null)` 은 0 이라 그대로 쓰면 "보합"이 지어진다. */
function numOrUndefined(v: number | string | null | undefined): number | undefined {
  if (v === null || v === undefined) return undefined;
  if (typeof v === "string" && v.trim() === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

export const FALLBACK_MIN_TRADES = 10;

/**
 * 월 집계 행 → 홈 지역 카드(폴백). 대상 순서를 지키고, 지역마다 **거래 건수가
 * minTrades 이상인 가장 최근 달** 하나를 쓴다. 조건에 맞는 달이 없는 지역은 뺀다.
 * 입력 순서에 기대지 않는다(월 내림차순으로 받아도, 아니어도 같은 결과).
 */
export function regionCardsFromMonthly(
  rows: MonthlyRow[],
  targets: readonly CardRegionTarget[],
  opts: {
    minTrades?: number;
    /**
     * [1009 · H] 주면 **신고 기한(말일 + 30일)이 지난 달**만 쓴다(lib/newui/reporting-window).
     * 왜: 10건 문턱만으로는 신고가 반쯤 들어온 달이 뽑혔다 — 2026-09-22 운영에서 강남구 카드가 8월(80건, 7월 189건의
     * 절반도 안 되는 신고 중인 달) 평균으로 "▼ 6.9%"를 띄웠다. 홈(home-data)은 렌더 시각을 넘긴다.
     * 안 주면 예전 규칙 그대로(테스트·다른 호출 호환).
     */
    now?: Date;
  } = {},
): HomeRegionCard[] {
  const minTrades = opts.minTrades ?? FALLBACK_MIN_TRADES;
  const cards: HomeRegionCard[] = [];
  for (const target of targets) {
    const monthlyName = CARD_REGION_MONTHLY_NAMES[target.id];
    if (!monthlyName) continue;
    let best: { month: string; count: number; won: number; delta: number | undefined } | null =
      null;
    for (const r of rows) {
      if (r.region_name !== monthlyName) continue;
      const month = typeof r.month === "string" ? r.month : "";
      if (!/^\d{6}$/.test(month)) continue;
      if (opts.now && !reportingClosed(month, opts.now)) continue;
      const count = numOrUndefined(r.transaction_count);
      if (count === undefined || count < minTrades) continue;
      const won = numOrUndefined(r.avg_deal_amount_krw);
      if (won === undefined || won <= 0) continue;
      if (best && best.month >= month) continue;
      best = { month, count, won, delta: numOrUndefined(r.trend_delta_pct) };
    }
    if (!best) continue;
    const periodLabel = periodLabelOf(best.month);
    const { delta, tone } = deltaOf(best.delta);
    cards.push({
      id: target.id,
      name: target.name,
      /* "마지막 집계"라는 설명은 카드 4장에 반복하지 않고 화면이 캡션 한 줄로 단다(page.tsx) */
      meta: `${target.city} · ${Math.round(best.count).toLocaleString("ko-KR")}건 (${periodLabel} 집계)`,
      periodLabel,
      price: formatEok(best.won),
      delta,
      tone,
      href: `/map?region=${encodeURIComponent(target.name)}`,
      spark: [],
      stale: true,
      /* [1009 · H] 표기 표준용 원값 — 변동률(trend_delta_pct)은 평균 거래가가 아니라 신고 실거래 **평당가 평균**의
         전월비다(운영 DB 함수 refresh_market_region_monthly — 두 달 모두 10건 이상일 때만 값). 화면은 "평당가 전월 대비"로 적는다 */
      city: target.city,
      trades: Math.round(best.count),
      tradesYm: best.month,
      tradesSource: "molit",
      changePct: best.delta ?? null,
      changeBasis: "avg",
      changeYm: best.month,
    });
  }
  return cards;
}

/**
 * [1009 · H] 스냅샷 카드가 빠진 지역을 월 집계 카드로 채운다 — 대상 순서 유지, 스냅샷이 있으면 스냅샷이 이긴다.
 *
 * 왜(2026-09-22 운영 실측): market_region_price 의 서울 3구(강남·마포·송파) 부동산원 행은 period '' · 평균가 null 로
 * 비어 있다. 스냅샷 조회는 **성공**(남양주 1행은 값이 있다)이라 [1002] 폴백(실패·0건일 때만)이 돌지 않았고,
 * 홈 "지역 시세"에는 카드가 **1장**(남양주)만 나갔다. 빈 칸은 같은 표의 월 집계(stale 카드 — "8월 집계" 표기)로 채운다.
 * 월 집계에도 없는 지역은 그대로 빠진다(빈 카드를 만들지 않는다).
 */
export function fillMissingRegionCards(
  primary: readonly HomeRegionCard[],
  fallback: readonly HomeRegionCard[],
  targets: readonly CardRegionTarget[],
): HomeRegionCard[] {
  const out: HomeRegionCard[] = [];
  for (const t of targets) {
    const hit = primary.find((c) => c.id === t.id) ?? fallback.find((c) => c.id === t.id);
    if (hit) out.push(hit);
  }
  return out;
}

/* ───────────── [1009 · H 리뷰] 카드 곁값(시계열) — 스파크라인 · 거래 건수의 제 달 · 등락 기준 통일 ───────────── */

/** 카드 지역의 시계열 곁값 — market_region_series 세 갈래를 읽어 여기서 모양을 맞춘다(홈 데이터 캐시 한 벌) */
export type CardSeries = {
  /** 주간 매매가격지수(오래된 것 → 최신) — 스파크라인 */
  sparks: Record<string, number[]>;
  /** 한국부동산원 월간 거래량 — 지역마다 가장 최근 달 */
  trades: Record<string, { ym: string; count: number }>;
  /** 한국부동산원 월간 매매가격지수 행(카드 지역 + 서울 구) — 카드 등락과 브리핑이 같은 행을 쓴다 */
  index: IndexRow[];
};

type SeriesRow = { region_id: string | null; period: string | null; value: number | string | null };

function ymOfPeriod(period: string | null): string | null {
  const ym = String(period ?? "").replace(/[^0-9]/g, "").slice(0, 6);
  return /^\d{6}$/.test(ym) ? ym : null;
}

/** 조회 행 → CardSeries(순수). 입력 순서에 기대지 않는다 — 기간으로 다시 정렬한다 */
export function cardSeriesFromRows(
  rows: { weekly: readonly SeriesRow[] | null; trades: readonly SeriesRow[] | null; index: readonly SeriesRow[] | null },
  sparkLength = 16,
): CardSeries {
  const weeklyBy = new Map<string, Array<{ p: string; v: number }>>();
  for (const r of rows.weekly ?? []) {
    const id = r.region_id ? String(r.region_id) : "";
    const v = Number(r.value);
    const p = String(r.period ?? "");
    if (!id || !p || !Number.isFinite(v)) continue;
    const list = weeklyBy.get(id) ?? [];
    list.push({ p, v });
    weeklyBy.set(id, list);
  }
  const sparks: Record<string, number[]> = {};
  for (const [id, list] of weeklyBy) {
    sparks[id] = list
      .sort((a, b) => a.p.localeCompare(b.p))
      .slice(-sparkLength)
      .map((x) => x.v);
  }
  const trades: Record<string, { ym: string; count: number }> = {};
  for (const r of rows.trades ?? []) {
    const id = r.region_id ? String(r.region_id) : "";
    const ym = ymOfPeriod(r.period);
    const count = Number(r.value);
    if (!id || !ym || !Number.isFinite(count) || count <= 0) continue;
    const cur = trades[id];
    if (!cur || cur.ym < ym) trades[id] = { ym, count: Math.round(count) };
  }
  return { sparks, trades, index: [...(rows.index ?? [])] };
}

/**
 * 카드에 시계열 곁값을 붙인다(순수 · 새 배열).
 *  · 스파크라인 — 주간 매매가격지수(있을 때만 갈아 끼운다).
 *  · 월 집계(국토부) 카드(stale) — 가격은 그 달 실거래 평균 그대로, **등락은 부동산원 월간 지수 전월비**로.
 *    왜(리뷰): 서울 카드가 국토부 평당가 전월비(강남 ▲2.4%·마포 ▼1.4%·송파 ▲5.7%)를 띄우는 옆에서 브리핑은 부동산원 지수로
 *    "서울 25개 구 중 25곳 상승, 평균 ▲1.3%", 지역 화면은 "시세 지수 0.6% 올랐어요"라고 했다 — [950] "한 화면 한 기준"을
 *    되돌린 것이다. 지수 전월비를 못 구하면 원래의 평당가 전월비(기준 "평당가 전월 대비")를 그대로 둔다.
 *  · 스냅샷 카드 — 스냅샷 trade_count 는 기준월과 다른 달 값이라 쓰지 않고, 부동산원 월간 거래량의 제 달·출처로.
 *    스냅샷에 월간 변동률이 없으면 같은 지수의 전월비로 채운다.
 */
export function applyCardSeries(cards: readonly HomeRegionCard[], s: CardSeries): HomeRegionCard[] {
  const moms = indexMoMByRegion(s.index);
  return cards.map((c) => {
    const next: HomeRegionCard = { ...c };
    const spark = s.sparks[c.id];
    if (Array.isArray(spark) && spark.length > 0) next.spark = spark;
    const mom = moms.get(c.id);
    const useIndex = () => {
      if (!mom) return;
      const { delta, tone } = deltaOf(mom.pct);
      next.delta = delta;
      next.tone = tone;
      next.changePct = mom.pct;
      next.changeBasis = "index";
      next.changeYm = mom.ym;
    };
    if (c.stale) {
      useIndex();
    } else {
      const t = s.trades[c.id];
      next.trades = t ? t.count : null;
      next.tradesYm = t ? t.ym : null;
      next.tradesSource = t ? "reb" : undefined;
      if (next.changePct === null || next.changePct === undefined) useIndex();
    }
    return next;
  });
}
