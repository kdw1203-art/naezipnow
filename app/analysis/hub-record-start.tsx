"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { useHubViewer } from "./hub-viewer";

/* [1007] "내가 쓴 기록" 계열의 시작 카드 — 로그인 여부로 갈리는 두 조각을 클라이언트에서 고른다.
 *
 * 게스트 카드(공개 노트 AI 미리보기 / 빈 안내)는 **서버가 그린 JSX** 를 children(guest)으로
 * 받는다 — 그 내용은 모두에게 같아 ISR HTML 에 그대로 실리고, 클라이언트 번들에는 이 파일의
 * 로그인 카드 한 장만 들어간다(/analysis 예산 490KB, 실측 488 — 여유 2KB 라 게스트 JSX 를
 * 클라이언트로 옮기면 넘친다). 프로브 전(null)에도 게스트 카드를 보여 하이드레이션이 어긋나지
 * 않는다. 문구·CTA 는 예전 page.tsx 의 로그인 분기 그대로다. */
export function HubRecordStart({ guest }: { guest: ReactNode }) {
  const { loggedIn, myNoteCount } = useHubViewer();
  if (!loggedIn) return <>{guest}</>;
  return (
    <div className="card tile flex flex-col gap-3 rounded-[14px] p-4 md:flex-row md:items-center md:justify-between">
      <div className="flex flex-col gap-1">
        <span className="t-section text-ink">
          {myNoteCount !== null
            ? myNoteCount > 0
              ? `내 노트 ${myNoteCount}건이 분석을 기다려요`
              : "아직 작성한 임장노트가 없어요"
            : "내 노트로 바로 분석할 수 있어요"}
        </span>
        <span className="t-sub text-text-3">
          {myNoteCount === 0
            ? "첫 임장노트를 남기면 AI 분석이 열려요"
            : "기록을 점수화하고 강점·약점·체크 제안을 정리해 드려요"}
        </span>
      </div>
      {myNoteCount === 0 ? (
        <Link href="/notes/new" className="btn-primary btn-md shrink-0">
          첫 노트 쓰기
        </Link>
      ) : (
        <a href="#ai-note-analysis" className="btn-primary btn-md shrink-0">
          내 노트로 분석 시작
        </a>
      )}
    </div>
  );
}

/** 노트 도구 카드의 티저 — 로그인 + 내 노트 1건 이상일 때만(예전 noteTeaser 와 같은 마크업) */
export function HubMyNoteTeaser() {
  const { loggedIn, myNoteCount } = useHubViewer();
  if (!loggedIn || !myNoteCount) return null;
  return (
    <span className="fit flex flex-col gap-0.5 rounded-[10px] bg-bg px-2.5 py-1.5">
      <span className="t-num t-section t-fit text-ink">{myNoteCount}건</span>
      <span className="t-caption t-fit text-text-3">분석을 기다리는 내 임장노트</span>
    </span>
  );
}
