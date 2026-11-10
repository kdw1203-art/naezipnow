"use client";

import dynamic from "next/dynamic";
import type { ComponentProps } from "react";
import type { HomeRegionTable as Body } from "./HomeRegionTableBody";

/* [1127 · 번들] 지역 동향 표(1125 부터 순서 칩이 있어 클라이언트 조각)를 따로 받는 청크로 — ScrubLineLazy(1009)와 같은 방식.
   서버 렌더는 그대로(첫 그림 · 크롤 HTML 에 표가 있다). 홈 첫 번들에서 표 · 등락 표기 코드가 빠진다(예산 495KB).
   클라이언트 이동으로 처음 그릴 때만 같은 높이의 빈 판이 잠깐 보인다. */
const Table = dynamic(() => import("./HomeRegionTableBody").then((m) => m.HomeRegionTable), {
  loading: () => <div className="skeleton h-[420px] w-full rounded-lg" aria-hidden="true" />,
});

export function HomeRegionTable(props: ComponentProps<typeof Body>) {
  return <Table {...props} />;
}

export default HomeRegionTable;
