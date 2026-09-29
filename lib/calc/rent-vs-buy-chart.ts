/**
 * [1025c · 담당 S] 살까·빌릴까 — 대표 그림 두 장의 **좌표 계산(순수)**. 렌더는 app/calculator/rent-vs-buy/RentVsBuyCharts.tsx.
 * 나눈 이유: 누적 막대의 조각 합 = 총비용, 곡선의 단조 감소, 교차점이 범위 안에 있음 같은 정직성 규칙을
 * 단위검증(tests/unit/rentbuy-1025.test.ts `[1025c]`)으로 잠그기 위해서다(node --test 는 .tsx 를 못 읽는다).
 * 좌표는 viewBox 단위(가로 320) — 폰 320px 안에 가로 스크롤 없이 들어간다. 숫자는 전부 lib/calc/rent-vs-buy 가 만든 값.
 *
 *  1. 누적 막대(layoutStackedBars): 매매·전세·월세 세 기둥을 늘 나란히. 조각은 이자 · 취득세+중개 · 기회비용 · 월세 합 · −상승분.
 *     양수 조각은 아래에서 위로 쌓고, 상승분이 양수(집값이 오름)면 총합을 **깎는** 조각이라 쌓인 기둥 꼭대기에서 아래로
 *     덮는 빨간 조각(kind "offset")으로 그린다 — 덮인 만큼이 빠진 비용이고 순합계(라벨)는 그 아래 선이다. 집값이 내리면
 *     손실이라 양수 조각으로 쌓는다. 합계를 못 만드는 기둥은 점선 윤곽("입력 전").
 *  2. 손익분기 선(layoutBreakEven): x = 연 상승률 0~8%, 매매 총비용 곡선(순수 함수로 17점) 과 상대(전세, 없으면 월세)의
 *     수평선. 교차점은 [0, 8] 이분법 — 곡선은 g 에 단조 감소라 근이 있으면 하나. 지금 상승률 자리에 점선 표식.
 */
import { OPTION_LABELS, buyTotalAt, type OptionKey, type OptionResult, type RentVsBuyInput, type RentVsBuyResult } from "@/lib/calc/rent-vs-buy";

/* ───────────────────────── 1. 누적 막대 ───────────────────────── */

export type StackKey = "interest" | "taxbroker" | "opp" | "rent" | "gain";

/** 범례 순서 = 쌓는 순서(아래→위). gain 은 맨 위(덮개) */
export const STACK_SEGMENTS: ReadonlyArray<{ key: StackKey; label: string }> = [
  { key: "interest", label: "이자" },
  { key: "taxbroker", label: "취득세·중개" },
  { key: "opp", label: "기회비용" },
  { key: "rent", label: "월세 합" },
  { key: "gain", label: "−상승분" },
];

export type StackValue = { key: StackKey; label: string; manwon: number | null };

function partOf(opt: OptionResult, key: string): number | null {
  const p = opt.parts.find((x) => x.key === key);
  return p ? p.manwon : null;
}

function addNullable(a: number | null, b: number | null): number | null {
  if (a === null && b === null) return null;
  return (a ?? 0) + (b ?? 0);
}

/**
 * 선택지 하나의 조각 값(만원) — 항목별 값을 범례 조각으로 묶는다. 합(모두 있을 때)은 opt.total 과 같다.
 *  · 매매: 이자 · 취득세+중개보수 · 자기자본 기회비용 · 상승분(부호 그대로: 오르면 음수)
 *  · 전세: 전세대출 이자 → 이자 · 중개보수 → 취득세·중개 · 보증금 기회비용
 *  · 월세: 월세 합 · 중개보수 → 취득세·중개 · 보증금 기회비용
 * 그 선택지에 없는 조각은 0(범례에는 적되 막대에는 안 그린다). 값을 못 만든 조각은 null.
 */
