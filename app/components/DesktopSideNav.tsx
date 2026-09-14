"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV, type NavItem } from "./nav-data";

/* [998 · A5] 데스크톱 고정 좌측 내비 — 헤더 호버 드롭다운을 대신한다(lg+ 전용).
   NAV 는 Header 가 이미 클라이언트로 보내므로 여기서 더 실리는 건 이 파일뿐이다.
   셸(.nz-shell)은 이 nav 가 실제로 그려졌을 때만 2열이 된다(globals.css :has). */

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

/** 셸 밖·전용 레이아웃 화면 — 내비를 그리지 않는다(카드 스튜디오는 캔버스 폭이 우선). */
const HIDE = /^\/(admin|login|signup|map|embed|welcome)(\/|$)|^\/notes\/[^/]+\/card(\/|$)/;

export function DesktopSideNav() {
  const pathname = usePathname();
  if (HIDE.test(pathname)) return null;
  const cur = (href: string) => (pathname === href ? "page" : undefined);

  return (
    <nav
      aria-label="사이트 내비"
      /* 헤더 70px(패딩 14 + 셸 56) + 12px = 82. self-start 가 없으면 그리드 행 높이로
         늘어나 sticky 가 안 움직인다. 22행(~790px)이라 768px 높이 노트북에서는 뷰포트에
         맞춰 안에서 스크롤한다 — 안 그러면 마이 링크가 페이지 끝까지 내려가야 보인다.
         -m-1/p-1 은 스크롤 상자가 포커스 링(2+2px)을 자르지 않게 하는 여유(top 은 78+4). */
      className="nz-sidenav hidden self-start lg:sticky lg:top-[78px] lg:-m-1 lg:block lg:max-h-[calc(100dvh-94px)] lg:overflow-y-auto lg:p-1"
    >
      {GROUPS.map((g) => (
        <div key={g.href} className={g === MY ? "border-t border-line pt-3" : "mb-3"}>
          <Link
            href={g.href}
            prefetch={false}
            aria-current={cur(g.href)}
            className={`block px-2.5 py-2 t-sub font-extrabold no-underline hover:text-primary ${
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
  );
}
