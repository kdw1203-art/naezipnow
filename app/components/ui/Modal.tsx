"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useScrollLock } from "@/lib/client/use-scroll-lock";
import { decideSwipeAxis, SHEET_AXIS_SLOP, shouldCloseSheet } from "@/lib/client/swipe-gesture";

/**
 * 공용 모달 오버레이 (#227).
 *
 * 왜 포털이 필요한가 — 실제로 났던 버그:
 *   `.rise-in*` 은 `animation: riseIn … both` 라서 애니메이션이 끝난 뒤에도
 *   마지막 키프레임의 `transform: translateY(0)` 이 **계속 남는다**. transform 이
 *   none 이 아닌 요소는 (1) 자손 `position: fixed` 의 컨테이닝 블록이 되고
 *   (2) 새 쌓임 맥락(stacking context)을 만든다. 그래서 `rise-in` 섹션 안에서
 *   `fixed inset-0 z-50` 오버레이를 열면 뷰포트가 아니라 **그 섹션 박스**에
 *   맞춰 잘리고, z-50 도 섹션 안에서만 유효해 헤더(z-50)·카테고리 줄(z-40)
 *   밑으로 깔린다. 화면에는 배경 딤이 없고 폼이 헤더 뒤로 파고든 모습이 된다.
 *   `card`/`glass` 의 backdrop-filter 도 같은 함정을 만든다(MobileMenu 주석 참고).
 *
 *   ancestor 를 하나씩 고쳐 봐야 다음에 누가 `rise-in` 안에 모달을 넣으면 또
 *   재발한다. 그래서 오버레이를 document.body 로 **포털**해 조상과 무관하게
 *   항상 뷰포트 기준으로 그린다 — 구조적으로 재발하지 않는 쪽을 택한다.
 *
 * 함께 처리하는 것: 스크롤 잠금, ESC 닫기, 배경 클릭 닫기, 포커스 복원.
 * 브라우저 기본 대화상자(confirm/alert)는 쓰지 않는다.
 */

/** 헤더(z-50)·카테고리 줄(z-40)보다 위, 소프트 가입 프롬프트(z-190)·코치마크(z-200)보다 아래. */
const MODAL_Z = 120;

export type ModalProps = {
  open: boolean;
  onClose: () => void;
  /** 스크린리더용 이름 — 모달마다 반드시 다르게 준다. */
  label: string;
  children: ReactNode;
  /** 패널 최대 너비 (기본 460px) */
  maxWidth?: number;
  /** 배경 클릭으로 닫지 않을 때 (제출 중 등) */
  dismissOnBackdrop?: boolean;
};

