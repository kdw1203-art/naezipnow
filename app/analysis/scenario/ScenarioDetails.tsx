"use client";
/* [1026b · 시나리오·비교] 세부 — 결론·대표 그림(금리 스트레스 곡선) 아래에 오는 결과 카드들. 예전 결과 열의 카드를 순서·계산 그대로 옮겼다:
   결과 세 칸(월 원리금 · 금리 +1.0%p · 시세 변동 자산) → 시나리오별 월 부담 비교 → N년 보유 시 상환 현황 → AI 코멘트(규칙 기반 요약 · 면책).
   폰은 결론과 겹치는 앞 두 칸을 숨긴다(1026 면적대별 숫자 줄과 같은 규칙). 첫 화면 아래라 next/dynamic(ssr:false · ScenarioLazy.tsx)으로
   싣는다 — ⓘ 설명 사전 · 등락 표기 · 부담 판정(calc-summary)이 첫 묶음에서 빠진다. 숫자는 computeScenario 결과 그대로(새 계산 없음). */

import { useMemo } from "react";
import { TweenNumber } from "@/app/components/motion/TweenNumber";
import { Explain } from "@/app/components/explain/Explain";
import { Delta } from "@/app/components/num/Delta";
import { DELTA_ARROW, DELTA_CLASS, DELTA_WORD, deltaDir, pctChange } from "@/lib/format/delta";
import type { ScenarioCalc } from "@/lib/market/scenario-calc";
import { burdenOf, scenarioWon } from "@/lib/market/scenario-conclusion";

type BaselineLite = { regionName: string; period: string; avgSaleLabel: string };

/* [1009 · A] 부담 판정은 상태색 — 적정 초록 · 주의 주황 · 위험 빨강(글자색). 경계는 대출 계산기와 하나(burdenLabel). */
function dsrTone(v: number) {
  const label = burdenOf(v);
  return { label, cls: label === "적정" ? "text-success" : label === "주의" ? "text-warning" : "text-danger" };
}

const CARD = "card flex flex-col gap-3 rounded-2xl p-4 max-md:p-3.5";

