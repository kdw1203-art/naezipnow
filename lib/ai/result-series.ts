/**
 * [1008 · W] 결과 화면의 "최근 실거래가"와 가격 그래프 재료 — 단지 매매 실거래 **행 단위** 계산(순수 함수).
 *
 * ── 왜 면적대가 아니라 평형(전용면적 ㎡ 정수)인가 ──────────────────────────
 * 실측(2026-09-21, 운영 DB): 공작아파트(안양 동안구)는 전용 37·50·60㎡ 세 평형인데, 면적대
 * "~59㎡" 한 칸에 37㎡(8개월 평균 4.0억)와 50㎡(6.6억)가 섞인다. 그래서
 *  · 면적대 월평균은 그 달 **팔린 평형 구성**에 따라 4.4억↔5.5억을 오갔고(실제로는 세 평형 모두 오름세),
 *  · "대표 면적 최근 6건 평균"(lib/market/complex-price.ts 규칙)은 6.5억 — 어느 평형 가격과도 맞지 않았다.
 *  결과 화면에 타일 "최근 실거래가 6.5억"과 그래프 마지막 점 5.7억이 나란히 보였다.
 *  은마도 76㎡(34.4억)·84㎡(38.8억)가 한 칸이다.
 * 그래서 **가장 많이 거래된 평형 하나**로 대표가와 그래프 선을 같이 낸다(타일 = 선의 끝과 같은 평형).
 * 한 평형으로 3건을 못 채우면 예전 규칙(가장 많이 거래된 면적대)으로 물러선다 — 창(최근 200건)·
 * 표본(최근 6건)·최소 3건은 complex-price.ts 와 같다. 관심단지 가격 알림(complex-price.ts)은 그대로다.
 *
 * ── 그래프 ─────────────────────────────────────────────────────────────
 *  · 달력으로 이어 붙인 달(거래 없는 달은 avg null · 0건) — 빈 달을 선으로 건너뛰지 않게
 *  · 막대 = 그 달 전체 거래 수, 진한 부분 = 선과 같은 평형
 *  · 최근 6개월(달력, 기준 달 포함) 전체 거래 수 — 타일 "최근 6개월 거래"
 *  · sparse: 값이 있는 달이 3개 미만이면 선을 잇지 않는다(점만)
 * 운영 DB 매매는 2026.01 부터 쌓여 "최근 3년"이 아니라 쌓인 달만 그린다. 최근 1~2개월은 신고 기한
 * (계약 후 30일) 때문에 덜 들어와 있을 수 있다 — 화면이 그 사실을 적는다.
 */
import { ymShift } from "@/lib/ai/region-trend";
import { AREA_BANDS, areaBandOf } from "@/lib/market/bands";

/** 매매 실거래 한 건 — lib/ai/complex-trades.ts 가 읽는 모양. 금액은 만원. */
export interface TradeLite {
  ym: string;
  day: number | null;
  man: number;
  area: number;
}

/** 대표가 창·표본 — lib/market/complex-price.ts 와 같은 값 */
export const PRICE_WINDOW = 200;
export const PRICE_SAMPLE = 6;
export const PRICE_MIN = 3;

/** 전용면적 → 평형 키(㎡ 정수, 내림). 84.97·84.99㎡ 는 같은 84㎡ 로 묶인다. */
export function unitOf(areaM2: number): number {
  return Math.floor(areaM2 + 1e-6);
}

export function unitLabel(unit: number): string {
  return `전용 ${unit}㎡`;
}

function validRows(rows: readonly TradeLite[] | null | undefined): TradeLite[] {
  return (rows ?? []).filter(
    (r) =>
      /^\d{6}$/.test(String(r.ym)) &&
      Number.isFinite(r.man) &&
      r.man > 0 &&
      Number.isFinite(r.area) &&
      r.area > 0,
  );
}

/** 최신순(계약월 → 계약일, 일자 없음은 뒤). [1008 · 리뷰 A-16] 같은 날 거래는 금액 → 면적(큰 쪽 먼저)으로
    확정한다 — 입력 순서(DB 반환 순서)에 맡기면 "최근 6건"의 경계에 걸린 같은 날 거래가 요청마다 바뀔 수 있었다. */
function latestFirst(rows: readonly TradeLite[]): TradeLite[] {
  return [...rows].sort(
    (a, b) => b.ym.localeCompare(a.ym) || (b.day ?? -1) - (a.day ?? -1) || b.man - a.man || b.area - a.area,
  );
}

