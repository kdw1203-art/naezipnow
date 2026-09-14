"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type FocusEvent } from "react";
import { NAV, type NavItem } from "./nav-data";

/* [998 · A5 → 999] 데스크톱 좌측 내비 — **접혀 있다가 마우스가 왼쪽 가장자리에 닿으면**
   미끄러져 나오는 오버레이(소유자 지시 2026-09-14: "마우스가 왼쪽으로 갔을 때만, 액션형으로").
   본문 폭을 차지하지 않는다(레이아웃 2열 제거). 헤더 드롭다운은 다시 hover 로 연다(Header.tsx).
   - 열림: 왼쪽 14px 핫존 pointerenter · 손잡이 focus/click(키보드) · 열린 패널 위 pointer
   - 닫힘: 패널 밖으로 pointer 가 나가고 220ms · Esc · 경로 이동
   - lg+ 에서만 렌더(모바일은 탭바·전체 메뉴). NAV 는 Header 가 이미 싣는다. */

/** 마이 바로가기 — 인증 검사 없음. 각 화면이 스스로 로그인으로 보낸다. */
const MY: NavItem = {
  label: "마이",
  href: "/my",
  children: [
    { label: "관심", href: "/my/watchlist" },
    { label: "기록", href: "/my/analyses" },
    { label: "포인트", href: "/my/points" },
    { label: "설정", href: "/my/settings" },
  ],
};
const GROUPS = [...NAV, MY];

/** 셸 밖·전용 레이아웃 화면 — 내비를 그리지 않는다(지도는 자체 좌측 패널이 있다). */
const HIDE = /^\/(admin|login|signup|map|embed|welcome)(\/|$)|^\/notes\/[^/]+\/card(\/|$)/;
const CLOSE_GRACE_MS = 220;

export function DesktopSideNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const closeTimer = useRef<number | null>(null);

  const cancelClose = () => {
    if (closeTimer.current != null) {
      window.clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  };
  const show = () => {
    cancelClose();
    setOpen(true);
  };
  const hideSoon = () => {
    cancelClose();
    closeTimer.current = window.setTimeout(() => setOpen(false), CLOSE_GRACE_MS);
  };

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
  const cur = (href: string) => (pathname === href ? "page" : undefined);

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
        className={`fixed left-0 top-1/2 z-40 flex h-12 w-[10px] -translate-y-1/2 items-center justify-center rounded-r-full border border-l-0 border-line bg-surface transition-opacity duration-150 ${
          open ? "opacity-0" : "opacity-70 hover:opacity-100"
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
        className={`glass-strong popover-surface fixed left-3 top-[82px] z-40 max-h-[calc(100dvh-100px)] w-[232px] overflow-y-auto rounded-2xl border border-line p-2 [box-shadow:var(--shadow-md)] transition-[transform,opacity] duration-[180ms] ease-out motion-reduce:transition-none ${
          open ? "translate-x-0 opacity-100" : "pointer-events-none -translate-x-[110%] opacity-0"
        }`}
      >
        {GROUPS.map((g) => (
          <div key={g.href} className={g === MY ? "mt-1 border-t border-line pt-2" : "mb-2"}>
            <Link
              href={g.href}
              prefetch={false}
              tabIndex={open ? 0 : -1}
              aria-current={cur(g.href)}
              className={`block px-2.5 py-1.5 t-sub font-extrabold no-underline hover:text-primary ${
                pathname.startsWith(g.href) ? "text-primary" : "text-text-3"
              }`}
            >
              {g.label}
            </Link>
            {g.children?.map((c) => (
              <Link
                key={c.href + c.label}
                href={c.href}
                prefetch={false}
                tabIndex={open ? 0 : -1}
                aria-current={cur(c.href)}
                className={`block rounded-lg px-2.5 py-1.5 t-body font-semibold no-underline ${
                  cur(c.href)
                    ? "bg-primary-soft text-primary"
                    : "text-text-2 hover:bg-[rgba(29,79,216,.07)] hover:text-primary"
                }`}
              >
                {c.shortLabel ?? c.label}
              </Link>
            ))}
          </div>
        ))}
      </nav>
    </div>
  );
}
