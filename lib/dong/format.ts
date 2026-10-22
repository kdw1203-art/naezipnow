/**
 * [1083] 법정동 실거래 페이지(/dong/<지역>/<동>) — 순수 함수(주소·문턱·제목·설명문·Q&A). 조회는 lib/dong/landing.ts.
 *
 * 왜: "잠실동 아파트 실거래가" 같은 동 단위 검색어를 받는 화면이 없었다(지역 872 · 실거래 구간 1,927 · 단지 23,809 사이의 빈 칸).
 * DB 에는 이미 동 단위 집계(market_agg.search_area_mv · 동 3,566곳 / search_complex_mv · 단지 40,316곳)가 있다.
 * 얇은 페이지 금지(docs/strategy/unfair-advantage.md): 단지 3곳 · 최근 6개월 거래 30건 이상만 색인하고, 사이트맵은 50건 이상만 싣는다.
 */
import { AREA_BANDS, areaBandOf } from "@/lib/market/bands";
import { formatKrwShort } from "@/lib/market/format";

/** 색인(index) 문턱 — 단지 3곳 · 최근 6개월 매매 신고 30건. 미만은 페이지는 있되 noindex,follow */
export const DONG_INDEX_MIN_COMPLEXES = 3;
export const DONG_INDEX_MIN_RECENT = 30;
/** 사이트맵 문턱 — 색인 문턱보다 높다(사이트맵 ⊂ 색인 가능). 운영 실측 2026-10-21: 1,154곳 */
export const DONG_SITEMAP_MIN_RECENT = 50;
/** 최근 N 개월 추이 · 최근 거래 표 */
export const DONG_TREND_MONTHS = 24;
export const DONG_RECENT_DEALS = 20;

export type DongComplex = {
  id: string;
  name: string;
  region: string;
  address: string | null;
  tradeCount: number;
  recentTradeCount: number;
  avgPriceManwon: number | null;
  avgAreaM2: number | null;
  buildYear: number | null;
  households: number | null;
};

export type DongMonth = { ym: string; count: number; medianKrw: number | null; avgKrw: number | null; open: boolean };
export type DongDeal = { complexName: string; ym: string; day: number | null; priceKrw: number; areaM2: number | null; floor: number | null };
export type DongBandCell = { slug: string; label: string; count: number; medianKrw: number | null; avgKrw: number | null };
export type DongSibling = { dong: string; complexCount: number; recentTradeCount: number };

export type DongLanding = {
  /** market_transactions.region_name ("서울 송파구" · "원주시") */
  region: string;
  regionSlug: string;
  dong: string;
  /** "서울 송파구 잠실동" */
  label: string;
  complexCount: number;
  recentTradeCount: number;
};

/** 지역 슬러그 — lib/market/tx-bands regionToSlug 와 같은 규칙(공백 → 하이픈). tx-bands 는 server-only 라 여기 다시 적는다 */
export function regionSlugOf(regionName: string): string {
  return regionName.trim().replace(/\s+/g, "-");
}

export function dongPath(region: string, dong: string): string {
  return `/dong/${encodeURIComponent(regionSlugOf(region))}/${encodeURIComponent(dong)}`;
}

/** 슬러그("서울-송파구") → 지역 이름("서울 송파구"). 꼴이 아니면 null(임의 문자열로 빈 페이지를 만들지 않는다) */
export function regionFromSlug(slug: string): string | null {
  let decoded = slug;
  try {
    decoded = decodeURIComponent(slug);
  } catch {
    /* 깨진 인코딩은 원문 */
  }
  const name = decoded.trim().replace(/-+/g, " ").replace(/\s+/g, " ");
  return /^[가-힣0-9 ]{2,24}$/.test(name) ? name : null;
}

/** 동 파라미터 — 한글 읍·면·동·가·리 꼴만(lib/complex/dong EMD_RE 와 같은 꼴) */
export function dongFromParam(param: string): string | null {
  let decoded = param;
  try {
    decoded = decodeURIComponent(param);
  } catch {
    /* 깨진 인코딩은 원문 */
  }
  const d = decoded.trim();
  return /^[가-힣][가-힣0-9]{0,11}[동읍면가리]$/.test(d) ? d : null;
}

