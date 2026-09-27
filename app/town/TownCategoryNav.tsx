"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  TOWN_CATEGORY_LINKS,
  type TownCategoryLink,
} from "@/lib/town/category-links";
/* [1012] 규칙 8 — 굵기 3단(400/500/700): 이 파일의 font-extrabold(800) 를 전부 font-bold(700) 로 내렸다. */

/**
 * 동네이야기 카테고리 줄 — 하위 화면(/apply · /auctions · /supply · /redevelopment · /qna …)의
 * 공통 이동 줄. 현재 경로와 일치하는 칸이 활성(aria-current="page").
 *
 * [v4] 아이콘 타일(96×80 카드 + 아이콘 칩 + 숫자 부제) → **글자 밑줄 탭 한 줄**.
 * v4 규칙 7 "아이콘 타일 금지 — 아이콘은 조작 버튼에만". 허브(/town)는 이 줄을 더 쓰지 않는다
 * (맨 아래 "동네 자료" 글자 링크 한 줄 — app/town/page.tsx). 그래서 허브만 넘기던 숫자 부제(counts)도
 * 없어졌다. 라벨은 카탈로그 label 그대로 — 하위 화면 제목(TownHero h1)과 같은 말이어야 한다([974]).
 *
 * `stick` — 하위 카테고리 페이지에서 쓰는 모드. 헤더(스크롤 시 56px) 바로 아래에
 * 붙여 스크롤해도 카테고리 줄이 사라지지 않게 한다.
 *
 * [970 · C-36] 칸은 <Link> 다 — 새 탭·중클릭·링크 복사가 되고 크롤러에게도 링크다.
 * 누르는 순간 pending 으로 그 칸에 밑줄을 먼저 옮겨(이동 전 피드백) 이동은 Link 가 한다.
 */

type Item = TownCategoryLink;

export function TownCategoryNav({
  items = TOWN_CATEGORY_LINKS,
  stick = false,
}: {
  items?: Item[];
  stick?: boolean;
}) {
  const pathname = usePathname();
  const [pending, setPending] = useState<string | null>(null);
  const railRef = useRef<HTMLDivElement | null>(null);

  /* 현재 경로와 일치하는 카테고리(있으면 활성 표시).
     [1011] 허브(/town)도 칸이다 — `startsWith` 로 보면 /town/news 까지 허브로 잡히므로
     허브만 **정확히 일치**할 때만 활성으로 친다. */
  const activeHref =
    items.find((i) => (i.href === "/town" ? pathname === "/town" : pathname.startsWith(i.href)))?.href ??
    null;

  /* [970 · B-20] 모바일에서 활성 칸이 레일 오른쪽 밖에 있었다(/supply·/auctions·
     /redevelopment 는 4~6번째 칸이라 첫 화면 폭 밖). 마운트·경로 변경 때 활성 칸을
     가운데로 끌어온다 — 세로 스크롤은 건드리지 않는다(block: "nearest"). */
  useEffect(() => {
    const rail = railRef.current;
    if (!rail || !activeHref) return;
    const el = rail.querySelector<HTMLElement>('[aria-current="page"]');
    if (!el) return;
    /* 감속 모션 존중 — 애니메이션 없이 위치만 맞춘다 */
    const reduce =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    try {
      el.scrollIntoView({ inline: "center", block: "nearest", behavior: reduce ? "auto" : "smooth" });
    } catch {
      /* 구형 브라우저(옵션 객체 미지원) — 그대로 둔다 */
    }
  }, [activeHref]);

  return (
    <nav
      aria-label="동네이야기 카테고리"
      className={`rise-in mb-5 border-b border-line ${
        stick
          ? /* 헤더는 sticky top-0 이고 스크롤 시 높이가 56px(패딩 8 + h-12)로 줄어든다.
               그 아래에 붙이고 z-40(헤더 z-50 미만)으로 두어 헤더가 항상 위에 오게 한다.
               좌우 -mx/px 는 컨테이너 패딩을 넘어 배경을 끝까지 채우기 위한 것 — PageShell 모바일
               패딩 px-3.5 · md 부터 px-5 와 같은 값([970 · B-20]). */
            "sticky top-[56px] z-40 -mx-3.5 bg-bg px-3.5 md:-mx-5 md:px-5"
          : ""
      }`}
    >
      <div
        ref={railRef}
        /* 모바일 실측 11 — 스크롤바를 숨기면 "더 있다"는 힌트가 사라진다. 우측 가장자리 페이드(mask)로
           이어짐을 암시한다(md+ 는 전부 보이므로 해제). */
        className="flex gap-5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden [mask-image:linear-gradient(to_right,black_calc(100%-28px),transparent)] md:[mask-image:none]"
      >
        {items.map((l) => {
          const active = pending === l.href || (pending === null && activeHref === l.href);
          return (
            <Link
              key={l.href}
              href={l.href}
              onClick={(e) => {
                /* 새 탭(⌘/Ctrl·중클릭)은 이 화면을 떠나지 않으므로 활성 표시를 옮기지 않는다 */
                if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
                setPending(l.href);
              }}
              aria-current={activeHref === l.href ? "page" : undefined}
              /* [1012-R2] 활성 = 남색 한 종류(나우블루는 CTA·링크·하락 delta 에만) */
              className={`shrink-0 border-b-2 pb-2.5 pt-3 t-body font-bold no-underline transition-colors ${
                active ? "border-brand-hanji-ink text-ink" : "border-transparent text-text-3"
              }`}
            >
              {l.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
