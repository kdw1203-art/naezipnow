"use client";

import { useState } from "react";
import type { ReactNode } from "react";

/* 표 / 타임라인 뷰 전환 — 상호작용(토글)만 클라이언트로 격리.
   두 뷰 모두 page.tsx 에서 서버 렌더된 노드를 받는다.
   [v4 · 부품 "밑줄 탭"] 회색 알약 세그먼트 + 아이콘(막대·시계) → 글자 탭 + 선택 칸 아래 2px 남색 선
   (app/town/TownCategoryNav · 단지 허브 탭과 같은 모양). 아이콘은 조작 버튼에만(규칙 7). */

type ViewMode = "table" | "timeline";

const TABS: { id: ViewMode; label: string }[] = [
  { id: "table", label: "표" },
  { id: "timeline", label: "타임라인" },
];

export function CompareView({
  table,
  timeline,
}: {
  table: ReactNode;
  timeline: ReactNode;
}) {
  const [view, setView] = useState<ViewMode>("table");

  return (
    <div className="flex flex-col gap-3">
      <div role="tablist" aria-label="회차 비교 보기 방식" className="flex gap-5 border-b border-line">
        {TABS.map((t) => {
          const active = view === t.id;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setView(t.id)}
              className={`min-h-10 border-b-2 pb-2.5 pt-3 t-body font-bold transition-colors ${
                active ? "border-brand-hanji-ink text-ink" : "border-transparent text-text-3"
              }`}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      <div>{view === "table" ? table : timeline}</div>
    </div>
  );
}
