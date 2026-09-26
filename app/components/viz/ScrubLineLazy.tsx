"use client";

import dynamic from "next/dynamic";
import type { ComponentProps } from "react";
import type { ScrubLine as ScrubLineType } from "./ScrubLine";

/* [1009] ScrubLine 을 따로 받는 청크로 — 서버 렌더는 그대로(첫 그림에 차트가 있다), 브라우저는
   이 청크를 받은 뒤 그 부분만 살아난다. 라우트 번들 예산(app-build-manifest 의 라우트 파일 목록)에
   잡히지 않으므로 예산이 빠듯한 /complex/[id](472/480)·/map(354/375)·/notes/new(466/470)는 이쪽을 쓴다.
   클라이언트 이동으로 처음 그릴 때만 잠깐 같은 높이의 빈 판(스켈레톤)이 보인다 — 자리가 흔들리지 않게. */
const ScrubLine = dynamic(() => import("./ScrubLine"), {
  /* [1009 · 리뷰 RA] 머리(약 52px)+차트(176)+출처 줄(약 28) ≈ 256 — 228 이면 받은 뒤 아래가 밀렸다 */
  loading: () => <div className="skeleton h-[256px] w-full rounded-[10px]" aria-hidden="true" />,
});

export function ScrubLineLazy(props: ComponentProps<typeof ScrubLineType>) {
  return <ScrubLine {...props} />;
}

export default ScrubLineLazy;
