"use client";

import {
  useCallback,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { UpgradePaywall } from "@/app/components/UpgradePaywall";
import {
  UpgradePaywallContext,
  useUpgradePaywall,
  type UpgradeIntent,
} from "@/app/components/upgrade-paywall-context";

/**
 * 전역 페이월 — 402 / QUOTA_EXCEEDED / TIER 부족을 한곳에서 띄운다.
 * SoftSignup(401)과 짝: 로그인 벽 vs 플랜 벽.
 * [1103] 컨텍스트 · 훅 · 타입은 upgrade-paywall-context.ts 로 옮겼다(훅만 쓰는 화면 청크에 본체가 딸려 가지 않게). 예전 경로 그대로 쓰도록 다시 내보낸다.
 */
export { useUpgradePaywall };
export type { UpgradeIntent };

const DEFAULT_MESSAGE =
  "이 기능은 현재 플랜 한도를 넘었어요. 구독에서 이어서 쓸 수 있어요.";

export function UpgradePaywallProvider({ children }: { children: ReactNode }) {
  const [intent, setIntent] = useState<UpgradeIntent | null>(null);

  const promptUpgrade = useCallback((next: UpgradeIntent) => {
    setIntent({
      title: next.title ?? "플랜 업그레이드",
      message: next.message || DEFAULT_MESSAGE,
      href: next.href ?? "/subscription",
      ctaLabel: next.ctaLabel ?? "요금제 보기",
    });
  }, []);

  const handleUpgradeResponse = useCallback(
    (
      status: number,
      body?: { code?: string; error?: string; message?: string } | null,
    ) => {
      const code = body?.code ?? "";
      const quota =
        status === 402 ||
        (status === 403 && (code === "QUOTA_EXCEEDED" || code === "TIER"));
      if (!quota) return false;
      const msg =
        (typeof body?.error === "string" && body.error.trim()) ||
        (typeof body?.message === "string" && body.message.trim()) ||
        DEFAULT_MESSAGE;
      promptUpgrade({
        title: code === "QUOTA_EXCEEDED" ? "이용 한도 도달" : "플랜 업그레이드",
        message: msg,
        ctaLabel: "구독하고 이어서 쓰기",
      });
      return true;
    },
    [promptUpgrade],
  );

  const value = useMemo(
    () => ({ promptUpgrade, handleUpgradeResponse }),
    [promptUpgrade, handleUpgradeResponse],
  );

  return (
    <UpgradePaywallContext.Provider value={value}>
      {children}
      <UpgradePaywall
        open={Boolean(intent)}
        onClose={() => setIntent(null)}
        title={intent?.title}
        message={intent?.message ?? DEFAULT_MESSAGE}
        href={intent?.href}
        ctaLabel={intent?.ctaLabel}
      />
    </UpgradePaywallContext.Provider>
  );
}

export default UpgradePaywallProvider;
