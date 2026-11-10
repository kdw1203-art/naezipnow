/* [1118 · 월간 리포트 달력] 소유자 2026-11-09 "이 부분도 다른 디자인 — 유사 사이트 참고"(연도별 30줄 목록).
   해마다 1~12월 칸(GitHub 기여 달력 · 아실 월별 거래량 · 증권 앱 히트맵 꼴) — 칸 색 진하기 = 그 해 안에서 거래 건수 상대 크기(0~4단).
   해마다 따로 견준다: 2025년(82곳)과 2026년(250곳 안팎)은 집계 범위가 달라 한 눈금에 두면 거래가 세 배로 읽힌다.
   신고 기한 전 달은 단계를 매기지 않는다(-1 · 점선 칸) — 모이는 중인 수를 "적다"로 칠하지 않는다. 순수 함수(단위 테스트). */
import type { ReportMonthSummary } from "./monthly";

export type HeatCell = { ym: string; month: number; txCount: number; regionCount: number; level: -1 | 0 | 1 | 2 | 3 | 4 };
export type HeatYear = { year: string; total: number; months: number; cells: Array<HeatCell | null> };

export function buildYearHeat(months: readonly ReportMonthSummary[], isOpen: (ym: string) => boolean): HeatYear[] {
  const byYear = new Map<string, ReportMonthSummary[]>();
  for (const m of months) {
    if (!/^\d{6}$/.test(m.ym)) continue;
    const y = m.ym.slice(0, 4);
    byYear.set(y, [...(byYear.get(y) ?? []), m]);
  }
  return [...byYear.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([year, ms]) => {
      const closed = ms.filter((m) => !isOpen(m.ym));
      const max = Math.max(...closed.map((m) => m.txCount), 1);
      const cells: Array<HeatCell | null> = Array.from({ length: 12 }, () => null);
      for (const m of ms) {
        const month = Number(m.ym.slice(4));
        if (month < 1 || month > 12) continue;
        const open = isOpen(m.ym);
        const r = m.txCount / max;
        const level: HeatCell["level"] = open ? -1 : r >= 0.9 ? 4 : r >= 0.75 ? 3 : r >= 0.55 ? 2 : r >= 0.35 ? 1 : 0;
        cells[month - 1] = { ym: m.ym, month, txCount: m.txCount, regionCount: m.regionCount, level };
      }
      return { year, total: ms.reduce((a, m) => a + m.txCount, 0), months: ms.length, cells };
    });
}
