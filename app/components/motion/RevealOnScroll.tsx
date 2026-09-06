"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import {
  addedNodesNeedScan,
  pickRevealRoot,
  type AddedNodeLike,
} from "@/lib/client/reveal-scope";

/**
 * 스크롤하며 내려오는 섹션을 한 번씩 살려 올린다.
 *
 * 쓰는 법은 **속성 하나**다. 서버 컴포넌트에서도 `data-reveal=""` 만 붙이면
 * 된다 — 이 파일을 import 할 필요가 없다. 그래서 연출을 넣자고 서버
 * 컴포넌트를 클라이언트로 내릴 일이 없다.
 *
 * ── 기본값이 "보임" 인 이유 ─────────────────────────────────────────────
 * 흔한 구현은 CSS 에서 `opacity: 0` 으로 시작해 스크립트가 보이게 만든다.
 * 그러면 스크립트가 한 번 실패하는 날 본문이 통째로 사라진다 — 검색 크롤러나
 * JS 차단 환경에서는 그게 기본 상태가 된다. 여기서는 서버가 그린 상태가
 * 그대로 보이는 상태이고, **화면 밖에 있는 것만** 스크립트가 잠시 숨겼다가
 * 올려 준다.
 *
 * ── 빈 공간 방지(2026-08-28) ────────────────────────────────────────────
 * 이 연출의 대기 상태(`pending`)는 `opacity: 0` 인데 **자리는 그대로 차지한다**.
 * 즉 올려 주는 데 실패하면 그 자리는 "아무것도 없는 빈 칸"으로 남는다.
 * 홈 실측에서 로드 직후 257px 짜리 블록 하나가 정확히 그 상태였다.
 *
 * IntersectionObserver 하나에만 기대면 그 실패가 곧 빈 칸이므로, 보증을
 * 세 겹으로 둔다. 원칙은 하나다 — **화면에 보이는 자리는 반드시 채워져 있다.**
 *   ① 옵저버: 평소 경로(연출이 붙는다)
 *   ② 스크롤·리사이즈 백스톱: 화면 안에 들어온 대기 요소를 무조건 깨운다.
 *      옵저버가 어떤 이유로든 안 울려도 스크롤 한 번이면 채워진다.
 *   ③ 안전 타이머: 그래도 남은 대기 요소를 SAFETY_MS 뒤 전부 깨운다.
 * 셋 다 같은 함수(`show`)로 수렴하므로 상태가 갈라지지 않는다.
 *
 * 화면보다 큰 블록은 아예 숨기지 않는다. 그런 블록이 늦게 나타나면 연출이
 * 아니라 "한참 비어 있다가 갑자기 생기는 화면"으로 읽힌다.
 *
 * ── 비용 절제 [968 · 11] ────────────────────────────────────────────────
 * 이 컴포넌트는 루트 레이아웃에 있어 모든 화면에서 돈다. 그래서
 *   · `[data-reveal]` 이 하나도 없는 화면에서는 아무것도 설치하지 않고,
 *   · MutationObserver 는 body 가 아니라 리빌 노드를 전부 담는 `<main>` 만 보며
 *     (밖에도 있으면 body 폴백), 추가된 노드에 리빌 후보가 있을 때만 훑고,
 *   · 대기 노드가 0 이 되면(전부 보였거나 안전 타이머가 깨움) 옵저버·스크롤·
 *     리사이즈 리스너를 전부 뗀다.
 * 뗀 뒤에 붙는 노드(클라이언트 목록이 2초 넘게 늦게 오는 경우)는 연출 없이
 * 기본값(보임)으로 그려진다 — 기능이 아니라 장식이 빠지는 쪽이다.
 */

/** 이 비율보다 아래에 있는 요소만 숨겼다가 올린다 (뷰포트 높이 대비) */
const BELOW_FOLD = 0.92;
/** 이 시간이 지나도 대기 중이면 연출을 포기하고 그냥 보여 준다 */
const SAFETY_MS = 2_000;

