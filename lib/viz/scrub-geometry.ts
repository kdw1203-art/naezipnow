/**
 * [1009] 손가락으로 훑는 추세선(ScrubLine) — 좌표 계산(순수, 테스트로 잠근다).
 *
 * 토스증권 차트의 핵심은 "누르고 좌우로 끌면 그 시점의 값이 읽힌다"이다. 그 동작의 절반은
 * 기하(어느 점이 손가락에 가장 가까운가, 선을 어디서 끊는가)라서 렌더와 떼어 둔다.
 * 좌표는 **픽셀**이다 — 렌더가 컨테이너 폭을 재서 넘긴다. viewBox 를 늘리는 방식
 * (preserveAspectRatio="none")은 점이 타원이 되고 글자가 찌그러진다(TrendChart 가 그랬다).
 *
 * 정직성 규칙(1008 · 리뷰 A-10 과 같은 원칙):
 *  · 값이 2개 미만이면 선을 그리지 않는다(null) — 한 점짜리 선은 "추세가 있다"는 거짓 신호다.
 *  · 건수(counts)를 주면 fewBelow 미만인 점은 "적은 표본"이다 — 실선에 넣지 않고 속 빈 점으로,
 *    앞뒤 실선 조각은 점선으로만 잇는다(한두 건 값이 V 자를 그리지 않게).
 *  · 값이 없는 칸(null)도 실선을 끊고 점선으로 잇는다(빈 달을 보간해 지어내지 않는다).
 */

export type ScrubBox = { width: number; height: number; padL: number; padR: number; padT: number; padB: number };

export type ScrubPoint = {
  /** 원래 배열에서의 위치 */
  i: number;
  x: number;
  /** 값이 없으면 null */
  y: number | null;
  v: number | null;
  /** 표본이 적은 점(건수 < fewBelow) */
  few: boolean;
};

export type ScrubLayout = {
  pts: ScrubPoint[];
  /** 실선 조각(path d) — 적은 표본·빈 칸에서 끊긴다 */
  solid: string[];
  /** 값 있는 점 전체 아래 면(path d) — 한 장 */
  areas: string[];
  /** 실선 조각 사이·적은 표본 점을 잇는 점선(path d) */
  dashed: string[];
  /** 최고·최저 점의 pts 인덱스(값 있는 점 중) — 값이 모두 같으면 max 만 */
  maxAt: number | null;
  minAt: number | null;
  lo: number;
  hi: number;
  plotTop: number;
  plotBottom: number;
  /** 값 있는 첫 점의 y — 토스식 "기간 시작" 점선 기준선 */
  baseY: number | null;
};

const r1 = (n: number) => Math.round(n * 10) / 10;
const finite = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);

