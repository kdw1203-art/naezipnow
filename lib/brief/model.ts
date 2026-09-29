/**
 * [1025 · 브리핑] 중개사 브리핑 리포트(/complex/[id]/brief) — 순수 계산(서버·클라이언트·테스트 공용, DOM·DB 없음).
 *
 *   · 발행자 줄 — 사무소명·담당자·연락처를 " · " 로 잇는다. 셋 다 비면 "사무소 정보 입력"(입력 전 상태를 그대로 말한다).
 *     값은 이 기기(localStorage)에만 있고 **URL 에 싣지 않는다**(개인정보 — 링크 복사는 정규 주소만).
 *   · 타입별 최근 실거래 표 — 전용면적 정수 ㎡(complex-v2-model 과 같은 규칙)로 묶어 거래 많은 순 최대 4개.
 *     칸은 최근가(그 타입 가장 최근 계약)·계약일·층·중앙값(최근 3개월, 달력 기준)·건수(기간 안 전체). 없는 값은 "—".
 *   · 해제 신고 — 표에서 뺀 해제 행의 건수와 계약월 목록("2026-01·02") — 주의 줄 재료.
 *
 * 값은 전부 만원 정수(HubDeal.man) — 억·만 표기는 화면 부품이 formatEokMan 으로 한다.
 */
import type { HubDeal } from "@/lib/complex/hub-price";
import { areaTypeKey } from "@/lib/market/tx-extremes";
import { isYm, medianOf, recentMedian, typeTabsFromDeals, ymAdd } from "@/app/complex/[id]/complex-v2-model";

/* ── 발행자 ─────────────────────────────────────────────────────────── */

export interface Publisher {
  office: string;
  agent: string;
  phone: string;
}

export const EMPTY_PUBLISHER: Publisher = { office: "", agent: "", phone: "" };

/** 입력 전 상태 문구 — 시안(mock1025/brief-d) 그대로 */
export const PUBLISHER_PLACEHOLDER = "사무소 정보 입력";

/** 이 기기에만 저장하는 키(localStorage). 쿼리·쿠키·서버에 보내지 않는다. */
export const PUBLISHER_STORAGE_KEY = "nz_brief_publisher_v1";

export const PUBLISHER_MAX = { office: 40, agent: 20, phone: 20 } as const;

/** 저장·표시 전 정리 — 앞뒤 공백 제거, 길이 상한, 문자열이 아닌 값은 빈칸 */
export function sanitizePublisher(input: unknown): Publisher {
  const o = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const pick = (k: keyof Publisher) =>
    typeof o[k] === "string" ? (o[k] as string).replace(/\s+/g, " ").trim().slice(0, PUBLISHER_MAX[k]) : "";
  return { office: pick("office"), agent: pick("agent"), phone: pick("phone") };
}

/** [1025c] 발행 줄 오른쪽 꼬리 — 띠에 문서 출처를 한 번 적는다(md 이상). */
export const BAND_SOURCE_TAIL = "내집나우 실거래 기준";

/** "○○공인중개사 · 김담당 · 010-0000-0000" — 있는 칸만 잇는다. 셋 다 비면 null */
export function publisherLine(p: Publisher): string | null {
  const s = sanitizePublisher(p);
  const parts = [s.office, s.agent, s.phone].filter((v) => v.length > 0);
  return parts.length > 0 ? parts.join(" · ") : null;
}

/** "발행 2026-09-29" — KST 날짜 문자열은 호출부가 준다(서버 ISR 시각을 쓰지 않는다: 7일 캐시라 낡는다) */
export function issuedLabel(isoDate: string | null): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(isoDate ?? "") ? `발행 ${isoDate}` : "발행 —";
}

