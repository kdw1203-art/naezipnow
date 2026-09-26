/**
 * [1008 · Q] 호가 점검 — "이 가격 괜찮을까?" (순수, 클라이언트 안전).
 *
 * 왜(목표 원문 "매매 단계까지의 과정 및 결정 과정에서 큰 역할"): 매물 호가를 들고 온 사람에게 가장
 * 먼저 필요한 건 "지난 실거래 사이에서 이 값이 어디쯤인가"다. 단지 허브에는 면적대별 평균·최저~최고만
 * 있고, 내 숫자를 올려 볼 자리가 없었다.
 *
 * 원칙 — **지어낸 기준선 금지**: 적정가·목표가·추정가를 만들지 않는다. 같은 면적대의 신고된 거래 분포
 * (최저·중앙·최고)와 그 위의 위치(몇 건보다 높은가)만 말한다. 최근 12개월에 3건 미만이면 24개월로
 * 넓히고, 그래도 3건 미만이면 "거래가 적어 비교하기 어려워요"다.
 *
 * 면적대 경계는 lib/market/bands.ts(AREA_BANDS) 하나만 쓴다 — 허브 "면적대별 시세" 표와 같은 구간.
 */
import { AREA_BANDS, areaBandOf } from "@/lib/market/bands";
import { formatEokMan } from "@/lib/format/eok-man";

export const ASKING_MIN_TRADES = 3;

export interface AskingTrade {
  /** 계약 연월 YYYYMM */
  ym: string;
  areaM2: number;
  /** 거래금액(만원) */
  priceManwon: number;
  floor: number | null;
}

/** API 응답 한 행 — [계약연월, 전용㎡, 만원, 층] (페이로드를 줄이려 배열로 싣는다) */
export type AskingTradeTuple = [string, number, number, number | null];

export function tradeToTuple(t: AskingTrade): AskingTradeTuple {
  return [t.ym, t.areaM2, t.priceManwon, t.floor];
}

/** 응답 → 거래 목록. 모양이 틀린 행은 버린다(신뢰 경계) */
export function tradesFromTuples(rows: unknown): AskingTrade[] {
  if (!Array.isArray(rows)) return [];
  const out: AskingTrade[] = [];
  for (const r of rows) {
    if (!Array.isArray(r) || r.length < 3) continue;
    const [ym, area, price, floor] = r as unknown[];
    if (typeof ym !== "string" || !/^\d{6}$/.test(ym)) continue;
    if (typeof area !== "number" || !(area > 0) || typeof price !== "number" || !(price > 0)) continue;
    out.push({ ym, areaM2: area, priceManwon: price, floor: typeof floor === "number" && floor > 0 ? floor : null });
  }
  return out;
}

/* ── 달력 ─────────────────────────────────────────────────────────────── */