export function stackValuesOf(opt: OptionResult): StackValue[] {
  const v: Record<StackKey, number | null> = { interest: 0, taxbroker: 0, opp: 0, rent: 0, gain: 0 };
  if (opt.key === "buy") {
    v.interest = partOf(opt, "interest");
    v.taxbroker = addNullable(partOf(opt, "tax"), partOf(opt, "broker"));
    v.opp = partOf(opt, "opp");
    v.gain = partOf(opt, "gain");
  } else if (opt.key === "jeonse") {
    v.interest = partOf(opt, "jloan");
    v.taxbroker = partOf(opt, "broker");
    v.opp = partOf(opt, "opp");
  } else {
    v.rent = partOf(opt, "rent");
    v.taxbroker = partOf(opt, "broker");
    v.opp = partOf(opt, "opp");
  }
  return STACK_SEGMENTS.map((s) => ({ key: s.key, label: s.label, manwon: v[s.key] }));
}

export type StackSegmentBox = {
  key: StackKey;
  label: string;
  manwon: number;
  x: number;
  y: number;
  w: number;
  h: number;
  /** fill = 단색 · soft = 연한 면 + 파란 테두리(기회비용) · offset = 상승분이 깎는 덮개 */
  kind: "fill" | "soft" | "offset";
};

export type StackBarBox = {
  key: OptionKey;
  label: string;
  x: number;
  w: number;
  /** 순합계(만원) — 없으면 점선 윤곽 */
  total: number | null;
  missing: string[];
  segments: StackSegmentBox[];
  /** 쌓인 기둥 꼭대기 y(양수 조각 합) */
  grossY: number;
  /** 순합계 y — offset 조각이 있으면 grossY 보다 아래 */
  netY: number;
  /** 합계 글자 y */
  labelY: number;
  /** 가장 적게 드는 쪽 */
  best: boolean;
};

export type StackedBarsLayout = {
  width: number;
  height: number;
  baseY: number;
  top: number;
  bars: StackBarBox[];
  /** 범례 — 보이는 기둥의 조각 합(0 이면 "0" 으로 적고 막대에는 없다) */
  legend: { key: StackKey; label: string; manwon: number }[];
  maxV: number;
  minV: number;
};

const SB_W = 320;
const SB_H = 190;
const SB_TOP = 28;
const SB_BASE = 158;
const SB_BW = 56;

const r1 = (n: number) => Math.round(n * 10) / 10;

/**
 * 세 기둥을 늘 나란히(없는 쪽은 "입력 전" 윤곽). y 눈금은 가장 높은 기둥(양수 조각 합)이 위 여백에 닿게,
 * 순합계가 음수(상승분이 비용보다 큼)면 기준선 아래로 내려간다.
 */
