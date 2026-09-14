/**
 * [1000] 빌링 승인 응답에서 영수증·결제수단 정보를 꺼낸다 — 순수 함수.
 *
 * 왜: 자동결제(첫 결제·갱신)는 markPaid 에 receiptUrl 을 넘기지 않아 결제 내역의
 * "영수증" 칸이 늘 "영수증 요청" 이었다. 토스 승인 응답(Payment 객체)에는
 * receipt.url · card.company · card.number · method · approvedAt 이 함께 온다
 * (코어 API 문서). 없는 값은 null — 지어내지 않는다.
 */

export type ChargeReceiptInfo = {
  receiptUrl: string | null;
  /** payments.method 에 적는 표기 — 결제 완료 화면(METHOD_LABEL)이 아는 값을 유지한다 */
  method: string;
  cardCompany: string | null;
  cardNumberMasked: string | null;
  approvedAt: string | null;
};

export const BILLING_METHOD_LABEL = "카드(자동결제)";

export function chargeReceiptInfo(
  data:
    | {
        receipt?: { url?: unknown } | null;
        card?: { company?: unknown; number?: unknown } | null;
        method?: unknown;
        approvedAt?: unknown;
      }
    | null
    | undefined,
): ChargeReceiptInfo {
  const str = (v: unknown): string | null => {
    if (typeof v !== "string") return null;
    const s = v.trim();
    return s ? s : null;
  };
  const receiptUrl = str(data?.receipt?.url);
  /* 영수증은 https 링크만 — 응답에 이상한 값이 와도 화면에 링크로 박히지 않게 */
  const safeReceipt = receiptUrl && /^https:\/\//i.test(receiptUrl) ? receiptUrl : null;
  const method = str(data?.method);
  return {
    receiptUrl: safeReceipt,
    method: !method || method === "카드" ? BILLING_METHOD_LABEL : `${method}(자동결제)`,
    cardCompany: str(data?.card?.company),
    cardNumberMasked: str(data?.card?.number),
    approvedAt: str(data?.approvedAt),
  };
}
