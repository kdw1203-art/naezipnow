/* [1061] 구글 서치콘솔 "실적"(Search Analytics API) — 응답 모양 다루기. 순수 모듈(시험 대상).
 * API 는 날짜·검색어·페이지 차원마다 { keys[], clicks, impressions, ctr, position } 줄을 돌려준다.
 * ctr 은 0~1 비율, position 은 평균 순위(작을수록 위). 합계는 줄을 더해 다시 계산한다 —
 * 클릭·노출은 합, CTR 은 합끼리 나눔, 순위는 노출 가중 평균(구글 화면과 같은 정의). */

export type GscMetricRow = {
  key: string;
  clicks: number;
  impressions: number;
  /** 0~1 */
  ctr: number;
  position: number;
};

export type GscTotals = {
  clicks: number;
  impressions: number;
  ctr: number;
  position: number | null;
};

type RawRow = { keys?: unknown; clicks?: unknown; impressions?: unknown; ctr?: unknown; position?: unknown };

function num(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** 응답 JSON → 줄 목록. 모양이 어긋난 줄은 버린다(키 없는 줄 포함). */
export function parseSearchAnalyticsRows(json: unknown): GscMetricRow[] {
  if (!json || typeof json !== "object") return [];
  const rows = (json as { rows?: unknown }).rows;
  if (!Array.isArray(rows)) return [];
  const out: GscMetricRow[] = [];
  for (const r of rows as RawRow[]) {
    if (!r || typeof r !== "object") continue;
    const keys = Array.isArray(r.keys) ? r.keys : [];
    const key = keys.length > 0 ? String(keys[0] ?? "") : "";
    out.push({ key, clicks: num(r.clicks), impressions: num(r.impressions), ctr: num(r.ctr), position: num(r.position) });
  }
  return out;
}

/** 줄 합계 — 노출 가중 평균 순위. 노출 0 이면 순위 null. */
export function sumTotals(rows: readonly GscMetricRow[]): GscTotals {
  let clicks = 0;
  let impressions = 0;
  let weighted = 0;
  for (const r of rows) {
    clicks += r.clicks;
    impressions += r.impressions;
    weighted += r.position * r.impressions;
  }
  return {
    clicks,
    impressions,
    ctr: impressions > 0 ? clicks / impressions : 0,
    position: impressions > 0 ? weighted / impressions : null,
  };
}

/**
 * 조회 기간(한국 날짜). 서치콘솔 자료는 이틀쯤 늦게 확정되므로 끝은 today-lag.
 * 길이 days 의 "최근 기간"과 바로 앞 같은 길이의 "앞 기간"을 돌려준다.
 */
export function gscDateRanges(today: string, days = 28, lagDays = 2): {
  start: string;
  end: string;
  prevStart: string;
  prevEnd: string;
} {
  const add = (d: string, delta: number) => new Date(Date.parse(`${d}T00:00:00Z`) + delta * 86_400_000).toISOString().slice(0, 10);
  const end = add(today, -lagDays);
  const start = add(end, -(days - 1));
  const prevEnd = add(start, -1);
  const prevStart = add(prevEnd, -(days - 1));
  return { start, end, prevStart, prevEnd };
}

/** 날짜 줄을 기간 전체(빈 날 0)로 편다 — 막대가 빠진 날 없이 그려지게 */
export function fillDates(rows: readonly GscMetricRow[], start: string, end: string): GscMetricRow[] {
  const byKey = new Map(rows.map((r) => [r.key, r]));
  const out: GscMetricRow[] = [];
  let t = Date.parse(`${start}T00:00:00Z`);
  const endT = Date.parse(`${end}T00:00:00Z`);
  while (t <= endT) {
    const d = new Date(t).toISOString().slice(0, 10);
    out.push(byKey.get(d) ?? { key: d, clicks: 0, impressions: 0, ctr: 0, position: 0 });
    t += 86_400_000;
  }
  return out;
}

/** 페이지 URL → 사이트 안 경로(화면용). 우리 도메인이 아니면 그대로. */
export function pagePath(url: string, origin: string): string {
  if (url.startsWith(origin)) {
    const p = url.slice(origin.length) || "/";
    try {
      return decodeURIComponent(p);
    } catch {
      return p;
    }
  }
  return url;
}
