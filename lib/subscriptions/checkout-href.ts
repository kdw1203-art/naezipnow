import { safeInternalPath } from "@/lib/safe-path";

/**
 * [1004] 요금제 카드 → 결제 화면 주소 — 순수 함수(클라이언트·서버·테스트가 같은 식을 본다).
 *
 * 왜 생겼나: 카드의 1순위 버튼이 `PlanCheckoutButton`(클라이언트)이었고, 누르면 버튼이
 * "결제창으로 이동합니다 / 취소 / 계속" 2단계로 바뀌었다. 그 다음 다시 `/api/auth/session`
 * 을 물어보고 나서야 이동했다. 즉 **누르고도 아무 일이 없는 것처럼 보이는 구간**이 두 번 있었다.
 * 토스 심사 세션(2026-09-16)이 요금제 화면에서 13.5초 뒤 이탈하고 체크아웃 페이지뷰가 0이었던
 * 것도 같은 자리다. 확인 단계는 이미 체크아웃 화면(주문 요약·동의·결제 버튼)이 하고 있으므로
 * 카드 버튼은 한 번 눌러 그 화면으로 가면 된다 — 그래서 링크가 됐다.
 *
 * 목적지 규칙:
 *  · 주간권(단건)          → 체크아웃(비회원도 그대로 결제창까지 간다)
 *  · 정기 + 로그인         → 빌링(카드 등록) 화면 — 정기결제의 본 화면이다
 *  · 정기 + 비로그인       → 체크아웃(결제수단을 먼저 보여 주고 로그인으로 잇는다)
 */
export type CheckoutTier = "pro" | "expert";
export type CheckoutBilling = "weekly" | "monthly" | "annual";

export function planCheckoutHref(input: {
  tier: CheckoutTier;
  billing: CheckoutBilling;
  /** 로그인 상태인가 — 서버가 아는 값을 그대로 넘긴다(클릭 시점에 다시 묻지 않는다) */
  authed: boolean;
  /** 페이월이 붙여 보낸 복귀 경로(내부 경로만) */
  returnTo?: string | null;
}): string {
  const base =
    input.billing !== "weekly" && input.authed ? "/subscription/billing" : "/subscription/checkout";
  const q = new URLSearchParams({ tier: input.tier, billing: input.billing });
  /* 외부 주소를 실어 보내면 결제 뒤 피싱 페이지로 튕길 수 있다 — 내부 경로만, "/" 는 의미 없어 뺀다 */
  const back = safeInternalPath(input.returnTo ?? "", "");
  if (back && back !== "/") q.set("returnTo", back);
  return `${base}?${q.toString()}`;
}
