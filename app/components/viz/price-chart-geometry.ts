/**
 * [1008 · W] 단지 실거래 흐름 그래프 — 좌표 계산(순수). 렌더(PriceHistoryChart.tsx)와 나눈 이유:
 * "거래가 적으면 선을 잇지 않는다" 같은 정직성 규칙과 축 눈금을 단위테스트로 잠그기 위해서다
 * (node --test 는 .tsx 를 못 읽는다). 좌표는 픽셀 — 렌더가 컨테이너 폭을 재서 넘긴다(글자가 늘어나지 않게).
 */

import { formatEokMan } from "@/lib/format/eok-man";
import { formatKrwWon } from "@/lib/format/krw";

export type ChartMonth = { ym: string; avgMan: number | null; n: number; nAll: number };
export type ChartScenarioPoint = { year: number; opt: number; base: number; pess: number };

export type ChartBox = { width: number; height: number; padL: number; padR: number; padT: number; padB: number; barH: number };

export type PriceChartLayout = {
  /** 과거 달 좌표 (avg 없으면 y=null) */
  points: { ym: string; x: number; y: number | null; avgMan: number | null; n: number; nAll: number }[];
  /** 실선 조각들 — 거래 3건 이상인 달이 이어진 곳만(빈 달·1~2건인 달에서 끊는다). sparse 면 비어 있다 */
  segments: string[];
  /** [1008 · 리뷰 A-10] 실선 조각 사이를 잇는 점선 — 그 사이 달은 거래가 없거나 1~2건(추세로 읽지 않게) */
  connectors: string[];
  /** 막대(전체 건수) · 그중 선과 같은 평형 몫 */
  bars: { x: number; w: number; yAll: number; hAll: number; yBand: number; hBand: number }[];
  barMax: number;
  /** y 눈금(만원) */
  ticks: { y: number; valueMan: number }[];
  /** 시나리오 선·면 (없으면 null) */
  fan: {
    opt: string;
    base: string;
    pess: string;
    area: string;
    ends: { key: "opt" | "base" | "pess"; x: number; y: number; labelY: number; valueKrw: number }[];
    yearTicks: { x: number; year: number }[];
    /** [1009 · A] 연차 점 전부(1년 뒤~) — 훑기가 연차마다 멈춘다(라벨 솎기와 별개) */
    points: { year: number; x: number; yOpt: number; yBase: number; yPess: number; opt: number; base: number; pess: number }[];
    startX: number;
    startY: number;
  } | null;
  /** 최근 달 x */
  lastX: number;
  /** [1008 · 리뷰 A-17] 첫 달 라벨을 그려도 최근 달 라벨과 안 겹치나(모바일 5년 시나리오에서 겹쳤다) */
  firstLabel: boolean;
  plotTop: number;
  plotBottom: number;
  /** [1009 · A] 선이 쓰는 아래 끝(막대 영역 바로 위) — 훑기 말풍선을 점과 겹치지 않게 놓는 데 쓴다 */
  lineBottom: number;
  sparse: boolean;
};

const r1 = (n: number) => Math.round(n * 10) / 10;

/** 1·2·2.5·5 × 10^k 의 "보기 좋은" 간격 */
export function niceStep(span: number, count: number): number {
  if (!(span > 0) || !(count > 0)) return 1;
  const raw = span / count;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const m = raw / pow;
  const nice = m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10;
  return nice * pow;
}

export function niceTicks(min: number, max: number, count = 3): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [];
  if (max === min) return [min];
  const step = niceStep(max - min, count);
  const start = Math.ceil(min / step) * step;
  const out: number[] = [];
  for (let v = start; v <= max + step * 1e-9; v += step) out.push(Math.round(v * 1e6) / 1e6);
  return out;
}

export const SPARSE_MONTHS = 3;
/** 이 건수 미만인 달은 실선에 넣지 않는다(점만, 속 빈 점) — 한두 건 값이 추세처럼 V 자를 그리던 것 */
export const FEW_TRADES = 3;
/** x 축 라벨 사이 최소 간격(px) — 10px 글자 "1년 뒤"·"26.08" 폭 */
const MIN_LABEL_GAP = 40;

