import type { Metadata } from "next";
import Link from "next/link";
import { PageShell } from "@/app/components/PageShell";
import { seoAlternates } from "@/lib/seo/alternates";
import { isTossPaymentsConfigured } from "@/lib/payments/toss-config";
import {
  hasCardRail,
  paymentRails,
  REVIEW_CHECKOUT_PATH,
  type PaymentRailFlags,
} from "@/lib/payments/payment-methods";
import {
  formatBusinessFooterPrimary,
  getBusinessInfo,
  isBusinessDisclosureComplete,
} from "@/lib/brand/business-info";
import { WEEKLY_PASS } from "@/lib/subscriptions/billing-periods";

/* [990] 결제 수단 안내 — 로그인 없이 열리는 한 장짜리 고지.

   왜 생겼나: 2026-09 토스페이먼츠 도메인 변경 심사가
   "변경 원하시는 홈페이지 내 결제수단 신용/체크카드가 확인되지 않습니다.
    결제창 연동 가능 여부 확인 부탁드립니다" 로 반려됐다.
   사이트에는 결제수단을 글로 적어 둔 자리가 없었고(구독 페이지의
   "토스페이먼츠 결제창에서 진행돼요" 한 줄이 전부), 결제창은 플랜 선택 +
   로그인을 거쳐야 보였다. 심사역·이용자 모두에게 필요한 것은 같다:
   **무엇으로 결제하는지 글로 읽고, 실제 결제창을 눌러 확인할 수 있을 것.**

   사실 우선: 수단 목록은 서버 설정에서 파생한다(paymentRails). 설정되지 않은
   수단은 여기 나타나지 않는다 — 고지 페이지가 거짓이 되면 미비보다 나쁘다. */

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "결제 수단 안내 | 내집나우",
  description:
    "내집나우 이용권 결제에 사용할 수 있는 결제수단(신용카드·체크카드 등)과 결제사, 청약철회·환불 규정, 사업자 정보를 안내합니다.",
  alternates: seoAlternates("/subscription/payment-methods"),
};

