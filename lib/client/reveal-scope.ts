/**
 * [968 · 11] 스크롤 리빌(RevealOnScroll)의 관찰 범위 — 순수 판정만 모아 둔 모듈.
 *
 * 예전엔 MutationObserver 가 `document.body` 전체를 subtree 로 봤다. `[data-reveal]`
 * 이 하나도 없는 화면(노트 작성 폼)에서도 글자 하나 칠 때마다 콜백 → querySelectorAll
 * ×2 가 돌았다. 여기서는 (1) 리빌 노드가 있는 화면에서만, (2) 그 노드들을 전부 담는
 * 가장 가까운 컨테이너(본문 `<main>`)만 보고, (3) 추가된 노드 중 리빌 후보가 있을 때만
 * 훑도록 판정을 나눈다. DOM 타입을 직접 쓰지 않아 node 단위 테스트에서 가짜 노드로
 * 검증할 수 있다.
 */

/** DOM `Node.contains` 만 쓰는 최소 형태 — 테스트에서 가짜로 대체 가능 */
export interface ContainsLike {
  contains(other: unknown): boolean;
}

/**
 * 관찰 루트 — 리빌 노드가 전부 `main` 안에 있으면 `main`, 하나라도 밖에 있거나
 * `main` 이 없으면 `body`. 나중에 붙는 노드(클라이언트 목록)도 대개 본문 안이라
 * `main` 이면 충분하고, 헤더·토스트·탭바의 변화는 아예 콜백을 만들지 않는다.
 */
export function pickRevealRoot<T extends ContainsLike>(
  revealNodes: readonly unknown[],
  main: T | null,
  body: T,
): T {
  if (!main) return body;
  if (revealNodes.length === 0) return body;
  return revealNodes.every((n) => main.contains(n)) ? main : body;
}

/** 추가된 노드 중 리빌 후보(자기 자신이거나 자손이 `[data-reveal]`)가 있는가 */
export interface AddedNodeLike {
  /** Element 면 true — Text/Comment 는 건너뛴다 */
  isElement: boolean;
  hasReveal: boolean;
  containsReveal: boolean;
}
export function addedNodesNeedScan(added: readonly AddedNodeLike[]): boolean {
  for (const n of added) {
    if (!n.isElement) continue;
    if (n.hasReveal || n.containsReveal) return true;
  }
  return false;
}
