"use client";
/* [1026d · 검색] 입력칸 음영 자동완성 — 친 글자(보이지 않게 같은 폭) 뒤에 나머지를 흐리게 겹쳐 그린다.
   입력칸과 같은 글꼴·크기·자간을 계산값에서 그대로 옮긴다(폰은 전역 규칙이 입력 글자를 16px 로 올린다 —
   클래스만 베끼면 어긋난다). 입력이 칸을 넘쳐 가로로 밀렸으면 그리지 않는다(겹쳐 보인다).
   나머지 글자를 누르면 채운다(폰에는 Tab 이 없다). 스크린리더에는 읽히지 않는다(목록이 같은 내용을 말한다). */

import { useLayoutEffect, useState, type CSSProperties, type RefObject } from "react";

export default function GhostText({
  inputRef,
  value,
  rest,
  onAccept,
}: {
  inputRef: RefObject<HTMLInputElement | null>;
  value: string;
  rest: string;
  onAccept: () => void;
}) {
  const [style, setStyle] = useState<CSSProperties | null>(null);
  useLayoutEffect(() => {
    const el = inputRef.current;
    if (!el || !rest || el.scrollWidth > el.clientWidth + 1 || el.scrollLeft > 0) {
      setStyle(null);
      return;
    }
    const cs = getComputedStyle(el);
    setStyle({
      fontFamily: cs.fontFamily,
      fontSize: cs.fontSize,
      fontWeight: cs.fontWeight,
      letterSpacing: cs.letterSpacing,
      lineHeight: cs.lineHeight,
      paddingLeft: cs.paddingLeft,
      textIndent: cs.textIndent,
    });
  }, [inputRef, value, rest]);
  if (!style || !rest) return null;
  return (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 flex items-center overflow-hidden whitespace-pre"
      style={style}
    >
      <span className="invisible">{value}</span>
      <span
        className="pointer-events-auto cursor-pointer text-text-3 opacity-75"
        onMouseDown={(e) => {
          e.preventDefault();
          onAccept();
        }}
      >
        {rest}
      </span>
    </span>
  );
}