export default function PaymentMethodsPage() {
  /* [992] 레일은 토스 하나 — 목록도 그 사실에서 파생된다 */
  const flags: PaymentRailFlags = { toss: isTossPaymentsConfigured() };
  const rails = paymentRails(flags);
  const cardOpen = hasCardRail(flags);
  const biz = getBusinessInfo();
  const disclosureComplete = isBusinessDisclosureComplete(biz);

  return (
    <PageShell breadcrumb="결제 수단 안내">
      <div className="mx-auto w-full max-w-[760px]">
        <h1 className="rise-in text-[24px] font-extrabold leading-[1.3] text-ink">
          결제 수단 안내
        </h1>
        <p className="rise-in-1 mt-2 t-body leading-[1.75] text-text-2">
          내집나우 이용권은 아래 결제수단으로 구매할 수 있습니다. 결제는 각 결제사의
          결제창에서 이루어지며, 카드번호 등 결제정보는 결제사가 처리하고 내집나우
          서버에는 저장되지 않습니다.
        </p>

        {/* [1003] 결론을 맨 위로 — 이 페이지에 오는 사람(심사역·구매자)이 확인하려는 것은
            딱 두 가지다: "신용/체크카드를 쓸 수 있는가", "결제창을 지금 볼 수 있는가".
            예전에는 둘 다 스크롤 두 화면 아래(취급 결제수단 → 결제창 직접 확인)에 있었다.
            2026-09-16 심사 세션은 /subscription 에 13.5초 머문 뒤 결제창에 닿지 못했다.
            카드사 이름·무이자·혜택은 적지 않는다 — 토스페이먼츠 일반결제(카드)로 실제
            결제되는 범위만 적고, 확인되지 않은 것은 쓰지 않는다. */}
        <div className="rise-in-2 card mt-5 flex flex-col gap-3 rounded-2xl px-5 py-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-md bg-primary-soft chip-pad t-caption font-extrabold text-primary">
              {cardOpen ? "지금 결제 가능" : "준비 중"}
            </span>
            <span className="t-section font-extrabold text-ink">
              신용카드 · 체크카드로 결제할 수 있습니다
            </span>
          </div>
          <p className="t-body leading-[1.75] text-text-2">
            국내 신용카드·체크카드를 토스페이먼츠 결제창(일반결제)에서 직접 입력해
            결제합니다. 카드 정보는 토스페이먼츠가 처리하며 내집나우 서버에 저장되지
            않습니다.
          </p>
          {cardOpen && (
            <Link
              href={REVIEW_CHECKOUT_PATH}
              className="btn-primary btn-md inline-flex self-start no-underline"
            >
              지금 카드 결제창 열어보기 →
            </Link>
          )}
          <p className="t-sub leading-[1.7] text-text-3">
            {cardOpen
              ? `로그인 없이 열립니다 · ${WEEKLY_PASS.label}(${WEEKLY_PASS.totalKrw.toLocaleString("ko-KR")}원) 주문서이며 결제 버튼을 누르기 전까지 어떤 금액도 청구되지 않습니다.`
              : "결제수단이 열리면 이 자리에서 실제 결제창을 바로 열 수 있습니다."}
          </p>
        </div>

        {/* ── 1. 취급 결제수단 ─────────────────────────────── */}
        <h2 className="mt-7 t-section font-extrabold text-ink">취급 결제수단</h2>
        {rails.length === 0 ? (
          /* 결제 레일이 하나도 열려 있지 않은 상태를 "없음"이라고 정직하게 적는다 —
             빈 목록 자리에 예시 수단을 그려 넣으면 그 순간 고지가 거짓이 된다. */
          <p className="mt-2 t-body text-text-2">
            현재 열려 있는 결제수단이 없습니다. 결제가 열리면 이 페이지에 표시됩니다.
          </p>
        ) : (
          <ul className="mt-3 flex flex-col gap-2.5">
            {rails.map((rail) => (
              <li key={rail.id} className="card rounded-2xl px-4 py-3.5">
                <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1">
                  <span className="t-body font-bold text-ink">{rail.name}</span>
                  <span className="t-sub text-text-3">결제사: {rail.provider}</span>
                </div>
                <p className="mt-1 t-sub leading-[1.7] text-text-2">{rail.detail}</p>
              </li>
            ))}
          </ul>
        )}

        {/* ── 2. 결제창 직접 확인 ───────────────────────────── */}
        <h2 className="mt-7 t-section font-extrabold text-ink">결제창 직접 확인하기</h2>
        <p className="mt-2 t-body leading-[1.75] text-text-2">
          {cardOpen
            ? `로그인하지 않아도 실제 결제창을 열어 결제수단을 확인할 수 있습니다. 아래 링크는 ${WEEKLY_PASS.label}(${WEEKLY_PASS.totalKrw.toLocaleString("ko-KR")}원) 주문서이며, 결제 버튼을 누르기 전까지 어떤 금액도 청구되지 않습니다.`
            : "결제수단이 열리면 이 자리에서 실제 결제창을 확인할 수 있습니다."}
        </p>
        {cardOpen && (
          <Link
            href={REVIEW_CHECKOUT_PATH}
            className="btn-primary btn-md mt-3 inline-flex no-underline"
          >
            결제창 열어 보기
          </Link>
        )}

        {/* ── 3. 결제·환불 규정 ─────────────────────────────── */}
        <h2 className="mt-7 t-section font-extrabold text-ink">결제·환불</h2>
        <ul className="mt-2 flex list-disc flex-col gap-1.5 pl-5 t-body leading-[1.75] text-text-2">
          <li>표시 금액은 모두 부가가치세(VAT)가 포함된 원화(KRW) 금액입니다.</li>
          <li>
            {WEEKLY_PASS.label}({WEEKLY_PASS.days}일)은 자동 갱신되지 않는 1회 결제이고,
            월간·연간 이용권은 카드를 등록하는 정기결제입니다.
          </li>
          <li>
            결제일로부터 7일 이내에 청약철회(환불)를 요청할 수 있습니다. 자세한 조건은{" "}
            {/* [990] 문장 속 링크 = WCAG 2.5.8(24px). inline-block + 세로 패딩으로
                글자줄만 키운다 — 44px 히트를 겹치면 위아래 줄의 탭을 훔친다. */}
            <Link
              href="/legal/terms#refund"
              className="inline-block py-[5px] font-bold text-primary underline"
            >
              이용약관 환불 규정
            </Link>
            을 확인해 주세요.
          </li>
          <li>
            정기결제는{" "}
            <Link
              href="/subscription"
              className="inline-block py-[5px] font-bold text-primary underline"
            >
              구독 관리
            </Link>
            에서 언제든 해지할 수 있고, 해지하면 다음 결제일부터 청구되지 않습니다.
          </li>
        </ul>

        {/* ── 4. 판매자(사업자) 정보 ────────────────────────── */}
        <h2 className="mt-7 t-section font-extrabold text-ink">판매자 정보</h2>
        <div className="card mt-2 flex flex-col gap-1 rounded-2xl px-4 py-3.5 t-sub leading-[1.8] text-text-2">
          <span>{formatBusinessFooterPrimary(biz)}</span>
          <span>주소: {biz.address || "—"}</span>
          <span>
            통신판매업 신고번호: {biz.mailOrderSalesNumber || "신고 진행 중"} · 대표전화:{" "}
            {biz.phone || "—"}
          </span>
          <span>고객문의: {biz.supportEmail || "—"}</span>
          {!disclosureComplete && (
            /* 고지가 비면 결제 자체가 막혀 있다(lib/payments/checkout-guard) —
               그 사실을 숨기지 않는다. */
            <span className="font-bold text-warning">
              사업자 고지가 완료되기 전에는 결제를 시작할 수 없습니다.
            </span>
          )}
        </div>

        <p className="mt-6 t-sub text-text-3">
          <Link href="/subscription" className="font-bold text-primary no-underline">
            ← 구독 안내로 돌아가기
          </Link>
        </p>
      </div>
    </PageShell>
  );
}