export function Modal({
  open,
  onClose,
  label,
  children,
  maxWidth = 460,
  dismissOnBackdrop = true,
}: ModalProps) {
  // SSR 에는 document 가 없다 — 마운트 후에만 포털을 만든다.
  const [mounted, setMounted] = useState(false);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => setMounted(true), []);

  const handleClose = useCallback(() => onClose(), [onClose]);

  // ESC 로 닫기 + Tab 순환(포커스 트랩, 항목 48)
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        handleClose();
        return;
      }
      /* 포커스 트랩 — aria-modal 은 보조기술에 "밖은 없는 셈 치라"고 말하지만
         키보드 Tab 은 막지 않는다. 트랩이 없으면 Tab 이 모달 뒤 페이지로
         새 나가고, 스크린리더 밖 키보드 사용자는 어디에 있는지 알 수 없다. */
      if (e.key !== "Tab") return;
      const panel = panelRef.current;
      if (!panel) return;
      const focusables = Array.from(
        panel.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((el) => el.offsetParent !== null || el === document.activeElement);
      if (focusables.length === 0) {
        e.preventDefault();
        panel.focus();
        return;
      }
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement;
      if (e.shiftKey) {
        if (active === first || active === panel || !panel.contains(active)) {
          e.preventDefault();
          last.focus();
        }
      } else if (active === last || !panel.contains(active)) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, handleClose]);

  /* 배경 스크롤 잠금 — 모달 뒤 목록이 같이 스크롤되면 위치를 잃는다.
     함께 `data-modal-open` 을 붙인다: 이 오버레이는 화면 전체를 덮으므로
     그 아래 배너(앱 설치 안내 등)는 보이기만 하고 눌리지 않는다. 배너 쪽이
     "지금 위에 모달이 있다"를 알 방법이 필요해서 body 에 표식을 남긴다.
     여러 모달이 겹칠 수 있으니 열린 개수를 세서 마지막 하나가 닫힐 때 지운다.
     [968 · 35] body.style.overflow 는 iOS Safari 가 무시한다 — 공용 훅(body fixed +
     top 복원)으로 바꿨다. `data-modal-open` 계약은 훅의 markModal 이 그대로 지킨다. */
  useScrollLock(open, { markModal: true });

  /* [968 · 36] 바텀시트 끌어서 닫기 — 핸들(상단 44px 띠)에서 시작한 포인터만 본다.
     시트 본문에서 시작한 끌기는 본문 스크롤 몫이라 건드리지 않는다.
     축은 8px 에서 한 번만 정하고(가로면 무시), 아래로 60px 넘게 끌고 놓으면 닫힌다.
     끌리는 동안은 translateY 로 손가락을 따라가고(감속 모션 설정이면 생략), 임계
     미만이면 제자리로 돌아간다. 상태로 다시 그리지 않고 ref 로 style 만 만진다 —
     move 마다 리렌더하면 저가 기기에서 손가락이 시트보다 앞서간다. */
  const drag = useRef<{
    id: number;
    x: number;
    y: number;
    axis: "x" | "y" | null;
    follow: boolean;
  } | null>(null);

  const setPanelOffset = (dy: number, animate: boolean) => {
    const panel = panelRef.current;
    if (!panel) return;
    panel.style.transition = animate ? "transform 180ms ease-out" : "";
    panel.style.transform = dy > 0 ? `translateY(${dy}px)` : "";
  };

  const onHandlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    let follow = true;
    try {
      follow = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    } catch {
      follow = true;
    }
    drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, axis: null, follow };
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* 캡처를 못 받아도 핸들 위에서의 끌기는 그대로 동작한다 */
    }
  };

  const onHandlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (d.axis === null) {
      d.axis = decideSwipeAxis(dx, dy, SHEET_AXIS_SLOP);
      if (d.axis === "x") {
        drag.current = null;
        return;
      }
      if (d.axis === null) return;
    }
    if (d.follow) setPanelOffset(dy, false);
  };

  const endHandleDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    drag.current = null;
    const dy = e.clientY - d.y;
    if (shouldCloseSheet(d.axis, dy)) {
      setPanelOffset(0, false);
      handleClose();
      return;
    }
    setPanelOffset(0, d.follow);
  };

  // 열릴 때 패널로 포커스를 옮기고, 닫히면 원래 버튼으로 돌려준다.
  useEffect(() => {
    if (!open) return;
    restoreFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    panelRef.current?.focus();
    return () => {
      restoreFocusRef.current?.focus?.();
    };
  }, [open]);

  if (!open || !mounted) return null;

  return createPortal(
    <div
      /* [968 · 27] 오버레이 위에서는 body 가 잠겨 scrollY 가 늘 0 — 설치 앱의 당겨서
         새로고침이 배경·시트 어디를 끌어도 시작하지 않게 한다. */
      data-ptr-ignore=""
      className="fixed inset-0 flex items-end justify-center bg-[rgba(16,24,40,.45)] backdrop-blur-[2px] sm:items-center"
      style={{ zIndex: MODAL_Z }}
      onMouseDown={(e) => {
        // 패널 내부에서 시작한 드래그가 배경에서 끝나도 닫히면 안 되므로 mousedown 대상으로 판단한다.
        if (dismissOnBackdrop && e.target === e.currentTarget) handleClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        style={{ maxWidth }}
        /* 아래 여백에 safe-area 를 더한다(standalone 점검 337). 모바일에서 이
           패널은 `items-end` 라 화면 **바닥에 붙는 시트**다. 브라우저 탭 모드는
           하단 툴바가 홈 인디케이터를 덮어 인셋이 0 이라 p-5 로도 멀쩡해 보이지만,
           홈 화면에 추가해 열면 바닥 34px 이 인디케이터 자리가 된다. 실측:
           베타 안내 모달의 버튼 두 개가 아래 여백 20px 로 끝나 14px 이 인디케이터
           안에 들어가 있었다(390x844, inset-bottom 34).
           sm 이상은 `items-center` 로 가운데 뜨므로 인셋을 더할 이유가 없다 —
           더하면 안 붙은 쪽에 빈 띠만 생긴다.
           [968 · 35] 90vh → 90dvh: iOS 주소창이 보일 때 vh 는 실제 화면보다 커서 시트
           바닥 버튼이 툴바 뒤로 들어갔다.
           [968 · 36] 모바일은 위 여백을 핸들(pt-0 + 핸들 44px)에게 준다 — p-5 의 위쪽
           20px 자리에 핸들 띠가 들어가고 sm 이상은 종전 p-5 그대로. */
        className="modal-in max-h-[90dvh] w-full overflow-y-auto rounded-t-3xl bg-surface p-5 pt-0 pb-[calc(20px+env(safe-area-inset-bottom,0px))] outline-none sm:rounded-3xl sm:pt-5 sm:pb-5"
      >
        {/* [968 · 36] 끌기 핸들 — 44px 높이의 띠 전체가 포인터 영역, 가운데 막대는 장식.
            touch-none: 핸들 위에서는 브라우저 스크롤을 끄고 우리가 손가락을 본다(시트
            본문은 그대로 스크롤된다). sm 이상은 가운데 뜨는 대화상자라 핸들이 없다. */}
        <div
          aria-hidden="true"
          onPointerDown={onHandlePointerDown}
          onPointerMove={onHandlePointerMove}
          onPointerUp={endHandleDrag}
          onPointerCancel={endHandleDrag}
          className="-mx-5 flex h-11 touch-none cursor-grab select-none items-center justify-center sm:hidden"
        >
          <span className="h-1 w-10 rounded-full bg-line-strong" />
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}

/** 모달 공통 헤더 — 제목 + 닫기 버튼. */
export function ModalHeader({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <div className="mb-3 flex items-start justify-between gap-2">
      <span className="text-[13px] font-extrabold text-ink">{title}</span>
      {/* [966] 15px 글자 하나가 터치 타깃이었다 — 32px 상자 + .tap(8px 히트 확장). 모양은 그대로. */}
      <button
        type="button"
        aria-label="닫기"
        onClick={onClose}
        className="press tap inline-flex min-h-[32px] min-w-[32px] shrink-0 items-center justify-center rounded-full px-1.5 text-[15px] leading-none text-text-3"
      >
        ✕
      </button>
    </div>
  );
}
