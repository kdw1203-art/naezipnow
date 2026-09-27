"use client";

import { useEffect, useRef, useState } from "react";
import nextDynamic from "next/dynamic";
import { useHubPicked } from "./hub-context";
import { useHubViewer } from "./hub-viewer";
import { ROW_CLASS, RowChevron, RowText } from "./hub-row";

/* ============================================================
   "임장노트 분석" 행 — 허브 "내 임장노트" 목록의 첫 행. 펼치면 임장노트 AI 분석(노트 고르기 → 실행)이 열린다.

   [v4 · 한 화면 한 가지] 예전엔 이 자리가 세 덩어리였다 — 로그인/게스트 시작 카드(채움 파랑 단추) ·
   "임장노트 분석" 도구 카드(/notes 링크) · "임장노트 AI 분석" 실행 카드(아이콘 타일 · 설명 문장 · 채움 파랑
   "분석 실행"). 같은 일(내 노트를 점수화해 강점·약점·확인 항목 정리)을 세 번 말하고 있었다.
   → **행 하나**(이름 + 결과 한 줄 / 오른쪽 내 노트 수)로 합치고, 실행 몸통은 펼칠 때만 내려받는다.

   [1007] 로그인 여부(loggedIn)와 ?noteId= 는 서버가 아니라 여기서 읽는다 —
   /analysis 를 ISR 로 굳히기 위해서다(하루 1,828회 함수 호출, 사람 방문 한 자릿수).
   몸통(ai-note-analysis)은 **펼친 뒤에만** 내려받는다(next/dynamic) — 첫 로드 묶음 밖.
   ?noteId= 로 들어오면(노트 상세 "이 노트로 AI 분석 받기") 행을 펼쳐 둔 채 그 자리로 스크롤한다 —
   예전엔 그 노트가 선택된 카드가 화면 맨 아래에 있어 찾아 내려가야 했다.
   ============================================================ */

const AiNoteAnalysisCard = nextDynamic(
  () => import("./ai-note-analysis").then((m) => m.AiNoteAnalysisCard),
  { ssr: false, loading: () => <NoteAnalysisPlaceholder /> },
);

/** 세션 판정·묶음 다운로드 동안의 자리표시자 — 실행 단추 높이만큼 */
function NoteAnalysisPlaceholder() {
  return <div aria-busy="true" className="h-11 rounded-lg bg-bg" />;
}

export function HubNoteRow({ title, sub }: { title: string; sub: string }) {
  const { picked } = useHubPicked();
  const { loggedIn, myNoteCount } = useHubViewer();
  const [noteId, setNoteId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDetailsElement | null>(null);

  /* ?noteId= 컨텍스트 — 마운트 뒤 한 번만(정적 셸에서 useSearchParams 는 Suspense 없이는 프리렌더를 깬다) */
  useEffect(() => {
    let id: string | null = null;
    try {
      id = new URLSearchParams(window.location.search).get("noteId")?.trim() || null;
    } catch {
      /* URL 파싱 실패 — 컨텍스트 없이 */
    }
    if (!id) return;
    setNoteId(id);
    setOpen(true);
    requestAnimationFrame(() => ref.current?.scrollIntoView({ block: "start" }));
  }, []);

  return (
    <li>
      <details
        ref={ref}
        id="ai-note-analysis"
        open={open}
        onToggle={(e) => setOpen(e.currentTarget.open)}
        className="group scroll-mt-24"
      >
        {/* 네이티브 <details> 토글 — summary 줄 전체가 컨트롤이다 */}
        <summary className={`${ROW_CLASS} cursor-pointer list-none [&::-webkit-details-marker]:hidden`}>
          <RowText title={title} sub={sub} />
          {/* 로그인 + 내 노트 실카운트가 있을 때만 숫자(가짜 0 금지) */}
          {loggedIn && myNoteCount ? (
            <span className="shrink-0 t-section t-num text-ink">{myNoteCount.toLocaleString("ko-KR")}편</span>
          ) : null}
          <RowChevron className="rotate-90 transition-transform group-open:-rotate-90" />
        </summary>
        {open && (
          <div className="pb-4">
            {loggedIn === null ? (
              <NoteAnalysisPlaceholder />
            ) : (
              <AiNoteAnalysisCard
                noteId={noteId}
                loggedIn={loggedIn}
                seedComplexName={picked?.name ?? null}
                seedRegionId={picked?.regionId ?? null}
                seedRegionLabel={picked?.regionLabel ?? null}
              />
            )}
          </div>
        )}
      </details>
    </li>
  );
}
