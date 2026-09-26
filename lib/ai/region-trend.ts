/**
 * [1008 · W] 지역 가격 흐름 — 한국부동산원(REB) 월간 매매지수·전세가율·거래량 시계열 → 결과 화면 재료.
 *
 * 왜(실측 2026-09-21, 운영 DB 읽기 전용):
 *  ① "1년 변화(%)" 를 단지 실거래로는 못 잰다 — market_transactions 매매가 2026.01~08(8개월)뿐이다.
 *     지역 매매지수는 2025.07~2026.08(14개월)이 있어 1년 변화를 정직하게 잴 수 있다
 *     (안양시 동안구 2025.08 86.71 → 2026.08 102.54 = +18.3%).
 *  ② 서울 25개 구는 지역 스냅샷(market_region_price) 행이 period='' · 값 null 로 덮여 있다(1007 P1 —
 *     수정은 배포 전). 그래서 은마·헬리오시티는 "가격 흐름·전세가율 자료 없음" 이었다. 같은 출처(REB)의
 *     월간 시계열에는 값이 있다(강남구 2026.07 매매지수 100.57 · 전세가율 43.0%) — 빈 칸만 이 값으로 채운다.
 *  ③ 전세가율 55.251254396857% 처럼 원값이 그대로 화면에 찍혔다 — 여기서 반올림한다.
 *
 * 순수 함수(서버 live-context · 단위테스트 공용). 값을 지어내지 않는다: 없으면 null.
 */

export interface SeriesPoint {
  /** "2026-08-01" 또는 "202608" */
  period: string;
  value: number;
}

export interface RegionTrend {
  /** 월간 매매지수(오름차순, 최대 14점) */
  index: { ym: string; value: number }[];
  /** 최근 달과 같은 달 1년 전의 매매지수 변동률(%) — 둘 다 있고 사이에 기준 변경 흔적이 없을 때만 */
  yoyPct: number | null;
  /** yoy 의 출발 달(yyyymm) */
  yoyFromYm: string | null;
  /** 최근 한 달 매매지수 변동률(%) */
  momPct: number | null;
  /** 매매지수 최근 달(yyyymm) */
  asOf: string | null;
  /** 전세가율(%) 최근값 · 기준 달 */
  jeonseRatio: number | null;
  jeonseAsOf: string | null;
  /** 월 거래량(건) 최근값 · 기준 달 */
  tradeCount: number | null;
  tradeAsOf: string | null;
  source: string;
}

export const REGION_TREND_SOURCE = "한국부동산원 월간 아파트 지수";

/** 한 달 사이 지수가 이만큼 넘게 움직이면 기준(100) 변경 흔적으로 본다 — 실측 2025.07→08 −6.8% */
export const INDEX_JUMP_GUARD_PCT = 5;

export function toYm(period: string): string | null {
  const s = String(period ?? "").trim();
  if (/^\d{6}$/.test(s)) return s;
  const m = /^(\d{4})-(\d{2})/.exec(s);
  return m ? `${m[1]}${m[2]}` : null;
}

