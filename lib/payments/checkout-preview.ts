/**
 * [968 · T1] 비로그인 결제 미리보기 — **순수 함수(서버 import 없음, 클라이언트 안전).**
 *
 * 왜 생겼나(2026-09-06 토스 도메인 변경 심사 반려): 심사역은 계정 없이
 * https://naezipnow.com/subscription/checkout 을 열어 본다. 예전 화면은 세션이
 * 없으면 "로그인하기" 카드에서 멈춰 결제위젯을 한 번도 그리지 않았고, 토스는
 * "결제창과 연동이 안 되어 있다"고 판정했다. 위젯을 그리려면 금액이 필요한데
 * 서버 주문(/api/payments/toss/create)은 로그인 필수(401)다 — 그래서 **표시용
 * 금액**을 클라이언트에서 판매가 단일 출처(billing-periods)로 계산한다.
 *
 * 경계: 여기서 나온 금액은 화면·위젯 미리보기 전용이다. 실제 청구 금액은
 * 로그인 뒤 서버가 다시 계산해 주문에 저장하고(create), 승인 때 대조한다
 * (confirm-toss-order). 클라이언트 금액을 서버가 믿는 경로는 없다.
 */

import {
  BILLING_PERIOD_PRICES,
  WEEKLY_PASS,
  type PaymentBilling,
} from "@/lib/subscriptions/billing-periods";
import { safeInternalPath } from "@/lib/safe-path";

export type PreviewTier = "pro" | "expert";

/**
 * 미리보기 금액(원). 서버(toss/create)와 같은 규칙:
 *   weekly → 플러스 주간권(pro 전용) · monthly → 1개월 행 · annual → 12개월 행.
 * 팔지 않는 조합(expert 주간권, 표에 없는 기간)은 null — 없는 상품에 0원을
 * 그리지 않는다.
 */
export function previewAmount(tier: PreviewTier, billing: PaymentBilling): number | null {
  if (billing === "weekly") {
    return tier === WEEKLY_PASS.tier ? WEEKLY_PASS.totalKrw : null;
  }
  const rows = BILLING_PERIOD_PRICES[tier];
  const months = billing === "annual" ? 12 : 1;
  const row = rows?.find((r) => r.months === months);
  return row && Number.isInteger(row.totalKrw) && row.totalKrw > 0 ? row.totalKrw : null;
}

/** 요약 카드의 주기 표기 — CheckoutClient 와 PlanCheckoutButton 이 같은 말을 쓰게 */
export function previewBillingLabel(billing: PaymentBilling): string {
  return billing === "annual" ? "연간" : billing === "weekly" ? "주간권(7일 단건)" : "월간";
}

/**
 * 로그인 뒤 **이 체크아웃 화면으로 그대로** 돌아오는 로그인 링크.
 * path 는 내부 경로만(safeInternalPath — `//`·`/\` 오픈 리다이렉트 차단),
 * search 는 `?` 유무를 가리지 않고 받는다. 966 의 returnTo 는 search 안에
 * 이미 들어 있으므로 그대로 보존된다.
 */
export function checkoutLoginCallback(path: string, search: string): string {
  const p = safeInternalPath(path, "/subscription");
  const s = search ? (search.startsWith("?") ? search : `?${search}`) : "";
  return `/login?callbackUrl=${encodeURIComponent(`${p}${s === "?" ? "" : s}`)}`;
}
