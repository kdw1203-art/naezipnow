"use client";
/* [1026 · 지역 시세] 온도 허브의 Q&A · "이 데이터를 인용하실 때" — 폰은 닫힌 <details>(1025 표준: 긴 근거·FAQ 는 접는다),
   데스크톱(lg+)은 펼친 채. 첫 HTML 은 닫힘(폰 우선)이고 마운트 뒤 lg 이상이면 연다 — 페이지 맨 아래라 여닫힘이 첫 화면에 보이지 않는다.
   내용은 늘 DOM 에 있다(QaBlock 의 FAQ JSON-LD 는 보이는 문답과 같은 배열 그대로). 펼친 데스크톱에서는 요약 줄을 숨긴다(제목이 두 번 서지 않게). */
import { useEffect, useRef, type ReactNode } from "react";

export function OpenOnDesktop({ summary, note, children }: { summary: string; note?: string; children: ReactNode }) {
  const ref = useRef<HTMLDetailsElement | null>(null);
  useEffect(() => {
    try {
      if (ref.current && window.matchMedia("(min-width: 1024px)").matches) ref.current.open = true;
    } catch {
      /* matchMedia 가 없으면 닫힌 채 — 요약 줄을 누르면 열린다 */
    }
  }, []);
  return (
    <details ref={ref} className="group">
      <summary className="card mb-3 flex min-h-10 cursor-pointer list-none items-center justify-between gap-3 rounded-2xl p-4 max-md:p-3.5 lg:group-open:hidden [&::-webkit-details-marker]:hidden">
        <span className="min-w-0">
          <span className="t-section text-ink">{summary}</span>
          {note && <span className="ml-1.5 t-caption text-text-3">{note}</span>}
        </span>
        <span className="shrink-0 text-text-3 transition-transform group-open:rotate-45" aria-hidden="true">
          +
        </span>
      </summary>
      {children}
    </details>
  );
}
