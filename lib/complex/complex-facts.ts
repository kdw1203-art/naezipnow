/**
 * [1006 · B] 단지 "자료 완성도 · 한 줄 요약 · 단지 전세가율" — 순수 모듈.
 *
 * 왜 따로 뺐나: 지도 단지 패널(app/map/ComplexInfoPanel.tsx)은 세대수·주차·시공사가
 * 비면 "—" 를 나열했고, 전월세(실거래의 62%)와 임장노트는 아예 없었다. 그리고 왜
 * 비었는지(대장 미연결인지, 대장엔 있는데 값이 없는지, 조회가 실패했는지)를
 * 화면이 구분하지 못했다. 여기서는 **받은 값만으로** 세 가지를 만든다:
 *
 *   1. completeness — 어떤 자료가 있고(have) 없는지(missing + 이유)의 사실 목록
 *   2. summaryLine  — 있는 숫자만 문장으로 이은 한 줄("2018년 준공 · 9,510세대 · …").
 *                     없는 항목은 문장에서 빠진다. 빈 괄호·"—" 를 만들지 않는다.
 *   3. jeonseRatio  — 최근 6개월 전세 보증금 중앙값 ÷ 같은 기간 매매 중앙값.
 *                     둘 다 표본 3건 이상일 때만. 아니면 null + 사람이 읽는 이유.
 *
 * 규칙: 산술 사실만(건수·중앙값). 전망·권유·추정 문장은 없다. `server-only`·React 를
 * import 하지 않는다 — API 라우트·node:test 가 같은 규칙을 부른다.
 *
 * "시세" 라는 말은 쓰지 않는다 — market_complex_price(KB식 시세)는 0행이라 원천이
 * 없고, 여기 있는 숫자는 전부 국토부 **실거래** 신고분이다.
 */
import { areaBandOf } from "@/lib/market/bands";
import { formatKrwWon } from "@/lib/format/krw";
import { kstParts } from "@/lib/format/kst";

/* ── 입력 ────────────────────────────────────────────────────────────── */

/** 최근 창의 매매 원표본 한 건(원). 면적이 없으면 면적대 집계에서만 빠진다. */
export interface TradeSample {
  /** yyyymm */
  ym: string;
  amountKrw: number;
  areaM2: number | null;
}

/** 전월세 원표본 한 건(원). monthlyKrw > 0 이면 월세, 0 이면 전세. */
export interface RentSample {
  /** yyyymm */
  ym: string;
  depositKrw: number;
  monthlyKrw: number;
}

/** 단지 대표행 중 이 모듈이 읽는 필드만 (ComplexRow 와 구조적으로 호환) */
export interface ComplexFactsRow {
  build_year: number | null;
  households: number | null;
  building_count: number | null;
  parking_count: number | null;
  parking_per_hh: number | null;
  builder_name: string | null;
  heating: string | null;
  road_address: string | null;
  kapt_code: string | null;
}

export interface ComplexNotesBrief {
  count: number;
  latest: {
    id: string;
    title: string;
    visitDate: string | null;
    /** metadata.decision 이 있을 때만 — 없으면 null(지어내지 않는다) */
    decision: { choice: "buy" | "hold" | "pass" | "revisit"; label: string } | null;
  } | null;
}

export interface ComplexFactsInput {
  complex: ComplexFactsRow | null;
  /** 최근 12개월 매매 원표본. null = 조회 실패(없음이 아니다) */
  trades: ReadonlyArray<TradeSample> | null;
  /** 최근 24개월 전월세 원표본. null = 조회 실패, [] = 신고 없음 */
  rents: ReadonlyArray<RentSample> | null;
  /** null = 조회 실패 */
  notes: ComplexNotesBrief | null;
  /** 이번 달(yyyymm) — 테스트가 고정한다. 없으면 오늘. */
  nowYm?: string;
}

/* ── 출력 ────────────────────────────────────────────────────────────── */

export type FactKey =
  | "build_year"
  | "households"
  | "building_count"
  | "parking"
  | "builder"
  | "heating"
  | "road"
  | "trades"
  | "rent"
  | "notes";

