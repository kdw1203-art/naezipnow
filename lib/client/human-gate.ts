"use client";

/**
 * [1007 · V2a-4] "사람이 볼 때만" 게이트 — 마운트 즉시 나가던 데이터 조회를 미룬다.
 *
 * 실측: /api/ai/context 1,215회/일 — AI 워크벤치(?complexId= 딥링크 · 경제 모니터)와
 * "같은 단지, 네 가지 눈" 보드(도구 3종 병렬)가 **마운트 즉시** 부른다. 크롤러가 보드의
 * 칸 링크(/analysis/ai/<tool>?complexId=)를 따라다니며 단지마다 4회씩 일으켰다.
 *
 * 규칙:
 *  - 봇(lib/client/is-bot-ua)이면 영원히 false — 호출하지 않는다.
 *  - 사람이면 (a) 지켜볼 요소가 뷰포트에 들어오거나(IntersectionObserver, rootMargin 으로
 *    한 화면 앞서) (b) 첫 상호작용(포인터·키·휠·터치·스크롤) 뒤에 true 가 된다.
 *  - 요소를 주지 않았거나 IntersectionObserver 가 없으면 사람에겐 마운트 직후 true —
 *    "딥링크로 온 사람이 보려는 것" 을 굳이 기다리게 하지 않는다.
 * true 가 되면 다시 false 로 돌아가지 않는다(래치).
 */

import { useEffect, useState, type RefObject } from "react";
import { isBotBrowser } from "@/lib/client/is-bot-ua";

const INTERACTION_EVENTS = ["pointerdown", "keydown", "wheel", "touchstart", "scroll"] as const;

export function useHumanGate(
  ref?: RefObject<Element | null>,
  opts: { rootMargin?: string } = {},
): boolean {
  const [armed, setArmed] = useState(false);
  const rootMargin = opts.rootMargin ?? "200px 0px";

  useEffect(() => {
    if (armed) return;
    if (isBotBrowser()) return;

    const el = ref?.current ?? null;
    if (!el || typeof IntersectionObserver === "undefined") {
      setArmed(true);
      return;
    }

    let done = false;
    const cleanups: Array<() => void> = [];
    const fire = () => {
      if (done) return;
      done = true;
      cleanups.forEach((fn) => fn());
      setArmed(true);
    };

    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) fire();
      },
      { rootMargin },
    );
    io.observe(el);
    cleanups.push(() => io.disconnect());

    for (const type of INTERACTION_EVENTS) {
      const handler = () => fire();
      window.addEventListener(type, handler, { passive: true, once: true });
      cleanups.push(() => window.removeEventListener(type, handler));
    }

    return () => {
      cleanups.forEach((fn) => fn());
    };
  }, [armed, ref, rootMargin]);

  return armed;
}

/**
 * [1027 · 제안 29] 첫 상호작용 게이트 — 사람이 **실제로 움직인 뒤에만** true.
 *
 * useHumanGate 는 지켜볼 요소가 없으면 마운트 직후 켜진다(딥링크로 온 사람을 기다리게 하지 않으려는 것).
 * 지표는 반대다: 화면만 열고 아무것도 하지 않는 방문(상태 점검기 · 화면 캡처 · 미리 불러오기)이 사람으로
 * 세이면 숫자가 거짓이 된다. 운영 실측: "가입 1단계" 451건 가운데 실제 가입은 2명이었다.
 *  · 봇(UA 표식 · navigator.webdriver)은 영원히 false.
 *  · 브라우저가 만든 진짜 입력(event.isTrusted)만 센다 — 스크립트가 dispatchEvent 로 만든 것은 아니다.
 *  · 포인터·키·터치·휠 가운데 처음 하나. **스크롤은 세지 않는다** — 브라우저가 스스로 일으킨 스크롤(위치 복원 ·
 *    화면 전체 캡처 도구)도 "진짜 입력"(isTrusted)으로 온다. 켜지면 꺼지지 않는다(래치).
 */
const FIRST_INPUT_EVENTS = ["pointerdown", "keydown", "touchstart", "wheel"] as const;

export function useFirstInteraction(): boolean {
  const [moved, setMoved] = useState(false);

  useEffect(() => {
    if (moved) return;
    if (isBotBrowser()) return;
    const cleanups: Array<() => void> = [];
    let done = false;
    const handler = (e: Event) => {
      if (done || !e.isTrusted) return;
      done = true;
      cleanups.forEach((fn) => fn());
      setMoved(true);
    };
    for (const type of FIRST_INPUT_EVENTS) {
      window.addEventListener(type, handler, { passive: true });
      cleanups.push(() => window.removeEventListener(type, handler));
    }
    return () => {
      cleanups.forEach((fn) => fn());
    };
  }, [moved]);

  return moved;
}

/**
 * [1027 · 제안 29] 세션당 한 번 — 처음이면 표식을 남기고 true, 이미 있으면 false.
 * 저장소가 막힌 브라우저(사파리 비공개 등)는 true(막지 않는다 — 호출부가 화면당 한 번은 이미 지킨다).
 */
export function markOncePerSession(key: string): boolean {
  try {
    if (window.sessionStorage.getItem(key)) return false;
    window.sessionStorage.setItem(key, "1");
    return true;
  } catch {
    return true;
  }
}
