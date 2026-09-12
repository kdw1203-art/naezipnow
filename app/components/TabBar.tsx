"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { Icon } from "./Icon";
import { useTabBarCompact } from "@/lib/client/use-scroll-state";
import { tabBarActive } from "@/lib/client/shell-gates";

/** 균형 5슬롯(2-＋-2) — ＋가 정중앙에 오도록 재배치(2026-07-21 리디자인).
 *  홈·지도·기록(＋)·분석·마이. 통일 라인 아이콘 사용.
 *  [991] '동네' → '분석'. 30일 실측: /analysis 62회·평균 251초(가장 오래 읽는 화면)
 *  vs /town 31회·7초(들어오자마자 나감). 탭바는 "다음에 갈 확률이 가장 높은 곳" 다섯이다 —
 *  동네이야기는 헤더 메뉴(동네 › 뉴스·청약)와 푸터에서 닿는다.
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
  /* 계산기·에이전트는 분석 도구의 다른 얼굴이다 — 같은 탭이 켜져야 길을 잃지 않는다 */
  { label: "분석", icon: "sparkles", href: "/analysis", extra: ["/calculator", "/agent"] },
  { label: "마이", icon: "user", href: "/my" },
];

/** 모바일 하단 플로팅 글래스 탭바 — 중앙 정렬·균형 5슬롯.
 *
 * 모바일 실측 4(2026-08-02): 중앙 기록(+) 원이 스크롤 중에도 본문 위에 떠
 * 콘텐츠를 가렸다. 아래로 읽어 내려가는 동안(=콘텐츠 소비 중)은 바를 살짝
 * 내리고 반투명하게 접고, 위로 스크롤(=이동 의도)하면 즉시 복원한다. */
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
      className={`tabbar-autohide fixed left-1/2 z-50 w-[min(420px,calc(100%-28px))] -translate-x-1/2 transition-all duration-300 md:hidden ${
        compact ? "translate-y-[14px] opacity-85" : ""
      }`}
      /* 소유자 캡처(2026-08-04): 바가 콘텐츠 버튼을 가렸다 — 더 아래로,
         더 얇게. 바닥 여백 16→6px(safe-area 는 그대로 존중 — 홈 인디케이터
         아래로는 안 내린다). 글씨 11px 은 유지(이전 요청: 메뉴 글씨는 키움). */
      style={{ bottom: "max(6px, env(safe-area-inset-bottom, 0px))" }}
      aria-label="하단 내비게이션"
    >
      <div className="glass-strong grid grid-cols-5 items-end rounded-[22px] px-2 pb-1 pt-1 shadow-[0_12px_32px_rgba(15,23,42,.18)]">
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
              {/* [970 · A-03] text-brand-navy → text-primary: --brand-navy 는 다크에서 뒤집히지
                  않는 고정 네이비라 다크 글래스 위에서 "기록" 글자가 묻혔다. 토큰을 다크에서
                  밝게 뒤집으면 네이비 카드 위 한지 글자가 전부 대비를 잃으므로 탭바 글자만
                  테마 토큰(primary)으로 — 데스크탑 GNB·전체 메뉴의 활성색과도 같아진다. */}
              {/* [976] text-primary → text-primary-strong. 탭바는 유리라 뒤 배경이
                  비치는데, 본문이 어두운 화면(/subscription 등)에서는 실제 바탕이
                  #ced3da 까지 내려가 --primary 가 4.41:1 이었다(axe 실측). 같은 파랑
                  계열의 진한 값(--primary-strong)이면 5.67:1 이고, 다크에서는 이
                  토큰이 밝은 쪽(#86a9ff)으로 뒤집히므로 어두운 유리 위에서도 산다. */}
              <span className="text-[12px] font-extrabold text-primary-strong">
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
                /* [970 · A-03] 활성 탭도 text-primary(사유는 위 "기록" 라벨 주석)
                   [975] 비활성 text-3 → text-2: 탭바는 반투명 유리라 뒤 배경이
                   비쳐 실제 바탕이 #d1d6dc 정도가 된다. 거기서 text-3 는 3.75:1
                   이었다(axe 실측). 이 라벨은 모든 화면 아래에 늘 떠 있다. */
                isActive(tab) ? "text-primary" : "text-text-2"
              }`}
            >
              {/* [962] 현재 탭 = 온점. 탭이 바뀌면 한 번 튄다(njn-pop) — 브랜드 색이 상태 언어가 된다 */}
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
