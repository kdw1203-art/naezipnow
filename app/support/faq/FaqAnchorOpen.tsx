"use client";

import { useEffect } from "react";

/**
 * [1000] /support/faq#id 로 들어오면 그 <details> 를 펼친다.
 * 브라우저의 자동 펼침(ancestor details revealing)은 대상이 details **안쪽** 노드일 때만
 * 동작하고, id 가 details 자신에 있으면 닫힌 채 스크롤만 된다. id 는 JSON-LD·기존 링크와
 * 같은 값을 유지해야 하므로 여기서 펼쳐 준다. 렌더 결과 없음(훅만).
 */
export function FaqAnchorOpen() {
  useEffect(() => {
    function reveal() {
      const raw = window.location.hash.slice(1);
      if (!raw) return;
      let id = raw;
      try {
        id = decodeURIComponent(raw);
      } catch {
        /* 잘못된 인코딩은 원문으로 */
      }
      const el = document.getElementById(id) ?? document.getElementById(raw);
      if (!el) return;
      if (el instanceof HTMLDetailsElement && !el.open) {
        el.open = true;
        /* 펼친 뒤 높이가 바뀌므로 다시 맞춘다 */
        requestAnimationFrame(() => el.scrollIntoView({ block: "start" }));
      }
    }
    reveal();
    window.addEventListener("hashchange", reveal);
    return () => window.removeEventListener("hashchange", reveal);
  }, []);
  return null;
}
