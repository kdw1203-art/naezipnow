"use client";

import nextDynamic from "next/dynamic";
import type { ComponentProps } from "react";
import type { TxTrendSection as Section } from "./TxTrendSection";

/* [1024 · 단지 상세] 타입 탭 + 매매|전세|월세 + 기간 칩 + 추이 그래프를 따로 받는 청크로 — PriceTrendLazy 와 같은 방식.
   서버 렌더는 그대로(첫 HTML 에 그래프가 있다 — ssr:false 가 아니다)이고, 라우트 번들 예산(478/480KB)에는 이 얇은 파일만
   잡힌다. 클라이언트 이동으로 처음 그릴 때만 같은 높이의 빈 판이 잠깐 보인다. */
const TxTrendSection = nextDynamic(() => import("./TxTrendSection").then((m) => m.TxTrendSection), {
  loading: () => <div className="skeleton h-[420px] w-full rounded-lg" aria-hidden="true" />,
});

export function TxTrendLazy(props: ComponentProps<typeof Section>) {
  return <TxTrendSection {...props} />;
}

export default TxTrendLazy;
