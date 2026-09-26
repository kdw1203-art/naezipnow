import { safeInternalPath } from "@/lib/safe-path";

/**
 * [1007] 요금제 화면(/subscription)의 진입 파라미터 — 순수 함수.
 *
 * 왜: /subscription 은 하루 200회(24h 실측) 서버리스 함수를 띄웠다 — `searchParams`
 * (plan·billing·returnTo)와 `safeAuth()` 를 서버에서 읽어 force-dynamic 이었기 때문이다.
 * 세 카드는 비회원 기준으로 ISR 에 굳히고(토스 심사가 보는 화면 그대로), 파라미터 판정은
 * 여기로 옮겨 PlanCards·WeeklyPassCta(클라이언트)가 마운트 뒤 window.location 을 넘겨 부른다.
 * 값의 뜻은 예전 page.tsx 와 같다.
 */

export type SubscriptionBilling = "monthly" | "annual";
/** [970 · A-07] ?plan=·?billing=weekly 에서 판정한 강조 대상 */
export type SubscriptionHighlight = "pro" | "expert" | "weekly" | null;

export type SubscriptionPageParams = {
  /** 결제 실패 재시도가 들고 돌아오는 주기 — 토글 초기값 */
  billing: SubscriptionBilling;
  /** 로그인 복귀·결제 실패 재시도로 돌아온 사람이 골랐던 플랜(주간권이면 주간권 섹션) */
  highlightPlan: SubscriptionHighlight;
  /** 페이월이 붙여 보낸 복귀 경로 — 내부 경로만, "/" 와 빈 값은 "" */
  returnTo: string;
};

export function parseSubscriptionParams(search: string | URLSearchParams): SubscriptionPageParams {
  const sp = typeof search === "string" ? new URLSearchParams(search) : search;
  const billingRaw = (sp.get("billing") ?? "").trim();
  const planRaw = (sp.get("plan") ?? "").trim();
  const returnRaw = (sp.get("returnTo") ?? "").trim();
  const returnTo = returnRaw ? safeInternalPath(returnRaw, "") : "";
  return {
    billing: billingRaw === "annual" ? "annual" : "monthly",
    highlightPlan:
      billingRaw === "weekly"
        ? "weekly"
        : planRaw === "pro" || planRaw === "expert"
          ? planRaw
          : null,
    returnTo: returnTo === "/" ? "" : returnTo,
  };
}

/** [1003] 주간권 결제창 직행 링크 — 페이월이 붙여 보낸 returnTo 를 이어 붙인다 */
export function weeklyCheckoutHref(base: string, returnTo: string): string {
  const back = safeInternalPath(returnTo, "");
  return back && back !== "/" ? `${base}&returnTo=${encodeURIComponent(back)}` : base;
}
