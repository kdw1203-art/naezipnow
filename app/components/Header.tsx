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

/** GNB — 호버 드롭다운 · 언더라인 인디케이터. NAV 데이터는 nav-data.ts 공유(데스크탑 GNB · 모바일 전체 메뉴 동기화)
 *
 *  [1012 · 규칙 C · 신호표 6번] 유리(blur)·떠 있는 알약 헤더 → **화면 폭 전체 흰 면 + 아래 1px 선**.
 *  기준 사이트 4곳(호갱노노·당근·네이버·숨고) 모두 헤더가 불투명 흰 면 + 1px 선이다. 예전 셸은
 *  `.glass` + `rounded-2xl` + `mx-auto max-w-[1240px]`(알약) 였고, 스크롤하면 `.header-scrolled` 가
 *  scale(.96) + 26px 반경으로 "캡슐"이 됐다([968 · 12] · [1000]). 이제 <header> 가 곧 흰 면이고
 *  안쪽은 폭만 1240px 로 맞춘다. 스크롤 상태(useScrolledPast)는 더 이상 필요 없어 뗐다 —
 *  리스너 하나가 줄고, 헤더 높이는 항상 같다(리플로우 0). 로고·메뉴·검색·CTA 배치는 그대로. */
export function Header() {
  const pathname = usePathname();
  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <header
      className="sticky top-0 z-50 border-b border-line bg-surface px-3.5 md:px-5"
      style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
    >
      <div
        /* [1003] 가로 예산 — NAV 가 4 → 5 대분류(요금제 추가)가 되면서 한 줄이 그만큼
           길어졌다. 라벨을 줄이면 대분류 이름이 표면마다 달라지므로(모바일 전체 메뉴·
           좌측 내비가 같은 NAV 를 읽는다) **간격만** 좁힌다: 묶음 사이 md 10px ·
           lg 12px · xl 부터 원래 24px(실측 사유는 1003·1011 기록 — lg(1024px)에서 검색 필드까지
           들어오는 구간이 가장 빠듯하다). 아래 메뉴 항목 패딩도 같은 계단을 쓴다.
           모바일 높이 48px(44px 터치 하한 위) · md+ 56px. */
        className="mx-auto flex h-12 max-w-[1240px] items-center gap-2 md:h-14 md:gap-2.5 lg:gap-3 xl:gap-6"
      >
        {/* [970 · A-19] 셸 링크는 뷰포트 프리페치를 끈다 — 헤더·푸터·메뉴만으로 페이지마다
            RSC 프리페치가 24건씩 나갔다. 다음 이동 확률이 가장 높은 모바일 탭바 5탭만
            기본 프리페치를 남긴다(TabBar.tsx). */}
        <Link href="/" prefetch={false} aria-label="내집나우 홈" className="press njn-logo shrink-0">
          <Logo />
        </Link>

        {/* 데스크탑 메뉴 — 9m 호버 드롭다운 + 언더라인 인디케이터 */}
        <nav className="hidden shrink-0 gap-0.5 t-body font-semibold text-text-1 md:flex">
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
                  /* [1003] 좌우 패딩 14→10px(xl 부터 14px 로 복귀) — 위 gap 축소와 같은
                     사유다. 글자 크기·라벨은 그대로 두고, whitespace-nowrap 으로 좁아질
                     때 라벨이 두 줄로 접히지 않게 한다(접히면 헤더 높이가 흔들린다). */
                  className={
                    active
                      ? "nav-underline block whitespace-nowrap rounded-lg bg-primary-soft px-2.5 py-[7px] text-primary transition-colors xl:px-3.5"
                      : "nav-underline block whitespace-nowrap rounded-lg px-2.5 py-[7px] text-text-1 transition-colors hover:bg-[rgba(29,79,216,.07)] hover:text-primary xl:px-3.5"
                  }
                >
                  {item.label}
                </Link>
                {/* [999] 드롭다운은 모든 md+ 폭에서 hover/focus 로 연다(소유자 지시 — 998 의 lg:hidden 되돌림).
                    좌측 내비는 가장자리 hover 오버레이라 둘이 겹치지 않는다. */}
                {item.children && (
                  <div className="invisible absolute left-0 top-full z-50 pt-2 opacity-0 transition-all duration-[180ms] group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100">
                    {/* [970 · A-01] 인라인 흰 배경(rgba(255,255,255,.9))을 걷었다 — 다크에서 흰 판 위
                        밝은 글자라 항목이 안 보였다. [1012 · 규칙 1·2] 유리(.glass-strong)·92% 반투명 대신
                        불투명 surface + 1px 선 + 8px + --shadow-lg(드롭다운은 허용 자리). */}
                    <div className="dropdown-panel min-w-[168px] rounded-lg border border-line bg-surface p-1.5 [box-shadow:var(--shadow-lg)]">
                      {item.children.map((c) => (
                        <Link
                          key={c.href + c.label}
                          href={c.href}
                          prefetch={false}
                          /* [963] whitespace-nowrap — "통합 지도 (탐색·실거래·매물)" 이
                             168px 패널 안에서 3줄로 접혀 메뉴가 세로로 길어졌다.
                             메뉴 항목은 접지 않고 패널이 가장 긴 라벨에 맞춰 넓어진다. */
                          className="block whitespace-nowrap rounded-lg px-3 py-2 text-[13px] font-semibold text-text-1 transition-all duration-[120ms] hover:translate-x-0.5 hover:bg-[rgba(29,79,216,.08)] hover:text-primary"
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
        {/* [1012 · 규칙 1] 알약(rounded-full·유리 배경) → 8px + 회색 면 + 1px 선(당근 모바일 검색 필드와 같은 형태) */}
        <Link
          href="/search"
          prefetch={false}
          className="field-focus press flex h-9 min-w-0 flex-1 items-center gap-1.5 rounded-lg border border-line bg-bg px-3 t-sub text-text-3 no-underline md:hidden"
        >
          <Icon name="search" size={15} className="shrink-0" />
          <span className="truncate">단지·지역 검색</span>
        </Link>
        <div className="hidden flex-1 md:block" />

        {/* 데스크탑 검색 — P2-14 인라인 자동완성 (HeaderSearch) */}
        <HeaderSearch />

        {/* 데스크탑 알림 진입점 (P2-3) — 미읽음 배지 포함(B10) */}
        <NotificationBell variant="desktop" />

        {/* [1012-R2 · 규칙 9 · 채점 C] 채움 파랑 → 아웃라인(btn-outline: 글자·테두리 나우블루, 채움 없음).
            헤더는 모든 화면 위에 얹히므로 여기가 채움 파랑이면 어느 화면이든 채움 파랑이 2개가 된다
            (홈 '검색' · town '동네이야기 쓰기' · news '주간 다이제스트 보기' · subscription 결제 등과 겹침).
            화면당 채움 파랑 1개는 **그 화면의 주행동**(검색·쓰기·결제)에 준다 — 헤더는 보조.
            모바일 탭바의 "기록(+)" 원형 버튼은 탭바 고유 요소라 그대로.
            [1012 · 규칙 2] 호버 들림·글로우 그림자 없이 색만 바뀐다(.btn-outline:hover) — btn-cta(그림자)도 뺐다. */}
        <Link
          href="/notes/new"
          prefetch={false}
          className="btn-outline press hidden px-4 py-[9px] text-[13px] md:block"
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
