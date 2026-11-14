"use client";

import { useEffect, useId, useState, type ReactNode } from "react";

/* [1182] 한 줄 → 누르면 창. 소유자(2026-11-15): "이런 건 한 줄로 표시하고 누르면 팝업처럼".
   출처 표 · 단계 설명처럼 늘 펼쳐 둘 필요가 없는 글을 단추 하나 뒤에 둔다.
   글은 닫혀 있어도 DOM 에 그대로다(hidden) — 검색 · 심사가 읽는 문장을 지우지 않는다. Esc · 바깥 누름 · 닫기 단추로 닫는다. */
export function PopupSheet({
  trigger,
  title,
  children,
  className = "",
}: {
  /** 단추 안에 그릴 것(한 줄) */
  trigger: ReactNode;
  /** 창 제목 */
  title: string;
  children: ReactNode;
  /** 단추 모양 */
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);
  return (
    <>
      <button type="button" aria-haspopup="dialog" aria-expanded={open} aria-controls={id} onClick={() => setOpen(true)} className={className}>
        {trigger}
      </button>
      <div
        id={id}
        hidden={!open}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={open ? "fixed inset-0 z-[70] flex items-end justify-center bg-[rgba(11,37,69,.55)] p-0 md:items-center md:p-6" : ""}
        onClick={(e) => {
          if (e.target === e.currentTarget) setOpen(false);
        }}
      >
        <div className="flex max-h-[82vh] w-full max-w-[560px] flex-col overflow-hidden rounded-t-2xl bg-surface md:rounded-2xl">
          <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-2.5">
            <p className="m-0 min-w-0 truncate t-body font-bold text-ink">{title}</p>
            <button type="button" onClick={() => setOpen(false)} className="press flex h-10 shrink-0 items-center rounded-lg px-2 t-sub font-bold text-text-2">
              닫기
            </button>
          </div>
          <div className="overflow-y-auto px-4 py-3">{children}</div>
        </div>
      </div>
    </>
  );
}
