/**
 * 게스트 홈 히어로·CTA 단일 소스.
 * 「임장 기록 → AI 정리 → 지도 비교」루프가 한 호흡으로 읽히게 유지한다.
 *
 * 방향성 리밸런싱(2026-08): 핵심 타깃은 '발로 뛰는 임장러'(실전 투자자·진지한
 * 실수요자)다. 조회만 하는 앱이 아니라 **기록으로 결정을 만드는 부동산 의사결정
 * 플랫폼**임을 첫 화면에서 말한다. 단, 노트 우선·정직한 퍼널(저장 시 로그인)은 유지.
 */

export const HOME_HERO_BADGE = "임장러를 위한 부동산 의사결정 플랫폼";

/**
 * 문서에 단 하나뿐인 H1. 화면에는 안 보이지만 항상 존재한다.
 *
 * 아래 두 히어로 문구는 오랫동안 각각 `<h1>` 이었다. 그런데 홈은
 * 모바일/데스크톱 두 벌을 **한 문서에 다** 그려 놓고 CSS 로 하나만
 * 보여 준다(S13-13a). 그래서 비로그인 HTML 에는 h1 이 두 개였고,
 * 로그인하면 두 히어로가 전부 `[data-static-hero]` 로 숨어 h1 이
 * **0개**가 됐다. 문서의 제목이 뷰포트와 로그인 여부에 따라 두 개였다가
 * 없어졌다가 한 셈이다.
 *
 * 그래서 제목은 한 군데로 모은다: `<main>` 첫 자식의 sr-only h1 하나.
 * 히어로 문구는 뷰포트별 "시각 카피"로 강등해 `<p>` 로 그린다.
 */
export const HOME_PAGE_H1 = "내집나우 — 발로 뛴 임장을 데이터·결정으로 바꾸는 부동산 플랫폼";

/** 모바일 히어로 문구 — emphasis 구간만 gradient (행동 우선, 전환 유지) */
export const HOME_HERO_MOBILE_LINE1 = "오늘 본 집,";
export const HOME_HERO_MOBILE_EMPHASIS = "3분 만에 기록";
export const HOME_HERO_MOBILE_TAIL = "하세요";

/** 데스크톱 히어로 문구 — '발로 뛴 임장'(타깃) → '판단 근거'(의사결정) */
export const HOME_HERO_DESKTOP_LEAD = "발로 뛴 임장이";
export const HOME_HERO_DESKTOP_EMPHASIS = "판단 근거";
export const HOME_HERO_DESKTOP_TAIL = "가 됩니다";

/** 기기 공통 보조문 — 처음 온 사람에게 "무엇을 하는 서비스인지"를 명사로 먼저 말한다.
 *  [945 · 실사용50 #13] 임시 확정 카피 — 소유자의 3인 인터뷰(홈만 보여주고 "무슨
 *  서비스냐" 질문) 후 최종 문구로 교체한다. 이 상수 한 줄만 바꾸면 홈·온보딩에 모두
 *  반영된다(단일 소스). */
export const HOME_HERO_SUBLINE =
  "발로 뛴 임장 기록을 AI가 정리하고 실거래로 검증하는 임장노트 서비스 — 쓰는 건 바로, 로그인은 저장할 때만.";

/** 루프 단계 하이라이트 (장식용·네비 아님) */
export const HOME_FUNNEL_STEPS = ["기록", "AI", "지도"] as const;

export const HOME_CTA_NOTE = { label: "임장노트 쓰기", href: "/notes/new" } as const;
export const HOME_CTA_MAP = { label: "지도에서 비교", href: "/map" } as const;
/** 내 노트 작성 → AI 정리로 이어지는 노트 바운드 CTA (도구 허브 아님) */
export const HOME_CTA_AI = {
  label: "노트로 AI 정리 시작",
  href: "/notes/new?intent=ai",
} as const;

/** [950] 검색 질문 아래 한 줄 — "무엇이 다른가"를 첫 화면에서 말한다(홈 비판 ①).
 *  히어로 블록은 두지 않는다(소유자 지시 2026-08-16: 검색이 첫인상). 작은 보조문 한 줄. */
export const HOME_HERO_SUBLINE_SHORT =
  "시세는 누구나 봅니다. 현장은 가 본 사람만 압니다 — 실거래 옆에 현장 기록을 남기는 임장노트";

export const HOME_AI_GATEWAY_TITLE = "임장노트 AI 정리";
/** [950] 예시로 결과의 형태를 보여 준다 — 수치 창작 없음, 형식 안내([1008] 두 칸 → 한 줄 HOME_AI_EXAMPLE_LINE) */
export const HOME_AI_GATEWAY_LEAD =
  "현장에서 적은 짧은 메모를 저장하면 AI(또는 규칙 초안)가 장단점·리스크·확인 항목으로 정리합니다. 로그인은 저장할 때만.";
/* 예시는 지표가 아니라 형태를 보여 준다(수치 창작 아님) — "AI"라는 단어만으로는
   무엇이 좋아지는지 전달되지 않는다는 홈 비판 대응.
   [1008 · J] 홈에서는 두 칸(입력 → 정리, 옛 HOME_AI_EXAMPLE_INPUT/OUTPUT) 대신 이 한 줄로 줄였다 — 검색 아래
   "어디서부터 시작할까요?" 입구를 넣은 만큼 AI 패널을 덜어 첫 화면 높이를 지킨다(app/page.tsx 주석).
   두 칸 상수는 쓰는 곳이 없어져 지웠다([958] 원칙 — 죽은 카피는 표류한다). */
/* [1008 · J 리뷰 C] 입력에 장점 거리(초등학교 도보 7분)가 없는데 "장점 1건"이라고 적혀 있었다 — 옛 두 칸 예시의
   입력(HOME_AI_EXAMPLE_INPUT)을 그대로 되살렸다. 결과(리스크 2건: 결로·야간 주차 / 장점 1건: 초등학교 도보권)가
   입력에서 그대로 나온다. 줄 높이는 그대로(1280·768·390·360 실측 — 글이 늘어도 줄 수가 같다). */
export const HOME_AI_EXAMPLE_LINE =
  "예: “복도 결로 흔적, 밤 주차 빡빡, 초등학교 도보 7분” → 리스크 2건 · 장점 1건 · 다음 방문 때 확인할 것";
/* [958] HOME_AI_GATEWAY_BODY 는 아무도 import 하지 않아 지웠다(죽은 카피는 표류한다) */
export const HOME_AI_BRIEFING_LABEL = "오늘의 시장 브리핑 (참고)";

/**
 * [1008 · J] 홈 검색 바로 아래 "어디서부터 시작할까요?" — 문 네 개.
 * 목적지로 고르는 입구다(기능 이름이 아니라 "지금 내 상황"). 경로는 전부 실재하는 화면이고, /quiz 는
 * 같은 판에 Q 가 만든 "실거래가 게임"(app/quiz)이다.
 * 서버 렌더·클라이언트 JS 없음(app/components/home/HomeStartDoors.tsx).
 */
export const HOME_START_DOORS_TITLE = "어디서부터 시작할까요?";
export const HOME_START_DOORS = [
  { title: "구경하러 왔어요", sub: "실거래가 게임", href: "/quiz", icon: "compass" },
  { title: "후보가 있어요", sub: "단지 종합 진단", href: "/analysis/ai/ai-diagnosis", icon: "target" },
  { title: "계약을 앞두고 있어요", sub: "계약·잔금 일정표", href: "/journey/contract", icon: "key" },
  { title: "처음부터 차근차근", sub: "내 집 마련 여정 6단계", href: "/journey", icon: "footprints" },
] as const;
