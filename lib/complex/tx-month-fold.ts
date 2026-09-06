/**
 * [967 · 16] 실거래 행 → 월별 집계(+ 면적대 분할) — 순수 함수.
 *
 * 왜 따로 뺐나: 단지 허브 시세 표에 면적대 필터를 붙이려면 월별 평균 안에
 * "그 달의 60~85㎡ 거래는 몇 건·평균 얼마"가 같이 있어야 한다.
 * getTransactionHistory(lib/complex/complex-store.ts) 는 월별로만 접고 area_m2 를
 * 아예 읽지 않는다(반환 행의 area_m2 는 언제나 null). 그 함수는 지도·임베드·
 * 노트 근거·상세 API 등 여섯 곳이 쓰므로 반환 모양을 건드리지 않고, 허브가 쓰는
 * 새 로더(getTransactionHistoryWithBands)가 이 접기를 쓴다.
 *
 * 월별 숫자는 기존 접기와 **같은 규칙**이어야 한다(반올림·정렬·slice) — 허브가
 * 다른 화면과 다른 평균을 말하면 그게 곧 버그다. 단위테스트가 이를 고정한다.
 *
 * 면적대 경계는 lib/market/bands.ts 가 단일 진실 공급원이다 — 여기서 다시
 * 정의하지 않는다.
 */
import { AREA_BANDS, areaBandOf } from "@/lib/market/bands";

/** market_transactions 에서 읽은 매매 한 건 (필요한 컬럼만) */
export interface TradeRowLite {
  contract_ym: string;
  deal_amount_krw: number;
  /** 전용면적 — 없으면(구 로더·결측) 면적대 분할에서 제외된다 */
  area_m2?: number | null;
}

/** 한 달 안의 면적대 한 조각 (단위: 만원) */
export interface TxMonthBandSlice {
  /** AREA_BANDS 의 slug */
  slug: string;
  avg_manwon: number;
  min_manwon: number;
  max_manwon: number;
  deal_count: number;
}

/** 월별 집계 행 — ComplexTransactionRow 와 같은 모양 + bands */
export interface TxMonthRow {
  complex_id: string;
  yyyymm: string;
  /** 한 달엔 여러 면적이 섞여 있으므로 언제나 null (기존 로더와 같은 계약) */
  area_m2: null;
  avg_manwon: number;
  min_manwon: number;
  max_manwon: number;
  deal_count: number;
  source: "molit";
  /** 그 달의 면적대별 분할 — AREA_BANDS 순서, 거래가 있는 구간만 */
  bands: TxMonthBandSlice[];
}

interface Acc {
  sum: number;
  n: number;
  min: number;
  max: number;
}

function acc(): Acc {
  return { sum: 0, n: 0, min: Number.POSITIVE_INFINITY, max: 0 };
}

function push(a: Acc, amt: number): void {
  a.sum += amt;
  a.n += 1;
  a.min = Math.min(a.min, amt);
  a.max = Math.max(a.max, amt);
}

/** 원 → 만원 반올림 (기존 접기와 같은 규칙) */
function manwon(krw: number): number {
  return Math.round(krw / 10_000);
}

/**
 * 과거→최신 정렬, 최근 limit 개월. 금액 0 이하·월 결측은 버린다
 * (getTransactionHistory 와 같은 규칙).
 */
export function foldTradesByMonth(
  rows: readonly TradeRowLite[],
  complexId: string,
  limit: number,
): TxMonthRow[] {
  const byYm = new Map<string, { all: Acc; bands: Map<string, Acc> }>();
  for (const r of rows) {
    const ym = r.contract_ym;
    const amt = Number(r.deal_amount_krw);
    if (!ym || !Number.isFinite(amt) || amt <= 0) continue;
    let cur = byYm.get(ym);
    if (!cur) {
      cur = { all: acc(), bands: new Map() };
      byYm.set(ym, cur);
    }
    push(cur.all, amt);
    const band = areaBandOf(r.area_m2);
    if (band) {
      let b = cur.bands.get(band.slug);
      if (!b) {
        b = acc();
        cur.bands.set(band.slug, b);
      }
      push(b, amt);
    }
  }

  return [...byYm.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(-limit)
    .map(([ym, v]) => ({
      complex_id: complexId,
      yyyymm: ym,
      area_m2: null,
      avg_manwon: Math.round(v.all.sum / v.all.n / 10_000),
      min_manwon: manwon(v.all.min),
      max_manwon: manwon(v.all.max),
      deal_count: v.all.n,
      source: "molit",
      /* 구간 순서는 AREA_BANDS(작은 면적부터) — 칩 순서가 여기서 결정된다 */
      bands: AREA_BANDS.flatMap((band) => {
        const b = v.bands.get(band.slug);
        if (!b) return [];
        return [
          {
            slug: band.slug,
            avg_manwon: Math.round(b.sum / b.n / 10_000),
            min_manwon: manwon(b.min),
            max_manwon: manwon(b.max),
            deal_count: b.n,
          },
        ];
      }),
    }));
}
