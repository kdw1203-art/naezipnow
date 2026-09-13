"use client";

import { useState } from "react";
import { isTossBillingOpenClient, isTossTestEnv, tossClientKey } from "./toss-rail";
import { safeInternalPath } from "@/lib/safe-path";

/**
 * 구독 플랜 결제 시작 버튼.
 * 새 디자인 플랜 → 구 결제 코드(membership plan tier) 매핑:
 *   플러스 → "pro" (PRO) · 프로(전문가) → "expert" (EXPERT)
 *
 * 절대 규칙: 결제를 완료시키지 않는다 — 결제 생성 API 호출 후
 * 응답의 결제창 URL로 이동하는 것까지만 연결한다. (승인·확정은 결제창에서 사용자가 진행)
 */
export type CheckoutTier = "pro" | "expert";

/** [966] 페이월이 붙인 ?returnTo= — 내부 경로만, 없으면 null */
function currentReturnTo(): string | null {
  if (typeof window === "undefined") return null;
  const raw = new URLSearchParams(window.location.search).get("returnTo");
  const safe = safeInternalPath(raw, "");
  return safe && safe !== "/" ? safe : null;
}

export function PlanCheckoutButton({
  tier,
  label,
  className,
  billing = "monthly",
}: {
  tier: CheckoutTier;
  label: string;
  className: string;
  billing?: "weekly" | "monthly" | "annual";
}) {
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  /**
   * 결제창 이동 전 한 번 더 묻는 단계. 예전에는 `window.confirm` 을 썼는데,
   * 브라우저 모달은 페이지 이벤트를 통째로 막고(자동화·접근성 도구 포함) 문구를
   * 다듬을 수도 없다. 버튼 자리에서 바로 확인받는 2단계 방식으로 바꾼다.
   */
  const [confirming, setConfirming] = useState(false);

  /* ============================================================
     [992] 결제 레일은 토스 하나다 — 주간권은 단건 결제창, 월간·연간은 빌링(카드 등록).
     예전 함수는 Stripe → 카카오페이 폴백 사다리(150줄)였다. 승인 0건인 채 실패 문구만
     여섯 갈래였고, 주간권을 폴백시키면 월간이 청구되는 함정까지 있었다. 이제 갈래는 셋:
       · 토스 키 없음 → "준비 중"
       · 주간권 → /subscription/checkout (비로그인 미리보기 포함 · [968 T1/T2])
       · 정기 → 빌링 개방이면 로그인은 /subscription/billing, 비로그인은 체크아웃 미리보기
                ([991]) · 미개방이면 "주간권만 가능"
     서버 주문은 여전히 로그인 필수 — 이 버튼은 결제를 완료시키지 않는다.
     ============================================================ */
  async function startCheckout() {
    if (busy) return;
    setNotice(null);

    if (!tossClientKey()) {
      setNotice("결제가 아직 열리지 않았어요. 잠시 후 다시 시도해 주세요.");
      return;
    }
    const rt = currentReturnTo();
    const q = `tier=${tier}&billing=${billing}${rt ? `&returnTo=${encodeURIComponent(rt)}` : ""}`;

    if (billing === "weekly") {
      setConfirming(false);
      window.location.href = `/subscription/checkout?${q}`;
      return;
    }

    if (!isTossBillingOpenClient()) {
      setNotice("월간·연간 결제는 준비 중이에요. 지금은 플러스 주간권(7일)으로 이용할 수 있어요.");
      return;
    }

    setConfirming(false);
    setBusy(true);
    try {
      let authed = false;
      try {
        const res = await fetch("/api/auth/session", { cache: "no-store" });
        const j = (await res.json().catch(() => null)) as { user?: { email?: string | null } } | null;
        authed = Boolean(j?.user?.email);
      } catch {
        authed = false;
      }
      /* 비로그인은 결제수단을 먼저 본다([991]) — 로그인 벽이 아니라 결제창이 첫 화면이다 */
      window.location.href = authed ? `/subscription/billing?${q}` : `/subscription/checkout?${q}`;
    } finally {
      setBusy(false);
    }
  }

  const billingLabel =
    billing === "annual" ? "연간" : billing === "weekly" ? "주간권(7일 단건)" : "월간";

  return (
    <div className="flex flex-col gap-1.5">
      {confirming && !busy ? (
        <div className="flex flex-col gap-1.5">
          <p className="text-center t-sub font-bold text-text-2">
            {billingLabel} 결제창으로 이동합니다
          </p>
          {/* 사실 우선 — 테스트 키 환경에서는 승인이 가상으로 이루어져 실제
              청구가 없다(토스 환경 가이드). 가짜 결제를 진짜처럼 보이게 두지 않는다. */}
          {isTossTestEnv() && (
            <p className="text-center t-sub font-bold text-warning">
              테스트 결제 환경 — 실제 금액이 청구되지 않아요
            </p>
          )}
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="flex-1 rounded-[14px] border border-line bg-surface p-[13px] text-center text-[13px] font-bold text-text-1"
            >
              취소
            </button>
            <button
              type="button"
              onClick={() => void startCheckout()}
              className={`flex-1 rounded-[14px] p-[13px] text-center text-[13px] font-bold ${className}`}
            >
              계속
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            setNotice(null);
            setConfirming(true);
          }}
          className={`rounded-[14px] p-[13px] text-center text-[13px] font-bold disabled:opacity-60 ${className}`}
        >
          {busy ? "연결 중…" : label}
        </button>
      )}
      {notice && (
        <p role="alert" className="text-center t-sub font-bold text-danger">
          {notice}
        </p>
      )}
    </div>
  );
}
