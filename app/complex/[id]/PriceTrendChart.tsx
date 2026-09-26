import { hubRanges, ymLongKo, ymShortDot, type HubSeries } from "@/lib/complex/hub-price";
import { PriceTrendLazy } from "./PriceTrendLazy";

/* 단지 실거래 가격 추이 (사실 우선 — market_transactions 실거래만, 해제분 제외).

   [1009 · C] 서버 SVG(raw hex #e11900·#1565d8·#1d4fd8·#eef1f6, 평형 혼합 월평균, 포인터 반응 없음)를 걷어 내고
   평형별 ScrubLine(PriceTrendPanel — 따로 받는 청크)으로 바꿨다. 이 파일은 서버에서 재료(달 축·탭·기간)만 만든다.
   재료 계산은 lib/complex/hub-price(순수) — 첫 화면 대표가와 같은 평형 규칙. 차트는 page.tsx 가 그려 탭 컴포넌트에
   엘리먼트로 넘긴다([968 · 4] — 요약·시세 탭이 같은 엘리먼트를 쓴다). */

export type PricePoint = {
  /** "YYYYMM" */
  ym: string;
  /** 평균 매매가 (만원) */
  avgManwon: number;
  /** 해당 월 거래 건수 */
  dealCount: number;
};

export function PriceTrendChart({ series, complexName }: { series: HubSeries | null; complexName: string }) {
  if (!series || series.tabs.length === 0) return null;
  return (
    <PriceTrendLazy
      tabs={series.tabs}
      defaultKey={series.defaultKey}
      labels={series.yms.map(ymShortDot)}
      fullLabels={series.yms.map(ymLongKo)}
      ranges={hubRanges(series.yms.length)}
      complexName={complexName}
      truncated={series.truncated}
      rep={series.rep}
    />
  );
}
