"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { Icon } from "./Icon";
import { useTabBarCompact } from "@/lib/client/use-scroll-state";
import { tabBarActive, TOWN_TAB_EXTRA_PREFIXES } from "@/lib/client/shell-gates";

/** 균형 5슬롯(2-＋-2) — ＋가 정중앙에 오도록 재배치(2026-07-21 리디자인).
 *  홈·지도·기록(＋)·동네·마이. 통일 라인 아이콘 사용.
 *  [1003] 넷째 자리를 '분석' → '동네'로 되돌린다(소유자 지시 2026-09-17: "메뉴에서
 *  동네이야기가 있었는데 사라졌어"). [991] 이 자리를 분석에 준 근거는 30일 실측
 *  (/analysis 62회·251초 vs /town 31회·7초)이었는데, 60일로 늘려 다시 재면
 *  /town* 104뷰·24세션 vs /analysis* 111뷰·22세션 으로 사실상 동률이다 — 한 자리를
 *  분석이 독점할 근거가 없어졌다. 분석은 사라지지 않는다: 헤더 GNB(AI 분석 + 핵심
 *  4종)·좌측 내비·모바일 전체 메뉴·홈 AI 패널에 그대로 있다. 거꾸로 동네이야기는
 *  모바일에서 ☰ 를 열어야만 닿는 유일한 대분류였다.
 *  [970 · A-19] 셸에서 기본 프리페치를 남긴 곳은 이 5탭뿐 — 모바일에서 다음 이동 확률이
 *  가장 높은 링크다. 헤더·푸터·메뉴·알림 링크는 전부 prefetch={false}. */
const TABS: Array<{
  label: string;
  icon: string;
  href: string;
  center?: boolean;
  /** 이 탭을 함께 켜는 다른 경로 — 세그먼트 prefix */
  extra?: readonly string[];
}> = [
  { label: "홈", icon: "house", href: "/" },
  { label: "지도", icon: "map", href: "/map" },
  // 중앙 ＋는 핵심 전환 동선 '노트 쓰기'(/notes/new) 고정
  { label: "기록", icon: "plus", href: "/notes/new", center: true },
  /* [1003] 동네이야기 카테고리 다섯 칸 중 넷은 라우트가 app/town 밖이다
     (/apply·/auctions·/supply·/redevelopment — lib/town/category-links). 거기서도
     같은 탭이 켜져야 길을 잃지 않는다. /town/news 는 /town prefix 가 덮는다. */
  { label: "동네", icon: "messages-square", href: "/town", extra: TOWN_TAB_EXTRA_PREFIXES },
  { label: "마이", icon: "user", href: "/my" },
];

/** 모바일 하단 탭바 — 균형 5슬롯.
 *
 * [1012 · 규칙 C · 신호표 6번] 떠 있는 유리 알약(.glass-strong · rounded-3xl · 좌우 14px 띄움 · 32px 그림자)
 * → **화면 폭 전체 흰 면 + 위 1px 선**(당근·호갱노노). 바닥에 붙고 safe-area 만큼 아래 여백을 더한다.
 * 스크롤 접기(useTabBarCompact)는 유지하되 반투명·내려앉기 대신 중앙 ＋ 원만 줄인다 — 바는 늘 같은 자리.
 *
 * 모바일 실측 4(2026-08-02): 중앙 기록(+) 원이 스크롤 중에도 본문 위에 떠 콘텐츠를 가렸다.
 * 아래로 읽어 내려가는 동안(=콘텐츠 소비 중)은 원을 줄이고, 위로 스크롤(=이동 의도)하면 즉시 복원한다. */