export function dongIndexable(complexCount: number, recentTradeCount: number): boolean {
  return complexCount >= DONG_INDEX_MIN_COMPLEXES && recentTradeCount >= DONG_INDEX_MIN_RECENT;
}

export function dongInSitemap(complexCount: number, recentTradeCount: number): boolean {
  return complexCount >= DONG_INDEX_MIN_COMPLEXES && recentTradeCount >= DONG_SITEMAP_MIN_RECENT;
}

const n = (v: number) => v.toLocaleString("ko-KR");

export function dongTitle(label: string, complexCount: number, recentTradeCount: number): string {
  return `${label} 아파트 실거래가 — 단지 ${n(complexCount)}곳 · 최근 6개월 ${n(recentTradeCount)}건 | 내집나우`;
}

export function dongDescription(label: string, complexCount: number, recentTradeCount: number, top: DongComplex | null, months: DongMonth[]): string {
  const closed = [...months].reverse().find((m) => !m.open && m.count > 0 && m.medianKrw);
  const parts = [`${label} 아파트 단지 ${n(complexCount)}곳의 매매 실거래(국토교통부 신고 · 최근 6개월 ${n(recentTradeCount)}건)`];
  if (top) parts.push(`거래 많은 단지 ${top.name}${top.avgPriceManwon ? ` 평균 ${formatKrwShort(top.avgPriceManwon * 10_000)}` : ""}`);
  if (closed) parts.push(`${ymKo(closed.ym)} 중앙값 ${formatKrwShort(closed.medianKrw)}`);
  parts.push("월별 추이 · 면적대별 중앙값 · 단지별 거래 · 최근 실거래. 매물 호가가 아닙니다.");
  return parts.join(" · ");
}

/** "202609" → "2026.09" */
export function ymDot(ym: string): string {
  return /^\d{6}$/.test(ym) ? `${ym.slice(0, 4)}.${ym.slice(4, 6)}` : ym;
}
/** "202609" → "2026년 9월" */
export function ymKo(ym: string): string {
  return /^\d{6}$/.test(ym) ? `${ym.slice(0, 4)}년 ${Number(ym.slice(4, 6))}월` : ym;
}

