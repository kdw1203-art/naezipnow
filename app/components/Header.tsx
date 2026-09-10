"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { Logo } from "./Logo";
import { HeaderAuth } from "./HeaderAuth";
import { HeaderSearch } from "./HeaderSearch";
import { MobileMenu } from "./MobileMenu";
import { NotificationBell } from "./NotificationBell";
import { NAV } from "./nav-data";
import { Icon } from "./Icon";
import { useScrolledPast } from "@/lib/client/use-scroll-state";

/** 9m GNB — 호버 드롭다운(리퀴드 글래스) · 트렌드 갱신: 스크롤 인지 · 언더라인 인디케이터
 *  NAV 데이터는 nav-data.ts 공유 (데스크탑 GNB · 모바일 전체 메뉴 동기화) */

/** 글래스 플로팅 GNB — 데스크탑은 메뉴+검색+CTA, 모바일은 로고+아이콘 */
export function Header() {
  const pathname = usePathname();
  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  /* [968 · 12] 스크롤 인지 — 공용 스크롤 상태(리스너 하나·rAF)에서 8px 경계만 받는다.
     예전엔 이 컴포넌트가 scroll 이벤트마다 setState 했다(터치는 프레임당 여러 번). */
  const scrolled = useScrolledPast(8);

  return (
    <header
      /* [968 · 12] 축소는 transform 으로만 — 예전엔 padding-top 14→8 · h-12→h-11 로
         sticky 상자 높이를 바꿔 **문서 전체를 리플로우**시켰다(스크롤마다 8px 경계를
         오갈 때). 이제 바깥 상자는 그대로 두고 안쪽 셸을 scale(.96) 한다(CSS
         .header-scrolled, 합성기 전용). 상자가 안 줄어 생기는 투명 띠는 pointer-events
         로 본문에 넘긴다(.site-header). */
      className="site-header sticky top-0 z-50 px-3.5 md:px-5"
      style={{ paddingTop: "max(14px, env(safe-area-inset-top, 0px))" }}
    >
      <div
        className={`header-shell mx-auto flex max-w-[1240px] items-center gap-2 rounded-2xl px-3.5 md:gap-6 md:px-5 ${
          /* 모바일3 — 본문 밀도를 줄인 뒤(2026-08-03 토큰 축소) 헤더가 상대적으로
             커 보였다. 모바일만 한 단계 축소: 56px→48px. 44px 는 터치 타깃 하한선이라
             그 밑으로는 내리지 않는다(스크롤 축소도 48×.96=46px 에서 멈춘다). md+ 원복. */
          scrolled ? "glass-strong header-scrolled h-12 md:h-14" : "glass h-12 md:h-14"
        }`}
      >
        {/* [970 · A-19] 셸 링크는 뷰포트 프리페치를 끈다 — 헤더·푸터·메뉴만으로 페이지마다
            RSC 프리페치가 24건씩 나갔다. 다음 이동 확률이 가장 높은 모바일 탭바 5탭만
            기본 프리페치를 남긴다(TabBar.tsx). */}
        <Link href="/" prefetch={false} aria-label="내집나우 홈" className="press njn-logo shrink-0">
          <Logo />
        </Link>

        {/* 데스크탑 메뉴 — 9m 호버 드롭다운 + 언더라인 인디케이터 */}
        <nav className="hidden gap-0.5 t-body font-semibold text-text-1 md:flex">
          {NAV.map((item) => {
            const active = isActive(item.href);
            return (
              <div
                key={item.label}
                className="group relative"
                /* [966] 드롭다운은 CSS(group-focus-within)로만 열린다 — 키보드 사용자가
                   Esc 로 닫을 길이 없었다. 활성 요소를 blur 하면 focus-within 이 풀린다.
                   (브라우저는 blur 된 자리를 다음 Tab 시작점으로 기억한다) */
                onKeyDown={(e) => {
                  if (e.key !== "Escape") return;
                  const el = document.activeElement;
                  if (el instanceof HTMLElement && e.currentTarget.contains(el)) el.blur();
                }}
              >
                <Link
                  href={item.href}
                  prefetch={false}
                  aria-current={active ? "page" : undefined}
                  data-active={active ? "true" : undefined}
                  className={
                    active
                      ? "nav-underline block rounded-[10px] bg-primary-soft px-3.5 py-[7px] text-primary transition-colors"
                      : "nav-underline block rounded-[10px] px-3.5 py-[7px] text-text-1 transition-colors hover:bg-[rgba(29,79,216,.07)] hover:text-primary"
                  }
                >
                  {item.label}
                </Link>
                {item.children && (
                  <div className="invisible absolute left-0 top-full z-50 pt-2 opacity-0 transition-all duration-[180ms] group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100">
                    {/* [970 · A-01] 인라인 흰 배경(rgba(255,255,255,.9))을 걷었다 — 다크에서 흰 판 위
                        밝은 글자라 항목이 안 보였다. .popover-surface 는 surface 토큰 92%(양 테마). */}
                    <div className="glass-strong dropdown-panel popover-surface min-w-[168px] rounded-2xl p-1.5">
                      {item.children.map((c) => (
                        <Link
                          key={c.href + c.label}
                          href={c.href}
                          prefetch={false}
                          /* [963] whitespace-nowrap — "통합 지도 (탐색·실거래·매물)" 이
                             168px 패널 안에서 3줄로 접혀 메뉴가 세로로 길어졌다.
                             메뉴 항목은 접지 않고 패널이 가장 긴 라벨에 맞춰 넓어진다. */
                          className="block whitespace-nowrap rounded-[10px] px-3 py-2 text-[13px] font-semibold text-text-1 transition-all duration-[120ms] hover:translate-x-0.5 hover:bg-[rgba(29,79,216,.08)] hover:text-primary"
                        >
                          {c.label}
                        </Link>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        {/* [972] 모바일 헤더 가운데 — 예전엔 그냥 빈 칸(flex-1)이었다.
            393px 실측: 로고 93px · 오른쪽 아이콘 묶음 120px 사이에 49px 이 아무것도
            없이 떠 있었고, 검색은 19px 짜리 돋보기 하나로만 들어갈 수 있었다
            (소유자 캡처의 상단 표시). 그 빈 칸을 검색 진입점으로 채운다 —
            데스크탑 HeaderSearch 와 같은 재질(--glass-bg)·같은 자리다.
            입력이 아니라 링크인 이유: sticky 헤더 안에서 키보드를 올리면 헤더가
            뷰포트와 함께 튀고, 검색 페이지(/search)가 최근 검색·자동완성을 이미
            다 갖고 있다. 오른쪽 묶음의 돋보기 아이콘은 이걸로 대체해 뺐다. */}
        <Link
          href="/search"
          prefetch={false}
          className="field-focus press flex h-9 min-w-0 flex-1 items-center gap-1.5 rounded-full bg-[var(--glass-bg)] px-3 t-sub text-text-3 no-underline md:hidden"
        >
          <Icon name="search" size={15} className="shrink-0" />
          <span className="truncate">단지 검색</span>
        </Link>
        <div className="hidden flex-1 md:block" />

        {/* 데스크탑 검색 — P2-14 인라인 자동완성 (HeaderSearch) */}
        <HeaderSearch />

        {/* 데스크탑 알림 진입점 (P2-3) — 미읽음 배지 포함(B10) */}
        <NotificationBell variant="desktop" />

        {/* 화면당 primary CTA는 1개 — 노트 쓰기 (마이크로 인터랙션: 리프트 + 글로우) */}
        <Link
          href="/notes/new"
          prefetch={false}
          className="btn-primary btn-cta press hidden px-4 py-[9px] text-[13px] transition-transform hover:-translate-y-0.5 hover:[box-shadow:var(--shadow-glow)] md:block"
        >
          노트 쓰기
        </Link>

        {/* 세션 영역 — 로그인 시 아바타+플랜 배지+드롭다운 / 비로그인 시 로그인 링크 */}
        <HeaderAuth />

        {/* 모바일 아이콘 + 전체 메뉴(☰) */}
        {/* [972] 돋보기 아이콘은 위 검색 필드로 옮겼다 — 같은 헤더에 검색 진입점을
            둘 두면 좁은 폭만 더 먹는다. gap 도 12→8px(필드에 폭을 넘긴다). */}
        {/* [989] gap 8→12px 로 되돌린다. 8px 이면 벨·메뉴의 44px 히트 영역이 4px 겹쳐
            겹친 구간에서 나중에 그려진 ☰ 가 벨의 탭을 가져갔다(실측: 벨의 실효 폭 40px).
            12px 이면 두 히트 영역이 정확히 맞닿고 겹치지 않는다 — 검색 필드는 4px 만
            줄어든다(flex-1 이라 체감 없음). */}
        <div className="flex shrink-0 items-center gap-3 text-text-1 md:hidden">
          <NotificationBell variant="mobile" />
          <MobileMenu />
        </div>
      </div>
    </header>
  );
}
