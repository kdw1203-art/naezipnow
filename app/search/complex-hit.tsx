import { highlightParts } from "@/lib/search/highlight";
import { complexFacts, complexPlace, type ComplexPreview } from "@/lib/search/complex-preview";

/* [1008 · S] 단지 검색 결과 한 줄의 작은 조각 — 단지 선택기·헤더·홈·지도·/search 가 같이 쓴다.
   서버/클라이언트 어느 쪽에서도 그려진다(훅 없음). 번들에 실리므로 작게. */

/** 이름에서 검색어와 맞은 글자만 굵게 — 괄호·띄어쓰기를 건너뛰어 맞춘다("한가람삼성" → 한가람(삼성)) */
export function Hl({ text, q }: { text: string; q: string }) {
  const parts = highlightParts(text, q);
  if (!parts.some((p) => p.hit)) return <>{text}</>;
  return (
    <>
      {parts.map((p, i) =>
        p.hit ? (
          <mark key={i} className="bg-transparent font-extrabold text-primary">
            {p.text}
          </mark>
        ) : (
          <span key={i}>{p.text}</span>
        ),
      )}
    </>
  );
}

/** 오타 추정 후보 표시 — "이 이름이 맞다" 가 아니라 "비슷하다" 를 정직하게 */
export function FuzzyBadge() {
  return (
    <span className="shrink-0 rounded border border-line px-1 text-[10px] font-bold text-text-3">비슷한 이름</span>
  );
}

/** "안양 동안구 관양동 · 1,710세대 · 6개월 거래 120건" — 같은 이름 단지를 가를 근거(모르는 값은 뺀다) */
export function complexMetaLine(p: ComplexPreview): string {
  return [complexPlace(p), ...complexFacts(p)].filter(Boolean).join(" · ");
}
