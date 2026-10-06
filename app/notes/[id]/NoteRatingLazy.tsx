"use client";

import nextDynamic from "next/dynamic";
import type { ComponentProps } from "react";
import type { NoteRating as Rating } from "./NoteRating";

/* [1043 · 임장노트 참여] 독자 평가를 따로 받는 청크로 — 단지 화면의 TxTrendLazy 와 같은 방식.
   서버 렌더는 그대로다(첫 HTML 에 평균·인원·별이 있다 — ssr:false 가 아니다). 라우트 번들(/notes/[id] 상한 495KB)에는
   이 얇은 파일만 잡힌다. 클라이언트 이동으로 처음 그릴 때만 같은 높이의 빈 판이 잠깐 보인다. */
const NoteRating = nextDynamic(() => import("./NoteRating").then((m) => m.NoteRating), {
  loading: () => <div className="skeleton h-[68px] w-full rounded-lg" aria-hidden="true" />,
});

export function NoteRatingLazy(props: ComponentProps<typeof Rating>) {
  return <NoteRating {...props} />;
}

export default NoteRatingLazy;
