"use client";

import nextDynamic from "next/dynamic";
import type { ComponentProps } from "react";
import type { PriceTrendPanel as Panel } from "./PriceTrendPanel";

/* [1009 · C] 실거래가 추이(평형 탭 + ScrubLine)를 따로 받는 청크로 — ScrubLineLazy 와 같은 방식.
   서버 렌더는 그대로(첫 HTML 에 그래프가 있다)이고, 라우트 번들 예산(/complex/[id] 472/480KB)에는 이 얇은 파일만 잡힌다.
   클라이언트 이동으로 처음 그릴 때만 같은 높이의 빈 판이 잠깐 보인다(자리가 흔들리지 않게). */
const PriceTrendPanel = nextDynamic(() => import("./PriceTrendPanel").then((m) => m.PriceTrendPanel), {
  loading: () => <div className="skeleton h-[372px] w-full rounded-[14px]" aria-hidden="true" />,
});

export function PriceTrendLazy(props: ComponentProps<typeof Panel>) {
  return <PriceTrendPanel {...props} />;
}

export default PriceTrendLazy;
