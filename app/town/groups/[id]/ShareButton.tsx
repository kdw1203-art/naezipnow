"use client";
/* [1022 · 정렬·글씨·테마] 지시 4 — 임의 px(text-[NNpx]·text-xs) → 램프 유틸(t-caption/t-sub/t-body/t-section/t-title) · 이모지 아이콘 식별자 → 선 아이콘 이름. 구조·데이터 변경 없음. */

import { ShareLinkButton } from "@/app/components/ShareLinkButton";

/* 모임 공유 — [966] 공용 ShareLinkButton 의 얇은 래퍼(시트→클립보드→토스트는 거기서).
   이 파일이 남은 이유: 모임 상세 page.tsx 의 임포트를 건드리지 않기 위해서다. */

export function ShareButton({ title }: { title: string }) {
  return (
    <ShareLinkButton
      title={title}
      text={`${title} · 임장 모임`}
      label="공유"
      copiedLabel="링크 복사됨 ✓"
      variant="text"
      className="btn-secondary flex-1 rounded-xl p-3 text-center t-body"
    />
  );
}
