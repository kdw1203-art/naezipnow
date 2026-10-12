"use client";

import { useEffect, useState, type RefObject } from "react";

/* [1058 · C1] "뷰포트에 가까워지면 한 번 true" — 지연 래퍼(ComplexReviewsLazy·ComplexTalkLazy)가 각자 들고 있던
   IntersectionObserver 보일러플레이트를 한 훅으로. 틀린 사실: 같은 관찰자 코드가 래퍼마다 복제돼 /complex/[id]
   첫 로드 청크(477.6/480KB)에 두 번 실렸다. 동작은 그대로 — 관찰자가 없는 환경은 바로 true(기능을 빼지 않는다),
   한 번 true 가 되면 관찰을 끊는다. rootMargin 은 호출하는 쪽이 넘긴다(후기 200px · 토론 400px). */
export function useNearViewport(ref: RefObject<Element | null>, rootMargin: string): boolean {
  const [near, setNear] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      setNear(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setNear(true);
          io.disconnect();
        }
      },
      { rootMargin },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [ref, rootMargin]);
  return near;
}
