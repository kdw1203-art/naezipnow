"use client";

/* [1025c · 브리핑] 문서 쪽 다리 — 폼의 "표 강조 타입" 칩이 고른 타입을 문서(서버 HTML)의 미니 카드·표 행에 옮긴다.
   그리는 것은 없다(null). 문서는 서버가 첫 타입을 강조한 채 보내고, 이 다리는 이벤트가 올 때 클래스만 옮긴다 —
   문서 본문을 클라이언트 부품으로 바꾸지 않는다(HTML 그대로 · 번들 0 에 가깝다). */
import { useEffect } from "react";
import { applyHighlight, subscribeHighlight } from "@/lib/brief/highlight-store";

export function BriefHighlightBridge({ scope }: { scope: string }) {
  useEffect(() => {
    const root = document.querySelector(scope);
    if (!root) return;
    return subscribeHighlight((area) => {
      applyHighlight(root, area);
    });
  }, [scope]);
  return null;
}

export default BriefHighlightBridge;
