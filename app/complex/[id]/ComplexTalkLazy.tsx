"use client";

import { useRef } from "react";
import nextDynamic from "next/dynamic";
import type { TalkScope } from "@/app/components/talk/TalkPanel";
import { useNearViewport } from "./use-near-viewport";

/* [1057 · B8] 단지 토론 — 홈 실시간 토론판(TalkPanel)을 이 단지 범위로(그 단지에 붙은 글만 · 쓰면 단지·지역이 함께 저장).
   ComplexReviewsLazy 와 같은 방식: 라우트 번들(/complex/[id] 480KB 상한)에는 이 얇은 래퍼만 실리고, 판 코드는 섹션 자리가
   뷰포트 400px 앞에 들어올 때 따로 받는다. 그 전·받는 동안은 같은 높이의 빈 판(서버 HTML 에 사용자 글은 싣지 않는다 — ISR).
   [1058 · C1] 관찰자 코드는 use-near-viewport 한 훅으로(ComplexReviewsLazy 와 복제돼 있었다). */

const TalkPanel = nextDynamic(() => import("@/app/components/talk/TalkPanel").then((m) => m.TalkPanel), {
  ssr: false,
  loading: () => <TalkSkeleton />,
});

function TalkSkeleton() {
  return <div className="skeleton h-[320px] w-full rounded-xl" aria-hidden="true" />;
}

export function ComplexTalkLazy({ scope }: { scope: TalkScope }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const near = useNearViewport(ref, "400px 0px");

  return <div ref={ref}>{near ? <TalkPanel variant="home" scope={scope} /> : <TalkSkeleton />}</div>;
}

export default ComplexTalkLazy;
