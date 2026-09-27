/**
 * 게스트 홈·온보딩 CTA 단일 소스.
 *
 * [1012 · 규칙 5·7] 홈 첫 화면이 "검색 + 실데이터 목록"이 되면서 히어로 카피(슬로건·부제·강조 구간)와
 * "어디서부터 시작할까요?" 문 넷(HOME_START_DOORS)·AI 패널 해설(HOME_AI_GATEWAY_LEAD·EXAMPLE_LINE)이
 * 화면에서 사라졌다. 쓰는 곳이 없는 카피는 표류하므로([958] 원칙) 지웠다 — 아무도 import 하지 않던
 * HOME_HERO_BADGE·HOME_HERO_MOBILE_*·HOME_HERO_DESKTOP_*·HOME_HERO_SUBLINE·HOME_FUNNEL_STEPS 도 함께.
 * 남은 것은 실제로 화면에 나가는 문자열뿐이다(app/page.tsx · JourneyBanner · WelcomeClient).
 */

/**
 * 문서에 단 하나뿐인 H1. 화면에는 안 보이지만 항상 존재한다(`<main>` 첫 자식의 sr-only h1).
 * 화면의 히어로 문구는 `<p>` 다 — h1 이 뷰포트·로그인 여부에 따라 0~2개가 되던 문제의 해법.
 */
export const HOME_PAGE_H1 = "내집나우 — 발로 뛴 임장을 데이터·결정으로 바꾸는 부동산 플랫폼";

/**
 * [1012] 검색창 위 입력 유도 질문 한 줄 — 숨고("강남구에서 어떤 서비스가 필요하세요?")식.
 * 슬로건도 자기소개도 아니다: 검색창에 무엇을 치면 되는지만 말한다. 부제 문단은 두지 않는다.
 */
export const HOME_HERO_QUESTION = "어느 단지를 보고 계세요?";

export const HOME_CTA_NOTE = { label: "임장노트 쓰기", href: "/notes/new" } as const;
export const HOME_CTA_MAP = { label: "지도에서 실거래 비교", href: "/map" } as const;
/** 내 노트 작성 → AI 정리로 이어지는 노트 바운드 CTA (도구 허브 아님). [1012 · 규칙 5] 동사 + 구체 대상 */
export const HOME_CTA_AI = {
  label: "임장노트 쓰고 AI 정리 받기",
  href: "/notes/new?intent=ai",
} as const;

export const HOME_AI_GATEWAY_TITLE = "임장노트 AI 정리";
export const HOME_AI_BRIEFING_LABEL = "오늘의 시장 브리핑 (참고)";