export function ScenarioDetails({
  calc,
  pricePct,
  baseline,
  incomeManwon,
  ltvPct,
}: {
  calc: ScenarioCalc;
  pricePct: number;
  /** 실시세 기준가 — 없으면 예시 시세 */
  baseline: BaselineLite | null;
  incomeManwon: number;
  ltvPct: number;
}) {
  const aiComment = useMemo(() => {
    const stress = dsrTone(calc.dsrStress);
    const head = baseline
      ? `${baseline.regionName} 평균 매매가 ${baseline.avgSaleLabel}(${baseline.period} 기준) 실데이터와 입력하신 조건(연 소득 ${incomeManwon.toLocaleString("ko-KR")}만원 · 대출 ${ltvPct}%)으로 계산했습니다.`
      : `예시 시세(8.4억)와 입력하신 조건(연 소득 ${incomeManwon.toLocaleString("ko-KR")}만원 · 대출 ${ltvPct}%) 기준입니다. 지역을 선택하면 실제 평균가로 다시 계산합니다.`;
    const body =
      stress.label !== "위험"
        ? `금리 1%p 상승 시에도 월 ${scenarioWon(calc.payStress)}(소득 대비 ${(calc.dsrStress * 100).toFixed(0)}%)로 ${stress.label} 범위입니다.`
        : `금리 1%p 상승 시 월 ${scenarioWon(calc.payStress)}(소득 대비 ${(calc.dsrStress * 100).toFixed(0)}%)로 부담이 커집니다. 대출 비율을 낮추거나 예산을 재조정하세요.`;
    const hold = ` ${calc.holdYears}년 보유 시 누적 이자는 약 ${scenarioWon(calc.holdInterest)}, 잔여 원금은 ${scenarioWon(calc.holdBalance)}입니다.`;
    const tail =
      pricePct < 0
        ? ` 시세 ${pricePct}% 시나리오에서 LTV는 ${calc.ltvAfter.toFixed(0)}%로 ${calc.ltvAfter < 60 ? "안전권" : "주의 구간"}입니다.`
        : "";
    return `${head} ${body}${hold}${tail}`;
  }, [baseline, calc, pricePct, incomeManwon, ltvPct]);

  const dsrNow = dsrTone(calc.dsr);
  const dsrStress = dsrTone(calc.dsrStress);
  const dir = deltaDir(pricePct);

  return (
    <div className="flex flex-col gap-3">
      {/* 결과 세 칸 — [1026b] 폰은 결론 한 줄과 겹치는 앞 두 칸을 숨기고 시세 변동 칸만 */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <div className="card rounded-2xl p-4 max-md:hidden">
          <div className="t-sub text-text-3">월 원리금 ({calc.rate.toFixed(2)}%)</div>
          <TweenNumber value={calc.pay / 10_000} format="eokmanwon" className="mt-1 block t-title text-ink" />
          <div className={`mt-0.5 inline-flex flex-wrap items-center gap-0.5 t-sub font-bold ${dsrNow.cls}`}>
            소득 대비 {(calc.dsr * 100).toFixed(0)}% · {dsrNow.label}
            <Explain
              term="dsr"
              title="소득 대비 상환 부담"
              body="이 화면의 '소득 대비'는 이 대출 하나만 넣은 값이라 실제 DSR(모든 대출 합산)보다 낮게 나와요."
              how={[
                "소득 대비 = 이 대출의 1년 원리금(월 상환액 × 12) ÷ 연 소득",
                "30% 이하 적정 · 40% 이하 주의 · 40% 넘으면 위험(대출 계산기와 같은 참고 기준)",
                "30년 원리금균등 상환, 금리는 위에서 고른 값 그대로",
              ]}
            />
          </div>
        </div>
        <div className="card rounded-2xl p-4 max-md:hidden">
          <div className="t-sub text-text-3">금리 +1.0%p 시 월 원리금</div>
          <TweenNumber value={calc.payStress / 10_000} format="eokmanwon" className="mt-1 block t-title text-ink" />
          {/* [1009 · A] 오류색으로 칠하던 금액 → "지금 대비 ▲ 얼마" 로 무엇이 늘었는지 말한다 */}
          <div className="mt-0.5 flex flex-wrap items-baseline gap-x-1.5 t-sub">
            <Delta pct={pctChange(calc.payStress, calc.pay)} diffManwon={(calc.payStress - calc.pay) / 10_000} srContext="지금보다" />
            <span className="t-caption text-text-3">지금 대비</span>
          </div>
          <div className={`mt-0.5 t-sub font-bold ${dsrStress.cls}`}>
            소득 대비 {(calc.dsrStress * 100).toFixed(0)}% · {dsrStress.label}
          </div>
        </div>
        <div className="card rounded-2xl p-4 max-md:p-3.5">
          <div className="t-sub text-text-3">
            시세 {pricePct === 0 ? "보합" : `${pricePct > 0 ? "+" : ""}${pricePct}%`} 시 자산 변화
          </div>
          {/* 등락 관례 — 오르면 빨강 ▲, 내리면 파랑 ▼ */}
          {!dir || dir === "flat" ? (
            <div className="mt-1 t-title delta-flat">보합 · 0원</div>
          ) : (
            <div className={`mt-1 t-title ${DELTA_CLASS[dir]}`}>
              <span aria-hidden="true">{DELTA_ARROW[dir]} </span>
              <span className="sr-only">{DELTA_WORD[dir]} </span>
              <TweenNumber value={Math.abs(calc.priceDeltaWon) / 10_000} format="eokmanwon" />
            </div>
          )}
          <div className="mt-0.5 t-sub text-text-3">
            LTV {calc.ltvAfter.toFixed(0)}%로 {pricePct < 0 ? "상승" : "변동"} · {calc.ltvAfter < 60 ? "안전권" : "주의"}
          </div>
        </div>
      </div>

      <section className={CARD} data-reveal="">
        <h2 className="t-section text-ink">시나리오별 월 부담 비교</h2>
        <div className="flex flex-col gap-2.5">
          {calc.bars.map((b) => (
            <div key={b.label} className="flex items-center gap-3">
              <span className="w-[90px] shrink-0 t-sub text-text-2">{b.label}</span>
              <div className="relative h-[22px] flex-1 rounded-md bg-bg">
                <div
                  className="absolute left-0 flex h-[22px] items-center justify-end rounded-md pr-2 t-sub font-bold text-white transition-[width] duration-200 ease-out motion-reduce:transition-none"
                  style={{ width: `${Math.max(18, Math.round((b.pay / calc.maxPay) * 92))}%`, background: b.color }}
                >
                  {scenarioWon(b.pay)}
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 보유기간 결과 — 3·5·10년 칩이 실제로 계산에 연결된 자리 */}
      <section className={CARD}>
        <div className="flex flex-wrap items-baseline gap-x-2">
          <h2 className="t-section text-ink">{calc.holdYears}년 보유 시 상환 현황</h2>
          <span className="t-sub font-semibold text-text-3">30년 원리금균등 · 금리 {calc.rate.toFixed(2)}% 고정 가정</span>
        </div>
        <div className="grid grid-cols-3 gap-3 text-center max-md:gap-2">
          {[
            ["갚은 원금", calc.holdPrincipal],
            ["낸 이자 (누적)", calc.holdInterest],
            ["잔여 원금", calc.holdBalance],
          ].map(([k, v]) => (
            <div key={k as string} className="rounded-lg bg-bg px-2 py-3">
              <div className="t-sub text-text-3">{k}</div>
              <TweenNumber value={(v as number) / 10_000} format="eokmanwon" className="mt-1 block t-section break-words text-ink" />
            </div>
          ))}
        </div>
      </section>

      {/* [1023] 흰 카드 위 잉크 토큰 — 예전 네이비 .ai-panel */}
      <div className="flex flex-col gap-2 rounded-2xl border border-line bg-bg p-4 max-md:p-3.5">
        <div className="flex items-start gap-3">
          <span className="inline-flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-lg border border-line t-caption font-bold text-ink">AI</span>
          <div className="flex-1 t-body text-text-1">{aiComment}</div>
          <span className="shrink-0 rounded border border-line px-1.5 py-px t-caption font-bold text-text-3">규칙 기반 요약</span>
        </div>
        <div className="t-caption text-text-3">본 분석은 참고용이며 투자 판단의 책임은 이용자에게 있습니다.</div>
      </div>
    </div>
  );
}

export default ScenarioDetails;
