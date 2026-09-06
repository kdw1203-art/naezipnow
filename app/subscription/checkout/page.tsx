import type { Metadata } from "next";
import { PageShell } from "@/app/components/PageShell";
import { CheckoutClient } from "./CheckoutClient";
import { ComplianceNotice } from "@/app/components/ComplianceNotice";
import { isTossBillingEnabled } from "@/lib/payments/toss-billing";

export const metadata: Metadata = {
  title: "결제하기 | 내집나우",
  // 개인 주문 화면 — 색인 대상이 아니다
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * 토스페이먼츠 결제위젯(주문서형) 체크아웃 — 고도화·토스 심사 대응.
 *
 * 결제창 직행 대신 위젯을 쓰는 이유(docs.tosspayments.com/guides/v2/payment-widget/admin):
 * 최초 1회 연동 후에는 **상점관리자 어드민에서 코드 수정 없이** 결제수단
 * 추가·UI 변경·프로모션 노출을 관리할 수 있다. variantKey 미지정 시 기본 UI.
 *
 * 파라미터·주문 생성·승인은 전부 기존 서버 경로를 그대로 쓴다:
 *   /api/payments/toss/create → 위젯 requestPayment → /payment/success → confirm
 */
export default function CheckoutPage() {
  return (
    <PageShell breadcrumb="구독 · 결제" title="결제하기">
      <CheckoutClient />
      {/* 수익 문구 미기재 방침 + 제공기간·환불 요약 — 결제 직전 화면에도 고지.
          [968 · T3] recurringOpen 을 /subscription(page.tsx) 과 같은 서버 판정으로
          내려준다 — 빌링이 열린 뒤에도 이 화면만 "모든 이용권은 1회성 단건" 이라
          적혀 있어, 구독 안내와 결제 화면의 법적 고지가 서로 달랐다(심사역이 두
          화면을 나란히 보면 어느 쪽이 사실인지 알 수 없다). */}
      <div className="mt-4">
        <ComplianceNotice variant="payment" recurringOpen={isTossBillingEnabled()} />
      </div>
    </PageShell>
  );
}
