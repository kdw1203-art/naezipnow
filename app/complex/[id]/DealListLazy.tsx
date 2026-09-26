"use client";

import nextDynamic from "next/dynamic";
import type { ComponentProps } from "react";
import type { DealList as DealListType } from "./DealList";

/* [1009 · C] 실거래 한 건 목록을 따로 받는 청크로 — 목록 부품 + 금액·면적 표기(eok-man·area-unit, terser ≈ 3KB)가
   허브 라우트 번들(472/480KB)에 실리지 않게. 서버 HTML 은 그대로(요약 탭은 기본 탭이라 첫 HTML 에 목록이 있다). */
const DealList = nextDynamic(() => import("./DealList").then((m) => m.DealList), {
  loading: () => <div className="skeleton h-[290px] w-full rounded-xl" aria-hidden="true" />,
});

export function DealListLazy(props: ComponentProps<typeof DealListType>) {
  return <DealList {...props} />;
}

export default DealListLazy;