export function layoutPriceChart(input: {
  months: readonly ChartMonth[];
  scenario?: { startKrw: number; path: readonly ChartScenarioPoint[] } | null;
  box: ChartBox;
}): PriceChartLayout | null {
  const { months, box } = input;
  if (!months.length || box.width < 80) return null;
  const P = months.length;
  const years = input.scenario?.path.length ? input.scenario.path[input.scenario.path.length - 1].year : 0;
  const xMaxMonths = Math.max(1, P - 1 + years * 12);
  const plotL = box.padL;
  const plotR = box.width - box.padR;
  const plotTop = box.padT;
  const plotBottom = box.height - box.padB;
  const lineBottom = plotBottom - box.barH - 6;
  const xOf = (t: number) => r1(plotL + (P === 1 && years === 0 ? (plotR - plotL) / 2 : ((plotR - plotL) * t) / xMaxMonths));

  const vals: number[] = months.filter((m) => m.avgMan != null).map((m) => m.avgMan as number);
  if (input.scenario) {
    vals.push(input.scenario.startKrw / 10_000);
    for (const p of input.scenario.path) vals.push(p.opt / 10_000, p.pess / 10_000);
  }
  if (vals.length === 0) {
    /* 가격 점이 하나도 없으면 막대만 — 선·눈금을 지어내지 않는다 */
  }
  const vMin = vals.length ? Math.min(...vals) : 0;
  const vMax = vals.length ? Math.max(...vals) : 1;
  const pad = Math.max((vMax - vMin) * 0.12, vMax * 0.02, 1);
  const lo = vMin - pad;
  const hi = vMax + pad;
  const yOf = (man: number) => r1(lineBottom - ((man - lo) / (hi - lo)) * (lineBottom - plotTop));

  const bandMonths = months.filter((m) => m.avgMan != null).length;
  const sparse = bandMonths < SPARSE_MONTHS;

  const points = months.map((m, i) => ({
    ym: m.ym,
    x: xOf(i),
    y: m.avgMan != null ? yOf(m.avgMan) : null,
    avgMan: m.avgMan,
    n: m.n,
    nAll: m.nAll,
  }));

  /* [1008 · 리뷰 A-10] 실선은 거래 3건 이상인 달끼리만 잇는다. 사이에 빈 달·1~2건 달이 끼면 실선을 끊고
     양 끝을 점선으로 잇는다(흐름은 보이되 한두 건 값이 V 자를 만들지 않게). */
  const segments: string[] = [];
  const connectors: string[] = [];
  if (!sparse) {
    const runs: { x: number; y: number }[][] = [];
    let cur: { x: number; y: number }[] = [];
    for (const p of points) {
      if (p.y != null && p.n >= FEW_TRADES) {
        cur.push({ x: p.x, y: p.y });
      } else if (cur.length) {
        runs.push(cur);
        cur = [];
      }
    }
    if (cur.length) runs.push(cur);
    for (const run of runs) {
      if (run.length >= 2) segments.push(run.map((q, i) => `${i === 0 ? "M" : "L"}${q.x} ${q.y}`).join(" "));
    }
    for (let i = 1; i < runs.length; i++) {
      const a = runs[i - 1][runs[i - 1].length - 1];
      const b = runs[i][0];
      connectors.push(`M${a.x} ${a.y} L${b.x} ${b.y}`);
    }
  }

  const barMax = Math.max(1, ...months.map((m) => m.nAll));
  const slot = P > 1 ? (xOf(1) - xOf(0)) : Math.min(28, (plotR - plotL) / 4);
  const bw = Math.max(3, Math.min(22, slot * 0.6));
  const bars = points.map((p) => {
    const hAll = r1((p.nAll / barMax) * box.barH);
    const hBand = r1((Math.min(p.n, p.nAll) / barMax) * box.barH);
    return { x: r1(p.x - bw / 2), w: r1(bw), yAll: r1(plotBottom - hAll), hAll, yBand: r1(plotBottom - hBand), hBand };
  });

  const ticks = vals.length ? niceTicks(lo, hi, 4).filter((v) => v > 0).map((v) => ({ y: yOf(v), valueMan: v })) : [];

  let fan: PriceChartLayout["fan"] = null;
  if (input.scenario && input.scenario.path.length >= 2) {
    const sx = xOf(P - 1);
    const sy = yOf(input.scenario.startKrw / 10_000);
    const line = (k: "opt" | "base" | "pess") =>
      [`M${sx} ${sy}`, ...input.scenario!.path.slice(1).map((p) => `L${xOf(P - 1 + p.year * 12)} ${yOf(p[k] / 10_000)}`)].join(" ");
    const optPts = input.scenario.path.map((p) => `${xOf(P - 1 + p.year * 12)} ${yOf(p.opt / 10_000)}`);
    const pessPts = [...input.scenario.path].reverse().map((p) => `${xOf(P - 1 + p.year * 12)} ${yOf(p.pess / 10_000)}`);
    const last = input.scenario.path[input.scenario.path.length - 1];
    const ex = xOf(P - 1 + last.year * 12);
    const ends = (["opt", "base", "pess"] as const).map((k) => ({ key: k, x: ex, y: yOf(last[k] / 10_000), labelY: yOf(last[k] / 10_000), valueKrw: last[k] }));
    /* 끝 라벨 겹침 밀어내기 — 최소 14px 간격(위→아래 순서 유지) */
    const sorted = [...ends].sort((a, b) => a.y - b.y);
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i].labelY - sorted[i - 1].labelY < 14) sorted[i].labelY = r1(sorted[i - 1].labelY + 14);
    }
    const overflow = sorted[sorted.length - 1].labelY - (lineBottom + 4);
    if (overflow > 0) for (const e of sorted) e.labelY = r1(e.labelY - overflow);
    fan = {
      opt: line("opt"),
      base: line("base"),
      pess: line("pess"),
      area: `M${optPts.join(" L")} L${pessPts.join(" L")} Z`,
      ends,
      yearTicks: thinTicks(
        input.scenario.path.slice(1).map((p) => ({ x: xOf(P - 1 + p.year * 12), year: p.year })),
        xOf(P - 1),
      ),
      points: input.scenario.path.slice(1).map((p) => ({
        year: p.year,
        x: xOf(P - 1 + p.year * 12),
        yOpt: yOf(p.opt / 10_000),
        yBase: yOf(p.base / 10_000),
        yPess: yOf(p.pess / 10_000),
        opt: p.opt,
        base: p.base,
        pess: p.pess,
      })),
      startX: sx,
      startY: sy,
    };
  }

  const lastX = xOf(P - 1);
  return {
    points,
    segments,
    connectors,
    bars,
    barMax,
    ticks,
    fan,
    lastX,
    firstLabel: P > 1 && lastX - xOf(0) >= MIN_LABEL_GAP,
    plotTop,
    plotBottom,
    lineBottom,
    sparse,
  };
}

