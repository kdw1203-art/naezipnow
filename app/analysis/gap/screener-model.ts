/**
 * [1021 · 지역 시세 gap] 전세가율·갭 스크리너의 조건·정렬·예산 — 순수 함수만(클라이언트·테스트 공용).
 *
 * 지시: 시안(mock8/gap) — 왼쪽 조건 패널(전세가율 이상 · 갭 이하 · 지역 · 월세 환산은 데이터에 있을 때만), 값은 URL 쿼리에
 * 남기되 **서버는 searchParams 를 읽지 않는다**(읽으면 ISR 캐시 정책이 바뀐다) — 클라이언트가 history.replaceState 로만 반영하고
 * 필터는 클라이언트 계산. "내 예산으로" = 갭 ≤ 예산인 곳 수 · 그 평균 매매가(표 데이터로 계산 가능한 값).
 * 새 지표는 없다: 갭은 page.tsx 가 이미 낸 실측(measuredGap) 우선 · 없으면 추정(gap).
 */
import type { Row } from "./RankTable";

export type SortKey = "ratio" | "gap" | "index";

export type GapFilter = {
  /** 전세가율 이상(%) — null 이면 제한 없음 */
  minRatio: number | null;
  /** 갭 이하(만원) — null 이면 제한 없음 */
  maxGapMan: number | null;
  /** 시/도("서울"·"경기"…) — null 이면 전국 */
  sido: string | null;
  /** 월세 환산 수익률 이상(연 %) — null 이면 제한 없음. 표에 값이 없는 지역은 조건이 있으면 빠진다 */
  minYield: number | null;
};

export const EMPTY_FILTER: GapFilter = { minRatio: null, maxGapMan: null, sido: null, minYield: null };

export const RATIO_OPTIONS: readonly number[] = [50, 60, 65, 70, 75, 80];
/** 만원 */
export const GAP_OPTIONS: readonly number[] = [3_000, 5_000, 10_000, 20_000, 30_000, 50_000];
export const YIELD_OPTIONS: readonly number[] = [1, 2, 3, 4];

/** 표에 적는 갭(원) — 실측 우선, 없으면 추정, 둘 다 없으면 null */
export function effectiveGap(r: Pick<Row, "measuredGap" | "gap">): number | null {
  if (r.measuredGap !== undefined) return r.measuredGap;
  if (r.gap !== undefined) return r.gap;
  return null;
}

function numParam(v: string | null): number | null {
  if (v === null || v.trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/** URL 쿼리("?ratio=70&gap=5000&sido=경기&yield=2") → 조건. 모르는 값은 무시 */
export function parseFilter(search: string): GapFilter {
  const q = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const sido = (q.get("sido") ?? "").trim();
  return {
    minRatio: numParam(q.get("ratio")),
    maxGapMan: numParam(q.get("gap")),
    sido: sido ? sido : null,
    minYield: numParam(q.get("yield")),
  };
}

/** 조건 → 쿼리 문자열("" 이면 조건 없음). 정렬·예산도 같이 남긴다 */
export function serializeFilter(f: GapFilter, extra?: { sort?: SortKey; budgetMan?: number | null }): string {
  const q = new URLSearchParams();
  if (f.minRatio !== null) q.set("ratio", String(f.minRatio));
  if (f.maxGapMan !== null) q.set("gap", String(f.maxGapMan));
  if (f.sido) q.set("sido", f.sido);
  if (f.minYield !== null) q.set("yield", String(f.minYield));
  if (extra?.sort && extra.sort !== "ratio") q.set("sort", extra.sort);
  if (extra?.budgetMan !== undefined && extra.budgetMan !== null) q.set("budget", String(extra.budgetMan));
  const s = q.toString();
  return s ? `?${s}` : "";
}

export function parseSort(search: string): SortKey {
  const v = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search).get("sort");
  return v === "gap" || v === "index" ? v : "ratio";
}

export function parseBudget(search: string): number | null {
  return numParam(new URLSearchParams(search.startsWith("?") ? search.slice(1) : search).get("budget"));
}

export function applyFilter<T extends Pick<Row, "ratio" | "gap" | "measuredGap" | "group" | "rentYield">>(
  rows: readonly T[],
  f: GapFilter,
): T[] {
  return rows.filter((r) => {
    if (f.minRatio !== null && r.ratio < f.minRatio) return false;
    if (f.maxGapMan !== null) {
      const g = effectiveGap(r);
      if (g === null || g > f.maxGapMan * 10_000) return false;
    }
    if (f.sido && r.group !== f.sido) return false;
    if (f.minYield !== null && (r.rentYield === undefined || r.rentYield < f.minYield)) return false;
    return true;
  });
}

/** 정렬 — 전세가율 높은 순 · 갭 작은 순(갭 없는 행은 뒤) · 지수 오른 순(변동 없는 행은 뒤). 같으면 이름 가나다 */
export function sortRows<T extends Pick<Row, "ratio" | "gap" | "measuredGap" | "saleChange" | "name">>(
  rows: readonly T[],
  key: SortKey,
): T[] {
  const byName = (a: T, b: T) => a.name.localeCompare(b.name, "ko");
  const out = [...rows];
  if (key === "gap") {
    out.sort((a, b) => {
      const ga = effectiveGap(a);
      const gb = effectiveGap(b);
      if (ga === null && gb === null) return byName(a, b);
      if (ga === null) return 1;
      if (gb === null) return -1;
      return ga - gb || byName(a, b);
    });
  } else if (key === "index") {
    out.sort((a, b) => {
      const ia = a.saleChange;
      const ib = b.saleChange;
      if (ia === undefined && ib === undefined) return byName(a, b);
      if (ia === undefined) return 1;
      if (ib === undefined) return -1;
      return ib - ia || byName(a, b);
    });
  } else {
    out.sort((a, b) => b.ratio - a.ratio || byName(a, b));
  }
  return out;
}

/** 내 예산으로 — 갭 ≤ 예산(만원)인 지역 수와 그 지역들의 평균 매매가(원, 매매가 있는 행만). 예산이 없으면 null */
export function budgetSummary<T extends Pick<Row, "gap" | "measuredGap" | "avgSale">>(
  rows: readonly T[],
  budgetMan: number | null,
): { count: number; avgSale: number | null } | null {
  if (budgetMan === null || !Number.isFinite(budgetMan) || budgetMan <= 0) return null;
  const hit = rows.filter((r) => {
    const g = effectiveGap(r);
    return g !== null && g <= budgetMan * 10_000;
  });
  const sales = hit.map((r) => r.avgSale).filter((v): v is number => typeof v === "number" && v > 0);
  return {
    count: hit.length,
    avgSale: sales.length > 0 ? Math.round(sales.reduce((a, b) => a + b, 0) / sales.length) : null,
  };
}

/** 시/도 선택지 — 지역 수 많은 순, 같으면 가나다 */
export function sidoOptions(rows: readonly Pick<Row, "group">[]): string[] {
  const m = new Map<string, number>();
  for (const r of rows) m.set(r.group, (m.get(r.group) ?? 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "ko")).map(([s]) => s);
}
