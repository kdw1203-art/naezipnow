"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

/**
 * [962] 당겨서 새로고침 — 모션 시스템 v1.0 §02 "스피너 대신 온점이 물방울처럼 늘어난다".
 *
 * 언제만: 홈 화면에 설치한 앱(standalone)에서. 브라우저에는 이미 자체 새로고침 제스처가
 * 있어 겹치면 두 번 당겨진다. 맨 위(scrollY 0)에서 72px 이상 아래로 끌면 한지 띠가
 * 내려오고 온점이 늘어나며 `router.refresh()` 로 서버 데이터를 다시 받는다.
 * 입력 중(input/textarea 포커스)이나 가로 스크롤 레일 위에서는 반응하지 않는다.
 *
 * [968 · 27] 옵트아웃 — 아래 두 가지가 더 붙었다.
 *  1. `data-ptr-ignore` 속성: 터치가 시작된 요소의 **조상 어디에든** 이 속성이 있으면
 *     제스처를 시작하지 않는다. 자기 손가락 끌기를 가진 것들에 단다 — 지도 루트,
 *     가로 캐러셀, 바텀시트(끌어서 닫기), 가로 칩 레일. 값은 필요 없다:
 *       <div data-ptr-ignore="">…</div>
 *     (fixed inset-0 처럼 scrollY 가 늘 0 인 화면에서 특히 필수 — 안 달면 72px 만
 *     끌어도 router.refresh() 가 화면을 통째로 다시 띄운다.)
 *  2. 경로 비활성: /map 은 화면 전체가 지도라 제스처 자체를 붙이지 않는다.
 */
const THRESHOLD = 72;

/** [968 · 27] 이 속성을 가진 조상 안에서는 당겨서 새로고침이 시작되지 않는다 */
export const PTR_IGNORE_ATTR = "data-ptr-ignore";

/** [968 · 27] 제스처를 아예 붙이지 않는 경로 — 화면 자체가 끌기 UI 인 곳 */
const PTR_DISABLED_PATHS = ["/map"];

export function isPtrDisabledPath(pathname: string | null): boolean {
  if (!pathname) return false;
  return PTR_DISABLED_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export function PullToRefresh() {
  const router = useRouter();
  const pathname = usePathname();
  const disabled = isPtrDisabledPath(pathname);
  const [state, setState] = useState<"idle" | "pull" | "refresh">("idle");
  const startY = useRef<number | null>(null);
  const armed = useRef(false);

  useEffect(() => {
    if (disabled) return;
    let standalone = false;
    try {
      standalone =
        window.matchMedia("(display-mode: standalone)").matches ||
        (navigator as Navigator & { standalone?: boolean }).standalone === true;
    } catch {
      standalone = false;
    }
    if (!standalone) return;

    const onStart = (e: TouchEvent) => {
      if (window.scrollY > 0 || e.touches.length !== 1) return;
      const t = e.target as HTMLElement | null;
      /* [968 · 27] [data-ptr-ignore] 조상 — 지도·캐러셀·바텀시트의 자기 끌기와 겹치지 않게 */
      if (
        t?.closest(
          `input, textarea, [contenteditable], .scroll-x-hidden-bar, .ticker-band, [${PTR_IGNORE_ATTR}]`,
        )
      )
        return;
      startY.current = e.touches[0]!.clientY;
      armed.current = false;
    };
    const onMove = (e: TouchEvent) => {
      if (startY.current === null) return;
      const dy = e.touches[0]!.clientY - startY.current;
      if (dy > THRESHOLD && window.scrollY === 0) {
        if (!armed.current) {
          armed.current = true;
          setState("pull");
        }
      } else if (armed.current) {
        armed.current = false;
        setState("idle");
      }
    };
    const onEnd = () => {
      if (armed.current) {
        armed.current = false;
        setState("refresh");
        router.refresh();
        window.setTimeout(() => setState("idle"), 1100);
      }
      startY.current = null;
    };
    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchmove", onMove, { passive: true });
    window.addEventListener("touchend", onEnd, { passive: true });
    window.addEventListener("touchcancel", onEnd, { passive: true });
    return () => {
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onEnd);
      window.removeEventListener("touchcancel", onEnd);
    };
  }, [router, disabled]);

  /* [968 · 27] 비활성 경로에서는 띠 자체를 그리지 않는다 — DOM 도 리스너도 없다 */
  if (disabled) return null;

  return (
    <div className="njn-ptr" data-state={state} aria-hidden={state === "idle"} role="status">
      <span className="njn-dot" />
      {state === "refresh" ? "지금 불러오는 중" : "놓으면 새로고침"}
    </div>
  );
}

export default PullToRefresh;
