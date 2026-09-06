"use client";

import { useEffect } from "react";

/**
 * [968 · 35] 배경 스크롤 잠금 — iOS Safari 에서도 실제로 잠기는 방식.
 *
 * 왜 바꿨나: 모달·전체 메뉴·사진 캐러셀이 각자 `document.body.style.overflow =
 * "hidden"` 을 썼는데, iOS Safari 는 body 의 overflow 를 무시한다 — 시트 뒤의
 * 페이지가 그대로 스크롤·바운스되고 시트를 닫으면 엉뚱한 위치에 서 있게 된다.
 * 확실한 방법은 body 를 `position: fixed` 로 못 박고 현재 스크롤 위치만큼
 * `top` 을 음수로 줘서 화면이 튀지 않게 한 뒤, 풀 때 그 위치로 되돌리는 것이다.
 *
 * 규칙
 *  - 겹쳐 열릴 수 있으므로(모달 위 모달) 잠금 개수를 세고, 마지막 하나가 풀릴 때만
 *    body 를 복원한다. 첫 잠금이 기록한 스크롤 위치를 마지막 해제가 되돌린다.
 *  - `data-modal-open` 표식은 기존과 같이 유지한다 — 설치 배너 등이 "위에 모달이
 *    있다"를 이걸로 판단한다(ui/Modal 의 기존 계약).
 *  - 서버에서는 아무 일도 하지 않는다.
 */

let lockDepth = 0;
let savedScrollY = 0;
let savedBodyStyle: { position: string; top: string; left: string; right: string; width: string; overflow: string } | null = null;

function lock() {
  if (typeof document === "undefined") return;
  lockDepth += 1;
  if (lockDepth > 1) return;
  const body = document.body;
  savedScrollY = window.scrollY || document.documentElement.scrollTop || 0;
  savedBodyStyle = {
    position: body.style.position,
    top: body.style.top,
    left: body.style.left,
    right: body.style.right,
    width: body.style.width,
    overflow: body.style.overflow,
  };
  body.style.position = "fixed";
  body.style.top = `-${savedScrollY}px`;
  body.style.left = "0";
  body.style.right = "0";
  body.style.width = "100%";
  body.style.overflow = "hidden";
}

function unlock() {
  if (typeof document === "undefined") return;
  if (lockDepth === 0) return;
  lockDepth -= 1;
  if (lockDepth > 0) return;
  const body = document.body;
  const s = savedBodyStyle;
  body.style.position = s?.position ?? "";
  body.style.top = s?.top ?? "";
  body.style.left = s?.left ?? "";
  body.style.right = s?.right ?? "";
  body.style.width = s?.width ?? "";
  body.style.overflow = s?.overflow ?? "";
  savedBodyStyle = null;
  /* 복원은 instant — smooth 로 두면 잠갔던 자리로 "스르륵" 움직이는 게 보인다. */
  const html = document.documentElement;
  const prevBehavior = html.style.scrollBehavior;
  html.style.scrollBehavior = "auto";
  window.scrollTo(0, savedScrollY);
  html.style.scrollBehavior = prevBehavior;
}

/**
 * `active` 가 true 인 동안 배경 스크롤을 잠근다. `markModal` 이 true 면 body 에
 * `data-modal-open` 표식(겹침 개수)도 함께 관리한다.
 */
export function useScrollLock(active: boolean, opts?: { markModal?: boolean }): void {
  const markModal = opts?.markModal ?? false;
  useEffect(() => {
    if (!active) return;
    lock();
    if (markModal) {
      const depth = Number(document.body.dataset.modalOpen ?? "0") + 1;
      document.body.dataset.modalOpen = String(depth);
    }
    return () => {
      unlock();
      if (markModal) {
        const next = Number(document.body.dataset.modalOpen ?? "1") - 1;
        if (next > 0) document.body.dataset.modalOpen = String(next);
        else delete document.body.dataset.modalOpen;
      }
    };
  }, [active, markModal]);
}
