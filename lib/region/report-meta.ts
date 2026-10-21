/**
 * [1082] 지역 월간 리포트(/region/<id>/report/<yyyy-mm> · 654쪽) 제목·설명문 — 운영 실측(2026-10-21) 설명문이 지역·달만 다른 같은 틀
 * ("… 매매 신고 건수, 평균·중앙값 매매가, 상위 실거래 …")이라 수가 하나도 없었다. 본문이 이미 읽는 값(건수·평균·중앙값·전월세)을 적는다.
 * 값이 없는 칸은 빼고, 신고 기한 안의 달은 "집계 중"을 붙인다. 순수 함수(테스트).
 */
import { formatKrwShort } from "@/lib/market/format";

export type RegionReportMetaFacts = {
  tradeCount: number | null;
  prevTradeCount: number | null;
  avgDealKrw: number | null;
  medianDealKrw: number | null;
  rentCount: number | null;
};

const n = (v: number) => v.toLocaleString("ko-KR");
const has = (v: number | null): v is number => typeof v === "number" && Number.isFinite(v) && v > 0;

export function regionReportTitle(name: string, label: string, f: RegionReportMetaFacts | null, open: boolean): string {
  if (f && has(f.tradeCount)) {
    const avg = has(f.avgDealKrw) ? ` · 평균 ${formatKrwShort(f.avgDealKrw)}` : "";
    return `${name} 아파트 ${label} 매매 신고 ${n(f.tradeCount)}건${open ? "(집계 중)" : ""}${avg} — 월간 리포트 | 내집나우`;
  }
  return `${name} 아파트 시장 ${label} 리포트 — 거래량·평균가·신고 실거래 | 내집나우`;
}

export function regionReportDescription(name: string, label: string, f: RegionReportMetaFacts | null, open: boolean): string {
  const parts: string[] = [];
  if (f && has(f.tradeCount)) {
    parts.push(`매매 신고 ${n(f.tradeCount)}건${open ? "(신고 기한 안 · 집계 중)" : has(f.prevTradeCount) ? `(전월 ${n(f.prevTradeCount)}건)` : ""}`);
  }
  if (f && has(f.avgDealKrw)) parts.push(`평균 매매가 ${formatKrwShort(f.avgDealKrw)}`);
  if (f && has(f.medianDealKrw)) parts.push(`중앙값 ${formatKrwShort(f.medianDealKrw)}`);
  if (f && has(f.rentCount)) parts.push(`전월세 신고 ${n(f.rentCount)}건`);
  if (parts.length === 0) {
    return `${label} ${name} 아파트 매매 신고 건수, 평균·중앙값 매매가, 상위 실거래, 전월세 신고 건수를 국토교통부·한국부동산원 데이터로 정리한 월간 스냅샷.`;
  }
  return `${label} ${name} 아파트 ${parts.join(" · ")} · 상위 실거래 — 국토교통부 실거래 신고·한국부동산원 지수로 정리한 월간 스냅샷.`;
}
