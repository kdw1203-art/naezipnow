"use client";

import { createContext, useContext } from "react";

/**
 * [1086] 가입 창(SoftSignupProvider)의 문맥과 훅만 — 부르는 화면(노트 쓰기 · 단지 · 지도 패널 · 노트 상세 …)이 창 그리기 코드와
 * 실험 등록부(문구 A/B · 약 5KB)까지 받지 않게 나눴다. Provider 는 루트 레이아웃에 한 번(app/layout.tsx).
 * 규약은 그대로: Provider 밖에서 불려도 no-op 이 아니라 최소한 로그인 화면으로 보낸다.
 */

export type SoftSignupIntent = {
  /** 퍼널 집계용 키. 예: "watchlist_add" */
  action: string;
  /** 모달 제목 — 사용자가 방금 누른 것 기준으로 쓴다. */
  title: string;
  /** 왜 로그인이 필요한지 한 줄. 과장 금지 — 실제로 제공하는 것만. */
  benefit: string;
  /** 로그인 후 돌아올 경로. 생략 시 현재 경로. */
  callbackUrl?: string;
  /** [1052] 창을 닫았을 때(가입 거절) 부르는 쪽이 치울 일 — 관심 등록은 "가입 뒤 마저 담기" 기록을 지운다.
   *  Provider 는 모든 화면 레이아웃에 있어 기능별 모듈(pending-watch 등)을 직접 import 하면 모든 화면 번들이 는다 */
  onDismiss?: () => void;
};

export type SoftSignupContextValue = {
  promptSignup: (intent: SoftSignupIntent) => void;
};

export const SoftSignupContext = createContext<SoftSignupContextValue | null>(null);

export function softLoginHref(callbackUrl: string): string {
  return `/login?callbackUrl=${encodeURIComponent(callbackUrl)}`;
}

export function useSoftSignup(): SoftSignupContextValue {
  const ctx = useContext(SoftSignupContext);
  return (
    ctx ?? {
      promptSignup: (intent) => {
        if (typeof window === "undefined") return;
        window.location.href = softLoginHref(
          intent.callbackUrl ?? window.location.pathname + window.location.search,
        );
      },
    }
  );
}
