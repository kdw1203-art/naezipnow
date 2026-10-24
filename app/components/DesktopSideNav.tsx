"use client";

import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type FocusEvent } from "react";

/* [1088 · 비용] 패널 안쪽(묶음 · 링크)은 지연 조각 — 첫 로드 JS 에서 빠진다(아래 drawn · 미리 받기 주석) */
const loadGroups = () => import("./DesktopSideNavGroups");
const SideNavGroups = dynamic(loadGroups, { ssr: false });

/* [998 · A5 → 999] 데스크톱 좌측 내비 — **접혀 있다가 마우스가 왼쪽 가장자리에 닿으면**
   미끄러져 나오는 오버레이(소유자 지시 2026-09-14: "마우스가 왼쪽으로 갔을 때만, 액션형으로").
   본문 폭을 차지하지 않는다(레이아웃 2열 제거). 헤더 드롭다운은 다시 hover 로 연다(Header.tsx).
   - 열림: 왼쪽 14px 핫존 pointerenter · 손잡이 focus/click(키보드) · 열린 패널 위 pointer
   - 닫힘: 패널 밖으로 pointer 가 나가고 220ms · Esc · 경로 이동 · Tab 이탈
   - lg+ 에서만 렌더(모바일은 탭바·전체 메뉴). NAV 는 Header 가 이미 싣는다.
   [1000] 소유자 지시 "각 메뉴 간 구분이 확실히 되도록": 묶음마다 **유리 타일**(아이콘 배지 + 굵은 머리 +
   왼쪽 레일에 매달린 하위 링크)로 나눈다. 지금 있는 묶음은 남색 배지·파란 테두리, 지금 화면인 링크는
   연파랑 알약. 계정·지원은 아래쪽에 따로(모바일 전체 메뉴의 계정·지원 묶음과 같은 구성). */

/** 셸 밖·전용 레이아웃 화면 — 내비를 그리지 않는다(지도는 자체 좌측 패널이 있다). */
const HIDE = /^\/(admin|login|signup|map|embed|welcome)(\/|$)|^\/notes\/[^/]+\/card(\/|$)/;
const CLOSE_GRACE_MS = 220;

export function DesktopSideNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  /* [1088 · 비용] 패널 안쪽(묶음 7개 · 링크 30여 개)은 처음 열 때 그린다 — 닫힌 패널이 모든 화면의 HTML 에 14KB 씩
     실려 저장·전송됐다(단지 화면 등 ISR 마다). 링크는 헤더 드롭다운(NAV)·푸터·전체 메뉴에 같은 목적지가 있어 검색 노출과 무관하다.
     <nav> 껍데기는 늘 있어(aria-controls 대상) 첫 열림에도 미끄러져 나오는 전환이 그대로 돈다. 한 번 그리면 닫혀도 남긴다. */
  const [drawn, setDrawn] = useState(false);
  const closeTimer = useRef<number | null>(null);

  const cancelClose = () => {
    if (closeTimer.current != null) {
      window.clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  };
  const show = () => {
    cancelClose();
    setDrawn(true);
    setOpen(true);
  };
  const hideSoon = () => {
    cancelClose();
    closeTimer.current = window.setTimeout(() => setOpen(false), CLOSE_GRACE_MS);
  };

  /* [1088] 넓은 화면(lg+)에서 마우스가 처음 움직이면 쉬는 시간에 패널 조각을 미리 받는다 — 가장자리에 닿기 전에 받아 두어
     첫 열림에도 안쪽이 바로 있다. 폰·태블릿 · 마우스를 움직이지 않는 크롤러는 받지 않는다. */
  useEffect(() => {
    if (drawn) return;
    if (typeof window.matchMedia !== "function" || !window.matchMedia("(min-width: 1024px)").matches) return;
    const warm = () => {
      window.removeEventListener("pointermove", warm);
      const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number };
      if (w.requestIdleCallback) w.requestIdleCallback(() => void loadGroups(), { timeout: 2000 });
      else window.setTimeout(() => void loadGroups(), 300);
    };
    window.addEventListener("pointermove", warm, { passive: true });
    return () => window.removeEventListener("pointermove", warm);
  }, [drawn]);

  /* 경로가 바뀌면 접는다 — 링크를 눌러 이동한 뒤에도 열려 있으면 본문을 가린다 */
  useEffect(() => {
    setOpen(false);
  }, [pathname]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      cancelClose();
    };
  }, [open]);

  if (HIDE.test(pathname)) return null;

  /* 키보드: Tab 이 패널 밖으로 나가면 접는다 — 열린 채 남으면 본문 위 오버레이가 화면을 가린다 */
  const onBlur = (e: FocusEvent<HTMLDivElement>) => {
    if (open && !e.currentTarget.contains(e.relatedTarget as Node | null)) setOpen(false);
  };

  return (
    <div className="hidden lg:block" onBlur={onBlur}>
      {/* 핫존 — 화면 왼쪽 가장자리 14px. 마우스가 닿으면 연다(클릭 불필요). 헤더 아래부터. */}
      <div
        aria-hidden="true"
        onPointerEnter={show}
        className="fixed bottom-0 left-0 top-[70px] z-40 w-[14px]"
      />
      {/* 손잡이 — 키보드·발견성. 왼쪽 중간의 얇은 알약. focus 또는 click 으로 연다. */}
      <button
        type="button"
        aria-label={open ? "메뉴 닫기" : "메뉴 열기"}
        aria-expanded={open}
        aria-controls="nz-sidenav-panel"
        onFocus={show}
        onClick={() => (open ? setOpen(false) : show())}
        onPointerEnter={show}
        /* [1054] 열린 동안은 마우스에 안 잡히게(pointer-events-none) — 손잡이에 마우스가 닿으면 이미 열리므로(onPointerEnter)
           그 자리에서 누르면 onClick 이 "열림 → 닫기"로 읽어 패널이 바로 접혔다. 키보드 Enter 는 pointer-events 와 무관해
           포커스 → 열기, Enter → 닫기 토글은 그대로다. */
        className={`fixed left-0 top-1/2 z-40 flex h-12 w-[10px] -translate-y-1/2 items-center justify-center rounded-r-full border border-l-0 border-line bg-surface transition-opacity duration-150 ${
          open ? "pointer-events-none opacity-0" : "opacity-70 hover:opacity-100"
        }`}
      >
        <span aria-hidden="true" className="block h-6 w-[3px] rounded-full bg-text-3" />
      </button>

      <nav
        id="nz-sidenav-panel"
        aria-label="사이트 내비"
        aria-hidden={!open}
        onPointerEnter={show}
        onPointerLeave={hideSoon}
        /* 헤더(14+56)+12 = 82px 아래에서 시작. 미지원 시 그냥 왼쪽에 붙어 있는 정적 패널. */
        className={`glass-strong popover-surface fixed left-3 top-[82px] z-40 flex max-h-[calc(100dvh-100px)] w-[248px] flex-col gap-1.5 overflow-y-auto rounded-3xl border border-line p-1.5 [box-shadow:var(--shadow-md)] transition-[transform,opacity] duration-[180ms] ease-out motion-reduce:transition-none ${
          open ? "translate-x-0 opacity-100" : "pointer-events-none -translate-x-[110%] opacity-0"
        }`}
      >
        {drawn && <SideNavGroups pathname={pathname} open={open} />}
      </nav>
    </div>
  );
}
