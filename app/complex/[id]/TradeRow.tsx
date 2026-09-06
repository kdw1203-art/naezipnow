"use client";

import type { HubTrade } from "@/lib/complex/hub-trades";

/* [968 · 4] 실거래 표 한 줄 — hub-client(요약 탭 미리보기)와 PriceTab(시세 탭 전체)이
   같은 모양을 쓴다. 시세 탭을 next/dynamic 으로 떼면서 둘이 공유하는 조각만 여기로. */

export function deltaClass(tone: "up" | "down" | "flat"): string {
  return tone === "down" ? "delta-down" : tone === "up" ? "delta-up" : "delta-flat";
}

export function TradeRow({ t, divider }: { t: HubTrade; divider: "top" | "bottom" | "none" }) {
  return (
    <div
      className={`flex items-center justify-between px-3.5 py-[7px] text-[12px] ${
        divider === "top" ? "border-t border-line" : divider === "bottom" ? "border-b border-divider" : ""
      }`}
    >
      <span className="text-text-2">
        {t.date}
        <span className="ml-1.5 text-text-3">{t.sub}</span>
      </span>
      <span className="flex shrink-0 items-baseline gap-1.5">
        <span className="font-extrabold text-ink">{t.price}</span>
        <span className={`text-[10px] ${deltaClass(t.tone)}`}>{t.delta}</span>
      </span>
    </div>
  );
}