export function TabBar() {
  const pathname = usePathname();
  const isActive = (tab: (typeof TABS)[number]) => tabBarActive(tab.href, pathname, tab.extra);

  /* [968 · 12] 접기 판정은 공용 스크롤 상태(리스너 하나·rAF)에서 받는다 — 규칙(아래로
     8px 이상 + 160px 아래면 접고, 위로 8px 이상이면 즉시 펼침)은 lib/client/
     use-scroll-state 의 순수 함수 nextTabBarCompact 그대로다. */
  const compact = useTabBarCompact();

  /* [968 · 40] 예전(모바일6)에는 쿠키 동의가 미결정이면 탭바를 통째로 접었다(null) —
     첫 방문자는 결정 전까지 지도·기록·동네 탭에 손이 닿지 않았다. 이제 배너 쪽이
     탭바 **위**(bottom: --nz-tabbar-offset)에 컴팩트하게 서고 탭바는 늘 그린다. */

  return (
    <nav
      className="tabbar-autohide fixed inset-x-0 bottom-0 z-50 border-t border-line bg-surface md:hidden"
      /* 홈 인디케이터 아래로는 안 내린다 — safe-area 만큼 바 안쪽 여백 */
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      aria-label="하단 내비게이션"
    >
      {/* [1012 · 모바일 60%] tabbar-row — 폰 60% 배율 안에서 탭바만 85% 로 보이게 되돌리는 자리(globals.css).
          nav 가 아니라 안쪽 줄을 키워 홈 인디케이터 여백(safe-area)은 그대로 둔다 */}
      <div className="tabbar-row grid grid-cols-5 items-end px-2 pb-1 pt-1">
        {TABS.map((tab) =>
          tab.center ? (
            <Link
              key={tab.label}
              href={tab.href}
              aria-label={tab.label}
              className="flex flex-col items-center"
            >
              <span
                /* 52→44px, 돌출 -mt-6→-mt-3.5 — 바 위로 솟는 높이를 줄인다.
                   44px 는 터치 타깃 하한선.
                   [962] 파랑 그라데이션 → 브랜드 네이비 + 주홍 파문(FAB 와 같은 언어).
                   "여기서 쓴다"는 신호가 앱 어디서나 같은 모양이다.
                   [970 · B-01] `relative` 를 여기서 직접 단다 — .njn-fab 의 position:relative 는
                   /notes·/town FAB 의 `fixed` 를 이기던 원인이라 CSS 에서 뺐다(파문 ::after 의
                   기준 상자는 이 유틸이 만든다). */
                className={`press njn-fab relative -mt-3.5 mb-[2px] flex h-[44px] w-[44px] items-center justify-center rounded-full leading-none transition-transform duration-300 ${
                  compact ? "scale-[.82]" : ""
                }`}
                data-glyph="plus"
              >
                <Icon name={tab.icon} size={22} strokeWidth={2.2} />
              </span>
              {/* [970 · A-03] 탭바 글자는 테마 토큰(primary) — 데스크탑 GNB·전체 메뉴의 활성색과 같다.
                  [1012] 바가 불투명 흰 면이 되어 [976] 의 반투명 대비 보정(primary-strong)은 필요 없어졌다 —
                  --primary 는 흰 면 위 5.9:1. 굵기는 700(규칙 8). */}
              <span className="text-[12px] font-bold text-primary">
                {tab.label}
              </span>
            </Link>
          ) : (
            <Link
              key={tab.label}
              href={tab.href}
              aria-current={isActive(tab) ? "page" : undefined}
              /* [968 · 34] 탭 한 칸 = py 6 + 아이콘 20 + 간격 2 + 글자 12 + py 6 = 46px
                 (예전 py-1 은 42px 로 44px 터치 하한 미달). 바는 4px 자라 56px —
                 globals.css --nz-tabbar-offset 도 64→68px 로 같이 올렸다. */
              className={`relative flex flex-col items-center gap-[2px] py-1.5 transition-colors ${
                /* [970 · A-03] 활성 탭도 text-primary(사유는 위 "기록" 라벨 주석) · 비활성 text-2([975]) */
                isActive(tab) ? "text-primary" : "text-text-2"
              }`}
            >
              {/* [1012] [1000] 의 "현재 탭 뒤 유리 알약"은 뗐다 — 평면 바에서는 색(primary)과 온점만으로 현재 탭을 말한다.
                  [962] 현재 탭 = 온점. 탭이 바뀌면 한 번 튄다(njn-pop) — 브랜드 색이 상태 언어가 된다 */}
              <span
                className={`absolute top-0 h-[5px] w-[5px] rounded-full bg-brand-red transition-opacity ${
                  isActive(tab) ? "njn-pop-once opacity-100" : "opacity-0"
                }`}
              />
              <span
                className={`flex leading-none transition-transform duration-200 ${
                  isActive(tab) ? "scale-110" : ""
                }`}
              >
                <Icon name={tab.icon} size={20} />
              </span>
              <span
                className={`text-[12px] leading-none ${
                  isActive(tab) ? "font-bold" : "font-semibold"
                }`}
              >
                {tab.label}
              </span>
            </Link>
          ),
        )}
      </div>
    </nav>
  );
}
