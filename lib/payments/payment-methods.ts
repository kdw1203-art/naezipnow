/**
 * [990] 결제 수단 안내 — **순수 함수(서버 import 없음).**
 *
 * 왜 생겼나(2026-09 토스 도메인 변경 심사 반려): 심사 회신이
 * "변경 원하시는 홈페이지 내 **결제수단 신용/체크카드가 확인되지 않습니다**.
 *  결제창 연동 가능 여부 확인 부탁드립니다" 였다. 사이트 어디에도 취급 결제수단을
 * 글로 적어 둔 곳이 없었고(구독 페이지는 "토스페이먼츠 결제창에서 진행돼요" 한 줄이
 * 전부), 결제창 자체는 로그인·플랜 선택을 거쳐야만 보였다. 전자상거래법 고지와
 * 카드사 심사가 공통으로 요구하는 것은 **판매 페이지에서 결제수단을 확인할 수 있을
 * 것**이므로, 글(이 모듈)과 실물 결제창(체크아웃 미리보기) 둘 다 열어 둔다.
 *
 * 경계: 여기 목록은 **실제로 열려 있는 레일에서만** 나온다. 설정되지 않은 수단을
 * 적으면 그 순간 이 페이지가 거짓이 되고, 심사에서는 거짓이 미비보다 나쁘다.
 * 그래서 입력은 서버가 판정한 boolean 뿐이고, 문구는 여기 한 곳에만 있다.
 */

export type PaymentRailId = "toss-card" | "kakaopay" | "stripe-card";

export type PaymentRail = {
  id: PaymentRailId;
  /** 화면에 그대로 쓰는 이름 */
  name: string;
  /** 결제사(PG) — 영수증·카드 명세서에 찍히는 주체 */
  provider: string;
  /** 한 줄 설명 — 사실만 */
  detail: string;
};

export type PaymentRailFlags = {
  toss: boolean;
  kakaoPay: boolean;
  stripe: boolean;
};

/**
 * 열린 결제수단 목록. 순서는 "심사가 찾는 것부터" — 신용/체크카드가 항상 첫 줄이다.
 */
export function paymentRails(flags: PaymentRailFlags): PaymentRail[] {
  const rails: PaymentRail[] = [];
  if (flags.toss) {
    rails.push({
      id: "toss-card",
      name: "신용카드 · 체크카드",
      provider: "토스페이먼츠",
      detail:
        "국내 카드사 신용카드와 체크카드로 결제합니다. 결제창에서 카드번호를 입력하며, 카드 정보는 토스페이먼츠가 처리하고 내집나우 서버에 저장되지 않습니다.",
    });
  }
  if (flags.kakaoPay) {
    rails.push({
      id: "kakaopay",
      name: "카카오페이",
      provider: "카카오페이",
      detail: "카카오페이에 등록해 둔 카드·머니로 결제합니다.",
    });
  }
  if (flags.stripe) {
    rails.push({
      id: "stripe-card",
      name: "해외 발행 카드",
      provider: "Stripe",
      detail: "국내 카드사에서 발행하지 않은 카드는 Stripe 결제창으로 연결됩니다.",
    });
  }
  return rails;
}

/** 신용/체크카드가 열려 있는가 — 심사가 확인하는 단 한 줄. */
export function hasCardRail(flags: PaymentRailFlags): boolean {
  return flags.toss || flags.stripe;
}

/**
 * 결제수단을 **직접 눈으로 볼 수 있는** 경로. 로그인 없이 토스 결제위젯이 그려진다
 * ([968 · T1] 비로그인 미리보기). 심사 재신청 메모에 이 URL 을 그대로 적는다.
 */
export const REVIEW_CHECKOUT_PATH = "/subscription/checkout?tier=pro&billing=weekly";

/** 결제 수단 안내 페이지 경로 — 푸터·구독 페이지·심사 메모가 같은 값을 쓴다. */
export const PAYMENT_METHODS_PATH = "/subscription/payment-methods";