/** 연차 라벨 솎기 — 마지막 해는 늘 남기고, 앞 라벨·최근 달 라벨과 40px 안쪽이면 뺀다 */
function thinTicks(ticks: { x: number; year: number }[], lastMonthX: number): { x: number; year: number }[] {
  const kept: { x: number; year: number }[] = [];
  let rightEdge = Number.POSITIVE_INFINITY;
  for (let i = ticks.length - 1; i >= 0; i--) {
    const t = ticks[i];
    const isLast = i === ticks.length - 1;
    if (isLast || (rightEdge - t.x >= MIN_LABEL_GAP && t.x - lastMonthX >= MIN_LABEL_GAP)) {
      kept.unshift(t);
      rightEdge = t.x;
    }
  }
  return kept;
}

/** "202608" → "2026.08" · "26.08" (short) */
export function ymLabel(ym: string, short = false): string {
  if (!/^\d{6}$/.test(ym)) return ym;
  return short ? `${ym.slice(2, 4)}.${ym.slice(4)}` : `${ym.slice(0, 4)}.${ym.slice(4)}`;
}

/* ── [1009 · A] 훑기(누르고 끌기 · 마우스 올리기 · 키보드) ───────────────────────────────
   소유자(1008): "숫자나 그래프로 보이지 않는다" → 1008 에 그래프는 생겼지만 **그 달 값을 읽을 길**이 없었다
   (포인터 반응 0 — 1009 인벤토리 실측). 토스증권 관례대로 누르고 좌우로 끌면 그 달 월평균·거래 건수가 읽힌다.
   lib/viz/scrub-geometry.ts 의 nearestValued/stepValued 와 같은 발상이되 칸이 두 종류다:
    · 과거 달 — 월평균(선의 평형)·그 달 전체 거래·같은 평형 거래. 값이 없는 달·거래 1~2건인 달도 칸이다
      (막대는 그려져 있다) — 말풍선이 "거래 없음"·"참고용"이라고 말한다(값을 지어내거나 건너뛰지 않는다).
    · 시나리오 연차(1년 뒤~) — 말풍선이 "시나리오(가정)"라고 먼저 말한다(예측을 사실처럼 보이지 않게). */

