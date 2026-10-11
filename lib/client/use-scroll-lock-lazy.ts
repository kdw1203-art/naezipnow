"use client";

import { useEffect } from "react";

/* [1055] 모든 화면 레이아웃에 있는 시트(소프트 가입 · 페이월 · 첫 방문 안내)용 — 잠금 코드(use-scroll-lock · iOS position:fixed 처리)를
 * 정적으로 import 하면 그 모듈이 화면 묶음(예: /notes/new 의 548 청크)에 함께 실려 번들 예산(470KB)에 닿았다. 열릴 때만 받는다.
 * 받는 사이 닫히면 잠그지 않는다(released). */
export function useScrollLockLazy(active: boolean, opts?: { markModal?: boolean }): void {
  const markModal = opts?.markModal ?? false;
  useEffect(() => {
    if (!active) return;
    let released = false;
    let release: (() => void) | null = null;
    void import("@/lib/client/use-scroll-lock").then((m) => {
      if (released) return;
      release = m.acquireScrollLock({ markModal });
    });
    return () => {
      released = true;
      release?.();
    };
  }, [active, markModal]);
}