export function layoutStackedBars(result: Pick<RentVsBuyResult, "buy" | "jeonse" | "monthly" | "cheapest">): StackedBarsLayout {
  const opts: OptionResult[] = [result.buy, result.jeonse, result.monthly];
  const values = opts.map((o) => (o.total === null ? null : stackValuesOf(o)));
  let maxV = 0;
  let minV = 0;
  values.forEach((vals, i) => {
    if (!vals) return;
    const gross = vals.filter((s) => s.key !== "gain").reduce((a, s) => a + Math.max(0, s.manwon ?? 0), 0) + Math.max(0, vals.find((s) => s.key === "gain")?.manwon ?? 0);
    maxV = Math.max(maxV, gross);
    minV = Math.min(minV, opts[i].total ?? 0);
  });
  if (maxV <= 0) maxV = 1;
  const plotH = SB_BASE - SB_TOP;
  const span = maxV - minV;
  const baseY = minV < 0 ? SB_TOP + (plotH * maxV) / span : SB_BASE;
  const scale = plotH / span;

  const gap = (SB_W - 3 * SB_BW) / 4;
  const legendSum: Record<StackKey, number> = { interest: 0, taxbroker: 0, opp: 0, rent: 0, gain: 0 };

  const bars: StackBarBox[] = opts.map((opt, ci) => {
    const x = r1(gap + ci * (SB_BW + gap));
    const vals = values[ci];
    if (!vals || opt.total === null) {
      return { key: opt.key, label: OPTION_LABELS[opt.key], x, w: SB_BW, total: null, missing: opt.missing, segments: [], grossY: SB_TOP, netY: baseY, labelY: (SB_TOP + baseY) / 2, best: false };
    }
    const segments: StackSegmentBox[] = [];
    let y = baseY;
    const gain = vals.find((s) => s.key === "gain")?.manwon ?? 0;
    for (const s of vals) {
      const v = s.manwon ?? 0;
      legendSum[s.key] += v;
      if (s.key === "gain") continue;
      if (v <= 0) continue;
      const h = v * scale;
      y -= h;
      segments.push({ key: s.key, label: s.label, manwon: v, x, y: r1(y), w: SB_BW, h: r1(h), kind: s.key === "opp" ? "soft" : "fill" });
    }
    if (gain > 0) {
      /* 집값이 내려 손실 — 비용이라 위에 쌓는다 */
      const h = gain * scale;
      y -= h;
      segments.push({ key: "gain", label: "−상승분", manwon: gain, x, y: r1(y), w: SB_BW, h: r1(h), kind: "fill" });
    }
    const grossY = r1(y);
    let netY = grossY;
    if (gain < 0) {
      /* 집값이 올라 비용을 깎는다 — 꼭대기에서 아래로 덮는 조각. 순합계가 음수면 기준선 아래까지 */
      const h = -gain * scale;
      netY = r1(grossY + h);
      segments.push({ key: "gain", label: "−상승분", manwon: gain, x, y: grossY, w: SB_BW, h: r1(h), kind: "offset" });
    }
    return {
      key: opt.key,
      label: OPTION_LABELS[opt.key],
      x,
      w: SB_BW,
      total: opt.total,
      missing: [],
      segments,
      grossY,
      netY,
      labelY: r1(grossY - 7),
      best: result.cheapest === opt.key,
    };
  });

  const legend = STACK_SEGMENTS.map((s) => ({ key: s.key, label: s.label, manwon: Math.round(legendSum[s.key]) })).filter(
    (s) => s.key !== "rent" || result.monthly.total !== null,
  );
  return { width: SB_W, height: SB_H, baseY: r1(baseY), top: SB_TOP, bars, legend, maxV, minV };
}

/* ───────────────────────── 2. 손익분기 선 ───────────────────────── */

export const BE_CHART_RANGE: readonly [number, number] = [0, 8];
export const BE_CURVE_POINTS = 17;

export type BreakEvenLayout = {
  width: number;
  height: number;
  plot: { l: number; r: number; t: number; b: number };
  /** 매매 총비용 곡선 — 상승률 0~8% 를 17점 */
  curve: { g: number; total: number; x: number; y: number }[];
  /** polyline points 문자열 */
  path: string;
  /** 상대(전세, 없으면 월세)의 수평선 */
  rentLine: { key: Exclude<OptionKey, "buy">; label: string; total: number; y: number } | null;
  xTicks: { g: number; x: number }[];
  yTicks: { v: number; y: number; label: string }[];
  /** 교차점(범위 안에 있을 때만) — 상승률 % 소수 1자리 */
  cross: { g: number; x: number; y: number } | null;
  /** 지금 상승률 표식(범위 안일 때만) */
  now: { g: number; x: number } | null;
  /** 곡선 이름표 자리 */
  curveLabel: { x: number; y: number };
  yMin: number;
  yMax: number;
};

const BE_W = 320;
const BE_H = 180;
const BE_L = 46;
const BE_R = 12;
const BE_T = 14;
const BE_B = 26;

/** 1·2·5 × 10^k 눈금 간격 — 5~6칸 */
export function niceStep(range: number): number {
  if (!(range > 0)) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(range / 4)));
  for (const m of [1, 2, 5, 10]) {
    const s = m * p;
    if (range / s <= 6) return s;
  }
  return 10 * p;
}

/** 만원 눈금 글자 — 1.2억 · 6천 · 0 · −6천 · 500만 */
export function tickLabel(v: number): string {
  if (v === 0) return "0";
  const a = Math.abs(v);
  const sign = v < 0 ? "−" : "";
  if (a >= 10_000) return `${sign}${String(Math.round((a / 10_000) * 10) / 10)}억`;
  if (a >= 1_000 && a % 1_000 === 0) return `${sign}${a / 1_000}천`;
  return `${sign}${a.toLocaleString("ko-KR")}만`;
}

