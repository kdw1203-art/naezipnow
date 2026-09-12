/** 9m GNB — 4 대분류 공유 데이터 (데스크탑 GNB · 모바일 전체 메뉴 공용)
 *  대통합 IA(2026-07): 지도는 탐색·실거래·실매물·등록 통합(/map 단일),
 *  대출·비용 계산기는 임장노트로, 입주물량·공매·청약은 동네이야기로 편입. */
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
      { label: "이 단지 종합 진단", href: "/analysis/ai/ai-diagnosis" },
    ],
  },
  {
    label: "동네",
    href: "/town",
    children: [
      { label: "뉴스", href: "/town/news" },
      { label: "청약", href: "/apply" },
    ],
  },
];
