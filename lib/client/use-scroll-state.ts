"use client";

import { useEffect, useState } from "react";

/**
 * [968 · 12] 문서 스크롤 상태 — 리스너 하나, 프레임당 한 번, 구독자는 여럿.
 *
 * 왜: 헤더(축소)·탭바(내리면 접기)·맨 위로(800px 뒤 표시)가 각자 `scroll` 리스너를
 * 달고 있었고, 헤더는 rAF 없이 **이벤트마다** setState 했다(터치 스크롤은 프레임당
 * 여러 번 발화한다). 홈 INP p75 568ms 의 한 조각이다. 여기서는 window 에 passive
 * 리스너 **하나**만 달고, requestAnimationFrame 으로 프레임당 한 번만 `scrollY` 를
 * 읽어 구독자 전부에게 같은 표본(y·dy)을 나눠 준다. 구독자가 0 이 되면 리스너도 뗀다.
 *
 * 규칙
 *  - 서버·첫 클라이언트 렌더는 항상 "안 내려감"(false / 0) — 하이드레이션 불일치 없음.
 *    마운트 뒤 효과에서 현재 위치를 한 번 읽어 맞춘다(스크롤 복원된 재진입 대비).
 *  - 훅은 자기 임계값을 넘나들 때만 setState 한다 — 스크롤마다 리렌더하지 않는다.
 *  - 판정 로직(`nextTabBarCompact`)은 순수 함수로 두어 브라우저 없이 검증한다.
 */

export type ScrollSample = {
  /** 현재 `window.scrollY` */
  y: number;
  /** 직전 표본 대비 이동량(+ 아래로, − 위로). 첫 표본은 0. */
  dy: number;
};

type Listener = (sample: ScrollSample) => void;

const listeners = new Set<Listener>();
let attached = false;
let rafId = 0;
let lastY = 0;

function readScrollY(): number {
  if (typeof window === "undefined") return 0;
  return window.scrollY || document.documentElement.scrollTop || 0;
}

function flush() {
  rafId = 0;
  const y = readScrollY();
  const sample: ScrollSample = { y, dy: y - lastY };
  lastY = y;
  listeners.forEach((l) => l(sample));
}

function onScroll() {
  if (rafId) return;
  rafId = window.requestAnimationFrame(flush);
}

function attach() {
  if (attached || typeof window === "undefined") return;
  attached = true;
  lastY = readScrollY();
  window.addEventListener("scroll", onScroll, { passive: true });
}

function detach() {
  if (!attached) return;
  attached = false;
  window.removeEventListener("scroll", onScroll);
  if (rafId) {
    window.cancelAnimationFrame(rafId);
    rafId = 0;
  }
}

/**
 * 스크롤 표본 구독. 반환된 함수로 해제한다. 첫 구독이 리스너를 달고 마지막 해제가 뗀다.
 * (훅 밖에서도 쓸 수 있게 노출 — RevealOnScroll 같은 비-React 루프가 붙을 자리)
 */
export function subscribeScroll(listener: Listener): () => void {
  listeners.add(listener);
  attach();
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) detach();
  };
}

/** 지금 붙어 있는 구독자 수 — 테스트·진단용 */
export function scrollSubscriberCount(): number {
  return listeners.size;
}

/**
 * `px` 보다 아래로 내려갔는가. 경계를 넘나들 때만 리렌더한다.
 * (헤더 8px · 맨 위로 800px)
 */
export function useScrolledPast(px: number): boolean {
  const [past, setPast] = useState(false);
  useEffect(() => {
    const apply = (y: number) => setPast(y > px);
    apply(readScrollY());
    return subscribeScroll((s) => apply(s.y));
  }, [px]);
  return past;
}

/**
 * 현재 스크롤 위치(px). `threshold` 만큼 움직였을 때만 갱신한다(기본 1px = 매 프레임).
 * 값 자체가 필요한 곳(진행 표시 등)만 쓴다 — 경계 판정은 useScrolledPast 가 싸다.
 */
export function useScrollY(threshold = 1): number {
  const [y, setY] = useState(0);
  useEffect(() => {
    let reported = readScrollY();
    setY(reported);
    return subscribeScroll((s) => {
      if (Math.abs(s.y - reported) < threshold) return;
      reported = s.y;
      setY(s.y);
    });
  }, [threshold]);
  return y;
}

/** 탭바 접기 규칙의 상수 — TabBar 가 쓰던 값 그대로 */
export const TABBAR_COMPACT_RULE = {
  /** 관성 스크롤 끝의 미세 떨림에 반응하지 않도록 이만큼 이상 움직여야 판정 */
  minDelta: 8,
  /** 이 위(첫 화면 근처)에서는 항상 펼친다 */
  top: 160,
} as const;

/**
 * 탭바 접힘 다음 상태(순수). 아래로 8px 이상 + 160px 아래 → 접고,
 * 위로 8px 이상 또는 160px 안 → 펼친다. 그 사이 떨림은 이전 상태 유지.
 */
export function nextTabBarCompact(
  prev: boolean,
  sample: ScrollSample,
  rule: { minDelta: number; top: number } = TABBAR_COMPACT_RULE,
): boolean {
  const { y, dy } = sample;
  if (dy > rule.minDelta && y > rule.top) return true;
  if (dy < -rule.minDelta || y <= rule.top) return false;
  return prev;
}

/** 탭바: 읽어 내려가는 동안 접고, 위로 올리면 즉시 펼친다 */
export function useTabBarCompact(): boolean {
  const [compact, setCompact] = useState(false);
  useEffect(() => {
    return subscribeScroll((s) => setCompact((prev) => nextTabBarCompact(prev, s)));
  }, []);
  return compact;
}
