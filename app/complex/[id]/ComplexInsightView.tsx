"use client";

/* [1089 · 비용] 단지 화면 "이 단지 결과 요약"(예전 ComplexAxisSummary) · "다요인 분석"(예전 ComplexSignals)의 그리기 몫 —
   ComplexInsightPanels 가 받은 값(/api/complex/insight)으로 예전과 같은 마크업을 그린다(문장 · 클래스 · 순서 그대로).
   계산(판단 카드 · 5축 · 요인)은 서버(lib/complex/insight)에서 끝났다 — 여기엔 그리기 코드만 온다(지연 조각).
   [OPT-48 · 994 · 1012 · 1015 · 1038] 결과 요약의 규칙 주석은 lib/complex/insight.ts summaryFromContext 와
   app/complex/[id]/axis-summary-rules.ts 에 있다. */
import Link from "@/app/components/IntentLink";
import { VerdictCard } from "@/app/analysis/ai/[tool]/VerdictCard";
import { ScoreRing } from "@/app/components/viz/ScoreRing";
import { ScoreRadar } from "@/app/components/viz/ScoreRadar";
import { SignalBoard } from "@/app/components/signals/SignalBoard";
import type { ComplexInsight } from "@/lib/complex/insight";

export default function ComplexInsightView({ data, complexId }: { data: ComplexInsight; complexId: string }) {
  const { summary, signals } = data;
  return (
    <>
      {summary && (
        <section aria-label="이 단지 결과 요약" className="mt-4 rounded-2xl border border-line bg-surface p-4 max-md:mt-3 max-md:p-3.5">
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="t-body font-bold text-ink">이 단지 결과 요약</h2>
            <Link
              href={`/analysis/ai/ai-diagnosis?complexId=${encodeURIComponent(complexId)}`}
              className="inline-block shrink-0 py-[5px] text-xs font-semibold text-primary"
            >
              이 단지 AI 종합 진단 받기 ›
            </Link>
          </div>
          {summary.score != null && summary.radar && (
            <div className="mt-3 flex flex-wrap items-center justify-center gap-3 rounded-lg bg-bg px-2 py-2 md:justify-start md:gap-6">
              <ScoreRing score={summary.score} size={96} label="투자 점수" />
              <div className="min-w-0 max-w-full">
                <ScoreRadar items={summary.radar} />
              </div>
            </div>
          )}
          <div className="mt-3">
            <VerdictCard
              verdict={summary.verdict}
              /* 축이 모자랄 때만 — 확인된 축의 이름·근거("금리 환경(기준금리 2.5%)")를 결론 아래 한 줄로 */
              toneLine={summary.toneLine}
              emptyTilesLine={summary.emptyTilesLine}
              fold
              hideMetric={summary.score != null}
            />
          </div>
          <p className="mt-1.5 t-caption text-text-3">참고용 요약 · 투자 권유 아님</p>
        </section>
      )}
      {signals && <SignalBoard report={signals} idPrefix="complex" className="mt-3 rise-in-1" />}
    </>
  );
}
