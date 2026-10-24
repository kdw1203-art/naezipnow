"use client";

/* [1088 · 비용] 좌측 내비 패널의 안쪽(묶음 7개 · 링크 30여 개) — DesktopSideNav 가 처음 열 때(또는 넓은 화면에서 마우스가
   처음 움직일 때 미리) 받는 지연 조각이다. 닫힌 패널이 모든 화면의 HTML 에 14KB · 첫 로드 JS 에 이 코드가 실려 있었다.
   마크업 · 규칙은 예전 DesktopSideNav 안쪽 그대로(옮기기만 했다). 묶음 설명은 DesktopSideNav 머리 주석. */

import Link from "@/app/components/IntentLink";
import { NAV, type NavItem } from "./nav-data";
import { Icon } from "./Icon";

type Group = NavItem & { icon: string };

/** 대분류 라벨 → 라인 아이콘 이름(MobileMenu 와 같은 표) — [1008 · J → 1011] 대분류 5개("내 집 마련"은 임장노트 하위로 —
 *  패널은 아래 세로 스크롤이라 잘리지 않는다)
 *  [1003] 요금제 타일이 NAV 의 다섯째로 들어온다 — GROUPS 는 NAV 를 그대로 펼치므로
 *  타일은 자동으로 생기고, 자리는 "동네" 다음·"마이" 앞이다(계정 묶음 바로 위라
 *  결제→구독 관리로 눈이 이어진다). 묶음이 6 → 7 이 되지만 패널은 세로 스크롤
 *  (max-h calc(100dvh-100px) · overflow-y-auto)이라 잘리지 않는다. */
const CAT_ICON: Record<string, string> = {
  임장노트: "notebook-pen",
  지도: "map",
  "AI 분석": "sparkles",
  동네: "messages-square",
  뉴스: "newspaper",
  요금제: "credit-card",
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

export default function DesktopSideNavGroups({ pathname, open }: { pathname: string; open: boolean }) {
  const cur = (href: string) => (pathname === href ? "page" : undefined);
  const currentGroup = groupOf(pathname);
  return (
    <>
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
              <span className="t-sub font-bold tracking-tight">{g.label}</span>
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
    </>
  );
}