export function ymShift(ym: string, delta: number): string {
  const y = Number(ym.slice(0, 4));
  const m = Number(ym.slice(4, 6)) - 1 + delta;
  const d = new Date(Date.UTC(y, m, 1));
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

const r1 = (n: number) => Math.round(n * 10) / 10;
const r2 = (n: number) => Math.round(n * 100) / 100;

function monthly(points: readonly SeriesPoint[] | null | undefined): { ym: string; value: number }[] {
  const byYm = new Map<string, number>();
  for (const p of points ?? []) {
    const ym = toYm(p.period);
    const v = Number(p.value);
    if (!ym || !Number.isFinite(v)) continue;
    if (!byYm.has(ym)) byYm.set(ym, v);
  }
  return [...byYm.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([ym, value]) => ({ ym, value }));
}

function latest(points: readonly SeriesPoint[] | null | undefined): { ym: string; value: number } | null {
  const m = monthly(points);
  return m.length ? m[m.length - 1] : null;
}

export function buildRegionTrend(input: {
  saleIndex?: readonly SeriesPoint[] | null;
  jeonseRatio?: readonly SeriesPoint[] | null;
  tradeCount?: readonly SeriesPoint[] | null;
}): RegionTrend | null {
  const index = monthly(input.saleIndex).filter((p) => p.value > 0).slice(-14);
  const jr = latest(input.jeonseRatio);
  const tc = latest(input.tradeCount);
  if (index.length === 0 && !jr && !tc) return null;

  const last = index.length ? index[index.length - 1] : null;
  const prev = index.length >= 2 ? index[index.length - 2] : null;
  const momPct =
    last && prev && prev.ym === ymShift(last.ym, -1) ? r2(((last.value - prev.value) / prev.value) * 100) : null;

  let yoyPct: number | null = null;
  let yoyFromYm: string | null = null;
  if (last) {
    const fromYm = ymShift(last.ym, -12);
    const from = index.find((p) => p.ym === fromYm) ?? null;
    if (from) {
      /* 창 안에서 한 달 ±5% 넘게 튄 곳이 있으면 기준 변경 흔적 — 1년 변화를 말하지 않는다 */
      const window = index.filter((p) => p.ym >= fromYm && p.ym <= last.ym);
      let jumped = false;
      for (let i = 1; i < window.length; i++) {
        /* 이웃한 달끼리만 본다 — 빠진 달을 건너뛴 두 점의 차이는 튐이 아니다 */
        if (window[i].ym !== ymShift(window[i - 1].ym, 1)) continue;
        const a = window[i - 1].value;
        const b = window[i].value;
        if (a > 0 && Math.abs(((b - a) / a) * 100) > INDEX_JUMP_GUARD_PCT) jumped = true;
      }
      if (!jumped) {
        yoyPct = r1(((last.value - from.value) / from.value) * 100);
        yoyFromYm = fromYm;
      }
    }
  }

  return {
    index,
    yoyPct,
    yoyFromYm,
    momPct,
    asOf: last?.ym ?? null,
    jeonseRatio: jr && jr.value > 0 ? r1(jr.value) : null,
    jeonseAsOf: jr?.ym ?? null,
    tradeCount: tc && tc.value >= 0 ? Math.round(tc.value) : null,
    tradeAsOf: tc?.ym ?? null,
    source: REGION_TREND_SOURCE,
  };
}

export interface SnapshotLike {
  avgSale: number | null;
  jeonseRatio: number | null;
  saleChangeMonthly: number | null;
  tradeCount: number | null;
  period: string;
}

/**
 * 스냅샷의 **빈 칸만** 같은 출처(REB) 시계열로 채운다. 값이 있는 칸은 건드리지 않는다.
 * 채운 칸이 하나도 없으면 원래 스냅샷(또는 null)을 그대로 돌려준다.
 * 반올림: 전세가율 0.1 · 월간 변동 0.01 (원값이 화면에 그대로 찍히던 것).
 */
export function patchSnapshot<T extends SnapshotLike>(
  snap: T | null,
  trend: RegionTrend | null,
): (T & { patched?: boolean }) | SnapshotLike | null {
  const round = <S extends SnapshotLike>(s: S): S => ({
    ...s,
    jeonseRatio: s.jeonseRatio != null && Number.isFinite(s.jeonseRatio) ? r1(s.jeonseRatio) : null,
    saleChangeMonthly:
      s.saleChangeMonthly != null && Number.isFinite(s.saleChangeMonthly) ? r2(s.saleChangeMonthly) : null,
  });
  if (!trend) return snap ? round(snap) : null;
  if (!snap) {
    if (trend.momPct == null && trend.jeonseRatio == null && trend.tradeCount == null) return null;
    return {
      avgSale: null,
      jeonseRatio: trend.jeonseRatio,
      saleChangeMonthly: trend.momPct,
      tradeCount: trend.tradeCount,
      period: trend.asOf ?? trend.jeonseAsOf ?? trend.tradeAsOf ?? "",
      patched: true,
    } as SnapshotLike & { patched: boolean };
  }
  const out = round(snap) as T & { patched?: boolean };
  let patched = false;
  if (out.saleChangeMonthly == null && trend.momPct != null) {
    out.saleChangeMonthly = trend.momPct;
    patched = true;
  }
  if (out.jeonseRatio == null && trend.jeonseRatio != null) {
    out.jeonseRatio = trend.jeonseRatio;
    patched = true;
  }
  if (out.tradeCount == null && trend.tradeCount != null) {
    out.tradeCount = trend.tradeCount;
    patched = true;
  }
  if (!out.period && (patched || out.tradeCount != null)) {
    out.period = trend.asOf ?? trend.jeonseAsOf ?? trend.tradeAsOf ?? "";
    patched = true;
  }
  if (patched) out.patched = true;
  return out;
}