export type MissingReason =
  /** K-apt 대장이 이 단지에 연결되지 않았다 — 비의무관리(소규모) 단지는 대장 자체가 없다 */
  | "master_unlinked"
  /** 대장은 연결됐지만 이 항목은 비어 있다(같은 필지에 단지가 여럿이면 세대수를 비운다) */
  | "master_empty"
  /** 원천(실거래 신고) 자체에 값이 없다 — 준공연도처럼 대장이 아니라 실거래에서 오는 항목 */
  | "not_in_source"
  | "no_trade_12m"
  | "no_rent_24m"
  | "no_notes"
  | "fetch_failed";

export interface FactGap {
  key: FactKey;
  label: string;
  reason: MissingReason;
  /** 화면에 그대로 쓰는 한 줄 이유 */
  note: string;
}

export interface FactCompleteness {
  have: FactKey[];
  missing: FactGap[];
}

export interface TradeBandSummary {
  /** AREA_BANDS 라벨("60~85㎡") — 클라이언트가 면적 단위 설정에 맞춰 바꿔 그린다 */
  label: string;
  count: number;
  medianKrw: number;
}

export interface TradeSummary {
  windowMonths: 12;
  fromYm: string;
  toYm: string;
  count: number;
  /** 창 안 매매 전체 중앙값(면적 혼합) — 표본 3건 미만이면 null */
  medianKrw: number | null;
  /** 표본이 가장 많은 면적대 — 그 면적대 표본이 3건 미만이면 null */
  band: TradeBandSummary | null;
  /** 창 안 가장 최근 계약월 */
  latestYm: string | null;
}

export interface RentMonthBrief {
  ym: string;
  jeonseCount: number;
  jeonseMedianKrw: number | null;
  wolseCount: number;
  wolseMedianDepositKrw: number | null;
  wolseMedianMonthlyKrw: number | null;
}

export interface RentSummary {
  windowMonths: 12;
  fromYm: string;
  toYm: string;
  jeonseCount: number;
  /** 창 안 전세 보증금 중앙값 — 표본 0 이면 null */
  jeonseMedianKrw: number | null;
  wolseCount: number;
  wolseMedianDepositKrw: number | null;
  wolseMedianMonthlyKrw: number | null;
  /** 신고가 있는 가장 최근 달(24개월 안) */
  latest: RentMonthBrief | null;
}

export interface JeonseRatio {
  pct: number;
  windowMonths: 6;
  fromYm: string;
  toYm: string;
  jeonseCount: number;
  jeonseMedianKrw: number;
  tradeCount: number;
  tradeMedianKrw: number;
}

/**
 * [1007 · P2] 한 줄 요약의 **조각** — summaryLine 은 이 조각을 " · " 로 이은 것이고, 허브 인용
 * 요약(lib/seo/citable-summary.ts)은 같은 조각으로 문장을 만든다. 어떤 숫자를 어떤 얼굴로
 * 말할지(표본 3건 규칙·면적대 선택·억 단위)는 여기 한 곳에만 있다. 없는 항목은 undefined.
 */
export interface SummaryFragments {
  /** "2018년 준공" */
  buildYear?: string;
  /** "9,510세대" */
  households?: string;
  /** "최근 12개월 매매 134건, 60~85㎡ 중앙 30.9억" */
  trades?: string;
  /** "전세 중앙 12.1억" 또는 표본 부족 시 "전세 2건" */
  jeonse?: string;
  /** "전세가율 39.2%(6개월)" */
  jeonseRatio?: string;
}

export interface ComplexFacts {
  completeness: FactCompleteness;
  summaryLine: string | null;
  /** [1007] summaryLine 의 조각(인용 요약이 같은 조각으로 문장을 만든다) */
  summaryFragments: SummaryFragments;
  jeonseRatio: JeonseRatio | null;
  /** jeonseRatio 가 null 인 이유(사람이 읽는 한 줄). 계산됐으면 null */
  jeonseRatioReason: string | null;
  tradeSummary: TradeSummary | null;
  rentSummary: RentSummary | null;
}