export function RevealOnScroll() {
  const pathname = usePathname();

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;

    /* [968 · 11] 리빌 노드가 하나도 없는 화면(노트 작성 폼·설정 등)에서는 아무것도
       설치하지 않는다. 예전엔 body 전체 MutationObserver + 스크롤·리사이즈 리스너가
       모든 화면에서 돌았다 — 글자 하나 칠 때마다 querySelectorAll ×2. */
    const initial = document.querySelectorAll<HTMLElement>("[data-reveal]");
    if (initial.length === 0) return;

    /* 관찰 범위 — 리빌 노드가 전부 본문(<main>) 안이면 main, 아니면 body(폴백). */
    const root = pickRevealRoot(Array.from(initial), document.querySelector("main"), document.body);

    const show = (el: HTMLElement) => {
      if (el.dataset.reveal === "shown") return;
      el.dataset.reveal = "shown";
    };

    /* 정리 — 대기 중인 노드가 0 이 되면(또는 경로가 바뀌면) 옵저버·리스너를 전부 뗀다.
       한 번 뗀 뒤에는 되살리지 않는다: 이후 붙는 노드는 기본값(보임)으로 그려진다.
       여러 경로(스캔·옵저버·스윕·안전 타이머)에서 부르므로 멱등이어야 한다. */
    let torn = false;
    let queued = 0;
    let sweepQueued = 0;
    let safety = 0;
    const teardown = () => {
      if (torn) return;
      torn = true;
      if (queued) window.cancelAnimationFrame(queued);
      if (sweepQueued) window.cancelAnimationFrame(sweepQueued);
      window.clearTimeout(safety);
      window.removeEventListener("scroll", onView);
      window.removeEventListener("resize", onView);
      window.removeEventListener("pageshow", onView);
      mutation.disconnect();
      observer.disconnect();
    };
    /* 대기(pending)도, 아직 안 훑은 노드("")도 없으면 할 일이 없다 → 정리 */
    const settleIfIdle = () => {
      if (torn) return;
      if (root.querySelector('[data-reveal=""], [data-reveal="pending"]')) return;
      teardown();
    };

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const el = entry.target;
          if (el instanceof HTMLElement) show(el);
          observer.unobserve(el);
        }
        settleIfIdle();
      },
      { rootMargin: "0px 0px -6% 0px", threshold: 0.04 },
    );

    /** 대기 중(pending)인데 이미 화면에 걸친 것들을 깨운다 — 빈 칸 방지 보증 */
    const sweep = () => {
      const viewport = window.innerHeight || 0;
      for (const el of root.querySelectorAll<HTMLElement>('[data-reveal="pending"]')) {
        if (el.getBoundingClientRect().top <= viewport * BELOW_FOLD) {
          show(el);
          observer.unobserve(el);
        }
      }
    };

    const scan = () => {
      const viewport = window.innerHeight || 0;
      const nodes = root.querySelectorAll<HTMLElement>('[data-reveal=""]');
      for (const el of nodes) {
        const rect = el.getBoundingClientRect();
        /* 이미 보이는 것: 표시만 바꿔 두고 애니메이션은 걸지 않는다. */
        if (rect.top <= viewport * BELOW_FOLD) {
          show(el);
          continue;
        }
        /* 화면보다 큰 블록은 숨기지 않는다 — 비어 보이는 시간이 길어진다 */
        if (viewport > 0 && rect.height > viewport) {
          show(el);
          continue;
        }
        el.dataset.reveal = "pending";
        observer.observe(el);
      }
      sweep();
      settleIfIdle();
    };

    /* 피드·목록은 클라이언트에서 나중에 붙는다. 붙을 때마다 훑되, 한 프레임에
       한 번으로 묶는다(중복 예약 방지). */
    const schedule = () => {
      if (queued || torn) return;
      queued = window.requestAnimationFrame(() => {
        queued = 0;
        scan();
      });
    };

    /* [968 · 11] 추가된 노드에 리빌 후보가 있을 때만 훑는다 — 텍스트 갱신·회전 배너 같은
       잦은 변화에는 addedNodes 만 훑고 끝난다(컨테이너 전체 querySelectorAll 없음). */
    const mutation = new MutationObserver((records) => {
      const added: AddedNodeLike[] = [];
      for (const r of records) {
        for (const n of r.addedNodes) {
          const el = n instanceof Element ? n : null;
          added.push({
            isElement: el !== null,
            hasReveal: el !== null && el.hasAttribute("data-reveal"),
            containsReveal: el !== null && el.querySelector("[data-reveal]") !== null,
          });
        }
      }
      if (addedNodesNeedScan(added)) schedule();
    });

    /* 백스톱 — 옵저버가 안 울려도 스크롤/리사이즈 한 번이면 화면 안은 채워진다 */
    const onView = () => {
      if (sweepQueued || torn) return;
      sweepQueued = window.requestAnimationFrame(() => {
        sweepQueued = 0;
        sweep();
        settleIfIdle();
      });
    };

    scan();
    if (torn) return; // 전부 화면 안이었다 — 설치할 것이 없다

    mutation.observe(root, { childList: true, subtree: true });
    window.addEventListener("scroll", onView, { passive: true });
    window.addEventListener("resize", onView, { passive: true });
    /* bfcache 복귀는 effect 가 다시 돌지 않는다 — 그때도 한 번 훑는다 */
    window.addEventListener("pageshow", onView);

    /* 마지막 보증 — 여기까지 왔는데도 대기 중이면 연출을 포기한다. */
    safety = window.setTimeout(() => {
      for (const el of root.querySelectorAll<HTMLElement>('[data-reveal="pending"]')) {
        show(el);
        observer.unobserve(el);
      }
      settleIfIdle();
    }, SAFETY_MS);

    return teardown;
  }, [pathname]);

  return null;
}

export default RevealOnScroll;
