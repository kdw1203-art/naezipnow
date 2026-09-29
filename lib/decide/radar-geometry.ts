/**
 * [1025c · 결정·비서] 결정 카드(/decide) 대표 그림의 기하 — 순수(클라이언트·테스트 공용).
 *
 *  · 겹친 레이더(후보 ≤3 · 축 = 쓸 수 있는 기준: 학교 자료가 없으면 3축, 가중치 0 축은 뺀다)
 *  · 원형 게이지(1순위 점수 0~100 · dasharray)
 *  · 점수 → 0~100 정수(게이지·큰 숫자용 — score.ts 의 가중 정규화 점수는 이미 0~100 이라 반올림만 한다)
 *
 * 레이더 값은 score.ts 와 같은 min-max 상대 위치(가장 앞선 값 1 · 가장 뒤진 값 0)다. 다른 점 하나:
 * 점수는 값이 한 곳뿐(single)·값이 모두 같음(same) 인 축을 **뺀다**(비교가 아니라서)지만, 그림은 그 축을
 * 그린다 — 값이 있는 후보를 1(그 축의 유일한/공동 최선값)로 찍고, 값이 없는 후보는 null → 0 자리에 작은 점.
 * 무엇이 점수에 들어갔는지는 화면이 캡션으로 적는다(`used` · `dropped`). 지어내는 숫자는 없다.
 *
 * 시안 mock1025c/_build.mjs radar(): 300×216 · 중심(150,108) · 반지름 78 · 축 라벨 1.22R · 값 하한 0.02(점이 보이게).
 */
import { DECIDE_AXES, axisValue, type DecideAxis, type DecideCandidateMetrics, type DecideResult } from "./score";

export const RADAR_W = 300;
export const RADAR_H = 216;
export const RADAR_CX = 150;
export const RADAR_CY = 108;
export const RADAR_R = 78;
/** 값이 0(또는 없음)이어도 꼭짓점 점이 보이게 하는 하한(시안 Math.max(v, 2)/100) */
export const RADAR_MIN_RATIO = 0.02;
/** 축 이름 위치(반지름 배수) */
export const RADAR_LABEL_RATIO = 1.22;
export const RADAR_RINGS = [0.25, 0.5, 0.75, 1] as const;

export interface Pt {
  x: number;
  y: number;
}

const r1 = (n: number) => Math.round(n * 10) / 10;

/** i 번째 축(12시부터 시계 방향)의 ratio(0~1.3) 지점 */
export function radarPoint(i: number, n: number, ratio: number): Pt {
  const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
  return { x: r1(RADAR_CX + Math.cos(a) * RADAR_R * ratio), y: r1(RADAR_CY + Math.sin(a) * RADAR_R * ratio) };
}

/** 눈금 다각형(ratio 배) points 문자열 */
export function radarRing(n: number, ratio: number): string {
  return Array.from({ length: n }, (_, i) => radarPoint(i, n, ratio))
    .map((p) => `${p.x},${p.y}`)
    .join(" ");
}

/** 축 이름 자리 + 정렬 — 위쪽 축은 가운데, 오른쪽은 start, 왼쪽은 end */
export function radarLabel(i: number, n: number): Pt & { anchor: "start" | "middle" | "end" } {
  const p = radarPoint(i, n, RADAR_LABEL_RATIO);
  const anchor = p.x > RADAR_CX + 6 ? "start" : p.x < RADAR_CX - 6 ? "end" : "middle";
  return { ...p, anchor };
}

/** 한 후보의 축 값(0~1 · null 은 없음) → 꼭짓점 목록(없음은 하한 자리) */
export function radarSeriesPoints(values: readonly (number | null)[]): Pt[] {
  const n = values.length;
  return values.map((v, i) => {
    const t = v === null || !Number.isFinite(v) ? 0 : Math.min(1, Math.max(0, v));
    return radarPoint(i, n, Math.max(RADAR_MIN_RATIO, t));
  });
}