export type ScrubSlot =
  | {
      kind: "month";
      x: number;
      /** 선 위 점의 y — 값이 없으면 null */
      y: number | null;
      ym: string;
      avgMan: number | null;
      n: number;
      nAll: number;
      /** 거래 1~2건(FEW_TRADES 미만) — 선에 넣지 않은 달 */
      few: boolean;
    }
  | {
      kind: "year";
      x: number;
      /** 기본 시나리오 점의 y */
      y: number;
      year: number;
      opt: number;
      base: number;
      pess: number;
      yOpt: number;
      yPess: number;
    };

export function scrubSlots(layout: PriceChartLayout): ScrubSlot[] {
  const out: ScrubSlot[] = layout.points.map((p) => ({
    kind: "month" as const,
    x: p.x,
    y: p.y,
    ym: p.ym,
    avgMan: p.avgMan,
    n: p.n,
    nAll: p.nAll,
    few: p.avgMan != null && p.n < FEW_TRADES,
  }));
  for (const f of layout.fan?.points ?? []) {
    if (f.year < 1) continue;
    out.push({ kind: "year", x: f.x, y: f.yBase, year: f.year, opt: f.opt, base: f.base, pess: f.pess, yOpt: f.yOpt, yPess: f.yPess });
  }
  return out;
}

/**
 * [1009 · A · 리뷰] 폭을 재기 전(첫 프레임)의 달 칸 — 자리(x·y)만 없고 달 순서·값은 scrubSlots 와 같다.
 * 머리(큰 숫자)는 폭과 무관한데, 폭을 잰 뒤에만 칸을 만들어 첫 프레임에 "이 기간 거래 없음"이 깜빡였다(리뷰 실측).
 * 달 칸이 앞에 오는 순서가 같아 idleSlot·baseSlot 의 번호가 폭을 잰 뒤의 칸과 그대로 맞는다.
 */
export function monthSlots(months: readonly ChartMonth[]): ScrubSlot[] {
  return months.map((m) => ({
    kind: "month" as const,
    x: 0,
    y: null,
    ym: m.ym,
    avgMan: m.avgMan,
    n: m.n,
    nAll: m.nAll,
    few: m.avgMan != null && m.n < FEW_TRADES,
  }));
}

/** 손가락(마우스) x 에 가장 가까운 칸 — 같은 거리면 앞 칸. 칸이 없으면 null */
export function nearestSlot(slots: readonly ScrubSlot[], x: number): number | null {
  let best: number | null = null;
  let bestD = Number.POSITIVE_INFINITY;
  slots.forEach((s, i) => {
    const d = Math.abs(s.x - x);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  });
  return best;
}

/** 머리(훑기 전)가 보여 줄 달 — 거래 3건 이상인 마지막 달, 없으면 값 있는 마지막 달, 그것도 없으면 null */
export function idleSlot(slots: readonly ScrubSlot[]): number | null {
  let valued: number | null = null;
  for (let i = slots.length - 1; i >= 0; i--) {
    const s = slots[i];
    if (s.kind !== "month" || s.avgMan == null) continue;
    if (!s.few) return i;
    if (valued === null) valued = i;
  }
  return valued;
}

