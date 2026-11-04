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
