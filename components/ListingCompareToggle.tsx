"use client";

import { useState, useSyncExternalStore } from "react";
import { Icon } from "@/app/components/Icon";
import {
  subscribe,
  has,
  count,
  toggle,
  MAX_COMPARE,
  type CompareListing,
} from "./listing-compare-store";

/**
 * 목록 카드용 "비교 담기" 토글.
 * 카드 전체가 <Link>이므로 클릭 시 이동을 막고(stopPropagation/preventDefault)
 * 비교함 스토어만 토글한다.
 */
export function ListingCompareToggle({
  item,
  className = "",
}: {
  item: CompareListing;
  className?: string;
}) {
  const active = useSyncExternalStore(
    subscribe,
    () => has(item.id),
    () => false,
  );
  const total = useSyncExternalStore(
    subscribe,
    () => count(),
    () => 0,
  );
  const full = !active && total >= MAX_COMPARE;
  /* [1009 · T] 담을 때 체크가 한 번 튄다(키를 바꿔 매번 재생). 가득 찼다는 설명은 title= 말풍선(휴대폰에선 안 보임)
     대신 버튼 글자로 — "3개까지 담겨요". 결과(담김·빠짐)는 바닥 비교함이 바로 보여 준다(토스트는 비교함을 가린다). */
  const [pop, setPop] = useState(0);

  return (
    <button
      type="button"
      onClick={(e) => {
        // 카드 <Link> 네비게이션 차단
        e.preventDefault();
        e.stopPropagation();
        if (full) return;
        if (toggle(item)) setPop((n) => n + 1);
      }}
      aria-pressed={active}
      aria-disabled={full}
      className={`press inline-flex min-h-[40px] shrink-0 items-center gap-1 rounded-[8px] border px-2.5 py-[5px] text-[12px] font-bold transition-colors ${
        active
          ? "border-primary/35 bg-primary-soft text-primary"
          : full
            ? "cursor-not-allowed border-line bg-bg text-text-3"
            : "border-line bg-surface text-text-2 hover:border-primary/35 hover:text-primary"
      } ${className}`}
    >
      <Icon
        key={active ? `on${pop}` : "off"}
        name={active ? "check" : "scale"}
        size={13}
        strokeWidth={2}
        className={active && pop ? "njn-pop-once" : ""}
      />
      {active ? "비교중" : full ? `${MAX_COMPARE}개까지 담겨요` : "비교 담기"}
    </button>
  );
}