/** epoch ms → KST 기준 YYYYMM */
export function kstYm(ms: number): string {
  const d = new Date(ms + 9 * 60 * 60 * 1000);
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** YYYYMM ± n개월 */
export function shiftYm(ym: string, months: number): string {
  const y = Number(ym.slice(0, 4));
  const m = Number(ym.slice(4, 6)) - 1 + months;
  const yy = y + Math.floor(m / 12);
  const mm = ((m % 12) + 12) % 12;
  return `${yy}${String(mm + 1).padStart(2, "0")}`;
}

/** 이번 달 포함 N개월 창의 첫 달(단지 허브 countDealsInWindow 와 같은 달력 규칙) */
export function windowStartYm(nowYm: string, months: number): string {
  return shiftYm(nowYm, -(months - 1));
}

/* ── 면적대 ───────────────────────────────────────────────────────────── */

export interface AskingBandOption {
  slug: string;
  /** "60~85㎡" — AREA_BANDS 라벨 그대로(평 변환은 화면이 areaBandLabelByUnit 로) */
  label: string;
  count12: number;
  count24: number;
}

/** 24개월 안에 거래가 있는 면적대만(눌러도 빈 결과인 칩은 만들지 않는다), AREA_BANDS 순서 */
export function askingBandOptions(trades: readonly AskingTrade[], nowYm: string): AskingBandOption[] {
  const from12 = windowStartYm(nowYm, 12);
  const from24 = windowStartYm(nowYm, 24);
  const out: AskingBandOption[] = [];
  for (const band of AREA_BANDS) {
    let c12 = 0;
    let c24 = 0;
    for (const t of trades) {
      if (t.ym > nowYm || t.ym < from24 || areaBandOf(t.areaM2)?.slug !== band.slug) continue;
      c24++;
      if (t.ym >= from12) c12++;
    }
    if (c24 > 0) out.push({ slug: band.slug, label: band.label, count12: c12, count24: c24 });
  }
  return out;
}

/** 처음 고를 면적대 — 최근 12개월 거래가 가장 많은 구간(동률이면 24개월, 그다음 AREA_BANDS 순서) */
export function defaultBandSlug(options: readonly AskingBandOption[]): string | null {
  let best: AskingBandOption | null = null;
  for (const o of options) {
    if (!best || o.count12 > best.count12 || (o.count12 === best.count12 && o.count24 > best.count24)) best = o;
  }
  return best?.slug ?? null;
}

export interface AskingWindow {
  months: 12 | 24;
  fromYm: string;
  toYm: string;
  /** 창 안·그 면적대 거래(최신순) */
  trades: AskingTrade[];
}

/** 최근 12개월 — 3건 미만이면 24개월로 넓힌다 */
export function askingWindow(trades: readonly AskingTrade[], bandSlug: string, nowYm: string): AskingWindow {
  const inBand = trades
    .filter((t) => t.ym <= nowYm && areaBandOf(t.areaM2)?.slug === bandSlug)
    .sort((a, b) => (a.ym === b.ym ? 0 : a.ym < b.ym ? 1 : -1));
  const pick = (months: 12 | 24): AskingWindow => {
    const fromYm = windowStartYm(nowYm, months);
    return { months, fromYm, toYm: nowYm, trades: inBand.filter((t) => t.ym >= fromYm) };
  };
  const w12 = pick(12);
  return w12.trades.length >= ASKING_MIN_TRADES ? w12 : pick(24);
}

/* ── 호가 입력 ────────────────────────────────────────────────────────── */

const UNIT_MANWON: Record<string, number> = { 억: 10_000, 천만: 1_000, 백만: 100, 천: 1_000, 백: 100, 만: 1 };
const MAX_MANWON = 10_000_000; // 1,000억 — 그 이상은 오타로 본다

export type AskingPriceRead =
  | { ok: true; manwon: number }
  /** empty: 빈 입력 · after-eok: 억 뒤 맨 끝 숫자가 1~3자리라 천/만 단위가 모호("12억 5") · format: 그 밖 */
  | { ok: false; reason: "empty" | "after-eok" | "format" };

/**
 * 사람이 적는 가격 → 만원(정수). 억·만원 둘 다 알아듣는다. 못 알아들으면 이유와 함께 실패(추측하지 않는다).
 *   "12억 5천" · "12억5,000만원" · "12.5억" · "125000" · "9억 8000" · "1억2천5백만" · "9,800만" · "１２억"(전각)
 * 단위 없는 숫자 하나: 1,000 미만이면 억("12.5" → 12억 5,000만), 1,000 이상이면 만원("98000"),
 * 천만 이상이면 원("1250000000" → 12억 5,000만).
 * 억 뒤 맨 끝의 단위 없는 숫자는 **네 자리일 때만** 만원이다("9억 8000" → 9억 8,000만). "12억 5"·"8억 5"를
 * 12억 5만·8억 5만으로 읽으면 사람이 뜻한 12억 5천과 4,995만원이 어긋난다(리뷰 C) — 1~3자리는
 * "12억 5천처럼 적어 주세요"로 되묻는다("3천 5" 를 추측하지 않는 규칙과 같은 원칙).
 */
export function readAskingPrice(input: string): AskingPriceRead {
  const s = input
    .normalize("NFKC")
    .replace(/[\s,원]/g, "")
    .replace(/^약/, "")
    .replace(/(정도|쯤)$/, "");
  if (!s) return { ok: false, reason: "empty" };
  const done = (manwon: number): AskingPriceRead =>
    manwon >= 1 && manwon < MAX_MANWON ? { ok: true, manwon: Math.round(manwon) } : { ok: false, reason: "format" };
  if (/^\d+(\.\d+)?$/.test(s)) {
    const v = Number(s);
    if (!(v > 0)) return { ok: false, reason: "format" };
    return done(v < 1_000 ? v * 10_000 : v < 10_000_000 ? v : v / 10_000);
  }
  const re = /(\d+(?:\.\d+)?)(억|천만|백만|천|백|만)?/y;
  let total = 0;
  let pos = 0;
  let lastUnit: string | null = null;
  while (pos < s.length) {
    re.lastIndex = pos;
    const m = re.exec(s);
    if (!m) return { ok: false, reason: "format" };
    const unit = m[2] ?? null;
    if (unit) {
      total += Number(m[1]) * UNIT_MANWON[unit];
    } else if (lastUnit === "억" && re.lastIndex === s.length) {
      /* "15억 3000" — 억 뒤 맨 끝의 **네 자리** 숫자만 만원 */
      if (!/^\d{4}$/.test(m[1])) return { ok: false, reason: "after-eok" };
      total += Number(m[1]);
    } else {
      return { ok: false, reason: "format" };
    }
    lastUnit = unit;
    pos = re.lastIndex;
  }
  return done(total);
}

/** readAskingPrice 의 값만 — 못 알아들으면 null */
export function parseAskingPrice(input: string): number | null {
  const r = readAskingPrice(input);
  return r.ok ? r.manwon : null;
}

/* ── 분포·위치 ────────────────────────────────────────────────────────── */

export function medianOf(xs: readonly number[]): number {
  if (xs.length === 0) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
}

export interface AskingPosition {
  n: number;
  /** 호가보다 낮은(싼) 거래 수 — "M건보다 높아요"의 M */
  below: number;
  equal: number;
  above: number;
  min: number;
  median: number;
  max: number;
  side: "above-all" | "below-all" | "within";
  /** 거래들 사이에 있을 때의 순위 문구 — "상위 22%" / "하위 13%"(가운데보다 싼 쪽이면 하위로) / "중간쯤".
   *  null 인 경우: 모든 거래보다 높거나 낮을 때("상위 1%"는 틀린 말 — 대신 차이 askingGapLabel),
   *  최저가·최고가와 같을 때와 모든 거래가 같은 값일 때(한 줄 요약이 이미 그렇게 말한다 — 옆에
   *  "하위 50%"가 붙으면 "가장 낮은 거래와 같아요"와 어긋난다, 리뷰 C) */
  rankLabel: string | null;
}

/** 호가가 거래들 사이 어디쯤인가 — 거래가 없으면 null */
export function askingPosition(prices: readonly number[], asking: number): AskingPosition | null {
  const xs = prices.filter((p) => Number.isFinite(p) && p > 0);
  if (xs.length === 0 || !(asking > 0)) return null;
  let below = 0;
  let equal = 0;
  for (const p of xs) {
    if (p < asking) below++;
    else if (p === asking) equal++;
  }
  const n = xs.length;
  const above = n - below - equal;
  const min = Math.min(...xs);
  const max = Math.max(...xs);
  const side = asking > max ? "above-all" : asking < min ? "below-all" : "within";
  const pct = (k: number) => Math.min(100, Math.max(1, Math.round((k / n) * 100)));
  /* 같은 값의 거래는 양쪽에 다 센다 — 그래서 둘 다 절반을 넘으면(가운데에 같은 값이 몰림) "중간쯤" */
  const higherShare = (above + equal) / n;
  const lowerShare = (below + equal) / n;
  const rankLabel =
    side !== "within" || below === 0 || above === 0
      ? null
      : higherShare <= 0.5
        ? `상위 ${pct(above + equal)}%`
        : lowerShare <= 0.5
          ? `하위 ${pct(below + equal)}%`
          : "중간쯤";
  return { n, below, equal, above, min, median: medianOf(xs), max, side, rankLabel };
}

/** 모든 거래 밖일 때 — "최고 거래가보다 8억 5,000만 높아요" / "최저 거래가보다 3억 낮아요". 안쪽이면 null */
export function askingGapLabel(pos: AskingPosition, asking: number): string | null {
  if (pos.side === "above-all") return `최고 거래가보다 ${formatEokMan(asking - pos.max)} 높아요`;
  if (pos.side === "below-all") return `최저 거래가보다 ${formatEokMan(pos.min - asking)} 낮아요`;
  return null;
}

/** 한 줄 요약 — "최근 12개월 이 면적대 실거래 23건 중 18건보다 높아요" (순위는 rankLabel 로 따로) */
export function askingHeadline(pos: AskingPosition, months: 12 | 24): string {
  const head = `최근 ${months}개월 이 면적대 실거래 ${pos.n}건`;
  if (pos.side === "above-all") return `${head} 모두보다 높아요`;
  if (pos.side === "below-all") return `${head} 모두보다 낮아요`;
  if (pos.below === 0 && pos.above === 0) return `${head} 모두 이 호가와 같은 값이에요`;
  /* 같은 값이 여럿이면 "가장 낮은 거래 2건과" — 받침에 따라 와/과 */
  const same = pos.equal > 1 ? `거래 ${pos.equal}건과` : "거래와";
  if (pos.below === 0) return `${head} 중 가장 낮은 ${same} 같아요`;
  if (pos.above === 0) return `${head} 중 가장 높은 ${same} 같아요`;
  return pos.equal > 0
    ? `${head} 중 ${pos.below}건보다 높고 ${pos.equal}건과 같아요`
    : `${head} 중 ${pos.below}건보다 높아요`;
}

/** 호가에 가장 가까운 실거래 k건 — 차이가 같으면 최근 거래 먼저 */
export function nearestTrades(trades: readonly AskingTrade[], asking: number, k = 3): AskingTrade[] {
  return [...trades]
    .sort((a, b) => {
      const d = Math.abs(a.priceManwon - asking) - Math.abs(b.priceManwon - asking);
      if (d !== 0) return d;
      return a.ym === b.ym ? 0 : a.ym < b.ym ? 1 : -1;
    })
    .slice(0, k);
}

/** 막대 위 x 위치(0~100%) — 범위는 거래와 호가를 모두 담고 양끝 4% 여백 */
export function barScale(values: readonly number[]): (v: number) => number {
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const span = hi - lo;
  if (!(span > 0)) return () => 50;
  return (v: number) => 4 + ((v - lo) / span) * 92;
}
