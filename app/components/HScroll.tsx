"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * [1054] 옆으로 미는 표 틀 — 폰에서 표가 틀보다 넓으면 오른쪽 가장자리를 흐리게 하고 "옆으로 밀어 전체 보기"를 적는다.
 *
 * 왜(운영 실측 2026-10-11 · 폰 390): 실거래 표(/tx · /complex/tx · /rent · 입주 물량 · 공매 · 비교 · 다이제스트 …)가
 * `min-w-[420~560px]` + `overflow-x-auto` 라 틀 폭(약 334px) 밖 열이 잘려 보였다. iOS 는 스크롤 막대를 그리지 않아
 * 잘린 열이 있다는 단서가 없었다 — "거래"·"단지" 열이 없는 표처럼 읽혔다. 넘칠 때만(ResizeObserver) 표시한다.
 * 끝까지 밀면 흐림을 걷는다. 서버 컴포넌트가 그대로 자식으로 넘긴다(표 내용은 서버 렌더).
 */
export function HScroll({
  children,
  className = "",
  hint = "옆으로 밀어 전체 열 보기",
}: {
  children: ReactNode;
  className?: string;
  hint?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [overflowing, setOverflowing] = useState(false);
  const [atEnd, setAtEnd] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const over = el.scrollWidth - el.clientWidth > 4;
      setOverflowing(over);
      setAtEnd(!over || el.scrollLeft + el.clientWidth >= el.scrollWidth - 2);
    };
    measure();
    const ro = typeof ResizeObserver === "function" ? new ResizeObserver(measure) : null;
    ro?.observe(el);
    el.addEventListener("scroll", measure, { passive: true });
    return () => {
      ro?.disconnect();
      el.removeEventListener("scroll", measure);
    };
  }, []);

  return (
    /* 바깥 = 판 껍데기(lq-panel 등 · className) · 안쪽 = 스크롤 틀. 마스크는 안쪽에만 — 판의 테두리·바탕은 흐리지 않는다 */
    <div className={className}>
      {/* 넘치고 끝이 아니면 오른쪽 가장자리를 마스크로 흐린다(.tab-scroll 과 같은 방식 · globals.css .nz-hscroll-fade) */}
      <div
        ref={ref}
        className={`overflow-x-auto ${overflowing && !atEnd ? "nz-hscroll-fade" : ""}`}
        tabIndex={overflowing ? 0 : undefined}
      >
        {children}
      </div>
      {overflowing && (
        <p className="m-0 mt-1 t-caption text-text-3 md:hidden" aria-live="polite">
          {atEnd ? "표 끝" : `${hint} →`}
        </p>
      )}
    </div>
  );
}