/** 등락 비교 기준 — 거래 3건 이상인 첫 달(한두 건 값을 기준으로 삼지 않는다). 없으면 null */
export function baseSlot(slots: readonly ScrubSlot[]): number | null {
  const i = slots.findIndex((s) => s.kind === "month" && s.avgMan != null && !s.few);
  return i >= 0 ? i : null;
}

/**
 * 키보드 ←/→ — 훑기 전(from=null)에 → 는 머리가 보이던 달(idle)에서 시작하고, ← 는 그 앞 칸으로 간다
 * (ScrubLine 과 같은 규칙). 양 끝에서는 제자리.
 */
export function stepSlot(
  slots: readonly ScrubSlot[],
  from: number | null,
  step: 1 | -1,
  idle: number | null = null,
): number | null {
  if (slots.length === 0) return null;
  const start = idle ?? slots.length - 1;
  if (from === null) return step === 1 ? start : Math.max(0, start - 1);
  return Math.min(slots.length - 1, Math.max(0, from + step));
}

/** "202606" → "2026년 6월" */
export function ymLong(ym: string): string {
  return /^\d{6}$/.test(ym) ? `${ym.slice(0, 4)}년 ${Number(ym.slice(4))}월` : ym;
}

/**
 * 칸 설명 — 말풍선 줄(1~2줄)과 스크린리더 문장. 금액 표기:
 *  · 과거 달 월평균 = 정밀 "4억 8,610만"(표준 — 평균이므로 "월평균"이라고 적는다)
 *  · 시나리오 = 짧은 "5.3억"(가정 계산을 만원 단위로 적으면 실제보다 정밀한 예측처럼 읽힌다)
 */
export function slotText(
  slot: ScrubSlot,
  opts: { label: string | null; basis?: "unit" | "band" },
): { tip: string[]; sr: string } {
  const what = opts.label ?? "대표 평형";
  const same = opts.basis === "band" ? "같은 면적대" : "같은 평형";
  const other = opts.basis === "band" ? "다른 면적대" : "다른 평형";
  if (slot.kind === "year") {
    const s = (krw: number) => formatKrwWon(krw, { style: "short" });
    return {
      tip: [`${slot.year}년 뒤 · 시나리오(가정)`, `기본 ${s(slot.base)} · 낙관 ${s(slot.opt)} · 비관 ${s(slot.pess)}`],
      sr: `${slot.year}년 뒤 시나리오, 기본 ${s(slot.base)}, 낙관 ${s(slot.opt)}, 비관 ${s(slot.pess)} — 예측이 아니라 가정 계산이에요`,
    };
  }
  const short = ymLabel(slot.ym, true);
  const long = ymLong(slot.ym);
  if (slot.avgMan == null) {
    if (slot.nAll > 0) {
      return {
        tip: [`${short} ${what} 거래 없음`, `${other} ${slot.nAll.toLocaleString("ko-KR")}건`],
        sr: `${long}, ${what} 거래 없음, ${other} 거래 ${slot.nAll.toLocaleString("ko-KR")}건`,
      };
    }
    return { tip: [`${short} 거래 없음`], sr: `${long}, 거래 없음` };
  }
  const count =
    slot.nAll > slot.n
      ? `거래 ${slot.nAll.toLocaleString("ko-KR")}건 · ${same} ${slot.n.toLocaleString("ko-KR")}건`
      : `거래 ${slot.n.toLocaleString("ko-KR")}건`;
  return {
    tip: [`${short} 월평균 ${formatEokMan(slot.avgMan)}`, slot.few ? `${count} · 참고용` : count],
    sr: `${long}, ${what} 월평균 ${formatEokMan(slot.avgMan, { unit: "만원" })}, ${
      slot.nAll > slot.n ? `거래 ${slot.nAll}건 중 ${same} ${slot.n}건` : `거래 ${slot.n}건`
    }${slot.few ? ", 거래가 적어 참고용이에요" : ""}`,
  };
}
