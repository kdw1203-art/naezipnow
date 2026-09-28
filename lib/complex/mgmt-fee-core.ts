/**
 * [1024] 단지 관리비 요약 — 순수 함수(server-only 밖, node:test 가 직접 부른다).
 * 입력은 complex_mgmt_fee 행(최근 12개월). 값이 없으면 null — 화면은 null 을 "—" 로 낸다.
 */

export interface ComplexMgmtFeeRow {
  /** YYYYMM */
  ym: string;
  commonKrw: number | null;
  individualKrw: number | null;
  totalKrw: number;
  /** 관리비부과면적 ㎡당(원) — 면적을 모르면 null */
  perM2Krw: number | null;
}

export interface ComplexMgmtFeeSummary {
  /** 가장 최근 달 */
  latest: ComplexMgmtFeeRow | null;
  /** 있는 달 수(최대 12) */
  months: number;
  /** 12개월 평균 총액(원) */
  avgTotalKrw: number | null;
  /** 12개월 평균 ㎡당(원) — ㎡당이 있는 달만 평균 */
  avgPerM2Krw: number | null;
  /** 최근 달 vs 같은 달 전년(둘 다 있을 때만) — 총액 기준 % */
  yoyPct: number | null;
  /** 전년 비교의 기준 달(YYYYMM) — 표기용 */
  yoyBaseYm: string | null;
}

/** 최신순 정렬(복사본) */
export function sortMgmtFeeDesc(rows: readonly ComplexMgmtFeeRow[]): ComplexMgmtFeeRow[] {
  return [...rows].filter((r) => /^\d{6}$/.test(r.ym)).sort((a, b) => b.ym.localeCompare(a.ym));
}

export function summarizeMgmtFee(rows: readonly ComplexMgmtFeeRow[]): ComplexMgmtFeeSummary {
  const sorted = sortMgmtFeeDesc(rows).slice(0, 12);
  if (sorted.length === 0) {
    return { latest: null, months: 0, avgTotalKrw: null, avgPerM2Krw: null, yoyPct: null, yoyBaseYm: null };
  }
  const latest = sorted[0];
  const totals = sorted.map((r) => r.totalKrw).filter((v) => Number.isFinite(v) && v >= 0);
  const perM2 = sorted.map((r) => r.perM2Krw).filter((v): v is number => v != null && Number.isFinite(v) && v >= 0);
  const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((s, v) => s + v, 0) / xs.length) : null);

  const baseYm = `${Number(latest.ym.slice(0, 4)) - 1}${latest.ym.slice(4, 6)}`;
  const base = rows.find((r) => r.ym === baseYm);
  const yoyPct =
    base && base.totalKrw > 0 && latest.totalKrw >= 0
      ? Math.round(((latest.totalKrw - base.totalKrw) / base.totalKrw) * 1000) / 10
      : null;

  return {
    latest,
    months: sorted.length,
    avgTotalKrw: avg(totals),
    avgPerM2Krw: avg(perM2),
    yoyPct,
    yoyBaseYm: yoyPct == null ? null : baseYm,
  };
}
