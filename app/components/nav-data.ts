/** 9m GNB — 대분류 공유 데이터 (데스크탑 GNB · 모바일 전체 메뉴 · 좌측 내비 공용)
 *  대통합 IA(2026-07): 지도는 탐색·실거래·실매물·등록 통합(/map 단일),
 *  대출·비용 계산기는 임장노트로, 입주물량·공매·청약은 동네이야기로 편입.
 *  [1003] 다섯째로 "요금제" 추가 — 사유는 아래 그 항목 주석.
 *  [1008 · J] 맨 앞에 "내 집 마련" 추가 → [1011] 임장노트 하위로 이동(대분류 5개로 복귀). */
export type NavItem = {
  label: string;
  href: string;
  /** [1044] 이 대분류를 함께 켜는 다른 경로(세그먼트 접두) — 주소가 대분류 href 아래에 있지 않은 하위 화면용 */
  also?: readonly string[];
  /** [1127] PC 상단 메뉴에서 "더보기" 안으로 접는 대분류 — 좌측 내비 · 모바일 전체 메뉴 · 푸터는 그대로 펼친다 */
  more?: boolean;
  children?: {
    label: string;
    href: string;
    /** [970 · A-26] 모바일 전체 메뉴(2열 · truncate)용 짧은 라벨 — 없으면 label 그대로.
     *  데스크탑 드롭다운은 nowrap 으로 긴 라벨을 다 보이므로 label 을 쓴다. */
    shortLabel?: string;
  }[];
};

export const NAV: NavItem[] = [
  /* [1108 · 통폐합] "실거래" 대분류(단지 찾기 · 단지 비교 · 실거래 구간 · 동별 실거래 · 월간 리포트 · 시장 온도)를 맨 앞에 두었다가
     [1110] 소유자 2026-11-08 "실거래 현황은 지도에서 표시할 수 있도록 해주고 메인 카테고리에서는 제외해줘" — 다시 뺐다(7 → 6).
     단지별 실거래 현황은 지도(/map — 단지 마커 · 목록)가 머리고, 실거래 구간 · 동별 · 월간 리포트 · 시장 온도 허브는 푸터 데이터 묶음으로
     돌아갔다(크롤 경로 보존). 주소는 전부 그대로(/complex/browse 는 색인 유입용으로 남는다 — 메뉴에서만 뺐다). 단지 · 지역 · 구간 · 동별 ·
     리포트 화면에서는 "지도"가 켜진다(also). */
  /* [1008 · J] 내 집 마련 — 여정(/journey)·계약·잔금 일정표·실거래가 게임.
     왜: 도구는 다섯 메뉴에 흩어져 있는데 "지금 어느 단계이고 다음에 뭘 하면 되는지"를 잇는 길이 없었다
     (30일 실측: /calculator·/guides/contract 조회 0, 단지 페이지 착지의 48% 가 다음 페이지 없이 이탈).
     왜 맨 앞인가: 이 메뉴는 기능 하나가 아니라 나머지 다섯(임장노트·지도·AI 분석·동네·요금제)을 **순서대로 잇는
     출발점**이라, 읽는 순서의 첫 칸에 둔다(대분류가 5 → 6). 하위는 셋만 — 여정 전체 · 계약·잔금 일정표 ·
     실거래가 게임(/quiz, 같은 판 Q 가 만든다). 모바일 하단 탭바(TabBar)는 그대로다(탭 다섯은 손가락 자리).
     폭 실측(Header.tsx [1008] 주석): 768·900·1024·1100·1280px 모두 한 줄·넘침 0 — 1024px 에서만 16px 이
     모자라 헤더 묶음 간격(lg)을 16 → 12px 로 줄였다. 좌측 내비·모바일 전체 메뉴는 NAV 를 그대로 펼친다. */
  /* [991] 18 → 8. 30일 실측(방문자 31·세션 82)에서 GNB 2단계 링크 중 열린 건
     노트 쓰기·공개 노트·지도·분석 허브뿐이었다. 각 대분류에 "가장 먼저 누르는 것" 둘만
     남기고, 나머지는 각 허브 화면 안에서 닿는다(회차 비교·시나리오·타이밍은 /analysis
     허브 카드, 모임·전문가는 991 원칙 ② 에 따라 보관). */
  /* [1011] "내 집 마련" 대분류를 여기 하위로 넣는다(대분류 6 → 5, 소유자 지시).
     사유: 여정·계약 일정표·실거래가 게임은 전부 **집을 보러 다니며 기록하는 일**의 앞뒤라,
     임장노트와 한 덩어리로 읽힌다. 맨 앞에 따로 둘 만큼 다른 축이 아니었다.
     주소는 그대로다(/journey · /journey/contract · /quiz) — 색인·공유 링크 손해 0.
     순서는 소유자 지시: 임장노트 본래 기능(노트 쓰기·공개 노트)이 먼저, 그다음 내 집 마련. */
  /* [1202 · 디자인 총괄 통폐합] 소유자 2026-11-21 "필요없는 부분은 과감히 통폐합 · 심플하게".
     근거 = 30일 실측(page_view_daily_agg): 뉴스 기사 937 · 노트 쓰기 567 · 단지 415 · 지역 시세 143 이 핵심이고,
     여정 6 · 일정표 · 게임 3 · 계산기 5 · 토론 18 · 모임 2 는 메뉴 한 칸 값을 못 했다.
     - "지도"와 "AI 분석"을 한 칸(지도·분석)으로 — 둘 다 "시세를 보고 판단한다"는 같은 일이다.
     - 비운 자리에 뉴스(가장 많이 읽히는 화면)를 올린다. 상단 넷 + 더보기 틀([1127])은 그대로.
     - 여정 · 일정표 · 계산기 · 게임은 더보기 "도구"로 모은다(메뉴에서 사라지지 않게).
     - 토론 · 모임은 메뉴에서 뺀다(홈 실시간 토론 · 동네 화면에서 닿는다). 주소는 전부 그대로. */
  {
    label: "임장노트",
    href: "/notes",
    children: [
      { label: "노트 쓰기", href: "/notes/new" },
      { label: "공개 노트", href: "/notes" },
      { label: "노트 분석·비교", href: "/notes/analysis" },
    ],
  },
  {
    label: "지도·분석",
    href: "/map",
    also: ["/complex", "/region", "/tx", "/dong", "/reports", "/analysis"],
    children: [
      { label: "통합 지도", href: "/map" },
      { label: "지역 시세", href: "/analysis/timing" },
      { label: "단지 비교", href: "/complex/compare" },
      { label: "AI 분석", href: "/analysis" },
    ],
  },
  {
    label: "동네",
    href: "/town",
    also: ["/talk"],
    children: [
      { label: "동네이야기", href: "/town" },
      { label: "청약", href: "/apply" },
      { label: "정비사업", href: "/redevelopment" },
      { label: "전문가 찾기", href: "/town/experts" },
    ],
  },
  /* 뉴스: 주소가 /town 아래라 활성 판정은 "가장 긴 접두가 이긴다"(navItemActive) — /town/news 에서는 뉴스만 켜진다. */
  {
    label: "뉴스",
    href: "/town/news",
    also: ["/digest"],
    children: [
      { label: "뉴스룸", href: "/town/news" },
      { label: "주간 다이제스트", href: "/digest" },
    ],
  },
  /* 도구 — 집 마련 단계별 계산·일정. 쓰임은 적지만 지우지 않고 더보기 한 칸에 모은다. */
  {
    label: "도구",
    href: "/journey",
    more: true,
    also: ["/calculator", "/quiz"],
    children: [
      { label: "내 집 마련 여정", href: "/journey" },
      { label: "계약·잔금 일정표", href: "/journey/contract" },
      { label: "대출 계산기", href: "/calculator" },
      { label: "실거래가 게임", href: "/quiz" },
    ],
  },
  /* [1003] 요금제 — GNB 에 결제 진입로가 **하나도 없었다**(푸터 한 줄이 전부).
     2026-09-16 13:57 KST 토스 심사 세션 실측: `/` → `/subscription`(13.5초) → `/` 이탈.
     요금제 화면까지는 왔는데 카드 결제창으로 가는 길을 못 찾았다(`/subscription/checkout`
     페이지뷰 0건). 심사가 찾는 것은 "신용/체크카드 결제창"이므로 대분류에서 한 번,
     드롭다운에서 결제창까지 한 번에 닿게 한다 — 세 번째 항목이 결제창 직행이다.
     경로는 lib/payments/payment-methods 의 REVIEW_CHECKOUT_PATH·PAYMENT_METHODS_PATH 와
     같은 값이다(nav-data 는 순수 데이터 모듈이라 import 하지 않고 tests/unit/nav-1003
     이 두 값의 일치를 검사한다). */
  {
    label: "요금제",
    href: "/subscription",
    more: true,
    children: [
      { label: "요금제·이용권", href: "/subscription" },
      { label: "결제 수단 안내", href: "/subscription/payment-methods" },
      {
        label: "주간권 카드 결제",
        shortLabel: "주간권 결제",
        href: "/subscription/checkout?tier=pro&billing=weekly",
      },
    ],
  },
];

