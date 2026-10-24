"use client";

/* [1089 · 비용] 단지 화면의 "이 단지 결과 요약 · 다요인 분석" 자리 — 서버 HTML 에는 아무것도 없고, 하이드레이션 뒤
   지연 조각(ComplexInsightLoader)이 사람이 볼 때만 /api/complex/insight 로 받아 예전과 같은 마크업을 그린다.
   왜: 두 판이 읽는 지역 축 · 심리 · 금리 · 관심도 캐시(1시간 · 6시간 · "market" 태그)가 단지 화면(ISR 7일)의 수명을
   1시간으로 끌어내리고, 실거래 적재마다 2.4만 쪽을 통째로 비웠다(lib/complex/insight-query 머리 주석).
   이 파일은 지연 조각을 부르는 껍데기뿐이다 — 단지 화면 첫 로드 JS 에 판정 · 조회 · 그리기 코드를 싣지 않는다. */
import dynamic from "next/dynamic";
import type { InsightSeries } from "@/lib/complex/insight-query";

const ComplexInsightLoader = dynamic(() => import("./ComplexInsightLoader"), { ssr: false });

export function ComplexInsightPanels(props: { complexId: string; regionName: string; series: InsightSeries | null }) {
  return <ComplexInsightLoader {...props} />;
}
