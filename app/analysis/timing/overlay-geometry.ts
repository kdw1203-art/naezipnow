/**
 * [1021 · 지역 시세 price·timing] 시세·타이밍 대표 그림 — 지수(선) + 월 거래량(막대) 한 그림의 좌표(순수 함수).
 *
 * 지시(시안 mock8/timing): 따로 있던 두 차트(ScrubLine 지수 · Bars 거래량)를 한 SVG 에 겹친다. 값은 TimingClient 가
 * 이미 들고 있는 trend.points(한국부동산원 지수)·volume(국토교통부 월별 거래량) 그대로 — 새 계산은 없다.
 *
 * 왜 순수 함수로 떼었나: 두 시계열은 달이 다르다(지수 13개월 · 거래량 8개월, 주간 지수 지역도 있다). 같은 x 축에
 * 놓는 규칙("달의 한가운데 = 그 달 막대·월간 지수점, 주간 점은 그 주의 날짜")을 단위 테스트로 잠근다.
 * 좌표는 픽셀 — 렌더가 컨테이너 폭을 재서 넘긴다(글자·점이 늘어나지 않게, ScrubLine 과 같은 방식).
 */

import { smoothPath } from "@/lib/viz/geometry";

export type OverlayIndexPoint = { period: string; value: number };
export type OverlayVolumeRow = { month: string; count: number };
export type OverlayBox = { width: number; height: number; padL: number; padR: number; padT: number; padB: number };

export type OverlayLayout = {
  bars: { month: string; count: number; x: number; w: number; y: number; h: number; isMax: boolean }[];
  /** 지수 점(시간 순) — 선이 있으면 2점 이상 */
  points: { period: string; ym: string; x: number; y: number; value: number }[];
  line: string;
  area: string;
  /** x 축 달 라벨 — 첫 칸·1월은 "yy.mm", 나머지는 "mm" */
  ticks: { x: number; label: string; ym: string }[];
  idxMin: number;
  idxMax: number;
  /** 지수 최고·최저 글자를 붙일 y */
  idxMaxY: number;
  idxMinY: number;
  maxBar: { month: string; count: number } | null;
  plotTop: number;
  plotBottom: number;
};

const r1 = (n: number) => Math.round(n * 10) / 10;

/** "202608" → 달 좌표(달의 한가운데). 연·월을 하나의 실수 축으로 — 지수·거래량이 서로 다른 달 범위여도 같은 자리에 선다 */
export function monthT(ym: string): number {
  const y = Number(ym.slice(0, 4));
  const m = Number(ym.slice(4, 6));
  return y * 12 + (m - 1) + 0.5;
}

/** "2025-08-01" → 월간이면 그 달 한가운데, 주간이면 그 날짜의 달 안 위치 */
export function periodT(period: string, weekly: boolean): number | null {
  const m = /^(\d{4})-(\d{2})(?:-(\d{2}))?/.exec(period);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  if (!weekly) return y * 12 + (mo - 1) + 0.5;
  const d = Number(m[3] ?? "1");
  const days = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  return y * 12 + (mo - 1) + (d - 1) / days;
}

export function periodYm(period: string): string {
  const m = /^(\d{4})-(\d{2})/.exec(period);
  return m ? `${m[1]}${m[2]}` : "";
}

/** 축 라벨 — 첫 칸과 1월은 "25.09"·"26.01", 나머지는 "10" (시안 표기) */
export function tickLabel(ym: string, first: boolean): string {
  const mm = ym.slice(4, 6);
  return first || mm === "01" ? `${ym.slice(2, 4)}.${mm}` : mm;
}

