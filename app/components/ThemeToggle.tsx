"use client";
/* [1022 · 정렬·글씨·테마] 지시 4 — 임의 px(text-[NNpx]·text-xs) → 램프 유틸(t-caption/t-sub/t-body/t-section/t-title) · 이모지 아이콘 식별자 → 선 아이콘 이름. 구조·데이터 변경 없음. */

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { Icon } from "./Icon";

/** #16 다크 모드 토글 — 전체 메뉴·설정에서 사용.
 *  hydration 안전: mounted 전에는 라이트 기준 라벨. */
export function ThemeToggle({ className }: { className?: string }) {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const isDark = mounted && resolvedTheme === "dark";

  return (
    <button
      type="button"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      aria-label={isDark ? "라이트 모드로 전환" : "다크 모드로 전환"}
      className={
        className ??
        "flex items-center gap-2.5 rounded-lg px-3 py-[9px] t-body font-semibold text-text-2 transition-colors active:bg-[rgba(29,79,216,.08)] active:text-primary"
      }
    >
      <Icon name={isDark ? "sun" : "moon"} size={17} />
      <span className="truncate">{isDark ? "라이트 모드" : "다크 모드"}</span>
    </button>
  );
}
