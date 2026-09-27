/* [1012 · 규칙 8] font-extrabold(800) → font-bold(700) — 굵기 3단(400·500·700). 이 파일의 모든 자리에 적용. */
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

  /* [v4 · 한 화면 한 가지] 제목 + 사실 한 줄 → 주인공(카드 결제 가능 + 결제창 열기 하나) → 1px 선 목록 → 판매자 정보.
     지운 것: PageShell 브레드크럼(글자뿐 · 본문 줄과 어긋남) · "지금 결제 가능" 배지(→ 제목 글자) ·
     "결제창 직접 확인하기" 섹션(맨 위 카드와 같은 링크·같은 문장 — 같은 사실 한 번, 링크는 맨 위에 그대로) ·
     두 번째 채움 파랑. 고지 사실(수단·결제사·VAT·단건/정기·7일 청약철회·해지·판매자)은 전부 남긴다. */
  return (
    <PageShell>
      <div className="mx-auto flex w-full max-w-[760px] flex-col gap-8">
        <header className="flex flex-col gap-0.5">
          <h1 className="t-title text-ink">결제 수단 안내</h1>
          <p className="t-sub text-text-3">결제사 결제창에서 결제 · 카드번호 등 결제정보는 결제사가 처리 · 내집나우 서버 미저장</p>
        </header>

        {/* [1003] 결론을 맨 위로 — 심사역·구매자가 확인하려는 두 가지: "신용/체크카드를 쓸 수 있는가",
            "결제창을 지금 볼 수 있는가". 카드사 이름·무이자·혜택은 적지 않는다(확인되지 않은 것은 쓰지 않는다). */}
        <section aria-labelledby="card-rail-h" className="card flex flex-col gap-3 rounded-lg p-4">
          <h2 id="card-rail-h" className="t-section text-ink">
            신용카드 · 체크카드 {cardOpen ? "결제 가능" : "준비 중"}
          </h2>
          <p className="t-body text-text-2">
            국내 신용카드·체크카드를 토스페이먼츠 결제창(일반결제)에서 직접 입력해 결제합니다. 카드 정보는
            토스페이먼츠가 처리하며 내집나우 서버에 저장되지 않습니다.
          </p>
          {cardOpen && (
            <Link href={REVIEW_CHECKOUT_PATH} className="btn-primary btn-md inline-flex self-start no-underline">
              카드 결제창 열어 보기 →
            </Link>
          )}
          <p className="t-sub text-text-3">
            {cardOpen
              ? `로그인 없이 열림 · ${WEEKLY_PASS.label}(${WEEKLY_PASS.totalKrw.toLocaleString("ko-KR")}원) 주문서 · 결제 버튼을 누르기 전까지 청구 없음`
              : "결제수단이 열리면 이 자리에서 실제 결제창을 바로 열 수 있습니다."}
          </p>
        </section>

        {/* ── 1. 취급 결제수단 ── [v4 · 규칙 5] 카드 목록 → 1px 선 행 */}
        <section aria-labelledby="rails-h" className="flex flex-col">
          <h2 id="rails-h" className="t-section text-ink">
            취급 결제수단
          </h2>
          {rails.length === 0 ? (
            /* 결제 레일이 하나도 열려 있지 않은 상태를 "없음"이라고 정직하게 — 예시 수단을 그려 넣지 않는다 */
            <p className="mt-1 t-body text-text-2">현재 열려 있는 결제수단 없음 · 결제가 열리면 이 페이지에 표시</p>
          ) : (
            <ul data-tone="mint" className="mt-1 divide-y divide-line">
              {rails.map((rail) => (
                <li key={rail.id} className="flex flex-col gap-0.5 py-3">
                  <span className="flex items-baseline justify-between gap-3">
                    <span className="t-body font-bold text-ink">{rail.name}</span>
                    <span className="shrink-0 t-sub text-text-3">결제사 {rail.provider}</span>
                  </span>
                  <span className="t-sub text-text-2">{rail.detail}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* ── 2. 결제·환불 규정 ── */}
        <section aria-labelledby="refund-h" className="flex flex-col">
          <h2 id="refund-h" className="t-section text-ink">
            결제·환불
          </h2>
          <ul data-tone="sand" className="mt-1 divide-y divide-line t-body text-text-2">
            <li className="py-2.5">표시 금액은 모두 부가가치세(VAT)가 포함된 원화(KRW) 금액입니다.</li>
            <li className="py-2.5">
              {WEEKLY_PASS.label}({WEEKLY_PASS.days}일)은 자동 갱신되지 않는 1회 결제이고, 월간·연간 이용권은 카드를
              등록하는 정기결제입니다.
            </li>
            <li className="py-2.5">
              결제일로부터 7일 이내에 청약철회(환불)를 요청할 수 있습니다. 자세한 조건은{" "}
              {/* [990] 문장 속 링크 = WCAG 2.5.8(24px) — inline-block + 세로 패딩 */}
              <Link href="/legal/terms#refund" className="inline-block py-[5px] font-bold text-primary underline">
                이용약관 환불 규정
              </Link>
              을 확인해 주세요.
            </li>
            <li className="py-2.5">
              정기결제는{" "}
              <Link href="/subscription" className="inline-block py-[5px] font-bold text-primary underline">
                구독 관리
              </Link>
              에서 언제든 해지할 수 있고, 해지하면 다음 결제일부터 청구되지 않습니다.
            </li>
          </ul>
        </section>

        {/* ── 3. 판매자(사업자) 정보 ── [v4 · 규칙 5] 카드 → 1px 선 항목·값 행 */}
        <section aria-labelledby="seller-h" className="flex flex-col">
          <h2 id="seller-h" className="t-section text-ink">
            판매자 정보
          </h2>
          <p className="mt-1 t-sub text-text-2">{formatBusinessFooterPrimary(biz)}</p>
          <dl data-tone="hanji" className="mt-1 divide-y divide-line border-t border-line t-sub">
            {[
              ["주소", biz.address || "—"],
              ["통신판매업 신고번호", biz.mailOrderSalesNumber || "신고 진행 중"],
              ["대표전화", biz.phone || "—"],
              ["고객문의", biz.supportEmail || "—"],
            ].map(([k, v]) => (
              <div key={k} className="flex items-baseline justify-between gap-3 py-2">
                <dt className="shrink-0 text-text-3">{k}</dt>
                <dd className="min-w-0 break-words text-right text-text-1">{v}</dd>
              </div>
            ))}
          </dl>
          {!disclosureComplete && (
            /* 고지가 비면 결제 자체가 막혀 있다(lib/payments/checkout-guard) — 그 사실을 숨기지 않는다 */
            <p className="mt-2 t-sub font-bold text-warning">사업자 고지가 완료되기 전에는 결제를 시작할 수 없습니다.</p>
          )}
        </section>

        <Link href="/subscription" className="self-start py-[5px] t-sub font-bold text-primary no-underline">
          ← 구독 안내로 돌아가기
        </Link>
      </div>
    </PageShell>
  );
}
