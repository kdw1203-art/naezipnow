"use client";

import { useRef } from "react";
import nextDynamic from "next/dynamic";
import type { ComponentProps } from "react";
import type { ComplexAreaMap as ComplexAreaMapType } from "./ComplexAreaMap";
import { useNearViewport } from "./use-near-viewport";

/* [1047] 단지 위치 지도를 따로 받는 청크로 — RoadviewLazy 와 같은 방식(단지 화면 첫 로드 JS 예산을 건드리지 않는다).
   서버 HTML 에는 같은 높이의 빈 판만 — 하이드레이션 뒤 지도·주변 정보가 채운다.
   [1085 · 속도] 하이드레이션 직후 바로 받던 것을 "뷰포트 600px 앞"으로 — 지도 칸은 단지 화면 아래쪽인데 첫 로드에
   지도 청크 + 네이버 SDK(90KB) + 타일 6~8장(장당 55~80KB) + /api/complex/area 조회가 같이 실렸다(운영 Lighthouse 폰:
   단지 화면 전송 1,182KB 중 지도 몫이 가장 컸다 · TBT 2.0초). 후기·토론과 같은 훅(use-near-viewport) ·
   관찰자가 없는 환경은 바로 마운트(기능을 빼지 않는다). 자리 높이는 그대로(380px) — 내려받는 동안 화면이 밀리지 않는다. */
function AreaMapPlaceholder() {
  return <div aria-hidden className="card h-[380px] rounded-2xl" />;
}

const ComplexAreaMap = nextDynamic(() => import("./ComplexAreaMap").then((m) => m.ComplexAreaMap), {
  ssr: false,
  loading: () => <div aria-hidden className="card h-[380px] animate-pulse rounded-2xl" />,
});

export function ComplexAreaMapLazy(props: ComponentProps<typeof ComplexAreaMapType>) {
  const ref = useRef<HTMLDivElement | null>(null);
  const near = useNearViewport(ref, "600px 0px");
  return <div ref={ref}>{near ? <ComplexAreaMap {...props} /> : <AreaMapPlaceholder />}</div>;
}

export default ComplexAreaMapLazy;
