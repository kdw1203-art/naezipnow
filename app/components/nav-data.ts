/** 9m GNB — 5 대분류 공유 데이터 (데스크탑 GNB · 모바일 전체 메뉴 · 좌측 내비 공용)
 *  대통합 IA(2026-07): 지도는 탐색·실거래·실매물·등록 통합(/map 단일),
 *  대출·비용 계산기는 임장노트로, 입주물량·공매·청약은 동네이야기로 편입.
 *  [1003] 다섯째로 "요금제" 추가 — 사유는 아래 그 항목 주석. */
export type NavItem = {
  label: string;
  href: string;
  children?: {
    label: string;
    href: string;
    /** [970 · A-26] 모바일 전체 메뉴(2열 · truncate)용 짧은 라벨 — 없으면 label 그대로.
     *  데스크탑 드롭다운은 nowrap 으로 긴 라벨을 다 보이므로 label 을 쓴다. */
    shortLabel?: string;
  }[];
};

export const NAV: NavItem[] = [
  /* [991] 18 → 8. 30일 실측(방문자 31·세션 82)에서 GNB 2단계 링크 중 열린 건
     노트 쓰기·공개 노트·지도·분석 허브뿐이었다. 각 대분류에 "가장 먼저 누르는 것" 둘만
     남기고, 나머지는 각 허브 화면 안에서 닿는다(회차 비교·시나리오·타이밍은 /analysis
     허브 카드, 모임·전문가는 991 원칙 ② 에 따라 보관). */
  {
    label: "임장노트",
    href: "/notes",
    children: [
      { label: "노트 쓰기", href: "/notes/new" },
      { label: "공개 노트", href: "/notes" },
    ],
  },
  {
    label: "지도",
    href: "/map",
    children: [
      { label: "통합 지도 (탐색·실거래·매물)", shortLabel: "통합 지도", href: "/map" },
      { label: "단지 찾기", href: "/complex/browse" },
    ],
  },
  {
    label: "AI 분석",
    href: "/analysis",
    children: [
      /* [958] 이름은 허브 카드(tool-catalog)와 글자까지 같게 */
      { label: "분석 허브", href: "/analysis" },
      /* [993] 핵심 4종(lib/ai/ai-tools CORE_AI_TOOL_IDS)을 GNB 에서 바로 — 12종 중 1종만 있어
         데스크톱에서 도구를 발견할 길이 허브 카드 4장뿐이었다. 이름은 tool-identity 와 같게. */
      { label: "이 단지 종합 진단", href: "/analysis/ai/ai-diagnosis" },
      { label: "이 단지 시세 예측", href: "/analysis/ai/ai-prediction" },
      { label: "이 단지 매수 타이밍", href: "/analysis/ai/ai-timing" },
      { label: "이 단지 임장 동선", href: "/analysis/ai/ai-inspection" },
    ],
  },
  {
    label: "동네",
    href: "/town",
    /* [996] 소유자 지시 — 하위 메뉴에 뉴스·청약만 보여 동네이야기(허브)·정비사업이 안 보였다.
       넷을 나란히: 뉴스 · 동네이야기 · 청약 · 정비사업. */
    children: [
      { label: "뉴스", href: "/town/news" },
      { label: "동네이야기", href: "/town" },
      { label: "청약", href: "/apply" },
      { label: "정비사업", href: "/redevelopment" },
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
