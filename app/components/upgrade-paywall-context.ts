"use client";
/* [1103 · 속도] 페이월 컨텍스트 · 훅만 따로 — 단지 화면(hub-client) · 지도 단지 판 · 뉴스 상세처럼 훅만 쓰는 곳이
   UpgradePaywallProvider 를 가져오면 페이월 본체(UpgradePaywall) · 요금 기간 표가 그 화면 청크에 한 벌 더 실렸다
   (빌드 그래프 실측 /complex/[id] 4.4KB 중복 · 431/435KB). 공급자는 레이아웃이 한 번만 싣는다. */
import { createContext, useContext } from "react";

export type UpgradeIntent = {
  title?: string;
  message: string;
  href?: string;
  ctaLabel?: string;
};

export type UpgradePaywallContextValue = {
  promptUpgrade: (intent: UpgradeIntent) => void;
  /**
   * fetch 응답을 보고 402/403(쿼터)·플랜 부족이면 페이월을 띄우고 true.
   * 호출측은 true면 early-return 하면 된다.
   */
  handleUpgradeResponse: (
    status: number,
    body?: { code?: string; error?: string; message?: string } | null,
  ) => boolean;
};

export const UpgradePaywallContext = createContext<UpgradePaywallContextValue | null>(null);

export function useUpgradePaywall(): UpgradePaywallContextValue {
  const ctx = useContext(UpgradePaywallContext);
  return (
    ctx ?? {
      promptUpgrade: () => {
        /* Provider 밖 — 조용히 no-op (기능 자체는 호출측 에러 처리에 맡김) */
      },
      handleUpgradeResponse: () => false,
    }
  );
}
