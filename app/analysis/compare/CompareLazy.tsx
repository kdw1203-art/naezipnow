"use client";

import nextDynamic from "next/dynamic";
import { SkTable } from "@/app/components/ui/Skeleton";

/* [1026b · 시나리오·비교] 번들 — /analysis/compare 첫 묶음(486KB)에서 무거운 클라이언트 부분을 뗀다(PreContractCheckLazy 와 같은 방식 · ssr:false):
   비교표(레이더 · ⓘ 설명 사전) · 내 기준 순위(Segmented · TweenNumber · 순위 계산) · 후보 지역 스냅샷(등락 표기) · 단지 검색(ComplexPicker).
   첫 묶음에는 담기 상태 · 비교 조회 · 결론 · 절차 · 다음 행동만 남는다. 자리 틀은 같은 카드 높이로 그려 레이아웃이 튀지 않게 한다. */

function TableShell() {
  return (
    <section aria-busy="true" aria-label="단지별 실거래 비교표 불러오는 중" className="card flex flex-col gap-3 rounded-2xl p-4 max-md:p-3.5">
      <div className="h-6 w-40 rounded bg-bg" />
      <SkTable rows={3} />
    </section>
  );
}

export const CompareTableLazy = nextDynamic(() => import("./CompareTable").then((m) => m.CompareTable), {
  ssr: false,
  loading: () => <TableShell />,
});

export const MyCriteriaRankLazy = nextDynamic(() => import("./MyCriteriaRank").then((m) => m.MyCriteriaRank), {
  ssr: false,
  loading: () => <div aria-busy="true" className="card h-[480px] rounded-2xl" />,
});

export const RegionMarketSummaryLazy = nextDynamic(() => import("./RegionMarketSummary").then((m) => m.RegionMarketSummary), {
  ssr: false,
  loading: () => <div aria-busy="true" className="card h-[112px] rounded-2xl" />,
});

/** 단지 검색 입력 — 라벨(18) + 입력(40) 높이 */
export const ComparePickerLazy = nextDynamic(() => import("./ComparePicker").then((m) => m.ComparePicker), {
  ssr: false,
  loading: () => (
    <div aria-busy="true" aria-label="단지 검색 불러오는 중" className="flex flex-col gap-1">
      <div className="h-4 w-28 rounded bg-bg" />
      <div className="h-10 w-full rounded-lg bg-bg" />
    </div>
  ),
});
