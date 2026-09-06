"use client";

import { useEffect, useState } from "react";

/**
 * [968 · 8] 홈의 "두 벌 섬" 문제 — 어느 벌이 실제로 보이는지 판정하는 한 곳.
 *
 * 홈(app/page.tsx)은 모바일 섹션(`md:hidden`)과 데스크톱 섹션(`hidden md:block`)
 * 을 **둘 다** 서버 HTML 에 그린다. 게스트 HTML(ISR 공유 캐시)·LCP·SEO 를 그대로
 * 두려면 이 구조는 유지해야 하는데, 그 안의 클라이언트 섬(히어로 검색·오늘의 한 줄·
 * 참여 카드·레벨 KPI·내 관심 레일·미니지도)도 두 벌이 전부 하이드레이션돼서
 * 타이머·세션 조회·옵저버가 두 배로 돌았다(360px 폰에서 보이지도 않는 데스크톱
 * 벌이 3.5초 인터벌·9초 인터벌·IntersectionObserver 를 굴렸다).
 *
 * 해법: 각 섬이 `shell` 프롭("mobile" | "desktop")으로 자기가 어느 벌인지 알고,
 * 마운트 뒤 `matchMedia` 로 실제 뷰포트와 대조한다. 안 맞는 벌은 정적 마크업만
 * 그리고(서버 HTML 그대로) 타이머·fetch·옵저버를 **시작하지 않는다**.
 *
 * - 서버·첫 클라이언트 렌더는 `false` — 하이드레이션 불일치를 만들지 않는다.
 *   섬의 부작용은 전부 useEffect 안이라 한 렌더 늦게 시작해도 사용자가 알 수 없다.
 * - 한 번 활성화되면 되돌리지 않는다(latch). 창 크기가 경계(768px)를 넘나들 때
 *   맞춰 살아나기는 하되(태블릿 회전), 살아난 벌의 타이머를 다시 죽이진 않는다 —
 *   fetch 효과가 토글마다 재실행되는 쪽이 더 비싸다.
 * - `shell` 을 안 준 호출자(홈 밖에서 재사용하는 경우)는 항상 활성.
 */

export type Shell = "mobile" | "desktop";

/** Tailwind `md` 경계 — globals.css 에 브레이크포인트 재정의가 없으므로 기본값 768px. */
export const DESKTOP_MEDIA = "(min-width: 768px)";

/** 순수 판정: 이 벌이 현재 뷰포트에서 보이는 벌인가. shell 이 없으면 항상 true. */
export function shellMatches(shell: Shell | undefined, desktopViewport: boolean): boolean {
  if (!shell) return true;
  return shell === "desktop" ? desktopViewport : !desktopViewport;
}

/** 브라우저에서 읽는다 — matchMedia 가 없으면(구형·테스트) 데스크톱으로 본다. */
export function isDesktopViewport(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return true;
  return window.matchMedia(DESKTOP_MEDIA).matches;
}

/** 마운트 뒤 동기 판정 — 효과 안에서 "이 벌이 일해야 하나"를 한 줄로 묻는 용도. */
export function isShellActive(shell: Shell | undefined): boolean {
  return shellMatches(shell, isDesktopViewport());
}

/**
 * 훅: 이 벌이 활성인가. 초기값 false(shell 없으면 true) → 마운트 뒤 matchMedia 로
 * 확정, 이후 경계를 넘어 이 벌이 보이게 되면 true 로 올라간다(되돌리지 않음).
 */
export function useShellActive(shell?: Shell): boolean {
  const [active, setActive] = useState<boolean>(() => !shell);
  useEffect(() => {
    if (!shell) return;
    if (isShellActive(shell)) {
      setActive(true);
      return;
    }
    if (typeof window.matchMedia !== "function") return;
    const mql = window.matchMedia(DESKTOP_MEDIA);
    const onChange = () => {
      if (shellMatches(shell, mql.matches)) setActive(true);
    };
    /* 구형 사파리(<14)는 addEventListener 가 없다 — addListener 로 폴백 */
    if (typeof mql.addEventListener === "function") {
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    }
    mql.addListener(onChange);
    return () => mql.removeListener(onChange);
  }, [shell]);
  return active;
}
