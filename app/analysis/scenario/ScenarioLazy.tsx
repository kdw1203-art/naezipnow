"use client";

import nextDynamic from "next/dynamic";

/* [1026b · 시나리오·비교] 번들 여유 — /analysis/scenario 첫 묶음이 494KB(미등재 상한 495 · Vercel 은 +1KB)였다.
   손잡이(조건 · 시나리오 두 카드 — 단지 검색 ComplexPicker · 지역 목록 seoul-districts · ⓘ 설명 사전 · Segmented · TweenNumber)와
   첫 화면 아래 세부(결과 세 칸 · 월 부담 비교 · 보유 현황 · AI 코멘트 — 등락 표기 · 부담 판정 calc-summary)를 첫 로드에서 뗀다
   (PreContractCheckLazy 와 같은 방식 · ssr:false). 자리 틀은 같은 카드 높이로 그려 레이아웃이 튀지 않게 한다. */

/** 조건 · 시나리오 두 카드 높이(레일 340 · 폰 접이식 안) */
function ControlsShell() {
  return (
    <div aria-busy="true" aria-label="조건 불러오는 중" className="flex flex-col gap-3">
      <section className="card rounded-2xl p-4 max-md:p-3.5">
        <div className="h-6 w-16 rounded bg-bg" />
        <div className="mt-3 h-[62px] w-full rounded-lg bg-bg" />
        <div className="mt-3 h-[62px] w-full rounded-lg bg-bg" />
        <div className="mt-3 h-[380px] w-full rounded-lg bg-bg" />
        <div className="mt-3 h-[136px] w-full rounded-lg bg-bg" />
      </section>
      <section className="card rounded-2xl p-4 max-md:p-3.5">
        <div className="h-6 w-20 rounded bg-bg" />
        <div className="mt-3 h-[110px] w-full rounded-lg bg-bg" />
        <div className="mt-3 h-[110px] w-full rounded-lg bg-bg" />
        <div className="mt-3 h-16 w-40 rounded-lg bg-bg" />
      </section>
    </div>
  );
}

/** 결과 세 칸 · 월 부담 비교 · 보유 현황 · AI 코멘트 높이 */
function DetailsShell() {
  return (
    <div aria-busy="true" aria-label="세부 결과 불러오는 중" className="flex flex-col gap-3">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <div className="card h-[118px] rounded-2xl max-md:hidden" />
        <div className="card h-[118px] rounded-2xl max-md:hidden" />
        <div className="card h-[118px] rounded-2xl" />
      </div>
      <div className="card h-[170px] rounded-2xl" />
      <div className="card h-[150px] rounded-2xl" />
      <div className="card h-[150px] rounded-2xl" />
    </div>
  );
}

export const ScenarioControlsLazy = nextDynamic(() => import("./ScenarioControls").then((m) => m.ScenarioControls), {
  ssr: false,
  loading: () => <ControlsShell />,
});

export const ScenarioDetailsLazy = nextDynamic(() => import("./ScenarioDetails").then((m) => m.ScenarioDetails), {
  ssr: false,
  loading: () => <DetailsShell />,
});

export { ControlsShell };
