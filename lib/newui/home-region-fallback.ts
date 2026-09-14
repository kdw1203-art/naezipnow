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
  opts: { minTrades?: number } = {},
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
    });
  }
  return cards;
}
