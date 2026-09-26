"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";

/* 세그먼티드 컨트롤 — 기간·지표 전환. 링크가 아니라 **같은 화면의 상태**를
   바꾸는 자리라 버튼이다(뒤로가기를 오염시키지 않는다).

   [1009] 선택 표시가 **미끄러져** 옮겨 간다(토스·iOS 관례) — 예전엔 누른 칸의 배경이 순간 교체돼
   "어디서 어디로" 바뀌었는지 눈이 따라가지 못했다. 붙은 뒤(JS) 선택 칸의 위치·폭을 재서 한 장의
   표시판을 옮긴다. JS 전·실패 시엔 예전처럼 aria-pressed 칸에 배경이 칠해진다(표시판은 투명).
   모션 최소화 설정이면 미끄러짐 없이 바로 옮긴다(globals.css). */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  className,
}: {
  options: ReadonlyArray<{ value: T; label: string }>;
  value: T;
  onChange: (v: T) => void;
  ariaLabel: string;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [ind, setInd] = useState<{ x: number; w: number } | null>(null);
  /* [1009 · 리뷰 RA] 첫 자리는 전환 없이 놓고(init), 다음 프레임부터 미끄러진다(on) — 예전엔 붙는 순간 폭 0·x 0 에서
     자라며 미끄러져(약 250ms) 화면마다 선택 표시가 한 번씩 춤췄다. */
  const [phase, setPhase] = useState<"init" | "on">("init");

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const btn = el.querySelector<HTMLButtonElement>('button[aria-pressed="true"]');
      if (!btn) {
        setInd(null);
        return;
      }
      setInd({ x: btn.offsetLeft, w: btn.offsetWidth });
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [value, options.length]);

  useEffect(() => {
    if (!ind || phase === "on") return;
    const id = requestAnimationFrame(() => setPhase("on"));
    return () => cancelAnimationFrame(id);
  }, [ind, phase]);

  const style = ind ? ({ "--seg-x": `${ind.x}px`, "--seg-w": `${ind.w}px` } as CSSProperties) : undefined;
  return (
    <div
      ref={ref}
      className={`seg seg-slide ${className ?? ""}`}
      role="group"
      aria-label={ariaLabel}
      data-ind={ind ? phase : undefined}
      style={style}
    >
      <span className="seg-ind" aria-hidden="true" />
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
