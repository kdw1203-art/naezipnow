/**
 * [1021 · 지역 시세 price·timing] 면적 선반 — 카드 5칸의 표시 규칙(순수 함수 · 테스트 대상).
 *
 * 지시(시안 mock8/price): 면적대마다 카드(막대 높이 = 거래 건수 비율 · 중앙값 크게 · 건수·평단가·상위 %). 거래 최다 칸은
 * 채움 파랑 막대 + "거래 최다" 배지, 평단가 최고 칸은 배지. 값은 tx_band_landing(국토교통부 실거래) 셀 그대로 —
 * 상위 % 는 페이지의 topPercentOf(수록 지역 8곳 이상일 때만) 결과를 그대로 받는다. 없는 값은 칸을 비운다.
 */

export type ShelfBand = {
  slug: string;
  label: string;
  txCount: number;
  complexCount: number;
  /** 표시용 문자열은 서버가 만든다(포맷 라이브러리를 클라이언트로 끌고 오지 않으려고) */
  medianText: string;
  avgText: string;
  minText: string;
  maxText: string;
  /** "2,402만/평" — 평단가 없으면 null */
  perText: string | null;
  /** 상위 % — 표본 8곳 미만이면 null */
  top: number | null;
  /** 그 면적대 실거래 상위 단지(거래 많은 순) */
  rows: { key: string; label: string; value: number; href?: string }[];
  /** 상위 3곳 평균 매매가 */
  avgRows: { name: string; avgText: string }[];
};

export type ShelfCardView = {
  slug: string;
  /** 막대 높이 % (최다 칸 100 · 최소 3) */
  barPct: number;
  busiest: boolean;
  priciest: boolean;
};

/** 막대 높이 = 그 칸 건수 ÷ 최다 칸 건수. 0건도 칸은 있으므로 3% 는 남긴다 */
export function shelfCards(bands: readonly ShelfBand[], busiestSlug: string | null, hiSlug: string | null): ShelfCardView[] {
  const max = Math.max(1, ...bands.map((b) => b.txCount));
  return bands.map((b) => ({
    slug: b.slug,
    barPct: Math.max(3, Math.round((b.txCount / max) * 100)),
    busiest: busiestSlug !== null && b.slug === busiestSlug,
    priciest: hiSlug !== null && b.slug === hiSlug,
  }));
}

/** 처음 고른 칸 — 거래 최다 면적대, 없으면 첫 칸 */
export function initialShelfSlug(bands: readonly ShelfBand[], busiestSlug: string | null): string | null {
  if (busiestSlug && bands.some((b) => b.slug === busiestSlug)) return busiestSlug;
  return bands[0]?.slug ?? null;
}
