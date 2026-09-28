/**
 * [1024 · 원룸·오피스텔] 보증금 × 월세 산점 배치 — 순수 계산. 그리는 쪽은 app/rent/[region]/RentScatter.tsx(서버 SVG).
 *
 * 좌표는 **퍼센트**다. SVG 에 viewBox 를 두지 않고 width=100% 로 두면 cx="37%" 가 폭에 따라 풀리고,
 * 글자·점 반지름은 px 로 고정된다 — 폰에서 글자가 같이 쪼그라드는 viewBox 축소를 피한다.
 */
import type { NonAptRentDeal } from "@/lib/market/rent-nonapt-core";

export type ScatterPoint = { xPct: number; yPct: number; depositKrw: number; monthlyKrw: number };
export type ScatterTick = { pct: number; value: number };
export type ScatterLayout = {
  points: ScatterPoint[];
  xMax: number;
  yMax: number;
  /** 세로 눈금(월세) — 25·50·75% */
  yTicks: ScatterTick[];
  /** 가로 눈금(보증금) — 50·100% */
  xTicks: ScatterTick[];
};

/** 점이 놓이는 가로 구간(퍼센트) — 왼쪽은 세로 눈금 글자 자리 */
export const SCATTER_X_RANGE: readonly [number, number] = [11, 97];
/** 점이 놓이는 세로 구간(퍼센트, 위가 0) */
export const SCATTER_Y_RANGE: readonly [number, number] = [8, 88];

/** 축 상한 — 최댓값을 1·2·2.5·5×10^n 중 바로 위 눈금으로 올린다(눈금 글자가 "1.2억"처럼 떨어지게) */
export function niceMax(v: number): number {
  if (!Number.isFinite(v) || v <= 0) return 1;
  const exp = Math.floor(Math.log10(v));
  const base = Math.pow(10, exp);
  for (const m of [1, 2, 2.5, 5, 10]) {
    if (v <= m * base) return m * base;
  }
  return 10 * base;
}

export function scatterLayout(deals: readonly NonAptRentDeal[], maxPoints = 400): ScatterLayout {
  const src = deals.filter((d) => d.monthlyKrw > 0 && d.depositKrw > 0).slice(0, maxPoints);
  const xMax = niceMax(Math.max(0, ...src.map((d) => d.depositKrw)));
  const yMax = niceMax(Math.max(0, ...src.map((d) => d.monthlyKrw)));
  const [x0, x1] = SCATTER_X_RANGE;
  const [y0, y1] = SCATTER_Y_RANGE;
  const px = (v: number, max: number) => (max > 0 ? Math.min(1, Math.max(0, v / max)) : 0);
  const points = src.map((d) => ({
    xPct: Math.round((x0 + (x1 - x0) * px(d.depositKrw, xMax)) * 10) / 10,
    yPct: Math.round((y1 - (y1 - y0) * px(d.monthlyKrw, yMax)) * 10) / 10,
    depositKrw: d.depositKrw,
    monthlyKrw: d.monthlyKrw,
  }));
  const yTicks = [0.25, 0.5, 0.75].map((f) => ({ pct: Math.round((y1 - (y1 - y0) * f) * 10) / 10, value: yMax * f }));
  const xTicks = [0.5, 1].map((f) => ({ pct: Math.round((x0 + (x1 - x0) * f) * 10) / 10, value: xMax * f }));
  return { points, xMax, yMax, yTicks, xTicks };
}
