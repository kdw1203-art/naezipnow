/**
 * [1012 · 규칙 5] 요금제 카드 CTA 문구 — 순수 함수(단위검증: tests/unit/complex-1012.test.ts).
 *
 * 왜: 카드 CTA 가 "무료로 시작"·"플러스 시작하기"였다 — 디자인 시스템 v3 의 금지 문구(check-ai-look)이고,
 * 누르면 무슨 일이 일어나는지(얼마가 나가는지)도 말하지 않았다. 기준 사이트(당근·호갱노노)의 CTA 는
 * 전부 "동사 + 구체 대상"이다. 여기서는 **동사 + 상품명 + 실제 청구액**으로 만든다.
 *
 * 가격은 절대 여기서 적지 않는다 — 서버(page.tsx)가 lib/subscriptions/billing-periods 에서 읽어 넘긴
 * 값만 받는다(하드코딩 금지 · check-plan-labels). 상품명도 planLabel 단일 출처에서 온 이름을 받는다.
 * 연간은 오늘 나가는 돈(연 총액)을 적는다 — 월 환산가로 싸 보이게 하지 않는다(C48·966 과 같은 판단).
 */

export type PlanCtaBilling = "monthly" | "annual";

export type PlanCtaPricing = {
  /** 월간 청구액(원) */
  monthly: number;
  /** 연간 한 번에 청구되는 총액(원) */
  annualTotal: number;
};

const fmtWon = (n: number) => `${n.toLocaleString("ko-KR")}원`;

/**
 * 유료 카드: "플러스 결제하기(월 2,900원)" · 연간이면 "플러스 결제하기(연 27,600원)".
 * 무료 카드(pricing 없음): 로그인 상태면 "무료로 노트 쓰기", 게스트면 "가입하고 무료로 노트 쓰기".
 */
export function planCtaLabel(
  planName: string,
  billing: PlanCtaBilling,
  pricing: PlanCtaPricing | null,
  guest: boolean,
): string {
  if (pricing == null) return guest ? "가입하고 무료로 노트 쓰기" : "무료로 노트 쓰기";
  const amount = billing === "annual" ? `연 ${fmtWon(pricing.annualTotal)}` : `월 ${fmtWon(pricing.monthly)}`;
  return `${planName} 결제하기(${amount})`;
}