/* ── 상수 ────────────────────────────────────────────────────────────── */

export const TRADE_WINDOW_MONTHS = 12;
export const RATIO_WINDOW_MONTHS = 6;
/** 중앙값을 말하려면 이만큼은 있어야 한다 — 한두 건의 중앙값은 그 거래 자체지 단지의 값이 아니다 */
export const MIN_SAMPLES = 3;

export const FACT_LABELS: Record<FactKey, string> = {
  build_year: "준공",
  households: "세대수",
  building_count: "동 수",
  parking: "주차",
  builder: "시공사",
  heating: "난방",
  road: "도로명 주소",
  trades: "매매 실거래",
  rent: "전월세 실거래",
  notes: "임장노트",
};

const MASTER_KEYS: ReadonlyArray<{
  key: FactKey;
  has: (c: ComplexFactsRow) => boolean;
}> = [
  { key: "households", has: (c) => c.households != null && c.households > 0 },
  { key: "building_count", has: (c) => c.building_count != null && c.building_count > 0 },
  { key: "parking", has: (c) => c.parking_count != null && c.parking_count > 0 },
  { key: "builder", has: (c) => Boolean(c.builder_name?.trim()) },
  { key: "heating", has: (c) => Boolean(c.heating?.trim()) },
  { key: "road", has: (c) => Boolean(c.road_address?.trim()) },
];

/* ── 유틸 ────────────────────────────────────────────────────────────── */

/**
 * 이번 달(yyyymm) — **KST 기준**. 서버는 UTC 로 돌아 `getMonth()` 가 KST 월초 0~9시에
 * 전달을 가리킨다(9월 1일 새벽에 "202508"). 사용자는 전부 한국에 있으므로 시간대를 고정한다.
 * KST 를 못 구하는 입력(NaN)이면 UTC 달로 후퇴한다.
 */