export function polygonPoints(pts: readonly Pt[]): string {
  return pts.map((p) => `${p.x},${p.y}`).join(" ");
}

/* ── 축 값 ───────────────────────────────────────────────────────────── */

export interface RadarAxisDef {
  key: DecideAxis;
  label: string;
  /** 점수에 들어간 축인가(아니면 캡션에 이유를 적는다) */
  scored: boolean;
}

export interface RadarSeries {
  id: string;
  name: string;
  /** 축 순서대로 0~1 · 값 없음 null */
  values: (number | null)[];
}

export interface DecideRadar {
  axes: RadarAxisDef[];
  series: RadarSeries[];
}

/**
 * 한 축에서 후보들의 상대 위치(0~1). 값이 한 곳뿐이면 그 곳 1, 모두 같으면 전부 1, 없으면 null.
 * min-max 는 score.ts 와 같은 식(better=low 는 뒤집는다).
 */
export function radarAxisValues(items: readonly DecideCandidateMetrics[], key: DecideAxis): (number | null)[] {
  const def = DECIDE_AXES.find((a) => a.key === key);
  if (!def) return items.map(() => null);
  const vals = items.map((it) => axisValue(it, key));
  const have = vals.filter((v): v is number => v !== null);
  if (have.length === 0) return vals.map(() => null);
  const lo = Math.min(...have);
  const hi = Math.max(...have);
  return vals.map((v) => {
    if (v === null) return null;
    if (hi === lo) return 1;
    return def.better === "low" ? (hi - v) / (hi - lo) : (v - lo) / (hi - lo);
  });
}

/**
 * 결정 카드 레이더 — 축은 자료 없음(unavailable)·가중치 0(off) 만 빼고 전부(학교 없으면 3축).
 * 축이 3개 미만이면 null(레이더는 3축부터 — 그림을 억지로 만들지 않는다).
 */
export function decideRadar(items: readonly DecideCandidateMetrics[], result: DecideResult): DecideRadar | null {
  const hidden = new Set(result.dropped.filter((d) => d.reason === "unavailable" || d.reason === "off").map((d) => d.key));
  const axes: RadarAxisDef[] = DECIDE_AXES.filter((a) => !hidden.has(a.key)).map((a) => ({
    key: a.key,
    label: a.label,
    scored: result.used.includes(a.key),
  }));
  if (axes.length < 3 || items.length === 0) return null;
  const perAxis = axes.map((a) => radarAxisValues(items, a.key));
  const series: RadarSeries[] = items.map((it, i) => ({
    id: it.id,
    name: it.name,
    values: perAxis.map((col) => col[i]),
  }));
  return { axes, series };
}

/* ── 점수 · 게이지 ───────────────────────────────────────────────────── */

/**
 * 점수 → 0~100 정수. score.ts 의 점수는 이미 0~100(소수 1자리)이라 반올림·범위 자르기만 한다.
 * 0~1 짜리(정규화 값)를 넘기면 100 배 — `scale: "unit"` 로 명시할 때만(암묵 추정 없음).
 */
export function scoreOutOf100(score: number | null | undefined, scale: "percent" | "unit" = "percent"): number | null {
  if (score === null || score === undefined || !Number.isFinite(score)) return null;
  const v = scale === "unit" ? score * 100 : score;
  return Math.round(Math.min(100, Math.max(0, v)));
}

export const RING_SIZE = 92;
export const RING_R = 38;
export const RING_STROKE = 8;

/** 원형 게이지 dasharray — 시안 gauge(): 둘레 × 점수/100, 12시부터(rotate -90) */
export function ringDash(score100: number): { dash: number; circumference: number } {
  const circumference = 2 * Math.PI * RING_R;
  const t = Math.min(100, Math.max(0, Number.isFinite(score100) ? score100 : 0)) / 100;
  return { dash: Math.round(circumference * t * 10) / 10, circumference: Math.round(circumference * 10) / 10 };
}