/** 거래가 가장 많은 평형 — 동수면 더 최근에 거래된 평형(최신순 목록에서 먼저 나온 쪽) */
function mostTradedUnit(latest: readonly TradeLite[]): { unit: number; rows: TradeLite[] } | null {
  const byUnit = new Map<number, TradeLite[]>();
  for (const r of latest) {
    const u = unitOf(r.area);
    const bucket = byUnit.get(u);
    if (bucket) bucket.push(r);
    else byUnit.set(u, [r]);
  }
  let best: { unit: number; rows: TradeLite[] } | null = null;
  for (const [unit, bucket] of byUnit) if (!best || bucket.length > best.rows.length) best = { unit, rows: bucket };
  return best;
}

const BAND_ORDER = new Map(AREA_BANDS.map((b, i) => [b.slug, i]));

export interface UnitPrice {
  /** 최근 거래 평균(원) */
  priceKrw: number;
  /** unit = 평형 하나, band = 면적대(평형으로 3건을 못 채움) */
  basis: "unit" | "band";
  /** 평형 키(㎡ 정수) — basis band 면 null */
  unitM2: number | null;
  /** 화면 라벨 — "전용 37㎡" · "60~85㎡" */
  label: string;
  /** 그 평형이 속한 면적대(또는 면적대 자체) */
  bandSlug: string;
  sampleSize: number;
  firstYm: string;
  latestYm: string;
}

function priceOf(
  basis: UnitPrice["basis"],
  unitM2: number | null,
  label: string,
  bandSlug: string,
  sample: readonly TradeLite[],
): UnitPrice | null {
  const avgMan = sample.reduce((s, r) => s + r.man, 0) / sample.length;
  const priceKrw = Math.round(avgMan * 10_000);
  if (!Number.isFinite(priceKrw) || priceKrw <= 0) return null;
  const yms = sample.map((r) => r.ym).sort();
  return { priceKrw, basis, unitM2, label, bandSlug, sampleSize: sample.length, firstYm: yms[0], latestYm: yms[yms.length - 1] };
}

/**
 * 단지 "최근 실거래가" — 최근 200건 안에서 가장 많이 거래된 평형의 최근 6건 평균(최소 3건).
 * 평형으로 못 채우면 가장 많이 거래된 면적대(동수면 좁은 구간)의 최근 6건 평균. 둘 다 못 채우면 null.
 */
export function resolveUnitPrice(rows: readonly TradeLite[] | null | undefined): UnitPrice | null {
  const latest = latestFirst(validRows(rows)).slice(0, PRICE_WINDOW);
  if (latest.length === 0) return null;

  const rep = mostTradedUnit(latest);
  if (rep && rep.rows.length >= PRICE_MIN) {
    const sample = rep.rows.slice(0, PRICE_SAMPLE);
    return priceOf("unit", rep.unit, unitLabel(rep.unit), areaBandOf(sample[0].area)?.slug ?? "", sample);
  }

  const byBand = new Map<string, TradeLite[]>();
  for (const r of latest) {
    const band = areaBandOf(r.area);
    if (!band) continue;
    const bucket = byBand.get(band.slug);
    if (bucket) bucket.push(r);
    else byBand.set(band.slug, [r]);
  }
  let repSlug = "";
  let repRows: TradeLite[] = [];
  for (const [slug, bucket] of byBand) {
    const better =
      bucket.length > repRows.length ||
      (bucket.length === repRows.length && (BAND_ORDER.get(slug) ?? 99) < (BAND_ORDER.get(repSlug) ?? 99));
    if (better) {
      repSlug = slug;
      repRows = bucket;
    }
  }
  if (repRows.length < PRICE_MIN) return null;
  const band = AREA_BANDS.find((b) => b.slug === repSlug);
  return priceOf("band", null, band?.label ?? repSlug, repSlug, repRows.slice(0, PRICE_SAMPLE));
}

export interface TradeMonth {
  ym: string;
  /** 선의 평형(또는 면적대) 월평균(만원) — 그 달 거래가 없으면 null */
  avgMan: number | null;
  /** 선의 평형(또는 면적대) 건수 */
  n: number;
  /** 그 달 전체 건수 */
  nAll: number;
}

export interface ComplexTradeSeries {
  basis: "unit" | "band";
  unitM2: number | null;
  bandSlug: string | null;
  /** "전용 37㎡" · "60~85㎡" */
  label: string | null;
  months: TradeMonth[];
  /** 최근 6개월(달력, 기준 달 포함) 전체 거래 */
  recent6: { count: number; fromYm: string; toYm: string; span: number };
  /** 선에 값이 있는 달 수 */
  pricedMonths: number;
  /** 값이 있는 달이 3개 미만 — 선을 잇지 않는다 */
  sparse: boolean;
  /** 읽기 상한에 걸려 가장 이른 달(일부만 읽힘)을 버렸는가 */
  truncated: boolean;
  source: string;
  /** 기준 달(yyyymm) */
  asOf: string | null;
}

export const SERIES_SOURCE = "국토교통부 실거래(신고)";
export const SPARSE_MIN_MONTHS = 3;

