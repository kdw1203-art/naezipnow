"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@/app/components/Icon";
import {
  TOWN_CATEGORY_LINKS,
  type TownCategoryLink,
} from "@/lib/town/category-links";

/**
 * 동네이야기 카테고리 바로가기 — 인터랙티브.
 * 카드를 누르면 설명이 접히며 세로로 살짝 줄어드는 "고정(pinned)" 애니메이션이
 * 재생되면서 해당 카테고리로 이동한다. 현재 경로와 일치하는 카드는 고정 상태로 표시.
 *
 * `stick` — 하위 카테고리 페이지에서 쓰는 모드. 헤더(스크롤 시 56px) 바로 아래에
 * 붙여 스크롤해도 카테고리 줄이 사라지지 않게 한다. 랜딩(`/town`)은 목록 자체가
 * 히어로 역할이라 고정하지 않는다.
 *
 * [970 · C-36] 카드는 <button onClick={router.push}> 였다 — 새 탭·중클릭·링크 복사가
 * 안 되고 크롤러에게는 링크가 아니었다(9개 카테고리 진입이 전부 JS 의존). <Link> 로
 * 바꾼다. 축소 애니메이션은 클릭 순간 pending 을 켜 같이 재생되고, 이동은 Link 가 한다
 * (setTimeout 으로 이동을 미루던 170ms 지연도 사라진다).
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

  // 현재 경로와 일치하는 카테고리(있으면 고정 표시). /town(피드)은 제외.
  const activeHref =
    items.find((i) => i.href !== "/town" && pathname.startsWith(i.href))?.href ?? null;

  /* [970 · B-20] 모바일에서 활성 카드가 레일 오른쪽 밖에 있었다(/supply·/auctions·
     /redevelopment 는 4~5번째 카드라 첫 화면 폭 밖). 마운트·경로 변경 때 활성 카드를
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
    <div
      ref={railRef}
      /* 모바일 실측 11 — 스크롤바를 숨겨 두어 "더 있다"는 힌트가 우연히 잘린
         카드뿐이었다. 우측 가장자리 페이드(mask)로 이어짐을 암시한다(md+ 는
         전체가 보이므로 불필요 — 해제). */
      className={`rise-in mb-5 flex w-full gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden [mask-image:linear-gradient(to_right,black_calc(100%-28px),transparent)] md:[mask-image:none] ${
        stick
          ? /* 헤더는 sticky top-0 이고 스크롤 시 높이가 56px(패딩 8 + h-12)로 줄어든다.
               그 아래에 붙이고 z-40(헤더 z-50 미만)으로 두어 헤더가 항상 위에 오게 한다.
               좌우 -mx/px 는 컨테이너 패딩을 넘어 배경을 끝까지 채우기 위한 것.
               [970 · B-20] PageShell 모바일 패딩은 px-3.5(14px)·md 부터 px-5 — -mx-5 는
               모바일에서 6px 을 더 물어 레일이 화면 밖으로 삐져나갔다. 패딩과 같은 값으로. */
            "sticky top-[56px] z-40 -mx-3.5 bg-bg px-3.5 pt-2 md:-mx-5 md:px-5"
          : ""
      }`}
    >
      {items.map((l) => {
        const pinned = pending === l.href || activeHref === l.href;
        return (
          <Link
            key={l.href}
            href={l.href}
            onClick={(e) => {
              /* 새 탭(⌘/Ctrl·중클릭)은 이 화면을 떠나지 않으므로 고정 표시를 남기지 않는다 */
              if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
              setPending(l.href);
            }}
            aria-current={pinned ? "page" : undefined}
            aria-label={`${l.label} — ${l.desc}`}
            title={`${l.label} — ${l.desc}`}
            /* 제안 모바일2(2026-08-03) — 카드 축소: 모바일 92×76px(기존 104×92).
               md+ 는 가로 균등 분배 유지. */
            /* [959] 램프 상향(sub 12·caption 10)에 맞춰 높이 +4px. 그림자는 토큰 3단 중 md. */
            className={`press relative flex w-[96px] shrink-0 flex-col items-center justify-center rounded-2xl border px-2 text-center no-underline transition-all duration-300 ease-out md:w-auto md:min-w-0 md:flex-1 md:basis-0 ${
              pinned
                ? "h-[68px] border-primary bg-primary-soft shadow-[var(--shadow-md)] md:h-[76px]"
                : "card tile h-[80px] border-transparent md:h-[96px]"
            }`}
          >
            {/* 아이콘 칩 — 9칸이 전부 같은 잉크색이라 목록이 평평했다.
                성격별 색을 입혀 스캔이 되게 한다. */}
            <span
              className={`tile-ico flex h-8 w-8 items-center justify-center rounded-[10px] transition-colors ${
                pinned ? "bg-primary text-surface" : l.tone
              }`}
            >
              <Icon name={l.icon} size={pinned ? 16 : 17} />
            </span>
            {/* [959] 사람이 채우는 칸(전문가·모임·자료)은 "모집" 점 — 비어 있어도 놀라지 않게 */}
            {l.humanSupplied && !pinned ? (
              <span
                className="absolute left-2 top-2 h-1.5 w-1.5 rounded-full bg-brand-red"
                title="참여자를 모집 중인 칸"
                aria-hidden="true"
              />
            ) : null}
            <span
              className={`mt-1.5 w-full truncate t-sub font-extrabold transition-colors ${
                pinned ? "text-primary" : "text-ink"
              }`}
            >
              {l.label}
            </span>
            {/* 고정 시 설명이 접히며 카드가 세로로 살짝 줄어든다.
                [970 · C-37] truncate(한 줄 말줄임)라 "요약·주간 다이제스트" 가 96px 카드에서
                "요약·주간 다…" 로 잘렸다 — 두 줄 clamp 로 전부 보이게(카드 높이 80px 안에서
                caption 10px 두 줄이 들어간다). */}
            <span
              className={`clamp-2 w-full t-caption leading-[1.25] text-text-3 transition-all duration-300 ease-out ${
                pinned ? "mt-0 max-h-0 opacity-0" : "mt-0.5 max-h-7 opacity-100"
              }`}
            >
              {l.desc}
            </span>
            {pinned ? (
              <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-primary" />
            ) : null}
          </Link>
        );
      })}
    </div>
  );
}