export function layoutScrub(input: {
  values: readonly (number | null | undefined)[];
  counts?: readonly (number | null | undefined)[];
  fewBelow?: number;
  box: ScrubBox;
  /** [1009 · 리뷰] 고정 세로축(예: 점수 0~100). 값이 범위를 벗어나면 그만큼만 넓힌다. 없으면 데이터 범위 ±12% */
  domain?: readonly [number, number];
}): ScrubLayout | null {
  const { values, box } = input;
  const valued = values.filter(finite);
  if (valued.length < 2 || box.width < 60) return null;
  const n = values.length;
  const plotL = box.padL;
  const plotR = box.width - box.padR;
  const plotTop = box.padT;
  const plotBottom = box.height - box.padB;
  const vMin = Math.min(...valued);
  const vMax = Math.max(...valued);
  const pad = Math.max((vMax - vMin) * 0.12, Math.abs(vMax) * 0.02, 1e-9);
  const dom = input.domain && input.domain[1] > input.domain[0] ? input.domain : null;
  /* 고정축이면 그 범위(값이 넘치면 넘친 만큼만 넓힘) — "64~75점이 바닥~꼭대기를 채워 급변처럼 보이던" 것을 막는다 */
  const lo = dom ? Math.min(dom[0], vMin) : vMin - pad;
  const hi = dom ? Math.max(dom[1], vMax) : vMax + pad;
  const xOf = (i: number) => r1(n === 1 ? (plotL + plotR) / 2 : plotL + ((plotR - plotL) * i) / (n - 1));
  const yOf = (v: number) => r1(plotBottom - ((v - lo) / (hi - lo)) * (plotBottom - plotTop));
  const few = input.fewBelow ?? 0;

  const pts: ScrubPoint[] = values.map((raw, i) => {
    const v = finite(raw) ? raw : null;
    const c = input.counts?.[i];
    return {
      i,
      x: xOf(i),
      y: v === null ? null : yOf(v),
      v,
      few: v !== null && few > 0 && finite(c) && c < few,
    };
  });

  /* 실선 = 값 있고 적은 표본이 아닌 점이 **연속**된 구간(2점 이상) */
  const runs: ScrubPoint[][] = [];
  let cur: ScrubPoint[] = [];
  for (const p of pts) {
    if (p.y !== null && !p.few) cur.push(p);
    else if (cur.length) {
      runs.push(cur);
      cur = [];
    }
  }
  if (cur.length) runs.push(cur);
  const solid: string[] = [];
  for (const run of runs) {
    if (run.length < 2) continue;
    solid.push(run.map((p, k) => `${k === 0 ? "M" : "L"}${p.x} ${p.y}`).join(" "));
  }

  /* 점선 = 값 있는 점을 차례로 이었을 때, 실선에 포함되지 않은 이음 */
  const dashed: string[] = [];
  const valuedPts = pts.filter((p) => p.y !== null);
  /* 면은 값 있는 점 전체 아래 한 장 — 조각마다 끊으면 빈 달 자리에 흰 구멍이 나서 "그래프가 깨졌다"로
     읽혔다(1009 하네스 실측). 불확실한 구간은 위의 점선·속 빈 점이 이미 말해 준다. */
  const areas: string[] = [];
  if (valuedPts.length >= 2) {
    const d = valuedPts.map((p, k) => `${k === 0 ? "M" : "L"}${p.x} ${p.y}`).join(" ");
    areas.push(`${d} L${valuedPts[valuedPts.length - 1].x} ${plotBottom} L${valuedPts[0].x} ${plotBottom} Z`);
  }
  for (let k = 1; k < valuedPts.length; k++) {
    const a = valuedPts[k - 1];
    const b = valuedPts[k];
    const inSolid = !a.few && !b.few && b.i === a.i + 1;
    if (!inSolid) dashed.push(`M${a.x} ${a.y} L${b.x} ${b.y}`);
  }

  /* 최고·최저 표식은 **표본이 충분한 칸** 중에서 — 거래 1건짜리 달이 "최저"로 이름 붙으면 한 건의
     특이값이 범위를 대표하게 된다. 충분한 칸이 2개 미만이면 전체에서 고른다(점 자체는 그대로 보인다). */
  const solidPts = valuedPts.filter((p) => !p.few);
  /* [1009 · 리뷰 RA-HIGH] 충분한 칸이 2개 미만이면 표식을 달지 않는다 — 예전엔 전체로 되돌아가 거래 1건짜리 점에
     "최고 10.9억"이 붙었다(풍림아이원 84㎡ 실측). */
  const pool = solidPts.length >= 2 ? solidPts : [];
  let maxAt: number | null = null;
  let minAt: number | null = null;
  for (const p of pool) {
    if (maxAt === null || (p.v as number) > (pts[maxAt].v as number)) maxAt = p.i;
    if (minAt === null || (p.v as number) < (pts[minAt].v as number)) minAt = p.i;
  }
  if (maxAt !== null && minAt !== null && pts[maxAt].v === pts[minAt].v) minAt = null;

  return {
    pts,
    solid,
    areas,
    dashed,
    maxAt,
    minAt,
    lo,
    hi,
    plotTop,
    plotBottom,
    baseY: valuedPts.length ? valuedPts[0].y : null,
  };
}

/** 손가락 x 에 가장 가까운 **값 있는** 점의 인덱스 — 없으면 null */
export function nearestValued(layout: ScrubLayout, x: number): number | null {
  let best: number | null = null;
  let bestD = Number.POSITIVE_INFINITY;
  for (const p of layout.pts) {
    if (p.y === null) continue;
    const d = Math.abs(p.x - x);
    if (d < bestD) {
      bestD = d;
      best = p.i;
    }
  }
  return best;
}

/** 키보드 ←/→ — from 에서 step(±1) 방향의 다음 값 있는 점. 끝이면 제자리 */
export function stepValued(layout: ScrubLayout, from: number | null, step: 1 | -1): number | null {
  const pts = layout.pts;
  if (!pts.length) return null;
  if (from === null) {
    for (let i = pts.length - 1; i >= 0; i--) if (pts[i].y !== null) return i;
    return null;
  }
  for (let i = from + step; i >= 0 && i < pts.length; i += step) {
    if (pts[i].y !== null) return i;
  }
  return from;
}

/** 기간 탭 — 뒤에서 last 개(0 이면 전체). 값 있는 점이 2개 미만이 되면 그 탭은 쓸 수 없다 */
export function rangeStart(length: number, last: number): number {
  if (!(last > 0) || last >= length) return 0;
  return length - last;
}

export function rangeUsable(values: readonly (number | null | undefined)[], last: number): boolean {
  const start = rangeStart(values.length, last);
  let k = 0;
  for (let i = start; i < values.length; i++) if (finite(values[i])) k++;
  return k >= 2;
}

/** 값 → 이 배치의 y(px) — 기준선(refLine) 같은 가로선을 그릴 때 */
export function yForValue(layout: Pick<ScrubLayout, "lo" | "hi" | "plotTop" | "plotBottom">, v: number): number {
  const span = layout.hi - layout.lo || 1;
  return Math.round((layout.plotBottom - ((v - layout.lo) / span) * (layout.plotBottom - layout.plotTop)) * 10) / 10;
}
