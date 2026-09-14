"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type FocusEvent } from "react";
import { NAV, type NavItem } from "./nav-data";
import { Icon } from "./Icon";

/* [998 · A5 → 999] 데스크톱 좌측 내비 — **접혀 있다가 마우스가 왼쪽 가장자리에 닿으면**
   미끄러져 나오는 오버레이(소유자 지시 2026-09-14: "마우스가 왼쪽으로 갔을 때만, 액션형으로").
   본문 폭을 차지하지 않는다(레이아웃 2열 제거). 헤더 드롭다운은 다시 hover 로 연다(Header.tsx).
   - 열림: 왼쪽 14px 핫존 pointerenter · 손잡이 focus/click(키보드) · 열린 패널 위 pointer
   - 닫힘: 패널 밖으로 pointer 가 나가고 220ms · Esc · 경로 이동 · Tab 이탈
   - lg+ 에서만 렌더(모바일은 탭바·전체 메뉴). NAV 는 Header 가 이미 싣는다.
   [1000] 소유자 지시 "각 메뉴 간 구분이 확실히 되도록": 묶음마다 **유리 타일**(아이콘 배지 + 굵은 머리 +
   왼쪽 레일에 매달린 하위 링크)로 나눈다. 지금 있는 묶음은 남색 배지·파란 테두리, 지금 화면인 링크는
   연파랑 알약. 계정·지원은 아래쪽에 따로(모바일 전체 메뉴의 계정·지원 묶음과 같은 구성). */

type Group = NavItem & { icon: string };

/** 4 대분류 라벨 → 라인 아이콘 이름(MobileMenu 와 같은 표) */
const CAT_ICON: Record<string, string> = {
  임장노트: "notebook-pen",
  지도: "map",
  "AI 분석": "sparkles",
  동네: "messages-square",
};

const GROUPS: Group[] = [
  ...NAV.map((g) => ({ ...g, icon: CAT_ICON[g.label] ?? "circle" })),
  {
    label: "마이",
    href: "/my",
    icon: "user",
    children: [
      { label: "마이페이지", href: "/my" },
      { label: "관심 단지·노트", shortLabel: "관심", href: "/my/watchlist" },
      { label: "구독 관리", href: "/my/subscription" },
      { label: "포인트", href: "/my/points" },
      { label: "설정", href: "/my/settings" },
    ],
  },
  {
    label: "지원",
    href: "/support",
    icon: "life",
    children: [
      { label: "고객센터", href: "/support" },
      { label: "내 문의 내역", href: "/my/support" },
      { label: "자주 묻는 질문", href: "/support/faq" },
    ],
  },
];

/** 셸 밖·전용 레이아웃 화면 — 내비를 그리지 않는다(지도는 자체 좌측 패널이 있다). */
const HIDE = /^\/(admin|login|signup|map|embed|welcome)(\/|$)|^\/notes\/[^/]+\/card(\/|$)/;
const CLOSE_GRACE_MS = 220;

/** 이 경로가 속한 묶음 — 가장 긴 접두가 이긴다(/my/support 는 지원, /my/... 는 마이). */
function groupOf(pathname: string): Group | null {
  let best: Group | null = null;
  let bestLen = -1;
  for (const g of GROUPS) {
    const hrefs = [g.href, ...(g.children ?? []).map((c) => c.href)];
    for (const h of hrefs) {
      const hit = pathname === h || pathname.startsWith(h.endsWith("/") ? h : `${h}/`);
      if (hit && h.length > bestLen) {
        best = g;
        bestLen = h.length;
      }
    }
  }
  return best;
}

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
  const currentGroup = groupOf(pathname);

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
        className={`glass-strong popover-surface fixed left-3 top-[82px] z-40 flex max-h-[calc(100dvh-100px)] w-[248px] flex-col gap-1.5 overflow-y-auto rounded-[20px] border border-line p-1.5 [box-shadow:var(--shadow-md)] transition-[transform,opacity] duration-[180ms] ease-out motion-reduce:transition-none ${
          open ? "translate-x-0 opacity-100" : "pointer-events-none -translate-x-[110%] opacity-0"
        }`}
      >
        {GROUPS.map((g) => {
          const isCurrentGroup = currentGroup === g;
          return (
            <section
              key={g.href}
              aria-label={g.label}
              className={`rounded-2xl border p-1 transition-colors ${
                isCurrentGroup
                  ? "border-[rgba(29,79,216,.28)] bg-[color-mix(in_srgb,var(--primary-soft)_70%,transparent)]"
                  : "border-line bg-[color-mix(in_srgb,var(--surface)_62%,transparent)]"
              } ${g.label === "마이" ? "mt-1.5 [border-top-width:2px]" : ""}`}
            >
              {/* 묶음 머리 — 아이콘 배지 + 굵은 라벨. 허브로 가는 링크. */}
              <Link
                href={g.href}
                prefetch={false}
                tabIndex={open ? 0 : -1}
                aria-current={cur(g.href)}
                className={`flex items-center gap-2 rounded-xl px-1.5 py-1.5 no-underline ${
                  isCurrentGroup ? "text-primary" : "text-ink hover:text-primary"
                }`}
              >
                <span
                  aria-hidden="true"
                  className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg ${
                    isCurrentGroup
                      ? "bg-primary text-white [box-shadow:var(--shadow-cta)]"
                      : "bg-surface text-text-2 [box-shadow:inset_0_0_0_1px_var(--border)]"
                  }`}
                >
                  <Icon name={g.icon} size={15} />
                </span>
                <span className="t-sub font-extrabold tracking-tight">{g.label}</span>
                <span aria-hidden="true" className="ml-auto pr-1.5 t-caption font-bold text-text-3">
                  ›
                </span>
              </Link>
              {/* 하위 링크 — 왼쪽 레일(배지 가운데에서 내려오는 선)에 매달린다 */}
              <div className="ml-[19px] mt-0.5 flex flex-col gap-px border-l border-line-strong pl-2 pb-0.5">
                {g.children?.map((c) => {
                  const active = cur(c.href) != null;
                  return (
                    <Link
                      key={c.href + c.label}
                      href={c.href}
                      prefetch={false}
                      tabIndex={open ? 0 : -1}
                      aria-current={cur(c.href)}
                      className={`block rounded-lg px-2 py-[5px] t-body font-semibold no-underline ${
                        active
                          ? "bg-surface text-primary [box-shadow:var(--shadow-sm)]"
                          : "text-text-2 hover:bg-[rgba(29,79,216,.07)] hover:text-primary"
                      }`}
                    >
                      {c.shortLabel ?? c.label}
                    </Link>
                  );
                })}
              </div>
            </section>
          );
        })}
      </nav>
    </div>
  );
}
