/* [1121 · 기능 통폐합 1·3단계] 소유자 2026-11-09 — 같은 일을 하는 화면들을 "한 화면의 탭"으로 잇는다(지역 화면 RegionTabs 와 같은 방식).
   주소는 그대로 둔다(색인 · 공유 링크 · 외부 링크) — 대신 묶음 안 모든 화면이 머리 아래 같은 탭 줄을 둔다. 순수 데이터(단위 테스트). */
export type SectionTab = { href: string; label: string };

/** 비교 — 단지 짝 비교 · 노트 회차 비교 · 매물 비교함(후보 단지 비교 /analysis/compare 는 "단지" 탭 안 링크) */
export const COMPARE_TABS: readonly SectionTab[] = [
  { href: "/complex/compare", label: "단지" },
  { href: "/notes/compare", label: "노트" },
  { href: "/listings/compare", label: "매물" },
];

/** 실거래 리포트 — 월간 · 주간(다이제스트) */
export const REPORT_TABS: readonly SectionTab[] = [
  { href: "/reports", label: "월간" },
  { href: "/digest", label: "주간" },
];

/** 가이드 — 전체 · 임장 · 계약 · 규제 · 데이터(방법론 · 출처) */
export const GUIDE_TABS: readonly SectionTab[] = [
  { href: "/guides", label: "전체" },
  { href: "/imjang", label: "임장" },
  { href: "/guides/contract", label: "계약" },
  { href: "/guides/regulations", label: "규제" },
  { href: "/methodology", label: "데이터" },
];
