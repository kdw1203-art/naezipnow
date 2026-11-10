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
    <aside
      aria-label="지도 처음 안내"
      className="card fixed left-1/2 z-30 flex w-[min(92vw,360px)] -translate-x-1/2 flex-col gap-1.5 rounded-2xl px-4 py-3 top-[calc(196px+env(safe-area-inset-top,0px))] md:top-[148px]"
    >
      <div className="flex items-start justify-between gap-2">
        <p className="m-0 t-body font-bold text-ink">단지를 누르면 실거래 · 단지 정보가 열립니다</p>
        <button type="button" onClick={close} aria-label="안내 닫기" className="-mr-2 -mt-1.5 inline-flex size-10 shrink-0 items-center justify-center t-body text-text-3">
          ✕
        </button>
      </div>
      <p className="m-0 t-sub text-text-2">직접 본 집은 임장노트에 사진 · 체크로 남깁니다 · 가입 무료</p>
      <Link href="/notes/new" onClick={close} className="tap-line inline-block w-fit py-[5px] t-sub font-bold text-primary no-underline">
        임장노트 쓰기 ›
      </Link>
    </aside>
  );
}

export default MapFirstCoach;
