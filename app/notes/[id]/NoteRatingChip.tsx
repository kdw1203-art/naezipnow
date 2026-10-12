"use client";

import { useEffect, useState } from "react";

/* [1058 · C5] 머리의 "독자 평가 4.5 · 12명" 칩. 틀린 사실: 평가를 남겨도 서버가 그린 숫자가 새로고침 전까지 옛 값이었다
   (아래 NoteRating 만 바뀌고 머리는 그대로). NoteRating 이 저장 성공 때 쏘는 window 이벤트 nz:note-rating
   {noteId, avg, count} 를 받아 같은 노트면 숫자를 바꾼다. 0명이면 칩이 없다(서버 ratingFact 와 같은 규칙).
   /notes/[id] 라우트 번들(487.4/495KB)에 더해지는 몫을 최소로 — 문자열 조립만, 라이브러리 import 없음. */
export const NOTE_RATING_EVENT = "nz:note-rating";

type Fact = { count: number; average: number | null };
type Detail = { noteId?: string; avg?: number | null; count?: number };

export function NoteRatingChip({ noteId, initial }: { noteId: string; initial: Fact | null }) {
  const [fact, setFact] = useState(initial);
  useEffect(() => {
    const on = (e: Event) => {
      const d = (e as CustomEvent<Detail>).detail;
      if (d?.noteId === noteId && typeof d.count === "number") setFact({ count: d.count, average: d.avg ?? null });
    };
    window.addEventListener(NOTE_RATING_EVENT, on);
    return () => window.removeEventListener(NOTE_RATING_EVENT, on);
  }, [noteId]);
  if (!fact || fact.count <= 0 || fact.average == null) return null;
  return (
    <a href="#rating" className="rounded-md bg-bg chip-pad t-sub font-bold text-text-2 no-underline">
      독자 평가 {fact.average.toFixed(1)} · {fact.count.toLocaleString("ko-KR")}명
    </a>
  );
}
