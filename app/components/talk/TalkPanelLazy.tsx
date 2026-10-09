"use client";

/* [1051 · 홈 실시간 토론] 홈 맨 아래 토론 판의 지연 로더 — 판(TalkPanel · 순위 · 글 · 쓰기)은 화면 가까이 오면 받는다.
   홈 첫 로드 번들(/ 예산 495KB · 여유가 몇 KB 뿐)에는 이 얇은 파일만 잡히고, 판 코드는 따로 받는 청크다.
   서버 HTML 에는 같은 높이의 빈 판만(사용자 글은 캐시된 홈 HTML 에 싣지 않는다 — 글은 늘 새로 받는다). */
import nextDynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";

const TalkPanel = nextDynamic(() => import("./TalkPanel").then((m) => m.TalkPanel), {
  ssr: false,
  loading: () => <TalkSkeleton />,
});

function TalkSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,300px)_minmax(0,1fr)]" aria-hidden="true">
      <div className="skeleton h-[260px] w-full rounded-xl md:h-[420px]" />
      <div className="skeleton h-[320px] w-full rounded-xl md:h-[420px]" />
    </div>
  );
}

export function TalkPanelLazy({ variant = "home" }: { variant?: "home" | "page" }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [near, setNear] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      setNear(true);
      return;
    }
    const io = new IntersectionObserver(
      (es) => {
        if (es.some((e) => e.isIntersecting)) {
          setNear(true);
          io.disconnect();
        }
      },
      { rootMargin: "600px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return <div ref={ref}>{near ? <TalkPanel variant={variant} /> : <TalkSkeleton />}</div>;
}

export default TalkPanelLazy;