/** 세그먼트 접두 — "/map" 이 "/mapping" 을 켜지 않게 */
function underNav(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(prefix.endsWith("/") ? prefix : `${prefix}/`);
}

/**
 * [1044] 이 경로가 속한 대분류 — **가장 긴 접두가 이긴다**.
 *
 * 예전 판정은 표면마다 `pathname.startsWith(item.href)` 였다. 뉴스(/town/news)가 동네(/town)에서 떨어져 나오면
 * 그 규칙으로는 뉴스 화면에서 동네와 뉴스가 **둘 다** 켜진다. 대분류 href 와 also 를 한데 놓고 가장 긴 접두 하나만
 * 고른다(좌측 내비 groupOf 와 같은 규칙) — 데스크탑 GNB · 모바일 전체 메뉴가 이 함수를 같이 쓴다.
 * 하위 메뉴 href 는 보지 않는다: /journey(임장노트 하위)에서 임장노트가 켜지지 않던 예전 동작을 그대로 둔다.
 */
export function navGroupOf(pathname: string, items: readonly NavItem[] = NAV): NavItem | null {
  let best: NavItem | null = null;
  let bestLen = -1;
  for (const item of items) {
    for (const h of [item.href, ...(item.also ?? [])]) {
      if (h === "/" ? pathname === "/" : underNav(pathname, h)) {
        if (h.length > bestLen) {
          best = item;
          bestLen = h.length;
        }
      }
    }
  }
  return best;
}

/** 대분류 활성 판정 — navGroupOf 가 고른 하나만 참 */
export function navItemActive(item: NavItem, pathname: string, items: readonly NavItem[] = NAV): boolean {
  return navGroupOf(pathname, items)?.label === item.label;
}
