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
  children?: {
    label: string;
    href: string;
    /** [970 · A-26] 모바일 전체 메뉴(2열 · truncate)용 짧은 라벨 — 없으면 label 그대로.
     *  데스크탑 드롭다운은 nowrap 으로 긴 라벨을 다 보이므로 label 을 쓴다. */
    shortLabel?: string;
  }[];
};

export const NAV: NavItem[] = [
  /* [1108 · 통폐합] "실거래" — 대분류 맨 앞(6 → 7). 11.01~05 첫 화면 수 1,956 가운데 단지 818 · 지역 391 · 비교 107 · 실거래 구간 59,
     곧 70% 가 실거래 화면인데 상단 메뉴에는 그 머리가 없었다(지역 · 단지 · 구간 · 동별 · 월간 리포트 · 시장 온도가 지도 하위 ·
     푸터 "데이터" 묶음 · 지역 화면 안 링크로 흩어져 있었다). 머리 화면은 단지 찾기(/complex/browse — 구 → 단지별 실거래 요약,
     색인 대상). 푸터에서 뺀 실거래 구간 · 동별 · 월간 리포트 · 시장 온도는 여기 하위로 옮겨 모든 화면 HTML 에 그대로 남는다
     (1069 · 1094 의 "끊긴 묶음" 크롤 경로 보존). 요금제는 토스 심사가 끝날 때까지 그대로(소유자 결정 2026-11-07). */
  {
    label: "실거래",
    href: "/complex/browse",
    also: ["/tx", "/dong", "/reports", "/region", "/complex", "/analysis/temperature"],
    children: [
      { label: "단지 찾기", href: "/complex/browse" },
      { label: "단지 비교", href: "/complex/compare" },
      { label: "실거래 구간", href: "/tx" },
      { label: "동별 실거래", href: "/dong" },
      { label: "월간 리포트", href: "/reports" },
      { label: "시장 온도", href: "/analysis/temperature" },
    ],
  },
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
  {
    label: "임장노트",
    href: "/notes",
    children: [
      { label: "노트 쓰기", href: "/notes/new" },
      { label: "공개 노트", href: "/notes" },
      { label: "내 집 마련 여정", href: "/journey" },
      { label: "계약·잔금 일정표", href: "/journey/contract" },
      { label: "실거래가 게임", href: "/quiz" },
    ],
  },
  {
    label: "지도",
    href: "/map",
    /* [1108 · 통폐합] 단지 찾기는 "실거래" 대분류의 머리로 갔다. 3D 지도(/map/3d · 5일 방문 10)는 지도의 다른 보기라 여기 하위로 —
       예전엔 메뉴 어디에도 없어 지도 화면 안 단추로만 닿았다. */
    children: [
      { label: "통합 지도 (탐색·실거래·매물)", shortLabel: "통합 지도", href: "/map" },
      { label: "3D 지도", href: "/map/3d" },
    ],
  },
  {
    label: "AI 분석",
    href: "/analysis",
    children: [
      /* [958] 이름은 허브 카드(tool-catalog)와 글자까지 같게 */
      { label: "분석 허브", href: "/analysis" },
      /* [993] 핵심 4종을 GNB 에 바로 두었던 것을 [1108 · 통폐합] 허브의 질문 세 계열(tool-catalog TIERS — 단지 분석 · 지역 시세 ·
         내 임장노트)로 바꾼다. 12개 도구 이름을 외워야 고를 수 있는 구조였고(AI 진입 12곳), 허브는 이미 2026-08-25 부터
         이 세 질문으로 짜여 있다(app/analysis/page.tsx #tier-*). 도구 주소는 그대로(허브 카드에서 닿는다). 이름은 TIERS.label 과 같게. */
      { label: "단지 분석", href: "/analysis#tier-complex" },
      { label: "지역 시세", href: "/analysis#tier-market" },
      { label: "내 임장노트 분석", shortLabel: "내 노트 분석", href: "/analysis#tier-record" },
    ],
  },
  {
    label: "동네",
    href: "/town",
    /* [996] 소유자 지시 — 하위 메뉴에 뉴스·청약만 보여 동네이야기(허브)·정비사업이 안 보였다.
       넷을 나란히. [1006] 순서를 화면과 맞춘다: 동네이야기(사람의 기록, 허브)가 먼저,
       뉴스(뉴스룸)는 그다음 — 동네이야기와 뉴스는 다른 재질의 두 화면이다. */
    /* [1044] 뉴스룸을 뺐다(소유자 지시 2026-10-06: "뉴스랑 동네글을 분리해줘" — 메뉴까지). 동네 = 사람이 쓴 글과
       동네 단위 공공데이터(청약·정비사업), 뉴스 = 자동수집 기사. 뉴스는 바로 아래 제 대분류에 선다. */
    /* [1108 · 통폐합] 토론(/talk) · 모임(/town/groups)을 하위에 — 사람이 쓰는 글이 글 · 토론 · 모임 세 화면인데 메뉴에는 글 하나만 있어
       토론은 홈 맨 아래 한 줄과 단지 화면에서만 닿았다. /talk 는 /town 아래가 아니라 also 로 동네를 켠다(탭바 TOWN_TAB_EXTRA 와 같은 판정). */
    also: ["/talk"],
    children: [
      { label: "동네이야기", href: "/town" },
      { label: "토론", href: "/talk" },
      { label: "모임", href: "/town/groups" },
      { label: "청약", href: "/apply" },
      { label: "정비사업", href: "/redevelopment" },
      /* [1047] 전문가 — 보관 해제(소유자 지시 2026-10-09 "전문가 등록 · 카테고리 · 숨고처럼 홍보"). 주소가 /town 아래라 동네가 켜진다 */
      { label: "전문가 찾기", href: "/town/experts" },
    ],
  },
  /* [1044] 뉴스 — 동네에서 떼어 낸 대분류(5 → 6). 주소는 그대로다(/town/news · /digest — 색인·공유 링크 손해 0).
     주소가 /town 아래라 활성 판정은 "가장 긴 접두가 이긴다"(navItemActive) — /town/news 에서는 뉴스만 켜지고 동네는 꺼진다.
     주간 다이제스트(/digest)는 뉴스 하위 화면이라 also 로 함께 켠다.
     하위 라벨 "뉴스룸"은 화면 제목·다른 화면의 링크("뉴스룸 전체 ›")와 같은 이름이다([1007 · P2]). */
  {
    label: "뉴스",
    href: "/town/news",
    also: ["/digest"],
    children: [
      { label: "뉴스룸", href: "/town/news" },
      { label: "주간 다이제스트", href: "/digest" },
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