/** 오늘(로컬 시계) → "YYYY-MM-DD". 브라우저에서만 부른다(발행일은 인쇄하는 사람의 오늘이다). */
export function localIsoDate(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/* ── 타입별 최근 실거래 표 ────────────────────────────────────────────── */

export interface BriefTypeRow {
  /** 전용면적 정수 ㎡ */
  areaM2: number;
  /** 기간 안 이 타입 거래 수(해제 제외) */
  count: number;
  /** 가장 최근 계약(만원·계약월·일·층) — 없으면 null(이론상 count ≥ 1 이면 있다) */
  latest: { ym: string; day: number | null; man: number; floor: number | null } | null;
  /** 최근 3개월(toYm 포함, 달력) 중앙값(만원) — 없으면 null */
  median3Man: number | null;
  /** 최근 3개월 표본 수 */
  median3Count: number;
}

/** 표 상한 — A4 한 장(시안은 3행) */
export const BRIEF_TYPE_MAX = 4;

/** 그 타입에서 가장 최근 계약(계약월 → 계약일 → 금액 순). 해제 행은 뺀다. */
export function latestOf(deals: readonly (HubDeal & { cancelled?: boolean })[]): HubDeal | null {
  let best: HubDeal | null = null;
  for (const d of deals) {
    if (d.cancelled || !isYm(d.ym)) continue;
    if (!best) {
      best = d;
      continue;
    }
    const cmp = d.ym.localeCompare(best.ym) || (d.day ?? -1) - (best.day ?? -1) || d.man - best.man;
    if (cmp > 0) best = d;
  }
  return best;
}

/**
 * 타입별 행 — 해제 행(cancelled)은 재료에서 뺀다(표는 "해제 제외"). 면적 없는 거래는 타입이 없어 빠진다.
 * nowYm 은 이번 달(KST) — 3개월 창의 끝. 못 구하면 가장 최근 계약월로 대신한다.
 */
export function briefTypeRows(
  deals: readonly (HubDeal & { cancelled?: boolean })[],
  nowYm: string | null,
  max = BRIEF_TYPE_MAX,
): BriefTypeRow[] {
  const valid = deals.filter((d) => !d.cancelled && isYm(d.ym) && Number.isFinite(d.man) && d.man > 0);
  if (valid.length === 0) return [];
  const toYm = nowYm && isYm(nowYm) ? nowYm : [...valid].map((d) => d.ym).sort().at(-1) ?? "";
  return typeTabsFromDeals(valid, max).map((t) => {
    const own = valid.filter((d) => areaTypeKey(d.area) === t.key);
    const latest = latestOf(own);
    const m = recentMedian(valid, toYm, 3, t.key);
    return {
      areaM2: t.areaM2,
      count: t.count,
      latest: latest ? { ym: latest.ym, day: latest.day ?? null, man: latest.man, floor: latest.floor ?? null } : null,
      median3Man: m.medianMan,
      median3Count: m.count,
    };
  });
}

/* ── 해제 신고 ──────────────────────────────────────────────────────── */

export interface CancelledSummary {
  count: number;
  /** 해제 행의 계약월(오름차순, 중복 제거) */
  yms: string[];
}

export function cancelledSummary(deals: readonly (HubDeal & { cancelled?: boolean })[]): CancelledSummary {
  const yms = new Set<string>();
  let count = 0;
  for (const d of deals) {
    if (!d.cancelled) continue;
    count += 1;
    if (isYm(d.ym)) yms.add(d.ym);
  }
  return { count, yms: [...yms].sort() };
}

/**
 * "2026-01·02" / "2025-11 · 2026-01·02" — 같은 해는 달만 잇는다. 빈 목록은 "".
 * 주의 줄이 A4 한 줄을 넘지 않게 최대 6개월까지만 적고 나머지는 "외 N개월".
 */
export function cancelledMonthsLabel(yms: readonly string[], max = 6): string {
  const valid = yms.filter(isYm).sort();
  if (valid.length === 0) return "";
  const shown = valid.slice(0, max);
  const groups = new Map<string, string[]>();
  for (const ym of shown) {
    const y = ym.slice(0, 4);
    const arr = groups.get(y) ?? [];
    arr.push(ym.slice(4, 6));
    groups.set(y, arr);
  }
  const text = [...groups.entries()].map(([y, ms]) => `${y}-${ms.join("·")}`).join(" · ");
  const rest = valid.length - shown.length;
  return rest > 0 ? `${text} 외 ${rest}개월` : text;
}

/* ── 학교 ───────────────────────────────────────────────────────────── */

export interface BriefSchool {
  name: string;
  category: string | null;
  distanceM: number;
}

/**
 * [1025b] ③ 줄의 학교 칸 — 가장 가까운 초등학교, 없으면 가장 가까운 학교. 목록이 비면 null(칸을 그리지 않는다 — "—" 칸 금지).
 * 거리가 유한하지 않은 행은 제외.
 */
export function nearestSchool<T extends BriefSchool>(schools: readonly T[]): T | null {
  const valid = schools.filter((s) => Number.isFinite(s.distanceM) && s.distanceM >= 0);
  const byDist = (a: T, b: T) => a.distanceM - b.distanceM;
  return [...valid].filter((s) => (s.category ?? "").includes("초등")).sort(byDist)[0] ?? [...valid].sort(byDist)[0] ?? null;
}

/** "350m · 도보 4분" / "1.2km · 도보 15분" — 도보는 80m/분, 최소 1분 */
export function schoolDistanceLabel(distanceM: number): string {
  const dist = distanceM >= 1000 ? `${(distanceM / 1000).toFixed(1)}km` : `${Math.round(distanceM)}m`;
  return `${dist} · 도보 ${Math.max(1, Math.round(distanceM / 80))}분`;
}

/* ── 주소 ───────────────────────────────────────────────────────────── */

/** 브리핑 정규 주소 — 단지 화면 정규 경로 + "/brief". 쿼리 없음(사무소 정보를 싣지 않는다). */
export function briefPathFromComplexPath(complexPath: string): string {
  const base = complexPath.replace(/\/+$/, "");
  return `${base}/brief`;
}

/** 하단 출처 줄에 적는 짧은 주소 — "naezipnow.com/complex/…"(프로토콜 없음) */
export function shortUrlLabel(origin: string, path: string): string {
  return `${origin.replace(/^https?:\/\//, "").replace(/\/+$/, "")}${path}`;
}

/* ── [1025c] 대표 그림 · 결론 줄 ─────────────────────────────────────────
   소유자(2026-09-29) "심심하지 않아?" — 문서 위에 **타입별 최근 12개월 미니 차트**(점 = 실거래 한 건 · 선 = 월 중앙값 ·
   막대 = 건수) 와 **요약 띠**(최근 거래가 큰 숫자 · 전세가율 링) 를 둔다. 여기는 기하(0~1 좌표 · 원 둘레)만 — 색·크기는
   화면 부품이 토큰으로 칠한다. 숫자는 전부 로더가 준 실거래 값이다(추정 없음). */

/** 미니 차트 개수 상한 — 표(BRIEF_TYPE_MAX 4)보다 하나 적다: A4 한 줄에 셋 */
export const BRIEF_MINI_MAX = 3;
/** 미니 차트 창(개월) */
export const BRIEF_MINI_MONTHS = 12;
/** 선을 그으려면 이만큼은 있어야 한다 — 점 둘을 잇는 선은 추세가 아니라 우연이다 */
export const BRIEF_MINI_MIN_LINE_POINTS = 3;

export interface MiniPoint {
  ym: string;
  day: number | null;
  man: number;
  /** 창 안 시간 위치 0~1(계약월 + 계약일/31) */
  fx: number;
  /** 창 안 가격 위치 0~1(최저 0 · 최고 1 · 한 값뿐이면 0.5) */
  fy: number;
  /** 가장 최근 계약 — 채운 점 */
  latest: boolean;
}

export interface MiniSeries {
  areaM2: number;
  /** 창 안 거래 수(해제 제외) */
  count: number;
  /** 시간순 점 */
  points: MiniPoint[];
  /** 월 중앙값 선(월별 한 점, 시간순) — 점이 BRIEF_MINI_MIN_LINE_POINTS 미만이면 [] */
  line: { fx: number; fy: number }[];
  minMan: number | null;
  maxMan: number | null;
}

function monthIndex(from: string, ym: string): number {
  return (Number(ym.slice(0, 4)) - Number(from.slice(0, 4))) * 12 + (Number(ym.slice(4, 6)) - Number(from.slice(4, 6)));
}

/** 창 [toYm−(months−1), toYm] 의 시작 달 */
export function miniWindowFrom(toYm: string, months = BRIEF_MINI_MONTHS): string {
  return ymAdd(toYm, -(months - 1));
}

/**
 * 타입별 미니 차트 재료 — areas 순서대로(표 행과 같은 순서) 최대 max 개. 창은 toYm 끝 months 달(달력).
 * 점은 해제 제외·금액 있는 실거래 한 건씩. 선은 월 중앙값을 잇되 점이 3개 미만이면 긋지 않는다.
 * toYm 이 없으면 전체에서 가장 최근 계약월이 창의 끝(표와 같은 규칙).
 */
export function briefMiniSeries(
  deals: readonly (HubDeal & { cancelled?: boolean })[],
  areas: readonly number[],
  nowYm: string | null,
  max = BRIEF_MINI_MAX,
  months = BRIEF_MINI_MONTHS,
): MiniSeries[] {
  const valid = deals.filter((d) => !d.cancelled && isYm(d.ym) && Number.isFinite(d.man) && d.man > 0);
  const toYm = nowYm && isYm(nowYm) ? nowYm : [...valid].map((d) => d.ym).sort().at(-1) ?? null;
  if (!toYm) return [];
  const from = miniWindowFrom(toYm, months);
  return areas.slice(0, Math.max(0, max)).map((areaM2) => {
    const key = String(areaM2);
    const own = valid
      .filter((d) => areaTypeKey(d.area) === key && d.ym >= from && d.ym <= toYm)
      .sort((a, b) => a.ym.localeCompare(b.ym) || (a.day ?? 15) - (b.day ?? 15) || a.man - b.man);
    if (own.length === 0) return { areaM2, count: 0, points: [], line: [], minMan: null, maxMan: null };
    const mans = own.map((d) => d.man);
    const minMan = Math.min(...mans);
    const maxMan = Math.max(...mans);
    const span = maxMan - minMan;
    const fyOf = (man: number) => (span > 0 ? (man - minMan) / span : 0.5);
    const fxOf = (ym: string, day: number | null) => {
      const dayFrac = day != null && day >= 1 && day <= 31 ? (day - 1) / 31 : 0.5;
      return Math.min(1, Math.max(0, (monthIndex(from, ym) + dayFrac) / months));
    };
    const points: MiniPoint[] = own.map((d, i) => ({
      ym: d.ym,
      day: d.day ?? null,
      man: d.man,
      fx: fxOf(d.ym, d.day ?? null),
      fy: fyOf(d.man),
      latest: i === own.length - 1,
    }));
    let line: { fx: number; fy: number }[] = [];
    if (points.length >= BRIEF_MINI_MIN_LINE_POINTS) {
      const byMonth = new Map<string, number[]>();
      for (const d of own) byMonth.set(d.ym, [...(byMonth.get(d.ym) ?? []), d.man]);
      line = [...byMonth.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([ym, ms]) => ({ fx: fxOf(ym, 15), fy: fyOf(medianOf(ms) ?? ms[0]) }));
    }
    return { areaM2, count: own.length, points, line, minMan, maxMan };
  });
}

/** 시안(mock1025c/_build.mjs miniType) 기하 — 120×36 · 여백 4 · 점 영역 위 4~(h−16) · 기준선 h−12 · 건수 막대 h−6 높이 4 */
export const MINI_GEOM = { w: 120, h: 36, pad: 4, top: 4, plotH: 16, baseY: 24, barY: 30, barH: 4 } as const;

/** 점이 이만큼 넘으면 빽빽한 모드 — 작은 점을 반투명으로 채워 겹치는 곳이 진해진다(속 빈 원은 겹치면 얼룩이 된다) */
export const MINI_DENSE_FROM = 24;

export interface MiniGeometry {
  w: number;
  h: number;
  /** 점이 MINI_DENSE_FROM 초과 — 부품이 작은 반투명 점으로 그린다 */
  dense: boolean;
  baseline: { x1: number; y1: number; x2: number; y2: number };
  dots: { cx: number; cy: number; latest: boolean }[];
  /** "x,y x,y …" — 선이 없으면 "" */
  polyline: string;
  bar: { x: number; y: number; width: number; height: number };
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/** 0~1 좌표 → SVG 좌표. maxCount 는 미니 셋 중 가장 큰 건수(막대 폭의 분모, 0 이면 폭 0). */
export function miniChartGeometry(
  s: Pick<MiniSeries, "points" | "line" | "count">,
  maxCount: number,
  g: { w: number; h: number; pad: number } = MINI_GEOM,
): MiniGeometry {
  const { w, h, pad } = g;
  const plotH = h - 20;
  const px = (fx: number) => r2(pad + (w - 2 * pad) * fx);
  const py = (fy: number) => r2(4 + plotH * (1 - fy));
  return {
    w,
    h,
    dense: s.points.length > MINI_DENSE_FROM,
    baseline: { x1: pad, y1: h - 12, x2: w - pad, y2: h - 12 },
    dots: s.points.map((p) => ({ cx: px(p.fx), cy: py(p.fy), latest: p.latest })),
    polyline: s.line.map((p) => `${px(p.fx)},${py(p.fy)}`).join(" "),
    bar: { x: pad, y: h - 6, width: maxCount > 0 ? r2(((w - 2 * pad) * s.count) / maxCount) : 0, height: 4 },
  };
}

/** 전세가율 링(시안 ringPct) — 64×64 · r 26 · 굵기 6. 값은 0~100 으로 자른다. null 이면 dash 0(회색 궤도만). */
export function ringGeometry(pct: number | null, r = 26): { r: number; c: number; dash: number; value: number | null } {
  const c = r2(2 * Math.PI * r);
  const v = pct != null && Number.isFinite(pct) ? Math.min(100, Math.max(0, pct)) : null;
  return { r, c, dash: v == null ? 0 : r2((c * v) / 100), value: v };
}

/** 창 안 매매 건수(해제 제외) — 요약 띠 "최근 12개월 매매 N건" */
export function countInWindow(
  deals: readonly (HubDeal & { cancelled?: boolean })[],
  nowYm: string | null,
  months = BRIEF_MINI_MONTHS,
): number | null {
  const valid = deals.filter((d) => !d.cancelled && isYm(d.ym));
  const toYm = nowYm && isYm(nowYm) ? nowYm : [...valid].map((d) => d.ym).sort().at(-1) ?? null;
  if (!toYm) return valid.length === 0 ? 0 : null;
  const from = miniWindowFrom(toYm, months);
  return valid.filter((d) => d.ym >= from && d.ym <= toYm).length;
}

/**
 * 결론 한 줄 — "최근 12개월 매매 152건 · 최근 5억 5,000만 · 전세가율 46.5%". 없는 값은 조각째 빠진다(빈 괄호·"—" 없음).
 * 셋 다 없으면 null(줄을 그리지 않는다). 가격 표기는 호출부가 formatEokMan 으로 만들어 준다.
 */
export function briefConclusion(input: { count12: number | null; latestLabel: string | null; jeonsePct: number | null; months?: number }): string | null {
  const months = input.months ?? BRIEF_MINI_MONTHS;
  const parts = [
    input.count12 != null ? `최근 ${months}개월 매매 ${input.count12.toLocaleString("ko-KR")}건` : null,
    input.latestLabel ? `최근 ${input.latestLabel}` : null,
    input.jeonsePct != null && Number.isFinite(input.jeonsePct) ? `전세가율 ${input.jeonsePct}%` : null,
  ].filter((p): p is string => Boolean(p));
  return parts.length > 0 ? parts.join(" · ") : null;
}

/* ── [1025c] QR ─────────────────────────────────────────────────────────
   실제 QR 은 서버 전용 lib/brief/qr.ts(qrcode 패키지)가 만든다. 여기는 그 SVG 문자열을 문서에 앉히는 순수 정리만 —
   role/aria-label 을 달고, 파일이 아닌 인라인이므로 xmlns 는 그대로 둔다(있어도 무해). `<svg` 로 시작하지 않으면 null. */

export function qrSvgMarkup(raw: string | null | undefined, label: string): string | null {
  const s = (raw ?? "").trim();
  if (!/^<svg[\s>]/i.test(s) || !/<\/svg>\s*$/i.test(s)) return null;
  const safe = label.replace(/[<>&"]/g, "");
  return s.replace(/^<svg/i, `<svg role="img" aria-label="${safe}"`);
}

/** 견본(/pro) 이 제 SVG 안에 QR 을 겹쳐 그릴 때 — viewBox 와 안쪽 마크업만 뽑는다 */
export function qrSvgParts(raw: string | null | undefined): { viewBox: string; inner: string } | null {
  const s = (raw ?? "").trim();
  const open = s.match(/^<svg\b([^>]*)>/i);
  if (!open || !/<\/svg>\s*$/i.test(s)) return null;
  const vb = open[1].match(/viewBox="([^"]+)"/i)?.[1] ?? null;
  if (!vb) return null;
  const inner = s.slice(open[0].length).replace(/<\/svg>\s*$/i, "");
  return { viewBox: vb, inner };
}
