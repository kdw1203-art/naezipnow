/**
 * [967 · 16] 단지 허브 시세 표 — 행 변환·면적대 필터·정렬 (순수, 클라이언트 안전).
 *
 * 서버(page.tsx)는 월별 집계를 HubTrade 로 바꿔 넘기고, 클라이언트(hub-client.tsx)
 * 는 이미 받은 행 위에서만 필터·정렬한다 — 추가 질의 없음. 그래서 표기 규칙
 * (억/만 표기·전월비 화살표)이 서버·클라이언트 양쪽에 필요하고, 한 곳에 둔다.
 * 예전엔 formatManwon·pctDelta·deltaLabel 이 page.tsx 안에 있었다.
 *
 * 면적대 경계는 lib/market/bands.ts(AREA_BANDS)만 쓴다 — 여기서 다시 정하지 않는다.
 */
import { AREA_BANDS } from "@/lib/market/bands";
import { formatKrwManwon } from "@/lib/format/krw";

export type TradeTone = "up" | "down" | "flat";

/** 한 달 안의 면적대 조각 (만원) */
export interface HubTradeBand {
  slug: string;
  avgManwon: number;
  minManwon: number;
  maxManwon: number;
  dealCount: number;
}

export interface HubTrade {
  /** yyyymm — 월별 집계라 목록 안에서 유일하다. React key 로 쓴다. */
  ym: string;
  /** "2026.07" */
  date: string;
  price: string;
  sub: string;
  delta: string;
  tone: TradeTone;
  /** 정렬용 원값(만원) */
  avgManwon: number;
  dealCount: number;
  /** 면적대 분할 — 구 로더(area 미조회)로 만든 행은 빈 배열 */
  bands: HubTradeBand[];
}

/** toHubTrades 입력 — ComplexTransactionRow(+bands) 와 구조적으로 호환 */
export interface TxMonthLike {
  yyyymm: string;
  area_m2?: number | null;
  avg_manwon: number;
  min_manwon: number | null;
  max_manwon: number | null;
  deal_count: number;
  bands?: ReadonlyArray<{
    slug: string;
    avg_manwon: number;
    min_manwon: number;
    max_manwon: number;
    deal_count: number;
  }>;
}

/** 만원 → "8.4억" / "9,800만" / "—"
 *  [967 · 31] 본체는 lib/format/krw.ts "eok1" 스타일(소수 한 자리, ".0" 제거, 천단위 구분 없음) */
export function formatManwon(manwon: number): string {
  return formatKrwManwon(manwon, { style: "eok1" });
}

export function pctDelta(curr: number, prev: number | undefined): number | null {
  if (!prev || prev <= 0 || !Number.isFinite(curr)) return null;
  return Math.round(((curr - prev) / prev) * 1000) / 10;
}

export function deltaLabel(pct: number | null): { delta: string; tone: TradeTone } {
  if (pct === null || pct === 0) return { delta: "—", tone: "flat" };
  return pct > 0
    ? { delta: `▲ ${Math.abs(pct).toFixed(1)}%`, tone: "up" }
    : { delta: `▼ ${Math.abs(pct).toFixed(1)}%`, tone: "down" };
}

function ymLabel(ym: string): string {
  return `${ym.slice(0, 4)}.${ym.slice(4, 6)}`;
}

/** "N건 · 최저~최고" — 최저=최고(1건 등)면 범위 생략 (기존 표기 그대로) */
function subLabel(dealCount: number, min: number | null, max: number | null, area?: number | null): string {
  const range =
    min != null && max != null && min !== max
      ? ` · ${formatManwon(min)}~${formatManwon(max)}`
      : "";
  const areaTxt = area != null ? ` · ${Math.round(area)}㎡` : "";
  return `${dealCount}건${areaTxt}${range}`;
}

/**
 * 월별 집계(과거→최신) → 허브 표 행(최신순). 전월비는 바로 앞 달 평균 대비.
 * page.tsx 의 옛 toTrades 와 같은 출력에 ym·원값·bands 가 더해졌다.
 */
