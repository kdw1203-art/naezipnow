/**
 * [1025c · 브리핑] 표 강조 타입 — 손잡이. 폼(BriefPublisherForm)의 칩이 고르면 문서(서버 조각)의 미니 카드·표 행 중
 * 같은 타입이 강조된다. 값은 이 탭의 메모리에만(저장 안 함 — 문서를 열 때마다 거래 많은 첫 타입이 기본).
 *
 * 폼과 문서는 다른 React 트리라 상태를 못 나눈다 — publisher-store 와 같은 방식으로 window 이벤트를 쏘고
 * 문서 쪽 다리(BriefHighlightBridge)가 듣는다. null = 기본(서버가 첫 행에 붙인 강조 그대로).
 */

/** 같은 탭 안 갱신 신호 */
export const HIGHLIGHT_EVENT = "nz-brief-highlight";
/** 문서 안 강조 대상 표식 — 미니 카드·표 행이 `data-brief-area="38"` 을 단다 */
export const HIGHLIGHT_ATTR = "data-brief-area";
/** 강조 클래스(globals.css [1025c · 브리핑]) */
export const HIGHLIGHT_CLASS = "brief-hl";

let current: number | null = null;

export function readHighlight(): number | null {
  return current;
}

export function writeHighlight(areaM2: number | null): void {
  current = areaM2 != null && Number.isFinite(areaM2) ? areaM2 : null;
  if (typeof window === "undefined") return;
  try {
    window.dispatchEvent(new CustomEvent(HIGHLIGHT_EVENT));
  } catch {
    /* 아주 오래된 브라우저 — 문서 강조만 안 바뀐다 */
  }
}

export function subscribeHighlight(onChange: (areaM2: number | null) => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  const fire = () => onChange(current);
  window.addEventListener(HIGHLIGHT_EVENT, fire);
  return () => window.removeEventListener(HIGHLIGHT_EVENT, fire);
}

/**
 * 문서 안 강조를 DOM 에 적용한다(순수 DOM — 서버 HTML 은 그대로 두고 클래스만 옮긴다).
 * areaM2 가 null 이면 첫 대상(거래 많은 타입)으로 되돌린다. 라벨(`data-brief-hl-label`)도 "38㎡ 강조" 로 맞춘다.
 */
export function applyHighlight(root: ParentNode, areaM2: number | null): number | null {
  const targets = Array.from(root.querySelectorAll<HTMLElement>(`[${HIGHLIGHT_ATTR}]`));
  if (targets.length === 0) return null;
  const areas = targets.map((el) => Number(el.getAttribute(HIGHLIGHT_ATTR)));
  const pick = areaM2 != null && areas.includes(areaM2) ? areaM2 : areas[0];
  for (const el of targets) el.classList.toggle(HIGHLIGHT_CLASS, Number(el.getAttribute(HIGHLIGHT_ATTR)) === pick);
  for (const label of Array.from(root.querySelectorAll<HTMLElement>("[data-brief-hl-label]"))) label.textContent = `${pick}㎡ 강조`;
  return pick;
}