export function nowYm(now: Date): string {
  /* 한국 시간 기준 달 — 서버(UTC) 자정 직후 달이 바뀌는 어긋남을 막는다 */
  const kst = new Date(now.getTime() + 9 * 3600_000);
  return `${kst.getUTCFullYear()}${String(kst.getUTCMonth() + 1).padStart(2, "0")}`;
}

/**
 * 월별 실거래 시계열. 선의 대상은 unitM2(평형) → bandSlug(면적대) → 둘 다 없으면 가장 많이 거래된 평형.
 * 대표가(resolveUnitPrice)의 unitM2·bandSlug 를 그대로 넘기면 타일과 선이 같은 평형을 말한다.
 */
export function buildComplexTradeSeries(
  rows: readonly TradeLite[] | null | undefined,
  opts: {
    unitM2?: number | null;
    bandSlug?: string | null;
    label?: string | null;
    now: Date;
    monthsBack?: number;
    /** 행을 상한까지 읽었다(가장 이른 달이 일부만 읽혔을 수 있다) */
    capped?: boolean;
  },
): ComplexTradeSeries | null {
  const list = latestFirst(validRows(rows));
  if (list.length === 0) return null;

  /* 선의 대상: 평형(주어진 것 → 없으면 가장 많이 거래된 평형) 또는, 평형 없이 면적대만 주어지면 면적대 */
  const byBand = opts.unitM2 == null && Boolean(opts.bandSlug);
  const unitM2: number | null = byBand
    ? null
    : (opts.unitM2 ?? mostTradedUnit(list.slice(0, PRICE_WINDOW))?.unit ?? null);
  const match = (r: TradeLite): boolean =>
    byBand ? areaBandOf(r.area)?.slug === opts.bandSlug : unitM2 != null && unitOf(r.area) === unitM2;

  const agg = new Map<string, { sum: number; n: number; nAll: number }>();
  for (const r of list) {
    let a = agg.get(r.ym);
    if (!a) {
      a = { sum: 0, n: 0, nAll: 0 };
      agg.set(r.ym, a);
    }
    a.nAll += 1;
    if (match(r)) {
      a.sum += r.man;
      a.n += 1;
    }
  }
  const yms = [...agg.keys()].sort();
  let truncated = false;
  if (opts.capped && yms.length > 1) {
    agg.delete(yms.shift() as string);
    truncated = true;
  }

  const monthsBack = opts.monthsBack ?? 36;
  /* 기준 달 = 이 단지 마지막 거래 달과 "지난달" 중 늦은 쪽 — 몇 달째 거래가 없는 단지가
     "최근 6개월"을 자기 마지막 거래 달로 끊어 거래가 이어지는 것처럼 보이지 않게(이번 달은 신고 중이라 뺀다). */
  const lastDataYm = yms[yms.length - 1];
  const prevMonth = ymShift(nowYm(opts.now), -1);
  const lastYm = lastDataYm > prevMonth ? lastDataYm : prevMonth;
  const floorYm = ymShift(lastYm, -(monthsBack - 1));
  const firstYm = yms.find((ym) => ym >= floorYm);
  if (!firstYm) return null;

  const months: TradeMonth[] = [];
  for (let ym = firstYm; ym <= lastYm && months.length < monthsBack; ym = ymShift(ym, 1)) {
    const a = agg.get(ym);
    months.push({
      ym,
      avgMan: a && a.n > 0 ? Math.round(a.sum / a.n) : null,
      n: a?.n ?? 0,
      nAll: a?.nAll ?? 0,
    });
  }

  const sixAgo = ymShift(lastYm, -5);
  const recentCount = months.filter((m) => m.ym >= sixAgo).reduce((s, m) => s + m.nAll, 0);
  const pricedMonths = months.filter((m) => m.avgMan != null).length;
  const bandLabel = byBand ? (AREA_BANDS.find((b) => b.slug === opts.bandSlug)?.label ?? null) : null;

  return {
    basis: byBand ? "band" : "unit",
    unitM2,
    bandSlug: opts.bandSlug ?? (unitM2 != null ? (areaBandOf(unitM2 + 0.5)?.slug ?? null) : null),
    label: opts.label ?? (byBand ? bandLabel : unitM2 != null ? unitLabel(unitM2) : null),
    months,
    /* 창은 늘 달력 6개월(기준 달 포함) — 그 안에서 이 단지 첫 거래가 늦게 시작했어도 "거래 없음"도 사실이다 */
    recent6: { count: recentCount, fromYm: sixAgo, toYm: lastYm, span: 6 },
    pricedMonths,
    sparse: pricedMonths < SPARSE_MIN_MONTHS,
    truncated,
    source: SERIES_SOURCE,
    asOf: lastYm,
  };
}
