"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

/**
 * 화면이 바뀌는 순간의 **연결감**.
 *
 * App Router 는 경로가 바뀌어도 화면이 그냥 툭 갈린다. 그 사이에 아무 변화가
 * 없으면 사용자는 "새 화면"이 아니라 "화면이 깜빡였다"로 읽는다. 여기서는
 * 경로가 바뀔 때마다 `<body>` 에 짧은 페이드를 한 번 걸어 준다.
 *
 * 왜 `template.tsx` 가 아니라 이 방식인가:
 * 루트 `template.tsx` 를 쓰면 이동할 때마다 트리 전체가 다시 마운트된다.
 * 그러면 `/map` 처럼 쿼리만 바꿔 필터링하는 화면이 매번 지도를 처음부터 다시
 * 그린다 — 연출을 얻으려고 기능을 깎는 셈이다. body 에 애니메이션만 걸면
 * 리마운트가 없다.
 *
 * 왜 이동/확대가 아니라 **불투명도만** 쓰는가:
 * transform·filter 는 자손 `position: fixed` 의 컨테이닝 블록을 만든다.
 * 하단 탭바가 fixed 라, 애니메이션이 도는 동안 탭바가 뷰포트가 아니라 문서
 * 박스를 기준으로 잡히면서 긴 페이지에서는 화면 밖으로 밀려난다. opacity 는
 * 쌓임 맥락만 만들고 컨테이닝 블록은 만들지 않아 안전하다. 실제 "움직임"은
 * 안쪽 콘텐츠(.rise-in-*, [data-reveal])가 맡는다.
 *
 * [1105 · 속도] class(.page-enter) 를 붙였다 떼는 대신 Web Animations(`body.animate`)로 건다.
 * 예전엔 이동마다 class 빼기 → 강제 리플로우(offsetWidth) → 붙이기, 600ms 뒤 또 빼기였다 — body 의 class 가 바뀔
 * 때마다 body 스타일을 다시 계산하고, CSS 애니메이션(fill both)은 600ms 동안 붙어 있었다. animate() 는 속성을 하나도
 * 바꾸지 않고(class·data 무효화 없음 · 리플로우 강제 없음) 300ms 가 지나면 스스로 빠진다(1104 빌드 실측 · 폰 390 · CPU 4배 ·
 * 홈 · 이동 한 번 창 750ms: 스타일 92 → 12ms · 페인트류 96 → 28ms — 그중 globals.css [1105] body 자식 재계산 수정이 92 → 22 ·
 * 96 → 37, 이 파일이 나머지 22 → 12 · 37 → 28). 1104 부터 body class 바꾸기 자체는 문서 전체 재계산이 아니다(class~= 규칙 정리).
 * 모양은 그대로다 — 키프레임(0.45 → 1) · 시간(--dur-page = --dur-md 300ms) · 곡선(--ease-out) · 모션 최소화(0 → 1 · 150ms
 * ease)는 예전 .page-enter 규칙과 같은 값이다(tests/unit/perf-1105 가 globals.css 토큰과 맞춰 본다). 키프레임이 둘뿐이라
 * CSS 의 키프레임별 곡선과 animate() 의 전체 곡선이 같은 곡선이다. 첫 로드(하이드레이션 직후)에도 예전처럼 한 번 돈다.
 */
const PAGE_FADE: Keyframe[] = [{ opacity: 0.45 }, { opacity: 1 }];
const PAGE_FADE_MS = 300;
const PAGE_FADE_EASING = "cubic-bezier(0.2, 0.8, 0.2, 1)";
/* 모션 최소화 — 예전 globals.css `@media (prefers-reduced-motion: reduce) { .page-enter { animation: fadeIn 150ms ease both } }` */
const REDUCED_FADE: Keyframe[] = [{ opacity: 0 }, { opacity: 1 }];
const REDUCED_FADE_MS = 150;
const REDUCED_FADE_EASING = "ease";

function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

export function PageTransition() {
  const pathname = usePathname();

  useEffect(() => {
    const body = document.body;
    /* animate() 가 없는 옛 브라우저는 연출 없이 바로 보인다(기능 영향 없음) */
    if (typeof body.animate !== "function") return;
    const reduce = prefersReducedMotion();
    const anim = body.animate(reduce ? REDUCED_FADE : PAGE_FADE, {
      duration: reduce ? REDUCED_FADE_MS : PAGE_FADE_MS,
      easing: reduce ? REDUCED_FADE_EASING : PAGE_FADE_EASING,
    });
    /* 300ms 안에 다시 이동하면 지금 것을 걷고 새로 처음(0.45)부터 — 예전 "떼고 리플로우 후 다시 붙이기"와 같은 재시작.
       정리와 다음 효과는 같은 커밋 안에서 돌아 그 사이에 그려지는 프레임이 없다. */
    return () => anim.cancel();
  }, [pathname]);

  return null;
}

export default PageTransition;
