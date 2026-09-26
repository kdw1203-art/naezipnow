/** 9m GNB — 6 대분류 공유 데이터 (데스크탑 GNB · 모바일 전체 메뉴 · 좌측 내비 공용)
 *  대통합 IA(2026-07): 지도는 탐색·실거래·실매물·등록 통합(/map 단일),
 *  대출·비용 계산기는 임장노트로, 입주물량·공매·청약은 동네이야기로 편입.
 *  [1003] 다섯째로 "요금제" 추가 — 사유는 아래 그 항목 주석.
 *  [1008 · J] 맨 앞에 "내 집 마련" 추가 → [1011] 임장노트 하위로 이동(대분류 5개로 복귀). */
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
         데스크톱에서 도구를 발견할 길이 허브 카드 4장뿐이었다. 이름은 tool-identity 와 같게.
         [1008] "이 단지 ~" 접두를 뺐다(소유자 지시 — 메뉴에서는 가리킬 단지가 없어 같은 말이
         네 번 반복될 뿐이었다). 단지 화면 안의 "이 단지 임장노트 쓰기" 같은 문맥 문구는 그대로다. */
      { label: "종합 진단", href: "/analysis/ai/ai-diagnosis" },
      { label: "시세 예측", href: "/analysis/ai/ai-prediction" },
      { label: "매수 타이밍", href: "/analysis/ai/ai-timing" },
      { label: "임장 동선", href: "/analysis/ai/ai-inspection" },
    ],
  },
  {
    label: "동네",
    href: "/town",
    /* [996] 소유자 지시 — 하위 메뉴에 뉴스·청약만 보여 동네이야기(허브)·정비사업이 안 보였다.
       넷을 나란히. [1006] 순서를 화면과 맞춘다: 동네이야기(사람의 기록, 허브)가 먼저,
       뉴스(뉴스룸)는 그다음 — 동네이야기와 뉴스는 다른 재질의 두 화면이다. */
    children: [
      { label: "동네이야기", href: "/town" },
      { label: "뉴스룸", href: "/town/news" }, // [1007 · P2] 카테고리 카드(lib/town/category-links)와 같은 라벨
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
