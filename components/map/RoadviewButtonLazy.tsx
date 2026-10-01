"use client";
/* [1026c · 번들] 거리뷰 버튼은 네이버 지도 SDK 로더(lib/map/naver-maps-sdk)를 끌고 온다 — 단지 상세 첫 로드에서 떼어 낸다
   (배포 빌드 /complex/[id] 479KB / 예산 480KB). 누르기 전에는 SDK 를 받지 않는 건 예전과 같다. 자리 틀은 같은 크기의 빈칸. */
import nextDynamic from "next/dynamic";

const RoadviewButtonBody = nextDynamic(() => import("./RoadviewButton").then((m) => m.RoadviewButton), {
  ssr: false,
  loading: () => <span aria-hidden="true" className="inline-block h-[30px] w-[76px] shrink-0" />,
});

export function RoadviewButtonLazy(props: { lat: number; lng: number; label?: string }) {
  return <RoadviewButtonBody {...props} />;
}
