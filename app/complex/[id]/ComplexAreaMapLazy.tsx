"use client";

import nextDynamic from "next/dynamic";
import type { ComponentProps } from "react";
import type { ComplexAreaMap as ComplexAreaMapType } from "./ComplexAreaMap";

/* [1047] 단지 위치 지도를 따로 받는 청크로 — RoadviewLazy 와 같은 방식(단지 화면 첫 로드 JS 예산을 건드리지 않는다).
   서버 HTML 에는 같은 높이의 빈 판만 — 하이드레이션 뒤 지도·주변 정보가 채운다. */
const ComplexAreaMap = nextDynamic(() => import("./ComplexAreaMap").then((m) => m.ComplexAreaMap), {
  ssr: false,
  loading: () => <div aria-hidden className="card h-[380px] animate-pulse rounded-2xl" />,
});

export function ComplexAreaMapLazy(props: ComponentProps<typeof ComplexAreaMapType>) {
  return <ComplexAreaMap {...props} />;
}

export default ComplexAreaMapLazy;
