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
