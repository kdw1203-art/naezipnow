"use client";
/* [1104 · 속도] 토스트 컨텍스트 · 훅 · 타입만 따로 — 훅만 쓰는 화면(단지 hub-client · 지도 단지 판 · 홈 최근 단지 · 노트 · 설정 …)이
   ToastProvider 를 가져오면 공급자 본체(타이머 · 토스트 마크업 · 링크)가 그 화면 청크에 한 벌 더 실렸다
   (1103 빌드 실측: 모듈 2,034B · gzip 948B 가 레이아웃 말고도 /complex/[id] · 홈 · 노트 · 마이 … 화면·공유 청크 30곳에 중복).
   1103 의 upgrade-paywall-context.ts 와 같은 분리 — 공급자는 레이아웃이 한 번만 싣고, 예전 경로(ToastProvider)도 다시 내보낸다. */
import { createContext, useContext } from "react";

export type ToastAction =
  | { label: string; href: string; onClick?: never }
  | { label: string; onClick: () => void; href?: never };

export type ToastContextValue = {
  showToast: (message: string, action?: ToastAction) => void;
};

export const ToastContext = createContext<ToastContextValue | null>(null);

/** Provider 밖에서 호출돼도 no-op 으로 안전 */
export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  return ctx ?? { showToast: () => {} };
}
