"use client";

import { useEffect, useState } from "react";
import { getSessionLite } from "@/lib/client/session-lite";

/* [1007] 분석 허브의 "보는 사람" — 로그인 여부 + 내 노트 수를 **클라이언트에서** 판정한다.
 *
 * 왜: /analysis 는 하루 1,828회(24h 실측) 서버리스 함수를 띄웠다. 사람 페이지뷰는 7일 합계
 * ~120건(모든 화면)인데, 페이지가 `safeAuth()`+`listNotes()` 를 서버에서 읽어 force-dynamic
 * 이라 크롤러 요청마다 함수·세션·DB 조회가 돌았다. 허브는 ISR(1시간)로 굳히고, 세션이
 * 갈랐던 세 조각(내 기록 시작 카드 · 노트 도구 티저 · 노트 AI 카드)만 여기서 판정한다.
 *
 * 요청 수: 세션은 헤더가 이미 부른 공유 프라미스(getSessionLite, 요청 0 추가), 내 노트는
 * 모듈 스코프 공유 프라미스로 한 페이지에 **1회** — 예전엔 서버(listNotes) 1회 + 노트 AI
 * 카드(fetch) 1회였다. 실패는 캐시하지 않는다(일시 오류가 "노트 0건"으로 굳지 않게). */

export type MyNoteLite = {
  id: string;
  title: string;
  region: string;
  aptName?: string | null;
  visitDate: string;
};

export type HubViewer = {
  /** null = 아직 모름(프로브 중) · false = 비로그인 · true = 로그인 */
  loggedIn: boolean | null;
  /** 로그인일 때만 의미. null = 아직 안 셌거나 못 셌음(가짜 0 금지) */
  myNoteCount: number | null;
};

let notesPromise: Promise<MyNoteLite[] | null> | null = null;

/** 내 임장노트 목록(경량) — 페이지당 1회 수렴. 실패는 null(캐시 안 함) */
export function fetchMyNotesShared(): Promise<MyNoteLite[] | null> {
  if (notesPromise) return notesPromise;
  const p: Promise<MyNoteLite[] | null> = fetch("/api/inspection/notes", { cache: "no-store" })
    .then(async (r) => {
      if (!r.ok) return null;
      const j = (await r.json().catch(() => null)) as { items?: MyNoteLite[] } | null;
      return Array.isArray(j?.items) ? j.items : null;
    })
    .catch(() => null)
    .then((v) => {
      if (v === null && notesPromise === p) notesPromise = null;
      return v;
    });
  notesPromise = p;
  return p;
}

export function useHubViewer(): HubViewer {
  const [viewer, setViewer] = useState<HubViewer>({ loggedIn: null, myNoteCount: null });
  useEffect(() => {
    let cancelled = false;
    void getSessionLite().then(async (s) => {
      if (cancelled) return;
      const loggedIn = Boolean(s?.user?.email);
      if (!loggedIn) {
        setViewer({ loggedIn: false, myNoteCount: null });
        return;
      }
      setViewer({ loggedIn: true, myNoteCount: null });
      const notes = await fetchMyNotesShared();
      if (cancelled) return;
      /* 집계 실패는 null 그대로 — 화면은 수치를 안 적는다(가짜 숫자 금지) */
      setViewer({ loggedIn: true, myNoteCount: notes ? notes.length : null });
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return viewer;
}
