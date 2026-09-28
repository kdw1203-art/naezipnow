/**
 * [1024] 타입(전용면적)별 신고가·신저가 — 순수 함수. 기간 안 **최고·최저 실거래** 그 자체다(추정 없음).
 *
 * 입력은 단지 허브의 매매 한 건(HubDeal 과 같은 모양: ym·day·man·area·floor). 해제분은 호출부가 이미 걸렀다
 * (getComplexDeals 는 is_cancelled=false 만 읽는다). 같은 금액이 여러 건이면 **가장 최근 계약**을 신고가·신저가로
 * 본다 — "신(新)" 은 최근을 뜻한다. 한 건뿐이면 신고가=신저가=그 한 건(둘 다 표시하지 않는 편이 낫다 — 호출부가
 * `single` 로 판단).
 */

export interface ExtremeDeal {
  /** 계약 연월 YYYYMM */
  ym: string;
  /** 계약일(1~31) — 없으면 null */
  day: number | null;
  /** 거래금액(만원) */
  man: number;
  /** 전용면적(㎡) — 없으면 null(타입 묶음에서 빠진다) */
  area: number | null;
  floor: number | null;
}

export interface TxExtremes<T extends ExtremeDeal = ExtremeDeal> {
  high: T | null;
  low: T | null;
  /** 기간 안 거래 수 */
  count: number;
  /** 거래가 한 건뿐(신고가=신저가) */
  single: boolean;
}

const YM = /^\d{6}$/;

/** 날짜 비교 키 — 계약월·계약일(없으면 0) */
function dateKey(d: ExtremeDeal): number {
  return Number(d.ym) * 100 + (d.day ?? 0);
}

/** 기간(fromYm~toYm, 둘 다 포함, 생략 가능) 안 거래 */
export function dealsInRange<T extends ExtremeDeal>(deals: readonly T[], range?: { fromYm?: string; toYm?: string }): T[] {
  const from = range?.fromYm && YM.test(range.fromYm) ? range.fromYm : null;
  const to = range?.toYm && YM.test(range.toYm) ? range.toYm : null;
  return deals.filter((d) => {
    if (!YM.test(d.ym) || !Number.isFinite(d.man) || d.man <= 0) return false;
    if (from && d.ym < from) return false;
    if (to && d.ym > to) return false;
    return true;
  });
}

/**
 * 기간 안 신고가·신저가. 동률은 최근 계약 우선.
 */
export function findTxExtremes<T extends ExtremeDeal>(
  deals: readonly T[],
  range?: { fromYm?: string; toYm?: string },
): TxExtremes<T> {
  const rows = dealsInRange(deals, range);
  let high: T | null = null;
  let low: T | null = null;
  for (const d of rows) {
    if (!high || d.man > high.man || (d.man === high.man && dateKey(d) > dateKey(high))) high = d;
    if (!low || d.man < low.man || (d.man === low.man && dateKey(d) > dateKey(low))) low = d;
  }
  return { high, low, count: rows.length, single: rows.length === 1 };
}

/**
 * 타입 키 — 전용면적을 정수 ㎡로(84.97 → "84", 59.99 → "59"). 단지 상세의 평형 탭이 같은 규칙으로 묶는다.
 * 면적을 모르면 null(타입별 계산에서 빠진다).
 */
export function areaTypeKey(area: number | null): string | null {
  if (area == null || !Number.isFinite(area) || area <= 0) return null;
  return String(Math.floor(area));
}

/** 타입별 신고가·신저가 — Map<타입키, extremes>. keyOf 를 바꾸면 평형 밴드 등 다른 묶음도 된다. */
export function extremesByType<T extends ExtremeDeal>(
  deals: readonly T[],
  range?: { fromYm?: string; toYm?: string },
  keyOf: (d: T) => string | null = (d) => areaTypeKey(d.area),
): Map<string, TxExtremes<T>> {
  const groups = new Map<string, T[]>();
  for (const d of dealsInRange(deals, range)) {
    const k = keyOf(d);
    if (!k) continue;
    const g = groups.get(k);
    if (g) g.push(d);
    else groups.set(k, [d]);
  }
  const out = new Map<string, TxExtremes<T>>();
  for (const [k, g] of groups) out.set(k, findTxExtremes(g));
  return out;
}

/** 표·그래프용 — 각 거래가 신고가/신저가인지(동일 객체 참조 기준). 한 건뿐이면 둘 다 false. */
export function markExtremes<T extends ExtremeDeal>(deals: readonly T[], ext: TxExtremes<T>): { high: boolean; low: boolean }[] {
  return deals.map((d) => ({
    high: !ext.single && ext.high === d,
    low: !ext.single && ext.low === d,
  }));
}
