"use client";

import { HomeWatchlistBrief } from "@/app/components/HomeWatchlistBrief";
import { HomeMyRegions } from "@/app/components/home/HomeMyRegions";

/* [1131 · 홈에서 옮겨 온 묶음] 내 관심단지 주간 브리핑 · 내 관심 지역 — 홈 첫 화면 위에 로그인한 사람에게만 뜨던 것.
   홈에서는 자리를 차지하지 않고 마이에서 본다(출석 · 포인트 · 최근 본 단지는 마이에 이미 있다). 둘 다 비면 아무것도 그리지 않는다. */
export function MyHomeBrief() {
  return (
    <>
      <HomeMyRegions />
      <HomeWatchlistBrief />
    </>
  );
}

export default MyHomeBrief;
