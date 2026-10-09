"use client";

import nextDynamic from "next/dynamic";
import type { ComponentProps } from "react";
import type { NoteComments as Comments } from "./NoteComments";
import type { NoteAudioTools as AudioTools } from "./NoteAudioTools";
import type { NoteSoftWall as SoftWall } from "./NoteSoftWall";

/* [1051 · 배포 막힘] 노트 상세(/notes/[id])가 Vercel 빌드에서 496KB 로 미등재 상한(495KB)을 넘어 1047·1048 배포가 실패했다
   (로컬 495.2KB — Vercel 은 로컬에 없는 공개 설정값이 번들에 들어가 조금 더 크다). 독자 평가(NoteRatingLazy, 1043)와 같은 방식으로
   댓글 · 음성 메모 도구 · 가입 배너를 따로 받는 청크로 뺀다. 서버 렌더는 그대로(ssr:false 가 아니다 — 첫 HTML 에 댓글이 있다).
   라우트 번들에는 이 얇은 파일만 잡힌다. 클라이언트 이동으로 처음 그릴 때만 같은 자리의 빈 판이 잠깐 보인다. */
const LazyComments = nextDynamic(() => import("./NoteComments").then((m) => m.NoteComments), {
  loading: () => <div className="skeleton h-[120px] w-full rounded-lg" aria-hidden="true" />,
});
const LazyAudioTools = nextDynamic(() => import("./NoteAudioTools").then((m) => m.NoteAudioTools));
const LazySoftWall = nextDynamic(() => import("./NoteSoftWall").then((m) => m.NoteSoftWall));

export function NoteCommentsLazy(props: ComponentProps<typeof Comments>) {
  return <LazyComments {...props} />;
}

export function NoteAudioToolsLazy(props: ComponentProps<typeof AudioTools>) {
  return <LazyAudioTools {...props} />;
}

export function NoteSoftWallLazy(props: ComponentProps<typeof SoftWall>) {
  return <LazySoftWall {...props} />;
}
