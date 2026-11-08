"use client";
/* [1110 · AI 분석 2차 통폐합] 시/도 필터 — 107곳을 한 번에 펼치지 않는다(규칙: 5개를 넘으면 필터식). 칩 한 줄(시/도)과 그 시/도의 판 하나.
   판(표)은 서버가 그린 조각(panels) — 여기서는 어느 판을 보일지만 바꾼다(데이터 왕복 없음 · 번들엔 칩 로직뿐). 처음 보이는 시/도는 첫 칩(서울).
   선택은 URL 에 남기지 않는다(ISR 캐시 한 벌 · 같은 화면을 모두에게). */

import { useId, useState, type ReactNode } from "react";

export function SidoFilter({ sidos, counts, panels }: { sidos: string[]; counts: number[]; panels: ReactNode[] }) {
  const [idx, setIdx] = useState(0);
  const base = useId();
  if (sidos.length === 0) return null;
  return (
    <div className="flex flex-col gap-2.5">
      <div role="tablist" aria-label="시/도" className="scroll-x-hidden-bar -mx-1 flex gap-1.5 px-1 md:flex-wrap">
        {sidos.map((s, i) => {
          const on = i === idx;
          return (
            <button
              key={s}
              type="button"
              role="tab"
              id={`${base}-tab-${i}`}
              aria-selected={on}
              aria-controls={`${base}-panel-${i}`}
              onClick={() => setIdx(i)}
              className={`chip t-sub shrink-0 px-3 py-1.5 font-bold transition-colors ${on ? "chip-active" : "border border-line bg-surface text-text-2"}`}
            >
              {s} <span className={`t-caption tabular-nums ${on ? "" : "text-text-3"}`}>{counts[i]}</span>
            </button>
          );
        })}
      </div>
      {panels.map((p, i) => (
        <div key={sidos[i]} role="tabpanel" id={`${base}-panel-${i}`} aria-labelledby={`${base}-tab-${i}`} hidden={i !== idx}>
          {p}
        </div>
      ))}
    </div>
  );
}
