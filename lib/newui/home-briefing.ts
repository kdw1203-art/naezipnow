/**
 * [1009 · H] 홈 AI 입구 "오늘의 시장 브리핑" 문장 — 순수 함수(테스트로 잠근다).
 *
 * 왜(2026-09-22 운영 실측): 브리핑은 스냅샷(market_region_price)의 서울 구 전월비(sale_change)로 만들었는데, 서울 25개 구
 * 부동산원 행이 전부 period '' · sale_change null 로 비어 있어 "5곳 미만이면 서울을 대표한다고 말하지 않는다" 규칙에
 * 걸려 **늘 null** — 홈에는 "오늘 브리핑을 아직 만들지 못했어요"가 고정으로 떠 있었다. 같은 원천(부동산원 매매가격지수)의
 * 월간 시계열(market_region_series, 25개 구 · 2026-07 까지 온전)에서 구마다 최근 달 전월비를 구하면 같은 문장이 선다.
 * 문장 규칙은 예전 briefingFromSnapshots 와 한 글자도 다르지 않게 이 함수 하나로 모았다.
 */
import type { HomeBriefing } from "@/lib/newui/home-data";

/** 구별 전월비(%) 목록 + 기준월(yyyymm) → 브리핑. 구가 minRegions 곳 미만이면 null(서울 대표라고 말하지 않는다) */
export function briefingFromDeltas(
  deltas: readonly number[],
  period: string,
  opts: { minRegions?: number; basis?: string } = {},
): HomeBriefing | null {
  const vals = deltas.filter((d) => Number.isFinite(d));
  const n = vals.length;
  if (n < (opts.minRegions ?? 5) || !period) return null;
  const falling = vals.filter((d) => d < -0.1).length;
  const rising = vals.filter((d) => d > 0.1).length;
  const avg = vals.reduce((a, b) => a + b, 0) / n;
  const arrow = avg > 0.05 ? "▲" : avg < -0.05 ? "▼" : "—";
  const lead = rising >= falling ? `서울 ${n}개 구 중 ${rising}곳 상승` : `서울 ${n}개 구 중 ${falling}곳 하락`;
  const avgLabel = arrow === "—" ? "평균 보합" : `평균 ${arrow}${Math.abs(avg).toFixed(1)}%`;
  const ym = /^\d{6}$/.test(period) ? `${period.slice(0, 4)}.${period.slice(4, 6)}` : period;
  return {
    text: `${lead}, ${avgLabel}`,
    asOfLabel: `기준 ${ym}`,
    basis: opts.basis ?? "한국부동산원 매매가격지수 전월비 · 위 지역 평균과 같은 기준",
  };
}

export type IndexRow = { region_id: string | null; period: string | null; value: number | string | null };

/** 행 → 지역별 (yyyymm → 지수). 값이 없거나 0 이하·기간이 이상한 행은 버린다(같은 달 중복은 뒤가 이긴다) */
function groupIndexRows(rows: readonly IndexRow[]): Map<string, Map<string, number>> {
  const byRegion = new Map<string, Map<string, number>>();
  for (const r of rows) {
    const id = r.region_id ? String(r.region_id) : "";
    const ym = String(r.period ?? "").replace(/[^0-9]/g, "").slice(0, 6);
    const v = Number(r.value);
    if (!id || !/^\d{6}$/.test(ym) || !Number.isFinite(v) || v <= 0) continue;
    const m = byRegion.get(id) ?? new Map<string, number>();
    m.set(ym, v);
    byRegion.set(id, m);
  }
  return byRegion;
}

function prevYmOf(ym: string): string {
  const y = Number(ym.slice(0, 4));
  const mo = Number(ym.slice(4, 6));
  return mo === 1 ? `${y - 1}12` : `${y}${String(mo - 1).padStart(2, "0")}`;
}

/**
 * 월간 매매가격지수 행(여러 구 · 여러 달) → 브리핑. 가장 많은 구가 가진 최신 달을 기준월로 잡고, 그 달과 바로 전 달이
 * 둘 다 있는 구만 전월비를 센다(빠진 달을 건너뛰어 두 달 치 변화를 한 달로 세지 않는다).
 */
export function briefingFromIndexRows(
  rows: readonly IndexRow[],
  opts: { minRegions?: number; basis?: string } = {},
): HomeBriefing | null {
  const byRegion = groupIndexRows(rows);
  const latestCount = new Map<string, number>();
  for (const m of byRegion.values()) {
    const latest = [...m.keys()].sort().pop();
    if (latest) latestCount.set(latest, (latestCount.get(latest) ?? 0) + 1);
  }
  /* 기준월 = 가장 많은 구가 최신으로 가진 달(같으면 더 최근 달) */
  const period = [...latestCount.entries()].sort((a, b) => b[1] - a[1] || b[0].localeCompare(a[0]))[0]?.[0];
  if (!period) return null;
  const prev = prevYmOf(period);
  const deltas: number[] = [];
  for (const m of byRegion.values()) {
    const cur = m.get(period);
    const base = m.get(prev);
    if (cur === undefined || base === undefined || base <= 0) continue;
    deltas.push(((cur - base) / base) * 100);
  }
  return briefingFromDeltas(deltas, period, opts);
}

/**
 * [1009 · H] 지역마다 **그 지역의 최신 달** 지수 전월비 — 바로 전 달이 있을 때만(빠진 달을 건너뛰지 않는다).
 * 홈 지역 카드가 브리핑과 같은 원천(부동산원 월간 매매가격지수)으로 등락을 적게 한다(한 화면 한 기준).
 */
export function indexMoMByRegion(rows: readonly IndexRow[]): Map<string, { ym: string; pct: number }> {
  const out = new Map<string, { ym: string; pct: number }>();
  for (const [id, m] of groupIndexRows(rows)) {
    const latest = [...m.keys()].sort().pop();
    if (!latest) continue;
    const cur = m.get(latest);
    const base = m.get(prevYmOf(latest));
    if (cur === undefined || base === undefined || base <= 0) continue;
    out.set(id, { ym: latest, pct: ((cur - base) / base) * 100 });
  }
  return out;
}
