"use client";

import { useCopy } from "@/lib/ui/use-copy";

/**
 * 복사 버튼 (마이 · 친구 추천).
 * variant="code" → 큰 코드 박스, variant="link" → 링크 필드.
 * [966] 클립보드·폴백·토스트는 useCopy 로. [1012] 규칙 5·6 — 라벨은 동사+대상("초대 코드 복사"), 느낌표 금지.
 */
export function CopyLink({
  value,
  variant = "link",
}: {
  value: string;
  variant?: "code" | "link";
}) {
  const { copy, copied } = useCopy(variant === "code" ? "코드를 복사했어요" : "링크를 복사했어요");

  if (variant === "code") {
    return (
      /* [v4 · 규칙 10] 가운데 정렬 → 왼쪽(코드 + 복사 버튼 한 줄) */
      <div className="flex flex-wrap items-center gap-3">
        <div className="select-all font-mono t-title tracking-[0.18em] text-text-1">
          {value}
        </div>
        <button
          type="button"
          onClick={() => void copy(value)}
          className="btn-primary press rounded-lg px-6 py-2.5 text-[13px]"
        >
          {copied ? "복사됐어요" : "초대 코드 복사"}
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-stretch gap-2">
      <div className="flex-1 truncate rounded-lg border border-line bg-surface px-3.5 py-3 t-body text-text-2">
        {value}
      </div>
      <button
        type="button"
        onClick={() => void copy(value)}
        /* [v4 · 규칙 2] 같은 화면의 코드 복사가 채움 파랑 — 링크 복사는 테두리 */
        className="btn-outline press shrink-0 rounded-lg px-4 py-3 text-[13px]"
      >
        {copied ? "복사됐어요" : "초대 링크 복사"}
      </button>
    </div>
  );
}

export default CopyLink;
