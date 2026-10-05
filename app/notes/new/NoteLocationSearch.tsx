"use client";
/* [1022 · 정렬·글씨·테마] 지시 4 — 임의 px(text-[NNpx]·text-xs) → 램프 유틸(t-caption/t-sub/t-body/t-section/t-title) · 이모지 아이콘 식별자 → 선 아이콘 이름. 구조·데이터 변경 없음. */
/* [1032] 번들 — 검색 드롭다운(입력·조회·결과·직접 입력, NoteLocationDropdown)은 카드를 **눌렀을 때만** 내려받는다.
   /notes/new 첫 로드에는 이 카드 버튼만 남는다(1단계에 지도 조각·타입 조각이 들어오면서 예산 470KB 를 지키기 위해). */

import { useEffect, useRef, useState } from "react";
import nextDynamic from "next/dynamic";
import { Icon } from "@/app/components/Icon";

const NoteLocationDropdown = nextDynamic(() => import("./NoteLocationDropdown").then((m) => m.NoteLocationDropdown), {
  ssr: false,
  loading: () => (
    <div className="glass-strong absolute left-0 right-0 top-[calc(100%+6px)] z-30 rounded-lg border border-line p-2 shadow-xl">
      <div className="h-[42px] animate-pulse rounded-xl bg-surface" />
    </div>
  ),
});

/**
 * 임장노트 위치 검색 — 단지명·주소로 검색해 노트에 위치를 연결한다.
 * /api/search/suggest 재사용: 내부 단지(suggestions) + 장소검색 폴백(places).
 * 선택 시 상위로 {aptName, region, complexId?, lat?, lng?} 전달. 본체는 NoteLocationDropdown.
 */

export type NoteLocation = {
  aptName: string;
  region: string;
  complexId?: string | null;
  lat?: number | null;
  lng?: number | null;
};

export function NoteLocationSearch({
  value,
  onChange,
}: {
  value: NoteLocation;
  onChange: (loc: NoteLocation) => void;
}) {
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  // 바깥 클릭 시 닫기
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  return (
    <div ref={boxRef} className="relative">
      {/* 현재 위치 카드 (클릭 시 검색 열림) */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="rise-in-1 card flex w-full items-center gap-2 rounded-lg px-3.5 py-3 text-left"
      >
        <Icon name="pin" size={16} className="shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="truncate t-body font-bold text-ink">{value.aptName || "단지·주소 검색"}</div>
          <div className="truncate t-sub text-text-3">
            {value.region ? `${value.region} · 변경` : "단지명 또는 주소 검색"}
          </div>
        </div>
        <Icon name="search" size={15} className="shrink-0 text-text-3" />
      </button>

      {/* 검색 드롭다운 — 열릴 때만 내려받는다 */}
      {open ? (
        <NoteLocationDropdown
          value={value}
          onChange={(loc) => {
            onChange(loc);
          }}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </div>
  );
}
