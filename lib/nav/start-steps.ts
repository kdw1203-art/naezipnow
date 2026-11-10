/* [1124 · 처음 온 사람의 길] 소유자 2026-11-10 "사용자가 처음 들어오면 회원가입 → 임장노트 → 지도 → 분석 · 유입경로(임장노트 · 뉴스 · 전문가 등록) 강화".
   네 단계는 실제 순서다(가입해야 노트가 저장되고, 노트 · 지도에서 고른 단지를 분석한다) — 번호가 정보다.
   순수 데이터 — 홈 · 임장노트 상세 · 뉴스 상세가 같은 줄을 쓴다(유입 화면마다 지금 서 있는 단계만 다르다). */

export type StartStepKey = "signup" | "note" | "map" | "analysis";
export type StartFrom = "home" | "note" | "news";

export interface StartStep {
  key: StartStepKey;
  title: string;
  sub: string;
  href: string;
}

export const START_STEPS: readonly StartStep[] = [
  { key: "signup", title: "회원가입", sub: "무료 · 이메일 하나", href: "/signup" },
  { key: "note", title: "임장노트", sub: "본 집을 사진 · 체크로 기록", href: "/notes/new" },
  { key: "map", title: "지도", sub: "실거래 · 단지 찾기", href: "/map" },
  { key: "analysis", title: "AI 분석", sub: "단지 · 지역 진단", href: "/analysis" },
];

/** 유입 화면이 이미 보여 주고 있는 단계 — 그 칸은 "지금 보는 중"으로 표시하고 링크를 걸지 않는다 */
export function currentStep(from: StartFrom): StartStepKey | null {
  return from === "note" ? "note" : null;
}

/** 가입 뒤 돌아올 곳 — 읽던 화면으로(내부 경로만) */
export function signupHref(returnTo?: string | null): string {
  if (!returnTo || !returnTo.startsWith("/") || returnTo.startsWith("//")) return "/signup";
  return `/signup?callbackUrl=${encodeURIComponent(returnTo)}`;
}

export const START_HEADING: Record<StartFrom, string> = {
  home: "처음이라면 이 순서로",
  note: "내 임장도 이렇게 남기는 순서",
  news: "기사 다음 순서",
};
