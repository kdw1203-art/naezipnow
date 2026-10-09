/**
 * [1048 · 다요인 분석 엔진] 심리 · 뉴스 · 관심도 · 거래량 · 1년 추이 · 단기 추세 · 매물·공급 · 금리 — 8요인 → 시장 신호.
 *
 * 소유자 지시(2026-10-09): "AI 분석 관련해서 여러 요인들(심리지수, 부동산뉴스, 관심도, 거래량, 추이, 추세, 매물수 등)을
 * 고려해서 분석할 수 있도록 툴을 만들어 적용 · 임장노트 결과에도 반영할 수 있게 범용적으로".
 *
 * 범용: 입력(SignalInputs)은 화면과 무관한 사실 묶음이다. 단지 화면 · 임장노트 · AI 분석 프롬프트가 같은 함수를 부른다.
 *   · 단지 화면    — 지역 사실 + 이 단지 실거래 · 관심
 *   · 임장노트     — 지역 사실 + 이 노트의 기록 점수(현장)
 *   · AI 프롬프트  — promptLines() 를 근거로 넣는다(숫자를 새로 만들지 않게)
 *
 * 규칙
 *  ① 요인 점수는 −2(내림 쪽) ~ +2(오름 쪽). 매수·매도 권유가 아니라 "가격·수요가 어느 쪽으로 기우는 신호인가"다.
 *  ② 값이 없으면 점수를 만들지 않는다(status none) · 못 읽었으면 failed · 표본이 작으면 thin(가중치 절반, 점수 없으면 미반영).
 *     [1052 · v2] 빈 값을 중립 0 으로 세지 않는다 — 방향 낱말 없는 뉴스 · 입주 예정 자료 없음(또는 0세대)인 매물·공급은
 *     점수 null(반영 수에서 빠짐). 관심도는 일부를 못 읽으면 "표본 적음"이 아니라 failed 로 적는다.
 *  ③ 종합(0~100, 50 중립)은 점수가 있는 요인이 3개 이상일 때만. 가중 평균 × 22.5 + 50.
 *  ④ 현장(임장 기록 점수)은 시장 신호에 섞지 않고 옆에 따로 적는다 — 성격이 다른 숫자다.
 *  ⑤ 공식을 바꾸면 SIGNAL_FORMULA_VERSION 을 올린다(AI 분석 기록에 버전이 함께 남는다).
 *  ⑥ 오름 쪽 · 내림 쪽 경계는 SIGNAL_LEAN 하나 — 끌어올림/누름 요인과 판의 낱말·색이 같은 값을 쓴다.
 *  ⑦ 이 계산은 정해진 규칙이다(AI 가 만든 판단이 아님) — 화면 이름도 "다요인 분석 · 규칙 계산".
 *
 * 순수 함수 — 서버 · 클라이언트 · 단위 시험 공용. DB 를 모른다(읽기는 lib/signals/load.ts).
 */
import { summarizeNewsTone } from "@/lib/signals/news-tone";
import {
  SIGNAL_LEAN,
  asOfKey,
  coverageBreakdown,
  factorStateWord,
  latestAsOf,
  scoreLean,
  scoreWord,
  unscoredReason,
  ymLabel,
} from "@/lib/signals/display";

export { SIGNAL_LEAN, asOfKey, coverageBreakdown, factorStateWord, latestAsOf, scoreLean, scoreWord, unscoredReason, ymLabel };

/** v2(1052) — 빈 값 0점 금지(뉴스 방향 낱말 없음 · 입주 예정 없음/0세대 → 미반영) · 관심도 일부 실패 구분 · 쪽 경계 SIGNAL_LEAN */
export const SIGNAL_FORMULA_VERSION = 2;

export type SignalFactorKey = "sentiment" | "news" | "interest" | "volume" | "trend" | "momentum" | "supply" | "rate";
export type SignalStatus = "ok" | "thin" | "none" | "failed";

