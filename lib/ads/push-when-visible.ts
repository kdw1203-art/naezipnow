/* [1105] 애드센스 유닛은 보이는(폭 > 0) 칸에서만 <ins> 를 그리고 push 한다.
   1105 에서 비회원 광고 잠금이 처음 풀리자 폰에서 CSS 로 숨긴 PC 전용 칸(hidden lg:block)의 <ins> 때문에 애드센스가
   "availableWidth=0" TagError 를 페이지 오류로 던졌다(로컬 실측 홈 폰 2건). push({}) 는 "내 칸"이 아니라 문서 순서상
   처리 안 된 첫 <ins> 를 채우므로, 숨긴 칸은 <ins> 자체를 그리지 않아야 한다 — 칸 상자의 폭을 재다가 보이게 되면(창 크기
   변경 · 회전) 그때 한 번 알린다. 반환값은 정리 함수(관찰 해제). */
export function whenBoxVisible(el: HTMLElement | null, onVisible: () => void): () => void {
  const noop = () => {};
  if (!el) return noop;
  if (el.offsetWidth > 0) {
    onVisible();
    return noop;
  }
  if (typeof ResizeObserver === "undefined") return noop;
  const ro = new ResizeObserver(() => {
    if (el.offsetWidth > 0) {
      ro.disconnect();
      onVisible();
    }
  });
  ro.observe(el);
  return () => ro.disconnect();
}

/* [1201] 안 채워진 칸은 접는다. 애드센스는 <ins> 에 data-ad-status="filled|unfilled" 를 적는데, 스크립트가 막히면
   (광고 차단기 · 회사망) 아무것도 적지 않아 336×280 빈 상자가 그대로 남았다 — 홈 왼쪽 칸에 큰 빈 공간(운영 2026-11-21).
   unfilled 이면 바로, 정해진 시간 안에 상태가 안 적히면 그때 onDead 를 부른다. filled 면 관찰을 멈춘다. */
export function watchAdFill(box: HTMLElement | null, onDead: () => void, ms = 8000): () => void {
  if (!box || typeof MutationObserver === "undefined") return () => {};
  let done = false;
  const statusOf = () => box.querySelector("ins.adsbygoogle")?.getAttribute("data-ad-status") ?? null;
  const finish = (dead: boolean) => {
    if (done) return;
    done = true;
    mo.disconnect();
    clearTimeout(timer);
    clearTimeout(blockedTimer);
    if (dead) onDead();
  };
  const check = () => {
    const s = statusOf();
    if (s === "filled") finish(false);
    else if (s === "unfilled") finish(true);
  };
  const mo = new MutationObserver(check);
  mo.observe(box, { subtree: true, attributes: true, attributeFilter: ["data-ad-status"], childList: true });
  const timer = setTimeout(() => finish(statusOf() !== "filled"), ms);
  /* [1203] 스크립트 자체가 막혔으면(광고 차단기 — window.adsbygoogle 가 그냥 배열로 남고 loaded 가 없다) 8초를 기다리지 않고 3초에 접는다 */
  const blockedTimer = setTimeout(() => {
    const g = (globalThis as { adsbygoogle?: { loaded?: boolean } }).adsbygoogle;
    if (!done && statusOf() === null && g?.loaded !== true) finish(true);
  }, Math.min(3000, ms));
  check();
  return () => {
    clearTimeout(blockedTimer);
    finish(false);
  };
}
