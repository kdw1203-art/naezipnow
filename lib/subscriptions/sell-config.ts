/**
 * [992] 판매 카탈로그 — 지금 **실제로 파는** 유료 티어. 순수 상수(클라이언트 안전).
 *
 * 프로(EXPERT)를 판매 페이지에서 내렸다. 혜택(전문가 등록·리포트 판매 우선·상담 수신)의
 * 전제인 전문가 프로필이 0명, 리포트 판매 0건, 상담 0건이다(2026-09-12 실측). 팔리지
 * 않는 상품이 요금표 절반을 차지하면 사려는 사람의 비교 대상이 사라진다.
 * 코드·플랜 정의·게이팅(access.ts)은 그대로다 — 이미 프로인 계정은 그대로 프로이고,
 * 되살릴 때는 이 배열에 "expert" 를 넣는 것으로 끝난다.
 */
export const SELLABLE_PAID_TIERS = ["pro"] as const satisfies readonly ("pro" | "expert")[];

export type SellablePaidTier = (typeof SELLABLE_PAID_TIERS)[number];

export function isTierOnSale(tier: string): boolean {
  return (SELLABLE_PAID_TIERS as readonly string[]).includes(tier);
}
