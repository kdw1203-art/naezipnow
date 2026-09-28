"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/* [1022] 소유자: "홈에서 지역 동향이 위에서 아래로 카드가 넘어가듯(주식처럼) 다른 지역들도 보여지게 해줘, 공개 임장노트도 마찬가지".
   쪽(page) 단위 회전판 — 서버가 만든 쪽들을 받아 일정 간격으로 다음 쪽을 아래에서 위로 올린다.
     · 첫 렌더는 0쪽(서버 HTML 과 같다 — 하이드레이션 불일치 없음). 쪽이 하나면 아무것도 안 돈다.
     · 마우스를 올리거나 안에 포커스가 있으면 멈춘다(읽는 중에 바뀌지 않게). 탭이 안 보일 때(visibilitychange)도 멈춘다.
     · prefers-reduced-motion 이면 자동 회전을 끄고 점 버튼으로만 넘긴다(애니메이션도 없음).
     · 점 버튼(40px 표적)으로 아무 쪽이나 바로. aria-live 는 쓰지 않는다(4초마다 읽어 주면 방해). */
export function RollingPanel({
  pages,
  intervalMs = 4500,
  label,
  className = "",
}: {
  pages: ReactNode[];
  intervalMs?: number;
  /** 점 버튼 그룹의 aria-label — "지역 동향 쪽" */
  label: string;
  className?: string;
}) {
  const [idx, setIdx] = useState(0);
  const [paused, setPaused] = useState(false);
  const [reduce, setReduce] = useState(false);
  const [tick, setTick] = useState(0);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const n = pages.length;

  useEffect(() => {
    try {
      const mql = window.matchMedia("(prefers-reduced-motion: reduce)");
      const sync = () => setReduce(mql.matches);
      sync();
      mql.addEventListener("change", sync);
      return () => mql.removeEventListener("change", sync);
    } catch {
      return undefined;
    }
  }, []);

  useEffect(() => {
    if (n < 2 || reduce || paused) return;
    let hidden = document.visibilityState === "hidden";
    const onVis = () => {
      hidden = document.visibilityState === "hidden";
    };
    document.addEventListener("visibilitychange", onVis);
    const t = window.setInterval(() => {
      if (hidden) return;
      setIdx((i) => (i + 1) % n);
      setTick((k) => k + 1);
    }, intervalMs);
    return () => {
      window.clearInterval(t);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [n, reduce, paused, intervalMs]);

  if (n === 0) return null;
  const cur = Math.min(idx, n - 1);

  return (
    <div
      ref={hostRef}
      className={`home-roll ${className}`}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={(e) => {
        if (!hostRef.current?.contains(e.relatedTarget as Node | null)) setPaused(false);
      }}
    >
      <div key={reduce ? "static" : `${cur}-${tick}`} className={reduce ? "" : "home-roll__page"}>
        {pages[cur]}
      </div>
      {n > 1 && (
        <div className="mt-2 flex items-center justify-center gap-0.5" role="group" aria-label={label}>
          {pages.map((_, i) => (
            <button
              key={i}
              type="button"
              aria-label={`${i + 1}쪽`}
              aria-pressed={i === cur}
              onClick={() => {
                setIdx(i);
                setTick((k) => k + 1);
              }}
              className="home-roll__dot"
            >
              <span aria-hidden="true" data-on={i === cur ? "true" : "false"} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
