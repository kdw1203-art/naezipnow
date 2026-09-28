"use client";
/* [1023 · AI 분석] 로그인 카드에 .hub-start(게스트 카드와 같은 최소 높이) — 세션 판정 뒤 바꿔 끼울 때 레이아웃 점프를 줄인다. */

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
    <div className="card tile hub-start flex flex-col gap-3 rounded-lg p-4 md:flex-row md:items-center md:justify-between">
      <div className="flex flex-col gap-1">
        {/* [1015 · 규칙 D] 사실 한 줄(숫자) — 기능 설명("점수화하고 … 정리해 드려요")은 걷었다 */}
        <span className="t-section text-ink">
          {myNoteCount !== null
            ? myNoteCount > 0
              ? `내 임장노트 ${myNoteCount}건`
              : "작성한 임장노트 없음"
            : "내 임장노트"}
        </span>
      </div>
      {/* [1015 · 규칙 J] 채움 파랑은 화면당 1개(노트 AI 분석 카드의 "분석 실행") — 여기는 outline */}
      {myNoteCount === 0 ? (
        <Link href="/notes/new" className="btn-outline btn-md shrink-0">
          첫 노트 쓰기
        </Link>
      ) : (
        <a href="#ai-note-analysis" className="btn-outline btn-md shrink-0">
          내 노트로 분석 열기
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
    <span className="fit flex flex-col gap-0.5 rounded-lg bg-bg px-2.5 py-1.5">
      <span className="t-num t-section t-fit text-ink">{myNoteCount}건</span>
      <span className="t-caption t-fit text-text-3">분석을 기다리는 내 임장노트</span>
    </span>
  );
}
