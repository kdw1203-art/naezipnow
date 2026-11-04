/**
 * [1103] 신고가 탐지의 순수 부분 — DB 를 읽지 않는다(tests/unit/ops-1103.test.ts).
 * DB 를 읽는 쪽은 lib/market/price-highs.ts(server-only). 규칙은 RPC detect_new_price_highs 와 같다(그 파일 머리 주석).
 */
import type { PriceHighRow } from "./price-record-copy";

/** 새로 들어온 매매 한 건 — RPC 의 fresh CTE 가 읽던 열 */
export type FreshTradeRow = {
  complex_name: string;
  region_name: string;
  area_m2: number;
  deal_amount_krw: number;
  contract_ym: string;
  contract_day: number | null;
};

/** (단지, 지역, 반올림 면적) 묶음의 최고가 한 건 — RPC 의 `distinct on (...) order by ..., deal_amount_krw desc` */
export type FreshGroup = {
  complex_name: string;
  region_name: string;
  area: number;
  deal_amount_krw: number;
  contract_ym: string;
  contract_day: number | null;
};

/** Postgres round(numeric)::int 와 같은 값 — 양수 면적에서 반올림(.5 는 올림) */
export function roundArea(areaM2: number): number {
  return Math.round(areaM2);
}

export function freshGroupKey(r: { complex_name: string; region_name: string; area: number }): string {
  return `${r.complex_name}\u0001${r.region_name}\u0001${r.area}`;
}

/**
 * 묶음마다 최고가 한 건만 남기고 **금액 내림차순**으로. 같은 금액이면 먼저 본 것(호출부가 금액 내림차순으로 읽어 온다).
 * 이미 본 묶음은 seen 에 넣는다 — 여러 쪽에 걸쳐 불러도 묶음이 두 번 나오지 않는다(뒤 쪽의 같은 묶음은 더 싸다).
 */
export function collectFreshGroups(rows: readonly FreshTradeRow[], seen: Set<string> = new Set()): FreshGroup[] {
  const out: FreshGroup[] = [];
  const best = new Map<string, FreshGroup>();
  for (const r of rows) {
    if (!r.complex_name || !Number.isFinite(r.area_m2) || !Number.isFinite(r.deal_amount_krw)) continue;
    const g: FreshGroup = {
      complex_name: r.complex_name,
      region_name: r.region_name,
      area: roundArea(r.area_m2),
      deal_amount_krw: r.deal_amount_krw,
      contract_ym: r.contract_ym,
      contract_day: r.contract_day ?? null,
    };
    const k = freshGroupKey(g);
    if (seen.has(k)) continue;
    const prev = best.get(k);
    if (!prev || g.deal_amount_krw > prev.deal_amount_krw) best.set(k, g);
  }
  for (const [k, g] of best) {
    seen.add(k);
    out.push(g);
  }
  return out.sort((a, b) => b.deal_amount_krw - a.deal_amount_krw);
}

/**
 * 앞선 이력의 면적 구간 — RPC 의 `round(t.area_m2)::int between f.area-2 and f.area+2` 를 원값 범위로.
 * round(x) ≥ a-2 ⇔ x ≥ a-2.5, round(x) ≤ a+2 ⇔ x < a+2.5 (양수 · .5 올림) — 그래서 [a-2.5, a+2.5).
 */
export function priorAreaRange(area: number): { gte: number; lt: number } {
  return { gte: area - 2.5, lt: area + 2.5 };
}

/** "YYYYMM" — UTC 기준 n개월 전 달(RPC 의 to_char(now() - interval 'n month', 'YYYYMM') 과 같은 달) */
export function utcYmMonthsAgo(n: number, now: Date = new Date()): string {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - n, 1));
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/**
 * 신고가 판정 — RPC 의 `h.prior_n >= p_min_prior and h.prior_max is not null and f.deal_amount_krw > h.prior_max * p_margin`.
 * 곱셈은 정수로 한다(배율을 만분율로) — 부동소수 오차로 경계값이 뒤집히지 않게. 원 단위 금액 × 10,000 은 1,000억 원이어도
 * 1e15 라 2^53(9e15) 안쪽이다 — 정수 그대로 정확하다(BigInt 리터럴은 tsconfig target ES2017 에서 못 쓴다).
 */
export function isNewHigh(
  deal: number,
  prior: { max: number | null; n: number },
  minPrior: number,
  margin: number,
): boolean {
  if (prior.n < minPrior || prior.max == null || !Number.isFinite(prior.max)) return false;
  return Math.round(deal) * 10_000 > Math.round(prior.max) * Math.round(margin * 10_000);
}

export function toPriceHighRow(g: FreshGroup, prior: { max: number; n: number }): PriceHighRow {
  return {
    complex_name: g.complex_name,
    region_name: g.region_name,
    area: g.area,
    deal_amount_krw: g.deal_amount_krw,
    prior_max: prior.max,
    prior_n: prior.n,
    contract_ym: g.contract_ym,
    contract_day: g.contract_day,
  };
}