export const SIGNAL_FACTOR_META: Record<SignalFactorKey, { label: string; weight: number; what: string }> = {
  sentiment: { label: "심리", weight: 1, what: "매수우위지수 · 주택가격전망 CSI" },
  news: { label: "뉴스", weight: 0.6, what: "지역 기사 제목의 오름·내림 낱말" },
  interest: { label: "관심도", weight: 0.6, what: "지역 기사 언급 변화 · 내집나우 관심 등록·조회" },
  volume: { label: "거래량", weight: 1, what: "지역 아파트 매매 신고 건수 변화" },
  trend: { label: "1년 추이", weight: 1, what: "한국부동산원 매매지수 1년 변화" },
  momentum: { label: "단기 추세", weight: 1, what: "주간 매매지수 최근 3주 흐름" },
  supply: { label: "매물·공급", weight: 0.8, what: "입주 예정 물량 · 기사 속 매물 흐름" },
  rate: { label: "금리", weight: 0.8, what: "예금은행 대출금리 · 금리수준전망 CSI" },
};

export const SIGNAL_FACTOR_ORDER: readonly SignalFactorKey[] = [
  "sentiment",
  "news",
  "interest",
  "volume",
  "trend",
  "momentum",
  "supply",
  "rate",
];

export interface SignalFactor {
  key: SignalFactorKey;
  label: string;
  /** −2(내림 쪽) ~ +2(오름 쪽) · 없으면 null */
  score: number | null;
  status: SignalStatus;
  /** 사실 한 줄 — "매수우위 99.1 · 주택가격전망 CSI 125" */
  value: string;
  /** 읽는 법 한 줄(짧게) — 없으면 null */
  note: string | null;
  source: string;
  asOf: string | null;
  /** 종합에 실제로 쓴 가중치(thin 이면 절반 · 점수 없으면 0) */
  weight: number;
}

export interface FieldSignal {
  /** 0~100 */
  score100: number;
  /** "이 노트 기록 점수" · "이웃 임장노트 평균" */
  label: string;
  source: string;
  count?: number | null;
}

export interface SignalReport {
  version: number;
  scope: "complex" | "region" | "note";
  regionLabel: string;
  generatedAt: string;
  factors: SignalFactor[];
  /** 종합 0~100(50 중립) — 점수 있는 요인이 3개 미만이면 null */
  index: number | null;
  band: string | null;
  coverage: { used: number; total: number };
  drivers: { up: string[]; down: string[] };
  field: FieldSignal | null;
  /** 규칙으로 만든 한 줄 해석 */
  headline: string;
}

/* ── 입력 ─────────────────────────────────────────────────────────── */

/** 값 · 없음(null) · 못 읽음("failed") */
export type Input<T> = T | null | "failed";

export interface SignalInputs {
  scope: SignalReport["scope"];
  regionLabel: string;
  /** 기준 시각(ISO) — 시험에서 고정 */
  now?: string;
  sentiment: Input<{
    /** 한국부동산원 주간 매매수급동향(매수우위) — 100 = 사려는 쪽·팔려는 쪽 균형 */
    buySuperiority: { value: number; asOf: string; area: string } | null;
    /** 한국은행 주택가격전망 CSI — 100 = 오를 거라는 응답과 내릴 거라는 응답이 같음 */
    housingCsi: { value: number; prev: number | null; asOf: string; group: string } | null;
  }>;
  news: Input<{
    /** 지역 기사(우리 자동 글 제외) — 최근 windowDays 일 */
    items: { title: string; at: string }[];
    windowDays: number;
  }>;
  interest: Input<{
    /** 지역 기사 최근 30일 · 직전 30일 — 기사를 못 읽었으면 null(newsFailed) */
    newsRecent30: number | null;
    newsPrior30: number | null;
    /** 지역 기사를 못 읽음 — 0건과 다르다 */
    newsFailed?: boolean;
    /** 내집나우 이 단지 화면 조회(동의한 방문의 표본) — 단지 화면이 아니면 null */
    siteViews30: number | null;
    siteViewsPrior30: number | null;
    /** 이 단지 관심 등록 수 */
    watchers: number | null;
    /** 단지 화면인데 조회·관심 표본을 못 읽음 — "표본 적음"과 다르다 */
    siteFailed?: boolean;
  }>;
  volume: Input<{
    /** 지역 월별 매매 신고 건수(오름차순, yyyymm) — 이번 달·지난달은 신고 기한(30일)이 안 지나 엔진이 뺀다 */
    region: { month: string; count: number }[];
    /** 이 단지 월별 건수(있으면 설명 줄에만) */
    complex?: { yms: string[]; counts: number[] } | null;
  }>;
  trend: Input<{
    yoyPct: number | null;
    fromYm: string | null;
    asOf: string | null;
    /** 이 단지 주력 평형 최근 3개월 중위 vs 직전 3개월(만원) — 설명 줄에만 */
    complexRecentMan?: number | null;
    complexPriorMan?: number | null;
  }>;
  momentum: Input<{
    /** 주간 매매지수(오름차순) */
    weekly: { period: string; value: number }[];
    /** 주간이 없을 때 월간 한 달 변동률(%) */
    momPct: number | null;
    momAsOf: string | null;
  }>;
  supply: Input<{
    upcomingHouseholds: number | null;
    regionHouseholds: number | null;
    firstYm: string | null;
    lastYm: string | null;
    /** 지역 연간 아파트 매매 신고(최근 12개 완결월 합) — 세대수 자료가 없을 때 입주 물량의 잣대 */
    annualTrades?: number | null;
  }>;
  rate: Input<{
    baseRatePct: number | null;
    loanRatePct: number | null;
    loanAsOf: string | null;
    /** 한국은행 금리수준전망 CSI — 100 넘으면 오를 거라는 응답이 많음 */
    rateOutlookCsi: number | null;
  }>;
  field?: FieldSignal | null;
}

