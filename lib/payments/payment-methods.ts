/**
 * [990] 결제 수단 안내 — **순수 함수(서버 import 없음).**
 *
 * 왜 생겼나(2026-09 토스 도메인 변경 심사 반려): 심사 회신이
 * "변경 원하시는 홈페이지 내 **결제수단 신용/체크카드가 확인되지 않습니다**.
 *  결제창 연동 가능 여부 확인 부탁드립니다" 였다. 사이트 어디에도 취급 결제수단을
 * 글로 적어 둔 곳이 없었고, 결제창 자체는 로그인·플랜 선택을 거쳐야만 보였다.
 * 글(이 모듈)과 실물 결제창(체크아웃 미리보기) 둘 다 열어 둔다.
 *
 * [992] 레일이 토스 하나로 정리됐다(Stripe·카카오페이·토스페이·IAP 제거 — 승인 0건인 채
 * 웹훅·환불·컴플라이언스 표면만 넓히고 있었다). 목록은 여전히 **실제로 열려 있는 레일**
 * 에서만 나온다 — 설정되지 않은 수단을 적으면 이 페이지가 거짓이 된다.
 */

export type PaymentRailId = "toss-card" | "toss-transfer" | "toss-easypay";

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
  /** [1026g] 주문서형(결제위젯, gck) 키인가 — 이때 주간권(단건) 결제 화면은 상점관리자 "결제 UI"가 고른 수단을 함께 보여 준다. */
  widget?: boolean;
};

/* [1026g] 운영 결제 화면(결제 UI "naezipnow")에서 실제로 보인 수단 — 2026-10-01 운영 방문 확인
   (PC: 실시간 계좌이체 · 신용·체크카드 · 카카오페이 · 토스페이 · PAYCO · 삼성페이 / 아이폰: 삼성페이 없음).
   이 목록은 서버 설정이 아니라 토스 상점관리자 결제 UI 설정에서 정해진다 — 그쪽에서 수단을 빼거나 더하면 여기도 고친다.
   정기결제(월간·연간)는 카드 등록형(빌링)이라 위젯 수단과 무관하게 신용·체크카드뿐이다. */
export const WIDGET_OTHER_METHODS_LABEL = "실시간 계좌이체 · 간편결제";

/** 열린 결제수단 목록. 신용/체크카드가 첫 줄 — 심사가 찾는 것부터. */
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
    if (flags.widget) {
      rails.push(
        {
          id: "toss-transfer",
          name: "실시간 계좌이체",
          provider: "토스페이먼츠",
          detail:
            "주간권(단건) 결제 화면에서 고를 수 있습니다. 은행 계좌에서 바로 결제되며, 계좌 정보는 토스페이먼츠가 처리하고 내집나우 서버에 저장되지 않습니다.",
        },
        {
          id: "toss-easypay",
          name: "간편결제",
          provider: "토스페이먼츠",
          detail:
            "카카오페이 · 토스페이 · PAYCO 등 결제 화면에 표시되는 간편결제로 주간권(단건)을 결제할 수 있습니다. 월간·연간 정기결제는 카드를 등록하는 방식이라 신용카드 · 체크카드만 쓸 수 있습니다.",
        },
      );
    }
  }
  return rails;
}

/** 신용/체크카드가 열려 있는가 — 심사가 확인하는 단 한 줄. */
export function hasCardRail(flags: PaymentRailFlags): boolean {
  return flags.toss;
}

/**
 * 결제수단을 **직접 눈으로 볼 수 있는** 경로. 로그인 없이 토스 결제위젯이 그려진다
 * ([968 · T1] 비로그인 미리보기). 심사 재신청 메모에 이 URL 을 그대로 적는다.
 */
export const REVIEW_CHECKOUT_PATH = "/subscription/checkout?tier=pro&billing=weekly";

/** 결제 수단 안내 페이지 경로 — 푸터·구독 페이지·심사 메모가 같은 값을 쓴다. */
export const PAYMENT_METHODS_PATH = "/subscription/payment-methods";
