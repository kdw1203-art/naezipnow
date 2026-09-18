/**
 * [992] 판매 카탈로그 — 지금 **실제로 파는** 유료 티어. 순수 상수(클라이언트 안전).
 *
 * 프로(EXPERT)를 판매 페이지에서 내렸다. 혜택(전문가 등록·리포트 판매 우선·상담 수신)의
 * 전제인 전문가 프로필이 0명, 리포트 판매 0건, 상담 0건이다(2026-09-12 실측). 팔리지
 * 않는 상품이 요금표 절반을 차지하면 사려는 사람의 비교 대상이 사라진다.
 * 코드·플랜 정의·게이팅(access.ts)은 그대로다 — 이미 프로인 계정은 그대로 프로이고,
 * 되살릴 때는 이 배열에 "expert" 를 넣는 것으로 끝난다.
 */
/* [1004] 프로(EXPERT)를 다시 올린다 — 소유자 지시(2026-09-18: "원래 3개였는데 두 개만 보인다").
   992 가 내린 이유는 **전문가 마켓 혜택**(전문가 등록·리포트 판매·상담)의 공급이 0이었기 때문이고,
   그 혜택 줄은 이미 그때 카드에서 지웠다. 지금 프로가 파는 것은 코드가 실제로 집행하는 한도다 —
   lib/subscriptions/access.ts 에서 expert 는 AI 분석·임장노트 정리·동네 요약·비교 트레이·CSV·
   관심단지가 전부 무제한(null)이다. 파는 것과 주는 것이 같으므로 다시 올려도 정직하다.
   덧붙여 토스 심사 회신에 적어 낸 상품은 셋(주간 1,100 · 플러스 2,900/27,600 · 프로 18,900/181,200)이라,
   화면에 둘만 있는 편이 오히려 제출본과 어긋났다(scripts/check-toss-review-freeze.mjs 가격 잠금 주석). */
export const SELLABLE_PAID_TIERS = ["pro", "expert"] as const satisfies readonly ("pro" | "expert")[];

export type SellablePaidTier = (typeof SELLABLE_PAID_TIERS)[number];

export function isTierOnSale(tier: string): boolean {
  return (SELLABLE_PAID_TIERS as readonly string[]).includes(tier);
}
