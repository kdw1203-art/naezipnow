"use client";

import nextDynamic from "next/dynamic";
import type { ComponentProps } from "react";
import type { RoadviewButton as RoadviewButtonType } from "@/components/map/RoadviewButton";

/* [v4] 거리뷰 버튼을 따로 받는 청크로 — ExplainLazy·ScrubLineLazy 와 같은 방식.
   왜: RoadviewButton 은 네이버 지도 SDK 로더(lib/map/naver-maps-sdk, 460여 줄)를 함께 싣는데 단지 허브의 첫 로드 JS 에
   통째로 들어 있었다(/complex/[id] 478/480KB). 거리뷰는 요약 목록의 한 행 오른쪽 조작이라 첫 그림에 필요 없다 —
   하이드레이션 뒤 청크를 받아 버튼이 나타난다(서버 HTML 에는 행 이름만). 동작·SDK 인증 실패 폴백은 그대로다. */
const RoadviewButton = nextDynamic(
  () => import("@/components/map/RoadviewButton").then((m) => m.RoadviewButton),
  { ssr: false },
);

export function RoadviewLazy(props: ComponentProps<typeof RoadviewButtonType>) {
  return <RoadviewButton {...props} />;
}

export default RoadviewLazy;