export function toHubTrades(tx: readonly TxMonthLike[]): HubTrade[] {
  const items: HubTrade[] = [];
  for (let i = tx.length - 1; i >= 0; i--) {
    const row = tx[i];
    const prev = i > 0 ? tx[i - 1].avg_manwon : undefined;
    const { delta, tone } = deltaLabel(pctDelta(row.avg_manwon, prev));
    items.push({
      ym: row.yyyymm,
      date: ymLabel(row.yyyymm),
      price: formatManwon(row.avg_manwon),
      sub: subLabel(row.deal_count, row.min_manwon, row.max_manwon, row.area_m2),
      delta,
      tone,
      avgManwon: row.avg_manwon,
      dealCount: row.deal_count,
      bands: (row.bands ?? []).map((b) => ({
        slug: b.slug,
        avgManwon: b.avg_manwon,
        minManwon: b.min_manwon,
        maxManwon: b.max_manwon,
        dealCount: b.deal_count,
      })),
    });
  }
  return items;
}

/* ===== 클라이언트 필터·정렬 ===== */

export type TradeSort = "latest" | "price-desc" | "price-asc";

export const TRADE_SORTS: ReadonlyArray<{ value: TradeSort; label: string }> = [
  { value: "latest", label: "최신순" },
  { value: "price-desc", label: "높은 가격순" },
  { value: "price-asc", label: "낮은 가격순" },
];

/** "전체" 칩의 값 */
export const ALL_BANDS = "all";

export interface TradeBandChip {
  slug: string;
  label: string;
  /** 표에 실린 개월 전체의 해당 구간 거래 건수 */
  dealCount: number;
}

/**
 * 행에 실제로 나타난 면적대만 칩으로 — AREA_BANDS 순서. 거래가 없는 구간은
 * 칩을 만들지 않는다(눌러도 빈 표가 되는 칩은 죽은 버튼과 같다).
 * "전체" 칩은 UI 가 앞에 붙인다.
 */
export function tradeBandChips(trades: readonly HubTrade[]): TradeBandChip[] {
  const counts = new Map<string, number>();
  for (const t of trades) {
    for (const b of t.bands) counts.set(b.slug, (counts.get(b.slug) ?? 0) + b.dealCount);
  }
  return AREA_BANDS.flatMap((band) => {
    const n = counts.get(band.slug);
    return n ? [{ slug: band.slug, label: band.label, dealCount: n }] : [];
  });
}

function sortTrades(rows: HubTrade[], sort: TradeSort): HubTrade[] {
  const byLatest = (a: HubTrade, b: HubTrade) => b.ym.localeCompare(a.ym);
  switch (sort) {
    case "price-desc":
      return [...rows].sort((a, b) => b.avgManwon - a.avgManwon || byLatest(a, b));
    case "price-asc":
      return [...rows].sort((a, b) => a.avgManwon - b.avgManwon || byLatest(a, b));
    default:
      return [...rows].sort(byLatest);
  }
}

/**
 * 면적대 필터 + 정렬. band 가 "all" 이면 행을 그대로(정렬만) 돌려준다.
 * 특정 구간이면 그 구간 거래가 있는 달만 남기고, 가격·건수·전월비를
 * **그 구간 기준**으로 다시 계산한다 — 전체 평균의 전월비를 구간 행에 그대로
 * 붙이면 84㎡ 행이 135㎡ 거래 때문에 오른 것처럼 읽힌다.
 * 표 열·표기 형식은 전체 보기와 같다(같은 subLabel·deltaLabel).
 */
export function viewTrades(
  trades: readonly HubTrade[],
  band: string,
  sort: TradeSort,
): HubTrade[] {
  if (band === ALL_BANDS) return sortTrades([...trades], sort);
  /* 전월비는 시간순으로 계산해야 하므로 과거→최신으로 훑는다 */
  const chrono = [...trades].sort((a, b) => a.ym.localeCompare(b.ym));
  const out: HubTrade[] = [];
  let prevAvg: number | undefined;
  for (const t of chrono) {
    const slice = t.bands.find((b) => b.slug === band);
    if (!slice) continue;
    const { delta, tone } = deltaLabel(pctDelta(slice.avgManwon, prevAvg));
    prevAvg = slice.avgManwon;
    out.push({
      ...t,
      price: formatManwon(slice.avgManwon),
      sub: subLabel(slice.dealCount, slice.minManwon, slice.maxManwon),
      delta,
      tone,
      avgManwon: slice.avgManwon,
      dealCount: slice.dealCount,
    });
  }
  return sortTrades(out, sort);
}

/** 표 머리의 "N개월 · M건" */
export function tradeTotals(rows: readonly HubTrade[]): { months: number; deals: number } {
  return {
    months: rows.length,
    deals: rows.reduce((s, r) => s + r.dealCount, 0),
  };
}
