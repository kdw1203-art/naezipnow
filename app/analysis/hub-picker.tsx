"use client";
/* [1022 · 정렬·글씨·테마] 지시 4 — 임의 px(text-[NNpx]·text-xs) → 램프 유틸(t-caption/t-sub/t-body/t-section/t-title) · 이모지 아이콘 식별자 → 선 아이콘 이름. 구조·데이터 변경 없음. */

import { useEffect, useState } from "react";
import nextDynamic from "next/dynamic";
import { Icon } from "@/app/components/Icon";
import { useHubPicked } from "./hub-context";
import { useHubViewer } from "./hub-viewer";

/* ============================================================
   임장노트 AI 분석 — 허브에서 "내 기록" 계열의 실행 카드.

   [UI-01·05] 예전에는 이 자리에 **단지 선택기 카드가 하나 더** 있었다.
   히어로에 검색을 올리면서(UI-05) 그 카드는 통째로 사라졌다 — 한 화면에
   같은 검색창이 둘일 이유가 없고, 진입점 23개를 줄이는 첫 삭제이기도 하다.
   고른 단지는 이제 허브 전체가 공유한다(hub-context).

   [1007] 로그인 여부(loggedIn)와 ?noteId= 는 서버가 아니라 여기서 읽는다 —
   /analysis 를 ISR 로 굳히기 위해서다(하루 1,828회 함수 호출, 사람 방문 한 자릿수).
   카드 본체(ai-note-analysis, 15KB 소스)는 세션 판정이 끝난 뒤에만 내려받는다
   (next/dynamic) — 첫 로드 번들에서 빠져 예산(490KB, 실측 488)에 여유가 생긴다.
   판정 전에는 같은 상자 크기의 머리글+비활성 버튼(자리표시자)만 그린다.
   ============================================================ */

const AiNoteAnalysisCard = nextDynamic(
  () => import("./ai-note-analysis").then((m) => m.AiNoteAnalysisCard),
  { ssr: false, loading: () => <NoteAnalysisPlaceholder /> },
);

/** 세션 판정·묶음 다운로드 동안의 자리표시자 — 실제 카드의 머리글·버튼과 같은 높이 규칙 */
function NoteAnalysisPlaceholder() {
  return (
    /* [1071] 실제 카드의 새 머리줄(칩 · 이름 · 오른쪽 단추 한 줄)과 같은 모양 — 판정 뒤 바꿔 끼울 때 덜컹거리지 않게 */
    <div className="card flex flex-col gap-2.5 rounded-2xl px-3 py-3" aria-busy="true">
      <div className="flex min-h-11 items-center gap-2.5">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-warning-soft text-warning" aria-hidden="true">
          <Icon name="bot" size={17} />
        </span>
        <span className="min-w-0 flex-1 t-body font-bold text-ink">임장노트 AI 분석</span>
        <span className="h-10 w-24 shrink-0 rounded-lg bg-bg" aria-hidden="true" />
      </div>
    </div>
  );
}

export function HubNoteAnalysis({
  className,
}: {
  /** 그리드 안에 놓일 때 열 span 등 — 카드 자체는 h-full 이라 늘어난다 */
  className?: string;
}) {
  const { picked } = useHubPicked();
  const { loggedIn } = useHubViewer();
  /* ?noteId= 컨텍스트 — 마운트 뒤 한 번만(정적 셸에서 useSearchParams 는 Suspense 없이는 프리렌더를 깬다) */
  const [noteId, setNoteId] = useState<string | null>(null);
  useEffect(() => {
    try {
      setNoteId(new URLSearchParams(window.location.search).get("noteId")?.trim() || null);
    } catch {
      /* URL 파싱 실패 — 컨텍스트 없이 */
    }
  }, []);
  return (
    <div id="ai-note-analysis" className={`scroll-mt-24 ${className ?? ""}`}>
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
  );
}
