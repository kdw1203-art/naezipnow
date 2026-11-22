"use client";

import { useRef } from "react";
import nextDynamic from "next/dynamic";
import { useNearViewport } from "./use-near-viewport";

/* [1210 · 34] AI 한 줄 판정 — 자리가 뷰포트 200px 앞에 들어올 때 청크를 받아 마운트한다(그때 판정을 한 번 받는다).
   /complex/[id] 첫 로드 JS 예산(480KB) · 크롤러가 판정 조회를 띄우지 않게. 관찰자는 use-near-viewport 한 훅(1058 · C1). */
const ComplexAiVerdicts = nextDynamic(() => import("./ComplexAiVerdicts").then((m) => m.ComplexAiVerdicts), { ssr: false });

export function ComplexAiVerdictsLazy({ complexId, className = "" }: { complexId: string; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const near = useNearViewport(ref, "200px 0px");
  return <div ref={ref}>{near ? <ComplexAiVerdicts complexId={complexId} className={className} /> : null}</div>;
}

export default ComplexAiVerdictsLazy;
