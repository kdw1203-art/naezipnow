/* [1048 · 다요인 분석] 단지 화면의 시장 신호 판 — "이 단지 결과 요약" 바로 아래.
   소유자 지시(2026-10-09): AI 분석에 심리지수 · 부동산 뉴스 · 관심도 · 거래량 · 추이 · 추세 · 매물수 등을 함께 고려.

   예산 규율(이 페이지는 ISR · 섹션 공유 예산 3초 — section-loaders [968]):
   · 라이브 컨텍스트는 결과 요약과 같은 것(loadAxisContext · 요청 안 dedupe) — 추가 왕복 없음.
   · 지역 묶음 · 한국은행 묶음 · 관심 지도는 지역/전역 키 캐시(lib/signals/load.ts) — 단지마다 다시 읽지 않는다.
   · 이 단지 월별 건수 · 주력 평형 월 중위는 본문이 이미 만든 거래 그래프 값(새 조회 0).
   · 예산을 넘기거나 요인이 하나도 없으면 아무것도 그리지 않는다(섹션 생략). */
import { SignalBoard } from "@/app/components/signals/SignalBoard";
import { loadSignalReport } from "@/lib/signals/load";
import { loadAxisContext, logSectionFailure, withSectionBudget } from "./section-loaders";

export async function ComplexSignals({
  complexId,
  regionName,
  series,
}: {
  complexId: string;
  regionName: string;
  series: { yms: string[]; counts: number[]; mainValues?: (number | null)[] } | null;
}) {
  if (!regionName) return null;
  const report = await withSectionBudget(
    loadAxisContext(complexId, regionName)
      .catch(() => null)
      .then((ctx) => loadSignalReport({ scope: "complex", regionName, complexId, ctx, complexSeries: series })),
  ).catch((e) => {
    logSectionFailure("다요인 분석", e);
    return null;
  });
  if (!report || report.coverage.used === 0) return null;
  return <SignalBoard report={report} idPrefix="complex" className="mt-3 rise-in-1" />;
}

export default ComplexSignals;