/**
 * 손익분기 선 그래프 좌표. 매매를 계산할 수 없거나(입력 부족) 상대가 없으면 null.
 * @param growthNow 지금 슬라이더 값(연 %) — 범위 밖이면 표식 없음
 */
export function layoutBreakEven(
  input: RentVsBuyInput,
  result: Pick<RentVsBuyResult, "jeonse" | "monthly" | "breakEvenAgainst">,
  growthNow: number,
): BreakEvenLayout | null {
  const [g0, g1] = BE_CHART_RANGE;
  const totals: { g: number; total: number }[] = [];
  for (let i = 0; i < BE_CURVE_POINTS; i++) {
    const g = g0 + ((g1 - g0) * i) / (BE_CURVE_POINTS - 1);
    const t = buyTotalAt(input, g);
    if (t === null) return null;
    totals.push({ g: r1(g), total: t });
  }
  const against = result.breakEvenAgainst;
  const rentTotal = against === "jeonse" ? result.jeonse.total : against === "monthly" ? result.monthly.total : null;
  if (against === null || rentTotal === null) return null;

  const lo = Math.min(rentTotal, ...totals.map((p) => p.total));
  const hi = Math.max(rentTotal, ...totals.map((p) => p.total));
  const step = niceStep(Math.max(hi - lo, 1));
  let yMin = Math.floor(lo / step) * step;
  let yMax = Math.ceil(hi / step) * step;
  if (yMax - hi < step * 0.15) yMax += step;
  if (lo - yMin < step * 0.15) yMin -= step;
  if (yMax === yMin) yMax = yMin + step;

  const xs = (g: number) => BE_L + ((BE_W - BE_L - BE_R) * (g - g0)) / (g1 - g0);
  const ys = (v: number) => BE_T + ((BE_H - BE_T - BE_B) * (yMax - v)) / (yMax - yMin);

  const curve = totals.map((p) => ({ g: p.g, total: p.total, x: r1(xs(p.g)), y: r1(ys(p.total)) }));
  const path = curve.map((p) => `${p.x},${p.y}`).join(" ");

  const yTicks: BreakEvenLayout["yTicks"] = [];
  for (let v = yMin; v <= yMax + 1e-9; v += step) yTicks.push({ v, y: r1(ys(v)), label: tickLabel(v) });
  const xTicks = [0, 2, 4, 6, 8].filter((g) => g >= g0 && g <= g1).map((g) => ({ g, x: r1(xs(g)) }));

  /* 교차점 — 곡선은 g 에 단조 감소: f(g0) > 0 > f(g1) 일 때만 범위 안에 근이 있다 */
  let cross: BreakEvenLayout["cross"] = null;
  const f = (g: number) => (buyTotalAt(input, g) ?? NaN) - rentTotal;
  const f0 = f(g0);
  const f1 = f(g1);
  if (Number.isFinite(f0) && Number.isFinite(f1) && f0 > 0 && f1 <= 0) {
    let a = g0;
    let b = g1;
    for (let i = 0; i < 50; i++) {
      const m = (a + b) / 2;
      if (f(m) > 0) a = m;
      else b = m;
      if (b - a < 0.001) break;
    }
    const g = Math.round(((a + b) / 2) * 10) / 10;
    cross = { g, x: r1(xs((a + b) / 2)), y: r1(ys(rentTotal)) };
  } else if (Number.isFinite(f0) && f0 === 0) {
    cross = { g: g0, x: r1(xs(g0)), y: r1(ys(rentTotal)) };
  }

  const now = Number.isFinite(growthNow) && growthNow >= g0 && growthNow <= g1 ? { g: growthNow, x: r1(xs(growthNow)) } : null;
  const mid = curve[Math.floor(curve.length * 0.62)];

  return {
    width: BE_W,
    height: BE_H,
    plot: { l: BE_L, r: BE_W - BE_R, t: BE_T, b: BE_H - BE_B },
    curve,
    path,
    rentLine: { key: against, label: OPTION_LABELS[against], total: rentTotal, y: r1(ys(rentTotal)) },
    xTicks,
    yTicks,
    cross,
    now,
    curveLabel: { x: r1(mid.x + 6), y: r1(mid.y - 8) },
    yMin,
    yMax,
  };
}
