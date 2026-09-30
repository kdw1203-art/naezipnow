"use client";
/* [1026b · 시나리오·비교] lg(1024px) 이상인가 — 손잡이(조건 입력 · 담은 단지)를 **한 번만** 마운트하려고 쓴다.
   데스크톱은 오른쪽 레일, 폰은 결론 아래 접이식 — 두 자리에 복제해 그리면 단지 검색(ComplexPicker)이 둘이 되어
   ?complexId= 딥링크를 두 번 읽고 두 번 담는다. 그래서 자리 하나만 고른다.
   서버 값 null(모름) → 하이드레이션 직후 실제 값(NoteForm 의 useSyncExternalStore 방식과 같다 · 불일치 경고 없음).
   /analysis/compare 도 같이 쓴다. */
import { useSyncExternalStore } from "react";

const DESKTOP_MQ = "(min-width: 1024px)";

function subscribe(cb: () => void): () => void {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return () => {};
  const mq = window.matchMedia(DESKTOP_MQ);
  /* 옛 사파리(13)는 addEventListener 가 없다 — 없으면 폭 변화만 못 따라갈 뿐 */
  mq.addEventListener?.("change", cb);
  return () => mq.removeEventListener?.("change", cb);
}

const read = (): boolean | null =>
  typeof window !== "undefined" && typeof window.matchMedia === "function" ? window.matchMedia(DESKTOP_MQ).matches : false;
const readServer = (): boolean | null => null;

/** true = lg 이상 · false = 그 아래 · null = 아직 모름(서버 렌더 · 하이드레이션 첫 렌더) */
export function useDesktop(): boolean | null {
  return useSyncExternalStore(subscribe, read, readServer);
}
