"use client";

import { createContext, useContext } from "react";

/**
 * [1086] "됐다" 장면(MomentProvider)의 문맥과 훅만 — 부르는 화면(노트 쓰기 · 가입 · 로그인 …)이 장면 그리기 코드(조각 22개 ·
 * 도장 마크업 · 타이머)까지 받지 않게 나눴다. Provider 는 루트 레이아웃에 한 번(app/layout.tsx) — 화면 번들에는 이 작은 모듈만.
 * (노트 쓰기 화면 번들 예산 470KB 안에서 1086 가입 재개 코드를 넣으려고 · 실측 약 2.3KB 절감)
 */

export type MomentKind = "success" | "celebrate" | "welcome";

export type MomentInput = {
  title: string;
  subtitle?: string;
  kind?: MomentKind;
  /** celebrate 에서 도장 아래 한지 알약 한 줄(예: "멤버십 시작하기") — 장식용 텍스트, 버튼 아님 */
  pill?: string;
};

export type MomentContextValue = { showMoment: (input: MomentInput) => void };

export const MomentContext = createContext<MomentContextValue | null>(null);

/** Provider 밖에서 불려도 안전하게 아무 일도 하지 않는다. */
export function useMoment(): MomentContextValue {
  const ctx = useContext(MomentContext);
  return ctx ?? { showMoment: () => {} };
}