/* ── 도움 함수 ─────────────────────────────────────────────────────── */

export function clampScore(v: number, lo = -2, hi = 2): number {
  const r = Math.min(hi, Math.max(lo, v));
  return Math.round(r * 100) / 100;
}

const signed = (v: number, digits = 1) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(digits)}`;
const pct = (v: number, digits = 1) => `${signed(v, digits)}%`;
const n0 = (v: number) => Math.round(v).toLocaleString("ko-KR");

/** 이번 달과 지난달(신고 기한 30일 안)은 뺀 완결월 */
export function completeMonths<T extends { month: string }>(rows: readonly T[], nowIso: string): T[] {
  const d = new Date(nowIso);
  const kst = new Date(d.getTime() + 9 * 3600_000);
  const cur = kst.getUTCFullYear() * 100 + kst.getUTCMonth() + 1;
  const prevDate = new Date(Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth() - 1, 1));
  const prev = prevDate.getUTCFullYear() * 100 + prevDate.getUTCMonth() + 1;
  return rows.filter((r) => /^\d{6}$/.test(r.month) && Number(r.month) < Math.min(cur, prev));
}

function monthsBetween(fromYm: string, toYm: string): number {
  const a = Number(fromYm.slice(0, 4)) * 12 + Number(fromYm.slice(4, 6));
  const b = Number(toYm.slice(0, 4)) * 12 + Number(toYm.slice(4, 6));
  return Number.isFinite(a) && Number.isFinite(b) ? Math.max(0, b - a) : 0;
}

/** 최근 12개 완결월 매매 신고 합 — 12개월이 다 있어야 한다(없으면 null) */
export function annualTradesFrom(rows: readonly { month: string; count: number }[], nowIso: string): number | null {
  const done = completeMonths(rows, nowIso).sort((a, b) => a.month.localeCompare(b.month));
  if (done.length < 12) return null;
  const last12 = done.slice(-12);
  if (monthsBetween(last12[0].month, last12[11].month) !== 11) return null;
  return last12.reduce((s, r) => s + r.count, 0);
}

function ymShift(ym: string, delta: number): string {
  const y = Number(ym.slice(0, 4));
  const m = Number(ym.slice(4, 6)) - 1 + delta;
  const d = new Date(Date.UTC(y, m, 1));
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function blank(key: SignalFactorKey, status: SignalStatus, value: string, source: string, note: string | null = null): SignalFactor {
  return { key, label: SIGNAL_FACTOR_META[key].label, score: null, status, value, note, source, asOf: null, weight: 0 };
}

function made(
  key: SignalFactorKey,
  score: number | null,
  status: SignalStatus,
  value: string,
  source: string,
  asOf: string | null,
  note: string | null,
): SignalFactor {
  const base = SIGNAL_FACTOR_META[key].weight;
  const weight = score === null ? 0 : status === "thin" ? base / 2 : base;
  return { key, label: SIGNAL_FACTOR_META[key].label, score: score === null ? null : clampScore(score), status, value, note, source, asOf, weight };
}

const FAILED_TEXT = "불러오기 실패 · 잠시 후 다시";

/* ── 요인별 규칙 ───────────────────────────────────────────────────── */

export function sentimentFactor(input: SignalInputs["sentiment"]): SignalFactor {
  const src = "한국부동산원 매매수급동향 · 한국은행 소비자동향조사";
  if (input === "failed") return blank("sentiment", "failed", FAILED_TEXT, src);
  const bs = input?.buySuperiority ?? null;
  const csi = input?.housingCsi ?? null;
  if (!bs && !csi) return blank("sentiment", "none", "심리 지수 없음", src);
  const parts: number[] = [];
  const text: string[] = [];
  let asOf: string | null = null;
  if (bs) {
    /* 매수우위는 실측 범위가 대개 70~110 — 100 에서 ±15 를 ±2 로 */
    parts.push((bs.value - 100) / 7.5);
    text.push(`매수우위 ${bs.value.toFixed(1)}(${bs.area})`);
    asOf = bs.asOf;
  }
  if (csi) {
    /* CSI 는 100 에서 ±25 를 ±2 로(125 = 오를 거라는 응답이 훨씬 많음) */
    parts.push((csi.value - 100) / 12.5);
    const move = csi.prev !== null ? ` · 3개월 전 ${Math.round(csi.prev)}` : "";
    text.push(`주택가격전망 CSI ${Math.round(csi.value)}(${csi.group}${move})`);
    asOf = asOf ?? csi.asOf;
  }
  const score = parts.reduce((a, b) => a + b, 0) / parts.length;
  const note = bs && csi ? "100 넘으면 사려는 쪽 · 오를 거라는 응답이 많음" : bs ? "100 넘으면 사려는 쪽이 많음" : "100 넘으면 오를 거라는 응답이 많음";
  return made("sentiment", score, "ok", text.join(" · "), src, asOf, note);
}

export function newsFactor(input: SignalInputs["news"]): SignalFactor {
  const src = "내집나우가 모은 부동산 뉴스(제목 낱말 기준)";
  if (input === "failed") return blank("news", "failed", FAILED_TEXT, src);
  const items = input?.items ?? [];
  const days = input?.windowDays ?? 60;
  if (items.length === 0) return blank("news", "none", `최근 ${days}일 이 지역 기사 없음`, src);
  const tone = summarizeNewsTone(items.map((i) => i.title));
  const toned = tone.upCount + tone.downCount;
  const words = tone.topWords.length ? ` · 많이 나온 낱말 ${tone.topWords.join("·")}` : "";
  const sortedAt = items.map((i) => i.at).sort();
  const latest = sortedAt.length ? sortedAt[sortedAt.length - 1] : null;
  const value = `기사 ${items.length}건 · 오름 ${tone.upCount} · 내림 ${tone.downCount}${words}`;
  const asOf = latest ? latest.slice(0, 10) : null;
  /* [1052] 방향 낱말이 하나도 없으면 "중립 0점"이 아니라 미반영 — 기사가 있다는 것만으로 방향을 말할 수 없다 */
  if (toned === 0) return made("news", null, "thin", value, src, asOf, "방향 낱말 있는 제목 없음 · 점수 미반영");
  const score = (2 * (tone.upCount - tone.downCount)) / Math.max(toned, 3);
  const status: SignalStatus = items.length < 3 ? "thin" : "ok";
  return made("news", score, status, value, src, asOf, status === "thin" ? "기사 3건 미만 · 가중치 절반" : null);
}

export function interestFactor(input: SignalInputs["interest"]): SignalFactor {
  const src = "지역 기사 언급 · 내집나우 관심 등록·조회(동의 방문 표본)";
  if (input === "failed") return blank("interest", "failed", FAILED_TEXT, src);
  if (!input) return blank("interest", "none", "관심 자료 없음", src);
  const parts: number[] = [];
  const text: string[] = [];
  const nr = input.newsFailed ? null : input.newsRecent30;
  const np = input.newsFailed ? null : input.newsPrior30;
  const newsTotal = nr !== null && np !== null ? nr + np : 0;
  if (input.newsFailed) text.push("지역 기사 불러오기 실패");
  else if (nr !== null && np !== null) {
    text.push(`지역 기사 30일 ${nr}건(직전 ${np}건)`);
    if (newsTotal >= 3) parts.push(Math.max(-1.5, Math.min(1.5, (nr - np) / Math.max(np, 2))));
  }
  const v30 = input.siteFailed ? null : input.siteViews30;
  const vp = input.siteFailed ? null : input.siteViewsPrior30;
  if (input.siteFailed) text.push("단지 조회·관심 불러오기 실패");
  else if (v30 !== null && vp !== null) {
    text.push(`이 단지 조회 ${v30}회(직전 ${vp}회)`);
    if (v30 + vp >= 10) parts.push(Math.max(-1, Math.min(1, (v30 - vp) / Math.max(vp, 5))));
  }
  if (!input.siteFailed && input.watchers !== null) text.push(`관심 등록 ${input.watchers}명`);
  const anyFailed = Boolean(input.newsFailed || input.siteFailed);
  if (text.length === 0) return blank("interest", "none", "관심 자료 없음", src);
  /* [1052] 일부를 못 읽어 점수가 없으면 "표본 적음"이 아니라 실패로 — 읽었으면 표본이 찼을 수도 있다 */
  if (parts.length === 0) {
    return anyFailed
      ? made("interest", null, "failed", text.join(" · "), src, null, "일부 불러오기 실패 · 점수 미반영")
      : made("interest", null, "thin", text.join(" · "), src, null, "표본 적음 · 점수 미반영");
  }
  const score = parts.reduce((a, b) => a + b, 0) / parts.length;
  const thin = newsTotal < 6 && (v30 ?? 0) + (vp ?? 0) < 20;
  const notes = [thin ? "표본 적음 · 가중치 절반" : null, anyFailed ? "일부 불러오기 실패" : null].filter(Boolean);
  return made("interest", score, thin ? "thin" : "ok", text.join(" · "), src, null, notes.length ? notes.join(" · ") : null);
}

export function volumeFactor(input: SignalInputs["volume"], nowIso: string): SignalFactor {
  const src = "국토교통부 실거래 신고(지역 아파트 매매)";
  if (input === "failed") return blank("volume", "failed", FAILED_TEXT, src);
  const rows = completeMonths(input?.region ?? [], nowIso).sort((a, b) => a.month.localeCompare(b.month));
  if (rows.length < 4) return blank("volume", "none", "완결월 거래 집계 부족", src);
  const last = rows[rows.length - 1].month;
  const byMonth = new Map(rows.map((r) => [r.month, r.count]));
  const window = [ymShift(last, -2), ymShift(last, -1), last];
  const sum = (yms: string[]) => yms.reduce((s, ym) => s + (byMonth.get(ym) ?? 0), 0);
  const have = (yms: string[]) => yms.every((ym) => byMonth.has(ym));
  const recent = sum(window);
  const yearAgo = window.map((ym) => ymShift(ym, -12));
  const prior = window.map((ym) => ymShift(ym, -3));
  let base: number;
  let basis: string;
  if (have(yearAgo) && sum(yearAgo) > 0) {
    base = sum(yearAgo);
    basis = "1년 전 같은 3개월";
  } else if (have(prior) && sum(prior) > 0) {
    base = sum(prior);
    basis = "직전 3개월";
  } else {
    return blank("volume", "none", "비교할 달 없음", src);
  }
  const delta = ((recent - base) / base) * 100;
  let detail = "";
  const cx = input?.complex ?? null;
  if (cx && cx.yms.length === cx.counts.length) {
    const cxRows = completeMonths(
      cx.yms.map((month, i) => ({ month, count: cx.counts[i] ?? 0 })),
      nowIso,
    );
    const last6 = cxRows.slice(-6).reduce((s, r) => s + r.count, 0);
    if (cxRows.length >= 6) detail = ` · 이 단지 최근 6개월 ${last6}건`;
  }
  return made(
    "volume",
    delta / 25,
    recent + base < 30 ? "thin" : "ok",
    `${ymLabel(window[0])}~${ymLabel(last)} ${n0(recent)}건 · ${basis} ${n0(base)}건(${pct(delta, 0)})${detail}`,
    src,
    last,
    "신고 기한(30일)이 남은 이번 달·지난달 제외",
  );
}

export function trendFactor(input: SignalInputs["trend"]): SignalFactor {
  const src = "한국부동산원 월간 아파트 매매지수";
  if (input === "failed") return blank("trend", "failed", FAILED_TEXT, src);
  if (!input || input.yoyPct === null) return blank("trend", "none", "1년 비교 지수 없음", src);
  const cxR = input.complexRecentMan ?? null;
  const cxP = input.complexPriorMan ?? null;
  const cx = cxR && cxP ? ` · 이 단지 주력 평형 최근 3개월 중위 ${pct(((cxR - cxP) / cxP) * 100)}` : "";
  return made(
    "trend",
    input.yoyPct / 5,
    "ok",
    `지역 매매지수 1년 ${pct(input.yoyPct)}(${ymLabel(input.fromYm) ?? "—"}→${ymLabel(input.asOf) ?? "—"})${cx}`,
    src,
    input.asOf,
    null,
  );
}

export function momentumFactor(input: SignalInputs["momentum"]): SignalFactor {
  const src = "한국부동산원 주간 아파트 매매지수";
  if (input === "failed") return blank("momentum", "failed", FAILED_TEXT, src);
  const pts = (input?.weekly ?? []).filter((p) => Number.isFinite(p.value) && p.value > 0);
  if (pts.length >= 5) {
    const ch: number[] = [];
    for (let i = 1; i < pts.length; i += 1) ch.push(((pts[i].value - pts[i - 1].value) / pts[i - 1].value) * 100);
    const recent = ch.slice(-3);
    const prior = ch.slice(-6, -3);
    const mean = (a: number[]) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0);
    const r = mean(recent);
    const p = prior.length ? mean(prior) : null;
    /* 주 ±0.16% 를 ±2 로 */
    return made(
      "momentum",
      r / 0.08,
      "ok",
      `최근 3주 평균 ${pct(r, 2)}${p !== null ? ` · 직전 ${pct(p, 2)}` : ""}`,
      src,
      pts[pts.length - 1].period.slice(0, 10),
      null,
    );
  }
  if (input && input.momPct !== null) {
    return made("momentum", input.momPct / 0.5, "thin", `월간 지수 한 달 ${pct(input.momPct, 2)}`, "한국부동산원 월간 아파트 매매지수", input.momAsOf, "주간 지수 없음 · 월간으로 대신");
  }
  return blank("momentum", "none", "단기 지수 없음", src);
}

export function supplyFactor(
  input: SignalInputs["supply"],
  newsInput: SignalInputs["news"],
): SignalFactor {
  const src = "입주 예정 물량(공공데이터) · 기사 속 매물 흐름";
  if (input === "failed") return blank("supply", "failed", FAILED_TEXT, src);
  const parts: number[] = [];
  const text: string[] = [];
  const up = input?.upcomingHouseholds ?? null;
  const hh = input?.regionHouseholds ?? null;
  /* [1052 · v2] 점수는 입주 예정 물량에 잣대(세대수 · 연 거래)가 있을 때만 낸다. 입주 예정 자료가 없거나 0세대
     ("정말 없음"과 "공공데이터에 아직 안 실림"을 가를 수 없다)거나 잣대가 없으면 미반영 — 기사 매물 단서만으로는
     점수를 만들지 않는다(같은 제목을 뉴스 요인이 이미 센다). 단서는 사실 줄에 그대로 적는다. */
  let unscored: string | null = up === null ? "입주 예정 자료 없음" : null;
  if (up === 0) {
    text.push("입주 예정 0세대(공공데이터 기준)");
    unscored = "0세대는 아직 안 실린 자료와 구분 불가";
  } else if (up !== null) {
    const span = input?.firstYm && input?.lastYm ? `(${ymLabel(input.firstYm)}~${ymLabel(input.lastYm)})` : "";
    const trades = input?.annualTrades ?? null;
    const spanMonths = input?.firstYm && input?.lastYm ? monthsBetween(input.firstYm, input.lastYm) + 1 : null;
    if (hh && hh > 0) {
      const ratio = (up / hh) * 100;
      /* 지역 세대수 대비 0% → +1(공급 적음) · 1.5% → 0 · 3% → −1 · 4.5% 이상 → −2 */
      parts.push(Math.max(-2, Math.min(1, 1 - ratio / 1.5)));
      text.push(`입주 예정 ${n0(up)}세대${span} · 지역 세대의 ${ratio.toFixed(1)}%`);
    } else if (up > 0 && trades && trades > 0 && spanMonths) {
      /* 세대수 자료가 없으면 연간 거래량을 잣대로 — 1년치 입주(연 환산) ÷ 1년치 매매 신고.
         0.2 → +1(공급 적음) · 0.5 → 0 · 0.8 → −1 · 1.1 이상 → −2 */
      const perYear = (up / Math.max(spanMonths, 12)) * 12;
      const ratio = perYear / trades;
      parts.push(Math.max(-2, Math.min(1, 1 - (ratio - 0.2) / 0.3)));
      text.push(`입주 예정 ${n0(up)}세대${span} · 연 환산 ${n0(perYear)}세대 = 연 매매 ${n0(trades)}건의 ${Math.round(ratio * 100)}%`);
    } else {
      text.push(`입주 예정 ${n0(up)}세대${span}`);
      unscored = "세대수·연 거래 잣대 없음";
    }
  }
  if (newsInput && newsInput !== "failed" && newsInput.items.length > 0) {
    const tone = summarizeNewsTone(newsInput.items.map((i) => i.title));
    if (tone.listingUp + tone.listingDown > 0) {
      /* 매물 늘었다는 기사 → 내림 쪽, 줄었다는 기사 → 오름 쪽 */
      parts.push(Math.max(-1, Math.min(1, (tone.listingDown - tone.listingUp) * 0.5)));
      text.push(`매물 기사 늘어남 ${tone.listingUp} · 줄어듦 ${tone.listingDown}`);
    }
  }
  const note = "매물 수 원천 없음 · 기사 제목 단서로 대신";
  if (text.length === 0) return blank("supply", "none", "입주 예정 · 매물 단서 없음", src, note);
  if (unscored !== null || parts.length === 0) {
    return made("supply", null, "thin", text.join(" · "), src, null, `${unscored ?? "표본 적음"} · 점수 미반영`);
  }
  const score = parts.reduce((a, b) => a + b, 0) / parts.length;
  return made("supply", score, "ok", text.join(" · "), src, null, note);
}

export function rateFactor(input: SignalInputs["rate"]): SignalFactor {
  const src = "한국은행 ECOS(기준금리 · 예금은행 대출금리 · 소비자동향조사)";
  if (input === "failed") return blank("rate", "failed", FAILED_TEXT, src);
  const loan = input?.loanRatePct ?? null;
  const base = input?.baseRatePct ?? null;
  const outlook = input?.rateOutlookCsi ?? null;
  if (loan === null && base === null) return blank("rate", "none", "금리 자료 없음", src);
  /* 대출금리 4.5% → 0 · 3.5% → +1 · 5.5% → −1 · 6.5% → −2 (기준금리만 있으면 3% 를 0 으로) */
  let score = loan !== null ? Math.min(1, (4.5 - loan) / 1) : Math.min(1, (3 - (base as number)) / 1);
  /* 금리 오를 거라는 응답이 많으면(CSI 100 초과) 최대 −0.5 */
  if (outlook !== null) score += Math.max(-0.5, Math.min(0.5, -(outlook - 100) / 40));
  const pctText = (v: number) => String(Number(v.toFixed(2)));
  const text = [
    base !== null ? `기준금리 ${pctText(base)}%` : null,
    loan !== null ? `대출금리 ${pctText(loan)}%${input?.loanAsOf ? `(${ymLabel(input.loanAsOf)})` : ""}` : null,
    outlook !== null ? `금리수준전망 CSI ${Math.round(outlook)}` : null,
  ].filter(Boolean);
  return made("rate", score, "ok", text.join(" · "), src, input?.loanAsOf ?? null, "금리가 낮을수록 오름 쪽");
}

/**
 * 이 단지 주력 평형의 월 중위(만원, 달마다 · 거래 없는 달 null) → 최근 3개 완결월 중위 vs 직전 3개월 중위.
 * 양쪽 모두 거래가 있는 달이 하나 이상일 때만. 1년 추이 칸의 설명 줄에만 쓴다(점수 아님 — 평형 섞임·표본이 작다).
 */
export function complexPriceChange(
  yms: readonly string[],
  values: readonly (number | null)[],
  nowIso: string,
): { recent: number; prior: number } | null {
  const rows = completeMonths(
    yms.map((month, i) => ({ month, v: values[i] ?? null })),
    nowIso,
  );
  if (rows.length < 6) return null;
  const median = (a: number[]) => {
    const s = [...a].sort((x, y) => x - y);
    const m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  };
  const pick = (r: typeof rows) => r.map((x) => x.v).filter((v): v is number => typeof v === "number" && v > 0);
  const recent = pick(rows.slice(-3));
  const prior = pick(rows.slice(-6, -3));
  if (recent.length === 0 || prior.length === 0) return null;
  return { recent: median(recent), prior: median(prior) };
}

/* ── 종합 ─────────────────────────────────────────────────────────── */

export function signalBand(index: number): string {
  return index >= 65 ? "상승 신호 강함" : index >= 55 ? "상승 신호 우세" : index >= 45 ? "혼조" : index >= 35 ? "하락 신호 우세" : "하락 신호 강함";
}

export function computeSignals(inputs: SignalInputs): SignalReport {
  const now = inputs.now ?? new Date().toISOString();
  const factors: SignalFactor[] = [
    sentimentFactor(inputs.sentiment),
    newsFactor(inputs.news),
    interestFactor(inputs.interest),
    volumeFactor(inputs.volume, now),
    trendFactor(inputs.trend),
    momentumFactor(inputs.momentum),
    supplyFactor(inputs.supply, inputs.news),
    rateFactor(inputs.rate),
  ];
  const scored = factors.filter((f) => f.score !== null && f.weight > 0);
  const wsum = scored.reduce((s, f) => s + f.weight, 0);
  const index =
    scored.length >= 3 && wsum > 0
      ? Math.round(Math.min(95, Math.max(5, 50 + (22.5 * scored.reduce((s, f) => s + f.weight * (f.score as number), 0)) / wsum)))
      : null;
  const band = index === null ? null : signalBand(index);
  const drivers = {
    up: scored.filter((f) => (f.score as number) >= SIGNAL_LEAN.lean).sort((a, b) => (b.score as number) - (a.score as number)).map((f) => f.label),
    down: scored.filter((f) => (f.score as number) <= -SIGNAL_LEAN.lean).sort((a, b) => (a.score as number) - (b.score as number)).map((f) => f.label),
  };
  const field = inputs.field ?? null;
  return {
    version: SIGNAL_FORMULA_VERSION,
    scope: inputs.scope,
    regionLabel: inputs.regionLabel,
    generatedAt: now,
    factors,
    index,
    band,
    coverage: { used: scored.length, total: factors.length },
    drivers,
    field,
    headline: signalHeadline({ index, band, drivers, used: scored.length, total: factors.length, field }),
  };
}

/** 규칙 한 줄 — "상승 신호 우세 · 끌어올림 거래량·심리 · 누름 금리 · 현장 72점" (사실 낱말만) */
export function signalHeadline(r: {
  index: number | null;
  band: string | null;
  drivers: { up: string[]; down: string[] };
  used: number;
  total: number;
  field: FieldSignal | null;
}): string {
  if (r.index === null) return `자료 부족 · ${r.total}개 요인 중 ${r.used}개만 확인`;
  const bits = [r.band ?? ""];
  if (r.drivers.up.length) bits.push(`끌어올림 ${r.drivers.up.slice(0, 3).join("·")}`);
  if (r.drivers.down.length) bits.push(`누름 ${r.drivers.down.slice(0, 3).join("·")}`);
  if (!r.drivers.up.length && !r.drivers.down.length) bits.push("두드러진 요인 없음");
  if (r.field) bits.push(`현장 ${Math.round(r.field.score100)}점`);
  return bits.filter(Boolean).join(" · ");
}

/**
 * AI 프롬프트에 넣을 근거 줄 — LLM 이 숫자를 새로 만들거나 고치지 않게 "확정 사실"로 넘긴다.
 * 임장노트 분석 · 단지 브리핑 · AI 분석 도구가 같은 줄을 쓴다.
 */
export function signalPromptLines(r: SignalReport): string[] {
  const head =
    r.index === null
      ? `[다요인 시장 신호 v${r.version} · ${r.regionLabel}] 자료 부족(${r.coverage.used}/${r.coverage.total}개 요인)`
      : `[다요인 시장 신호 v${r.version} · ${r.regionLabel}] 종합 ${r.index}/100 · ${r.band} · 반영 ${r.coverage.used}/${r.coverage.total}개 요인`;
  const lines = [head];
  for (const f of r.factors) {
    const s = f.score === null ? `미반영(${unscoredReason(f) ?? "표본 적음"})` : `${signed(f.score, 1)}(${scoreWord(f.score)})`;
    lines.push(`- ${f.label}: ${s} · ${f.value}${f.asOf ? ` · 기준 ${ymLabel(f.asOf) ?? f.asOf}` : ""}`);
  }
  if (r.field) lines.push(`- 현장(${r.field.label}): ${Math.round(r.field.score100)}/100`);
  lines.push("규칙: 위 숫자는 확정 사실이다 — 고치거나 새 숫자를 만들지 말 것. 신호는 가격·수요 방향의 참고이며 매수·매도 권유가 아니다.");
  return lines;
}