export function layoutOverlay(input: {
  index: readonly OverlayIndexPoint[];
  weekly: boolean;
  volume: readonly OverlayVolumeRow[];
  box: OverlayBox;
}): OverlayLayout | null {
  const { box } = input;
  if (box.width < 80) return null;
  const idx = input.index
    .map((p) => ({ period: p.period, ym: periodYm(p.period), t: periodT(p.period, input.weekly), value: p.value }))
    .filter((p): p is { period: string; ym: string; t: number; value: number } => p.t !== null && Number.isFinite(p.value));
  const vol = input.volume.filter((v) => /^\d{6}$/.test(v.month) && Number.isFinite(v.count));
  if (idx.length < 2 && vol.length === 0) return null;

  const tVals: number[] = [];
  for (const p of idx) tVals.push(p.t);
  for (const v of vol) tVals.push(monthT(v.month) - 0.5, monthT(v.month) + 0.5);
  let tLo = Math.min(...tVals);
  let tHi = Math.max(...tVals);
  if (tHi - tLo < 1) {
    tLo -= 0.5;
    tHi += 0.5;
  }
  /* 끝점 원·첫 점이 가장자리에 닿지 않게 0.15달 여유 */
  tLo -= 0.15;
  tHi += 0.15;

  const plotL = box.padL;
  const plotR = box.width - box.padR;
  const plotTop = box.padT;
  const plotBottom = box.height - box.padB;
  const plotH = plotBottom - plotTop;
  const xOf = (t: number) => r1(plotL + ((t - tLo) / (tHi - tLo)) * (plotR - plotL));
  const slot = xOf(1) - xOf(0);
  const bw = r1(Math.max(4, Math.min(36, slot * 0.6)));

  /* 막대: 바닥에서 plotH 의 70% 까지. 선: 위 8px 부터 plotH 의 62% 까지 — 둘이 겹치되 막대 꼭대기와 선이 같은 자리에 몰리지 않게 */
  const barMaxH = plotH * 0.7;
  const maxCount = vol.length ? Math.max(1, ...vol.map((v) => v.count)) : 1;
  let maxBar: OverlayLayout["maxBar"] = null;
  for (const v of vol) if (maxBar === null || v.count > maxBar.count) maxBar = { month: v.month, count: v.count };
  const bars = vol.map((v) => {
    const h = r1((v.count / maxCount) * barMaxH);
    return {
      month: v.month,
      count: v.count,
      x: r1(xOf(monthT(v.month)) - bw / 2),
      w: bw,
      y: r1(plotBottom - h),
      h,
      isMax: maxBar !== null && v.month === maxBar.month && v.count === maxBar.count,
    };
  });

  const lineTop = plotTop + 8;
  const lineBottom = plotTop + plotH * 0.62;
  const idxMin = idx.length ? Math.min(...idx.map((p) => p.value)) : 0;
  const idxMax = idx.length ? Math.max(...idx.map((p) => p.value)) : 0;
  const span = idxMax - idxMin || 1;
  const yOf = (v: number) => r1(idxMax === idxMin ? (lineTop + lineBottom) / 2 : lineBottom - ((v - idxMin) / span) * (lineBottom - lineTop));
  const points = idx.length >= 2 ? idx.map((p) => ({ period: p.period, ym: p.ym, x: xOf(p.t), y: yOf(p.value), value: p.value })) : [];
  const line = points.length >= 2 ? smoothPath(points) : "";
  const area =
    points.length >= 2 ? `${line} L${points[points.length - 1].x} ${plotBottom} L${points[0].x} ${plotBottom} Z` : "";

  /* 축 라벨: 막대가 있으면 그 달들, 없으면 지수 점의 달(중복 제거). 16칸 넘으면 한 칸 걸러 */
  const months = vol.length ? vol.map((v) => v.month) : Array.from(new Set(idx.map((p) => p.ym)));
  const every = months.length > 16 ? 2 : 1;
  const ticks = months
    .map((ym, i) => ({ x: xOf(monthT(ym)), label: tickLabel(ym, i === 0), ym, i }))
    .filter((t) => t.i % every === 0)
    .map(({ x, label, ym }) => ({ x, label, ym }));

  return {
    bars,
    points,
    line,
    area,
    ticks,
    idxMin,
    idxMax,
    idxMaxY: points.length ? yOf(idxMax) : lineTop,
    idxMinY: points.length ? yOf(idxMin) : lineBottom,
    maxBar,
    plotTop,
    plotBottom,
  };
}

/** 훑기 — x 에 가장 가까운 지수 점(선이 없으면 막대) 인덱스 */
export function nearestSlot(layout: OverlayLayout, x: number): { kind: "point" | "bar"; i: number } | null {
  const list = layout.points.length ? layout.points : layout.bars.map((b) => ({ x: b.x + b.w / 2 }));
  if (list.length === 0) return null;
  let best = 0;
  let bestD = Infinity;
  list.forEach((p, i) => {
    const d = Math.abs(p.x - x);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  });
  return { kind: layout.points.length ? "point" : "bar", i: best };
}
