"use client";

import { useEffect, useState } from "react";
import Link from "@/app/components/IntentLink";
import { readAuthedHint } from "@/lib/auth/authed-hint";

/* [1125 · 처음 온 사람의 길 — 지도] 지도에 처음 들어온 비회원에게 한 번만 뜨는 안내 한 장.
   "단지를 누르면 무엇이 열리는지 · 본 집은 어디에 남기는지" 두 사실만 적는다. 닫으면 이 브라우저에서는 다시 뜨지 않는다
   (localStorage — 막혀 있으면 그 방문에만 닫힌다). 회원(로그인 힌트)에게는 그리지 않는다. 서버 HTML 에는 없다(지도 첫 그림을 가리지 않는다).
   자리는 위(검색 · 필터 줄 아래) — 첫 방문에는 아래에 쿠키 안내가 떠 있어 아래에 두면 가려진다. */
const KEY = "nz_map_coach_1125";

export function MapFirstCoach() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (readAuthedHint()) return;
    try {
      if (window.localStorage.getItem(KEY)) return;
    } catch {
      /* 저장소가 막혀 있으면 이번 방문에만 보인다 */
    }
    setOpen(true);
  }, []);
  if (!open) return null;
  const close = () => {
    setOpen(false);
    try {
      window.localStorage.setItem(KEY, "1");
    } catch {
      /* ignore */
    }
  };
  return (
    /* [1193] 석 줄 카드 → 한 줄. 소유자(2026-11-16): "지도에 띄워 있는 창이 너무 많아 보여" */
    <aside
      aria-label="지도 처음 안내"
      className="glass fixed left-1/2 z-30 flex w-max max-w-[92vw] -translate-x-1/2 items-center gap-2 rounded-full py-1 pl-4 pr-1 top-[calc(196px+env(safe-area-inset-top,0px))] md:top-[96px]"
    >
      <p className="m-0 truncate t-sub text-text-1">단지를 누르면 실거래 · 단지 정보</p>
      <Link href="/notes/new" onClick={close} className="tap-line inline-flex min-h-10 shrink-0 items-center t-sub font-bold text-primary no-underline md:min-h-8">
        임장노트 쓰기 ›
      </Link>
      <button type="button" onClick={close} aria-label="안내 닫기" className="inline-flex size-10 shrink-0 items-center justify-center t-sub text-text-3 md:size-8">
        ✕
      </button>
    </aside>
  );
}

export default MapFirstCoach;