function median(sorted: number[]): number | null {
  if (sorted.length === 0) return null;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

/** 거래 행(월·금액·면적)을 월별로 — 창 안의 달은 0건도 한 줄(빈 달이 사라지면 추이가 끊긴 것처럼 보인다) */
export function aggregateMonths(
  rows: ReadonlyArray<{ ym: string; priceKrw: number }>,
  ymsAsc: readonly string[],
  isOpen: (ym: string) => boolean,
): DongMonth[] {
  const by = new Map<string, number[]>();
  for (const r of rows) {
    if (!Number.isFinite(r.priceKrw) || r.priceKrw <= 0) continue;
    const list = by.get(r.ym);
    if (list) list.push(r.priceKrw);
    else by.set(r.ym, [r.priceKrw]);
  }
  return ymsAsc.map((ym) => {
    const list = (by.get(ym) ?? []).sort((a, b) => a - b);
    const sum = list.reduce((s, v) => s + v, 0);
    return { ym, count: list.length, medianKrw: median(list), avgKrw: list.length ? Math.round(sum / list.length) : null, open: isOpen(ym) };
  });
}

/** 최근 12개월 면적대별 — 건수 0 구간은 뺀다 */
export function aggregateBands(rows: ReadonlyArray<{ ym: string; priceKrw: number; areaM2: number | null }>, fromYm: string): DongBandCell[] {
  const by = new Map<string, number[]>();
  for (const r of rows) {
    if (r.ym < fromYm || !Number.isFinite(r.priceKrw) || r.priceKrw <= 0) continue;
    const band = areaBandOf(r.areaM2);
    if (!band) continue;
    const list = by.get(band.slug);
    if (list) list.push(r.priceKrw);
    else by.set(band.slug, [r.priceKrw]);
  }
  return AREA_BANDS.map((b) => {
    const list = (by.get(b.slug) ?? []).sort((a, c) => a - c);
    const sum = list.reduce((s, v) => s + v, 0);
    return { slug: b.slug, label: b.label, count: list.length, medianKrw: median(list), avgKrw: list.length ? Math.round(sum / list.length) : null };
  }).filter((c) => c.count > 0);
}

/** 실데이터로만 만든 Q&A — 값이 없으면 그 질문을 넣지 않는다 */
export function buildDongFaq(input: {
  label: string;
  complexCount: number;
  recentTradeCount: number;
  top: DongComplex | null;
  bands: DongBandCell[];
  months: DongMonth[];
}): Array<{ q: string; a: string }> {
  const out: Array<{ q: string; a: string }> = [];
  const { label, complexCount, recentTradeCount, top, bands, months } = input;
  if (complexCount > 0) {
    out.push({
      q: `${label} 아파트 단지는 몇 곳인가요?`,
      a: `국토교통부 실거래 신고에 잡힌 ${label} 아파트 단지는 ${n(complexCount)}곳이고, 최근 6개월 매매 신고는 ${n(recentTradeCount)}건입니다. 매물 호가가 아닌 신고된 실거래만 집계한 값입니다.`,
    });
  }
  if (top && top.recentTradeCount > 0) {
    out.push({
      q: `${label}에서 최근 거래가 가장 많은 단지는 어디인가요?`,
      a: `최근 6개월 매매 신고가 가장 많은 단지는 ${top.name}(${n(top.recentTradeCount)}건${top.avgPriceManwon ? ` · 거래 평균 ${formatKrwShort(top.avgPriceManwon * 10_000)}` : ""}${top.buildYear ? ` · ${top.buildYear}년 준공` : ""})입니다.`,
    });
  }
  const m85 = bands.find((b) => b.slug === "60-85" && b.medianKrw);
  const topBand = [...bands].sort((a, b) => b.count - a.count)[0];
  if (m85) {
    out.push({
      q: `${label} 아파트 전용 60~85㎡(국민평형)는 얼마에 거래되나요?`,
      a: `최근 12개월 전용 60~85㎡ 매매 실거래 ${n(m85.count)}건의 중앙값은 ${formatKrwShort(m85.medianKrw)}, 평균은 ${formatKrwShort(m85.avgKrw)}입니다. 단지·층·동에 따라 차이가 크니 단지별 실거래를 함께 봅니다.`,
    });
  } else if (topBand && topBand.medianKrw) {
    out.push({
      q: `${label} 아파트는 주로 어느 면적대가 거래되나요?`,
      a: `최근 12개월 전용 ${topBand.label} 구간이 ${n(topBand.count)}건으로 가장 많고, 이 구간의 중앙값은 ${formatKrwShort(topBand.medianKrw)}입니다.`,
    });
  }
  const closed = months.filter((m) => !m.open && m.count > 0);
  const last = closed[closed.length - 1];
  const prev = closed[closed.length - 2];
  if (last && prev && prev.count > 0) {
    const pct = Math.round(((last.count - prev.count) / prev.count) * 100);
    out.push({
      q: `${label} 아파트 거래량은 늘고 있나요?`,
      a: `신고가 끝난 ${ymKo(last.ym)} 매매 신고는 ${n(last.count)}건으로 ${ymKo(prev.ym)}(${n(prev.count)}건)보다 ${pct >= 0 ? `${pct}% 많습니다` : `${Math.abs(pct)}% 적습니다`}. 계약 후 신고까지 30일 시차가 있어 최근 달 수치는 이후 늘어날 수 있습니다.`,
    });
  }
  return out;
}

/** 인용 문장 — 출처·기준이 든 완결 문장 */
export function dongCitation(label: string, complexCount: number, recentTradeCount: number, months: DongMonth[]): string {
  const closed = [...months].reverse().find((m) => !m.open && m.count > 0 && m.medianKrw);
  return `내집나우(naezipnow.com) 집계에 따르면, ${label} 아파트 단지 ${n(complexCount)}곳의 최근 6개월 매매 실거래는 ${n(recentTradeCount)}건이다${
    closed ? ` (${ymKo(closed.ym)} 중앙값 ${formatKrwShort(closed.medianKrw)})` : ""
  } (국토교통부 실거래 신고 기반, 해제분 제외).`;
}