export function currentYm(d: Date = new Date()): string {
  const p = kstParts(d);
  if (p) return `${p.year}${String(p.month).padStart(2, "0")}`;
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** nowYm 에서 n 개월 전 yyyymm (n=0 이면 그대로). 창은 [from, now] 양끝 포함 → 달 수 = n+1 */
export function ymMonthsBefore(nowYm: string, n: number): string {
  const y = Number(nowYm.slice(0, 4));
  const m = Number(nowYm.slice(4, 6));
  const total = y * 12 + (m - 1) - n;
  const yy = Math.floor(total / 12);
  const mm = (total % 12) + 1;
  return `${yy}${String(mm).padStart(2, "0")}`;
}

/** 정렬 안 된 배열의 중앙값(짝수면 가운데 둘의 반올림 평균). 빈 배열 → null */
export function medianOf(values: ReadonlyArray<number>): number | null {
  const sorted = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

function isYm(s: string): boolean {
  return /^\d{6}$/.test(s);
}

/** 원 → "30.9억"/"9,800만" — 허브 시세 표와 같은 얼굴(eok1) */
function eok(krw: number): string {
  return formatKrwWon(krw, { style: "eok1" });
}

/** 대장(K-apt)이 이 단지에 연결돼 있는가 — kapt 코드가 있거나 대장 유래 필드가 하나라도 차 있으면 */
export function isMasterLinked(c: ComplexFactsRow | null): boolean {
  if (!c) return false;
  if (c.kapt_code?.trim()) return true;
  return MASTER_KEYS.some((k) => k.has(c));
}

/* ── 집계 ────────────────────────────────────────────────────────────── */

export function summarizeTrades(
  trades: ReadonlyArray<TradeSample>,
  nowYm: string,
): TradeSummary {
  const fromYm = ymMonthsBefore(nowYm, TRADE_WINDOW_MONTHS - 1);
  const inWin = trades.filter(
    (t) => isYm(t.ym) && t.ym >= fromYm && t.ym <= nowYm && Number.isFinite(t.amountKrw) && t.amountKrw > 0,
  );
  const amounts = inWin.map((t) => t.amountKrw);
  const median = inWin.length >= MIN_SAMPLES ? medianOf(amounts) : null;

  /* 표본이 가장 많은 면적대 — 동률이면 먼저 나온(작은) 면적대 */
  const byBand = new Map<string, number[]>();
  for (const t of inWin) {
    const b = areaBandOf(t.areaM2);
    if (!b) continue;
    const arr = byBand.get(b.label) ?? [];
    arr.push(t.amountKrw);
    byBand.set(b.label, arr);
  }
  let band: TradeBandSummary | null = null;
  for (const [label, arr] of byBand) {
    if (band && arr.length <= band.count) continue;
    if (arr.length < MIN_SAMPLES) continue;
    const m = medianOf(arr);
    if (m == null) continue;
    band = { label, count: arr.length, medianKrw: m };
  }

  const latestYm = inWin.reduce<string | null>(
    (acc, t) => (acc == null || t.ym > acc ? t.ym : acc),
    null,
  );
  return {
    windowMonths: 12,
    fromYm,
    toYm: nowYm,
    count: inWin.length,
    medianKrw: median,
    band,
    latestYm,
  };
}

function foldRentMonth(ym: string, rows: ReadonlyArray<RentSample>): RentMonthBrief {
  const jd: number[] = [];
  const wd: number[] = [];
  const wm: number[] = [];
  for (const r of rows) {
    if (r.monthlyKrw > 0) {
      wd.push(r.depositKrw);
      wm.push(r.monthlyKrw);
    } else jd.push(r.depositKrw);
  }
  return {
    ym,
    jeonseCount: jd.length,
    jeonseMedianKrw: medianOf(jd),
    wolseCount: wd.length,
    wolseMedianDepositKrw: medianOf(wd),
    wolseMedianMonthlyKrw: medianOf(wm),
  };
}

export function summarizeRents(
  rents: ReadonlyArray<RentSample>,
  nowYm: string,
): RentSummary {
  const fromYm = ymMonthsBefore(nowYm, TRADE_WINDOW_MONTHS - 1);
  const valid = rents.filter(
    (r) => isYm(r.ym) && r.ym <= nowYm && Number.isFinite(r.depositKrw) && r.depositKrw > 0,
  );
  const inWin = valid.filter((r) => r.ym >= fromYm);
  const win = foldRentMonth(fromYm, inWin);

  /* 가장 최근 달 — 창 밖(13~24개월 전)이라도 마지막 신고가 언제였는지는 말한다 */
  const latestYm = valid.reduce<string | null>(
    (acc, r) => (acc == null || r.ym > acc ? r.ym : acc),
    null,
  );
  const latest = latestYm ? foldRentMonth(latestYm, valid.filter((r) => r.ym === latestYm)) : null;

  return {
    windowMonths: 12,
    fromYm,
    toYm: nowYm,
    jeonseCount: win.jeonseCount,
    jeonseMedianKrw: win.jeonseMedianKrw,
    wolseCount: win.wolseCount,
    wolseMedianDepositKrw: win.wolseMedianDepositKrw,
    wolseMedianMonthlyKrw: win.wolseMedianMonthlyKrw,
    latest,
  };
}

/**
 * 단지 전세가율 — 최근 6개월 전세 보증금 중앙값 ÷ 같은 기간 매매 중앙값.
 * 둘 다 표본 3건 이상일 때만 숫자를 낸다. 면적을 가중하지 않는다(호출부가 명기).
 */
export function computeJeonseRatio(
  trades: ReadonlyArray<TradeSample> | null,
  rents: ReadonlyArray<RentSample> | null,
  nowYm: string,
): { ratio: JeonseRatio | null; reason: string | null } {
  if (trades == null || rents == null) {
    return {
      ratio: null,
      reason:
        trades == null && rents == null
          ? "매매·전세 실거래를 지금 불러오지 못해 계산하지 않았어요"
          : trades == null
            ? "매매 실거래를 지금 불러오지 못해 계산하지 않았어요"
            : "전세 실거래를 지금 불러오지 못해 계산하지 않았어요",
    };
  }
  const fromYm = ymMonthsBefore(nowYm, RATIO_WINDOW_MONTHS - 1);
  const t = trades
    .filter((x) => isYm(x.ym) && x.ym >= fromYm && x.ym <= nowYm && x.amountKrw > 0)
    .map((x) => x.amountKrw);
  const j = rents
    .filter(
      (x) => isYm(x.ym) && x.ym >= fromYm && x.ym <= nowYm && x.monthlyKrw <= 0 && x.depositKrw > 0,
    )
    .map((x) => x.depositKrw);
  if (t.length < MIN_SAMPLES || j.length < MIN_SAMPLES) {
    const parts: string[] = [];
    if (j.length < MIN_SAMPLES) parts.push(`전세 ${j.length}건`);
    if (t.length < MIN_SAMPLES) parts.push(`매매 ${t.length}건`);
    return {
      ratio: null,
      reason: `최근 ${RATIO_WINDOW_MONTHS}개월 ${parts.join(" · ")} — 각 ${MIN_SAMPLES}건 이상일 때만 계산해요`,
    };
  }
  const tm = medianOf(t);
  const jm = medianOf(j);
  if (tm == null || jm == null || tm <= 0) {
    return { ratio: null, reason: "중앙값을 만들 수 없어 계산하지 않았어요" };
  }
  return {
    ratio: {
      pct: Math.round((jm / tm) * 1000) / 10,
      windowMonths: 6,
      fromYm,
      toYm: nowYm,
      jeonseCount: j.length,
      jeonseMedianKrw: jm,
      tradeCount: t.length,
      tradeMedianKrw: tm,
    },
    reason: null,
  };
}

/* ── 완성도 ──────────────────────────────────────────────────────────── */

export function buildCompleteness(input: {
  complex: ComplexFactsRow | null;
  tradeSummary: TradeSummary | null;
  rents: ReadonlyArray<RentSample> | null;
  notes: ComplexNotesBrief | null;
}): FactCompleteness {
  const have: FactKey[] = [];
  const missing: FactGap[] = [];
  const c = input.complex;
  const gap = (key: FactKey, reason: MissingReason, note: string) =>
    missing.push({ key, label: FACT_LABELS[key], reason, note });

  if (c?.build_year) have.push("build_year");
  else gap("build_year", "not_in_source", "실거래 신고에 준공연도가 없어요");

  const linked = isMasterLinked(c);
  for (const k of MASTER_KEYS) {
    if (c && k.has(c)) {
      have.push(k.key);
      continue;
    }
    if (!linked) {
      gap(
        k.key,
        "master_unlinked",
        "K-apt 대장 미연결 — 의무관리 대상이 아닌 소규모 단지는 대장 자체가 없어요",
      );
    } else if (k.key === "households") {
      gap(
        k.key,
        "master_empty",
        "대장에 세대수가 없어요 — 같은 필지에 단지가 여럿이면 틀린 값 대신 비워 둬요",
      );
    } else {
      gap(k.key, "master_empty", "연결된 대장에 이 항목이 비어 있어요");
    }
  }

  const ts = input.tradeSummary;
  if (ts == null) gap("trades", "fetch_failed", "매매 실거래를 지금 불러오지 못했어요");
  else if (ts.count > 0) have.push("trades");
  else gap("trades", "no_trade_12m", "최근 12개월 매매 신고가 없어요");

  if (input.rents == null) gap("rent", "fetch_failed", "전월세 실거래를 지금 불러오지 못했어요");
  else if (input.rents.length > 0) have.push("rent");
  else gap("rent", "no_rent_24m", "최근 24개월 전월세 신고가 없어요");

  if (input.notes == null) gap("notes", "fetch_failed", "임장노트를 지금 불러오지 못했어요");
  else if (input.notes.count > 0) have.push("notes");
  else gap("notes", "no_notes", "아직 이 단지 임장노트가 없어요");

  return { have, missing };
}

/* ── 한 줄 요약 ──────────────────────────────────────────────────────── */

/**
 * [1007] 요약 조각 — 있는 숫자만. 순서·문구는 summaryLine 과 같다(그 함수가 이걸 잇는다).
 */
export function buildSummaryFragments(input: {
  complex: ComplexFactsRow | null;
  tradeSummary: TradeSummary | null;
  rentSummary: RentSummary | null;
  jeonseRatio: JeonseRatio | null;
}): SummaryFragments {
  const out: SummaryFragments = {};
  const c = input.complex;
  if (c?.build_year) out.buildYear = `${c.build_year}년 준공`;
  if (c?.households && c.households > 0) out.households = `${c.households.toLocaleString("ko-KR")}세대`;

  const ts = input.tradeSummary;
  if (ts && ts.count > 0) {
    let s = `최근 ${ts.windowMonths}개월 매매 ${ts.count.toLocaleString("ko-KR")}건`;
    if (ts.band) s += `, ${ts.band.label} 중앙 ${eok(ts.band.medianKrw)}`;
    else if (ts.medianKrw != null) s += `, 중앙 ${eok(ts.medianKrw)}`;
    out.trades = s;
  }

  const rs = input.rentSummary;
  if (rs && rs.jeonseCount >= MIN_SAMPLES && rs.jeonseMedianKrw != null) {
    out.jeonse = `전세 중앙 ${eok(rs.jeonseMedianKrw)}`;
  } else if (rs && rs.jeonseCount > 0) {
    out.jeonse = `전세 ${rs.jeonseCount}건`;
  }

  if (input.jeonseRatio) {
    out.jeonseRatio = `전세가율 ${input.jeonseRatio.pct}%(${input.jeonseRatio.windowMonths}개월)`;
  }
  return out;
}

/** 조각을 화면 순서대로 늘어놓는다(없는 항목은 빠진다) */
export function summaryFragmentList(f: SummaryFragments): string[] {
  return [f.buildYear, f.households, f.trades, f.jeonse, f.jeonseRatio].filter(
    (v): v is string => typeof v === "string" && v.length > 0,
  );
}

/**
 * 있는 숫자만 " · " 로 잇는다. 예)
 *   "2018년 준공 · 9,510세대 · 최근 12개월 매매 134건, 60~85㎡ 중앙 30.9억 · 전세 중앙 12.1억 · 전세가율 39%(6개월)"
 * 아무것도 없으면 null. [1007] 조각(buildSummaryFragments)을 잇기만 한다 — 계약(출력 문자열)은 그대로.
 */
export function buildSummaryLine(input: {
  complex: ComplexFactsRow | null;
  tradeSummary: TradeSummary | null;
  rentSummary: RentSummary | null;
  jeonseRatio: JeonseRatio | null;
}): string | null {
  const parts = summaryFragmentList(buildSummaryFragments(input));
  return parts.length > 0 ? parts.join(" · ") : null;
}

/* ── 진입점 ──────────────────────────────────────────────────────────── */

export function buildComplexFacts(input: ComplexFactsInput): ComplexFacts {
  const nowYm = input.nowYm && isYm(input.nowYm) ? input.nowYm : currentYm();
  const tradeSummary = input.trades ? summarizeTrades(input.trades, nowYm) : null;
  const rentSummary = input.rents ? summarizeRents(input.rents, nowYm) : null;
  const { ratio, reason } = computeJeonseRatio(input.trades, input.rents, nowYm);
  const completeness = buildCompleteness({
    complex: input.complex,
    tradeSummary,
    rents: input.rents,
    notes: input.notes,
  });
  const summaryFragments = buildSummaryFragments({
    complex: input.complex,
    tradeSummary,
    rentSummary,
    jeonseRatio: ratio,
  });
  const parts = summaryFragmentList(summaryFragments);
  const summaryLine = parts.length > 0 ? parts.join(" · ") : null;
  return {
    completeness,
    summaryLine,
    summaryFragments,
    jeonseRatio: ratio,
    jeonseRatioReason: reason,
    tradeSummary,
    rentSummary,
  };
}
