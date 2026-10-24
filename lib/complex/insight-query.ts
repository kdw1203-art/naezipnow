/**
 * [1089 · 비용] 단지 화면 "결과 요약 · 다요인 분석" 조회 주소 — 순수 함수(클라이언트 · API 라우트 · tests/unit/review-1089).
 *
 * 두 판은 지역 축(실거래 집계 · 심리 · 뉴스 · 한국은행 금리)과 관심도(1시간)를 읽는다. 단지 화면(ISR 7일) 안에서 읽으면
 * 그 캐시들의 짧은 수명(1시간 · 6시간)이 화면 전체의 수명이 되고(Next: 렌더 중 읽은 캐시 revalidate 의 최솟값),
 * 실거래 적재마다 비우는 "market" 태그가 2.4만 쪽을 통째로 비웠다(로컬 빌드 실측 s-maxage=3600). 그래서 두 판은
 * 사람이 볼 때 이 주소로 따로 받는다(/api/complex/insight · CDN 6시간). 주소에는 화면이 이미 가진 값만 싣는다 — 새 조회 0.
 */

export type InsightSeries = { yms: string[]; counts: number[]; mainValues?: (number | null)[] };

export type InsightQuery = {
  complexId: string;
  regionName: string;
  series: InsightSeries | null;
};

const ID_RE = /^[A-Za-z0-9._~-]{1,200}$/;
/** 지역 이름 — "서울 강남구" · "안양 동안구" · "세종" (한글 · 영문 · 숫자 · 공백 · 가운뎃점) */
const REGION_RE = /^[가-힣A-Za-z0-9 ·.()-]{1,40}$/;
const YM_RE = /^\d{6}$/;
const MAX_MONTHS = 120;

export const INSIGHT_PATH = "/api/complex/insight";

/** 화면 값 → 주소 쿼리. 계열 길이가 어긋나면 계열은 싣지 않는다(지어내지 않는다). */
export function insightQueryString(q: InsightQuery): string {
  const sp = new URLSearchParams();
  sp.set("id", q.complexId);
  sp.set("region", q.regionName);
  const s = q.series;
  if (s && s.yms.length > 0 && s.yms.length <= MAX_MONTHS && s.counts.length === s.yms.length) {
    sp.set("ym", s.yms.join(","));
    sp.set("c", s.counts.map((n) => String(Math.max(0, Math.round(n)))).join(","));
    if (s.mainValues && s.mainValues.length === s.yms.length) {
      sp.set("v", s.mainValues.map((v) => (v == null || !Number.isFinite(v) ? "" : String(Math.round(v)))).join(","));
    }
  }
  return sp.toString();
}

function ints(raw: string, n: number, allowEmpty: boolean): (number | null)[] | null {
  const parts = raw.split(",");
  if (parts.length !== n) return null;
  const out: (number | null)[] = [];
  for (const p of parts) {
    if (p === "") {
      if (!allowEmpty) return null;
      out.push(null);
      continue;
    }
    if (!/^\d{1,9}$/.test(p)) return null;
    out.push(Number(p));
  }
  return out;
}

/** 주소 쿼리 → 값. 형식이 어긋나면 null(400) — 계열만 어긋나면 계열 없이(지역 · 금리 요인은 그대로 읽는다). */
export function parseInsightQuery(sp: URLSearchParams): InsightQuery | null {
  const complexId = (sp.get("id") ?? "").trim();
  const regionName = (sp.get("region") ?? "").trim();
  if (!ID_RE.test(complexId) || !REGION_RE.test(regionName)) return null;
  let series: InsightSeries | null = null;
  const ym = sp.get("ym");
  const c = sp.get("c");
  if (ym && c) {
    const yms = ym.split(",");
    if (yms.length > 0 && yms.length <= MAX_MONTHS && yms.every((y) => YM_RE.test(y))) {
      const counts = ints(c, yms.length, false);
      if (counts) {
        const v = sp.get("v");
        const values = v != null ? ints(v, yms.length, true) : null;
        series = { yms, counts: counts as number[], ...(values ? { mainValues: values } : {}) };
      }
    }
  }
  return { complexId, regionName, series };
}
