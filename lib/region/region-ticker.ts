/* [1115 · 지역 시세 시세판] 소유자 2026-11-09 "지역 시세는 서울 주요 구, 인기 구 식으로 그래프를 4x4 형식(주식처럼) 보여주고 자동으로 넘어가는 액션".
   순수 함수 — 지역 줄(평균 매매가 · 온도) + 월간 매매가격지수 시계열 → 시세판 쪽(쪽마다 16칸).
   쪽은 데이터로만 고른다(손으로 고른 목록 없음):
     ① 서울 주요 구 = 서울 중 평균 매매가 높은 순 16
     ② 상승 큰 곳 = 전 지역 지수 전월 대비 높은 순 16(상승한 곳만)
     ③ 하락 큰 곳 = 전월 대비 낮은 순 16(하락한 곳만)
   지수가 두 달 치 미만인 지역은 칸에 넣지 않는다(빈 선 · 가짜 등락 없음). */
import type { RegionSiseRow } from "./region-sise";

export type TickerCard = {
  id: string;
  name: string;
  sido: string;
  href: string;
  /** 마지막 달 지수 */
  index: number;
  /** 마지막 달 "2026.09" */
  ym: string;
  momPct: number | null;
  /** 선(오름차순 · 최대 13칸) */
  spark: number[];
  avgSaleKrw: number | null;
};

export type TickerPage = { key: string; title: string; cards: TickerCard[] };

type Point = { period: string; value: number };

const ymOf = (period: string) => {
  const m = /^(\d{4})-?(\d{2})/.exec(period);
  return m ? `${m[1]}.${m[2]}` : period;
};

export function toTickerCard(row: RegionSiseRow, series: readonly Point[] | undefined, maxPoints = 13): TickerCard | null {
  const pts = (series ?? []).filter((p) => Number.isFinite(p.value)).slice().sort((a, b) => a.period.localeCompare(b.period));
  if (pts.length < 2) return null;
  const last = pts[pts.length - 1];
  const prev = pts[pts.length - 2];
  const momPct = prev.value !== 0 ? Math.round(((last.value - prev.value) / prev.value) * 1000) / 10 : null;
  return {
    id: row.id,
    name: row.name,
    sido: row.sido,
    href: row.href,
    index: Math.round(last.value * 10) / 10,
    ym: ymOf(last.period),
    momPct,
    spark: pts.slice(-maxPoints).map((p) => p.value),
    avgSaleKrw: row.avgSaleKrw,
  };
}

export function buildTickerPages(
  rows: readonly RegionSiseRow[],
  seriesById: ReadonlyMap<string, readonly Point[]>,
  perPage = 16,
): TickerPage[] {
  const all = rows.map((r) => toTickerCard(r, seriesById.get(r.id))).filter((c): c is TickerCard => c !== null);
  /* 같은 달끼리만 — 공표가 멈춘 지역(마지막 달이 다른 곳)의 "전월 대비"를 이번 달 순위에 섞지 않는다 */
  const ymCount = new Map<string, number>();
  for (const c of all) ymCount.set(c.ym, (ymCount.get(c.ym) ?? 0) + 1);
  const latestYm = [...ymCount.entries()].sort((a, b) => b[1] - a[1] || b[0].localeCompare(a[0]))[0]?.[0];
  const cards = all.filter((c) => c.ym === latestYm);
  const pages: TickerPage[] = [];
  const seoul = cards
    .filter((c) => c.sido === "서울")
    .sort((a, b) => (b.avgSaleKrw ?? -1) - (a.avgSaleKrw ?? -1) || b.index - a.index)
    .slice(0, perPage);
  if (seoul.length > 0) pages.push({ key: "seoul", title: "서울 주요 구 · 평균 매매가 높은 순", cards: seoul });
  const withMom = cards.filter((c) => c.momPct !== null);
  const up = withMom.filter((c) => (c.momPct as number) > 0).sort((a, b) => (b.momPct as number) - (a.momPct as number)).slice(0, perPage);
  if (up.length > 0) pages.push({ key: "up", title: "상승 큰 곳 · 지수 전월 대비", cards: up });
  const down = withMom.filter((c) => (c.momPct as number) < 0).sort((a, b) => (a.momPct as number) - (b.momPct as number)).slice(0, perPage);
  if (down.length > 0) pages.push({ key: "down", title: "하락 큰 곳 · 지수 전월 대비", cards: down });
  return pages;
}

/** 시계열 하한 — 기준 시각의 달에서 n 달 전 1일("2025-08-01") */
export function seriesSince(now: Date, monthsBack = 14): string {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - monthsBack, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`;
}
