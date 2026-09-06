"use client";

import { useEffect, useRef, useState } from "react";
import { planLabel } from "@/lib/subscriptions/labels";
import {
  accessEndsAtMs,
  billingDurationLabel,
  type PaymentBilling,
} from "@/lib/subscriptions/billing-periods";
import Link from "next/link";
import { safeInternalPath } from "@/lib/safe-path";
import { SkLine } from "@/app/components/ui/Skeleton";
import {
  checkoutLoginCallback,
  previewAmount,
  previewBillingLabel,
} from "@/lib/payments/checkout-preview";
import {
  isTossTestEnv,
  isWidgetKey,
  loadTossSdk,
  tossClientKey,
  type TossWidgets,
} from "../toss-rail";

/* ============================================================
   결제위젯 주문서형 클라이언트.

   흐름 (docs.tosspayments.com/guides/v2/get-started/payment-flow):
     1) URL ?tier=&billing= 검증 → 서버 주문 생성(/api/payments/toss/create —
        금액은 서버가 계산·저장, 로그인 필수 401)
     2) SDK widgets() → setAmount → renderPaymentMethods + renderAgreement
     3) 결제하기 → requestPayment → successUrl 리다이렉트(paymentKey·orderId·amount)
     4) /payment/success 가 서버 confirm(금액 대조·멱등키) 호출

   세금(세금 처리 문서): 구독은 전부 과세 상품이므로 taxFreeAmount 를 보내지
   않는다 — 과세 상점은 면세 금액이 항상 0 이라 파라미터 설정이 필요 없다.
   면세·복합 과세 상품을 팔게 되면 requestPayment 에 taxFreeAmount 를 추가할 것.

   사실 우선:
   - 테스트 키(test_ck_)면 "실제 청구 없음"을 화면에 명시한다.
   - 위젯 렌더 실패는 실패라고 말하고(구독 페이지로 되돌아가는 길 제공),
     빈 화면으로 결제가 되는 척하지 않는다.

   [968 · T1] 비로그인 미리보기(preview):
   - 토스 도메인 변경 심사(2026-09-06)가 "결제창과 연동이 안 되어 있다"로 반려됐다.
     심사역은 계정 없이 이 URL 을 여는데, 세션이 없으면 "로그인하기" 카드에서
     멈춰 위젯을 한 번도 그리지 않았기 때문이다. 이제 세션이 없거나 create 가
     401 이면 판매가 단일 출처(billing-periods)로 **표시용 금액**을 계산해 로그인
     경로와 똑같이 위젯을 그린다(ANONYMOUS customerKey). 서버 주문은 만들지
     않는다 — 결제 버튼 자리는 "로그인하고 결제하기"(callbackUrl = 이 화면)이고,
     로그인 뒤 돌아오면 기존 흐름(세션 → 주문 → 위젯 → 결제)이 그대로 돈다.
   ============================================================ */

type Phase =
  | { kind: "loading"; msg: string }
  | { kind: "ready"; orderId: string; amount: number }
  /* API 개별 연동 키(ck)용 결제창형 — 위젯 없이 버튼 한 번으로 카드 결제창을
     연다. API 키 문서: widgets() 는 위젯 연동 키(gck) 전용이라 ck 키로 부르면
     INVALID_CLIENT_KEY 가 난다. 키 종류에 맞는 흐름을 자동으로 고른다. */
  | { kind: "window-ready"; orderId: string; amount: number }
  /* [968 · T1] 비로그인 미리보기 — amount 는 표시용(서버가 다시 계산한다).
       widget: shown = gck 키로 위젯을 그렸다 · none = ck 키(주문 없이는 결제창을
       열 수 없어 요약·안내·로그인 버튼만) · failed = gck 인데 SDK/렌더 실패. */
  | {
      kind: "preview";
      amount: number;
      widget: "shown" | "none" | "failed";
      loginHref: string;
    }
  | { kind: "error"; msg: string };

/* 플랜명은 단일 출처 — lib/subscriptions/labels.planLabel (게이트: check:plan-labels) */

function parseParams(): {
  tier: "pro" | "expert";
  billing: "weekly" | "monthly" | "annual";
  /** [966] 결제 뒤 돌아갈 내부 경로 — 페이월에서 넘어온 경우 */
  returnTo: string | null;
} | null {
  try {
    const sp = new URLSearchParams(window.location.search);
    const tier = sp.get("tier");
    const rawBilling = sp.get("billing");
    const billing =
      rawBilling === "annual" ? "annual" : rawBilling === "weekly" ? "weekly" : "monthly";
    if (tier !== "pro" && tier !== "expert") return null;
    /* 주간권은 플러스 전용 — 서버(toss/create)도 거절하지만 여기서 먼저 막는다 */
    if (billing === "weekly" && tier !== "pro") return null;
    const rt = safeInternalPath(sp.get("returnTo"), "");
    return { tier, billing, returnTo: rt && rt !== "/" ? rt : null };
  } catch {
    return null;
  }
}

/* ============================================================
   [C42] 결제 전 요약 — 무엇을, 얼마에, 언제까지.

   이 화면은 **주간권(단건) 전용**이다 — 월간·연간은 위 useEffect 가
   /subscription/billing(카드 등록형 정기결제)으로 보낸다.

   예전 화면에는 "플러스 플랜 · 주간 결제" 와 "1,100원 결제하기" 버튼뿐이었고,
   위젯형(gck)에는 요약 카드조차 없었다. 빠져 있던 사실은 두 가지다:
   **언제까지 쓰는지**(applyPlanToUserByEmail durationDays=7, 이후
   plan-expiry-sweep 이 무료로 되돌린다)와 **자동 갱신이 없다는 것**.
   결제 버튼 위는 그 둘을 말할 마지막 자리다.
   ============================================================ */
function CheckoutSummary({
  planName,
  billing,
  billingLabel,
  amount,
  orderId,
}: {
  planName: string;
  billing: PaymentBilling;
  billingLabel: string;
  amount: number;
  orderId: string;
}) {
  /* 종료일은 렌더 시점 기준이다. 사용자가 이 화면을 오래 열어 두면 실제
     승인 시각과 하루 어긋날 수 있어 "결제 시각 기준"이라고 밝혀 둔다. */
  const endsAt = new Date(accessEndsAtMs(billing, Date.now()));
  const endsLabel = endsAt.toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="card flex flex-col gap-2 rounded-2xl px-4 py-5">
      <div className="flex items-center justify-between t-body">
        <span className="text-text-3">플랜</span>
        <span className="font-bold text-ink">
          {planName} · {billingLabel}
        </span>
      </div>
      <div className="flex items-center justify-between t-body">
        <span className="text-text-3">이용 기간</span>
        <span className="font-bold text-ink">
          {billingDurationLabel(billing)} · {endsLabel}까지
        </span>
      </div>
      <div className="flex items-center justify-between border-t border-divider pt-2 t-body">
        <span className="text-text-3">결제 금액</span>
        <span className="t-section font-extrabold text-ink">
          {amount.toLocaleString("ko-KR")}원
          {/* [966] 부가세는 /subscription 맨 아래 잔글씨에만 있었다 — 결제 직전 금액 옆에 */}
          <span className="ml-1 t-caption font-bold text-text-3">VAT 포함</span>
        </span>
      </div>
      <div className="mt-1 flex flex-col gap-1 rounded-xl bg-bg px-3 py-2.5 t-sub text-text-2">
        <span>
          <span className="font-bold text-ink">자동 갱신되지 않는 1회 결제예요.</span>{" "}
          기간이 끝나면 추가 청구 없이 무료 플랜으로 돌아갑니다.
        </span>
        <span>
          계속 쓰실 생각이면{" "}
          <Link href="/subscription" className="font-bold text-primary underline">
            월간·연간 정기결제
          </Link>
          가 하루 기준으로 더 저렴해요 — 그건 카드 등록형이라 해지 전까지 자동
          갱신됩니다.
        </span>
        <span>
          결제 7일 이내 청약철회(환불) 가능 ·{" "}
          <Link href="/legal/terms#refund" className="font-bold text-primary underline">
            환불 규정
          </Link>
        </span>
      </div>
      <p className="t-sub text-text-3">주문번호 {orderId}</p>
    </div>
  );
}

/* ============================================================
   [968 · T4] 자리 예약(제안 33) — 위젯이 마운트되는 순간 아래 요소가 튀지 않게.

   예전에는 #toss-payment-methods / #toss-agreement 가 빈 div 였다. 로딩 카드가
   사라지고 요약 카드·위젯(400px 남짓)·버튼이 한 번에 나타나면서 화면이 통째로
   내려앉았다 — 결제 직전 화면에서 가장 나쁜 순간에 생기는 점프다.
   요약 카드는 최종 카드와 같은 5줄 모양으로, 위젯 자리는 min-h 로 먼저 잡고
   로딩 문구는 그 자리 **안**에서 보여 준다. 스켈레톤은 기존 .sk(전역 CSS)만
   쓰고, 감속 모션에서는 반짝임을 끈다(motion-reduce).
   ============================================================ */
function CheckoutSummarySkeleton() {
  return (
    <div aria-hidden className="card flex flex-col gap-2 rounded-2xl px-4 py-5">
      <div className="flex items-center justify-between">
        <SkLine w="18%" h={12} className="motion-reduce:animate-none" />
        <SkLine w="42%" h={12} className="motion-reduce:animate-none" />
      </div>
      <div className="flex items-center justify-between">
        <SkLine w="22%" h={12} className="motion-reduce:animate-none" />
        <SkLine w="48%" h={12} className="motion-reduce:animate-none" />
      </div>
      <div className="flex items-center justify-between border-t border-divider pt-2">
        <SkLine w="20%" h={12} className="motion-reduce:animate-none" />
        <SkLine w="36%" h={20} className="motion-reduce:animate-none" />
      </div>
      <div className="mt-1 flex flex-col gap-1.5 rounded-xl bg-bg px-3 py-2.5">
        <SkLine w="92%" h={10} className="motion-reduce:animate-none" />
        <SkLine w="84%" h={10} className="motion-reduce:animate-none" />
        <SkLine w="60%" h={10} className="motion-reduce:animate-none" />
      </div>
      <SkLine w="40%" h={10} className="motion-reduce:animate-none" />
    </div>
  );
}

/** 위젯 자리 위에 겹쳐 두는 로딩 오버레이 — 형제 요소로 둔다(SDK 컨테이너의 자식을
 *  SDK 가 어떻게 다루는지 보장이 없어, 컨테이너 안에는 아무것도 넣지 않는다). */
function WidgetSkeletonOverlay({ msg }: { msg: string }) {
  return (
    <div
      role="status"
      className="absolute inset-0 flex flex-col gap-3 rounded-2xl border border-line bg-surface px-4 py-5"
    >
      <p className="t-body text-text-3">{msg}</p>
      <div aria-hidden className="flex flex-col gap-3">
        <SkLine w="34%" h={14} className="motion-reduce:animate-none" />
        <div className="grid grid-cols-2 gap-2">
          <SkLine w="100%" h={52} className="motion-reduce:animate-none" />
          <SkLine w="100%" h={52} className="motion-reduce:animate-none" />
          <SkLine w="100%" h={52} className="motion-reduce:animate-none" />
          <SkLine w="100%" h={52} className="motion-reduce:animate-none" />
        </div>
        <SkLine w="28%" h={14} className="mt-1 motion-reduce:animate-none" />
        <SkLine w="100%" h={44} className="motion-reduce:animate-none" />
        <SkLine w="100%" h={44} className="motion-reduce:animate-none" />
      </div>
    </div>
  );
}

/* [968 · T1] 비로그인 안내 — 위젯 위, 요약 카드 바로 아래. 무엇이 필요한지와
   로그인 뒤 어디로 돌아오는지를 한 카드에서 말한다. */
function GuestNotice({ widget }: { widget: "shown" | "none" | "failed" }) {
  return (
    <div role="status" className="card flex flex-col gap-1 rounded-2xl px-4 py-3.5">
      <p className="t-body font-bold text-ink">결제하려면 로그인이 필요해요</p>
      <p className="t-sub text-text-2">
        로그인하면 이 화면으로 돌아와 그대로 결제할 수 있어요. 주문번호는 로그인 뒤
        발급돼요.
      </p>
      {widget === "none" && (
        /* ck(결제창형) 키는 주문번호가 있어야 결제창을 열 수 있다 — 주문은 로그인
           뒤 서버가 만들므로 게스트에게는 요약·안내·로그인 버튼까지만 보여 준다. */
        <p className="t-sub text-text-3">카드 결제창은 로그인해서 주문이 만들어진 뒤 열려요.</p>
      )}
      {widget === "failed" && (
        <p role="alert" className="t-sub font-bold text-danger">
          결제 수단 화면을 불러오지 못했어요. 로그인한 뒤 다시 시도해 주세요.
        </p>
      )}
    </div>
  );
}

export function CheckoutClient() {
  const [phase, setPhase] = useState<Phase>({ kind: "loading", msg: "주문 준비 중…" });
  const [params, setParams] = useState<ReturnType<typeof parseParams>>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [paying, setPaying] = useState(false);
  const widgetsRef = useRef<TossWidgets | null>(null);
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return; // StrictMode 이중 실행 방지
    startedRef.current = true;

    const p = parseParams();
    if (!p) {
      setPhase({ kind: "error", msg: "결제할 플랜 정보가 없어요. 구독 페이지에서 다시 시작해 주세요." });
      return;
    }
    /* [토스 심사 보완 2026-08-24] 이 페이지(단건 결제창)는 주간권 전용이다.
       정기(월간·연간)가 딥링크·북마크로 들어오면 빌링 카드 등록창으로 보낸다 —
       버튼(PlanCheckoutButton)만 고치면 옛 링크로 재발한다. */
    if (p.billing !== "weekly") {
      window.location.replace(`/subscription/billing?tier=${p.tier}&billing=${p.billing}`);
      return;
    }
    setParams(p);

    if (!tossClientKey()) {
      setPhase({
        kind: "error",
        msg: "결제 서비스가 아직 준비되지 않았어요. 잠시 후 다시 시도해 주세요.",
      });
      return;
    }

    /* 위젯 렌더 — 로그인 경로와 [968 · T1] 게스트 미리보기가 **같은 코드**를 쓴다.
       심사역이 보는 화면과 실제 결제 화면이 다르면 미리보기가 거짓이 된다. */
    async function renderWidgets(amount: number): Promise<TossWidgets> {
      const TossPayments = await loadTossSdk();
      const widgets = TossPayments(tossClientKey() as string).widgets({
        /* 개인정보(이메일)를 토스 대시보드 식별자로 남기지 않는다 —
           일회성 결제라 비회원 상수로 충분하다(빌링 전환 시 서버 발급 키로). */
        customerKey: TossPayments.ANONYMOUS,
      });
      await widgets.setAmount({ currency: "KRW", value: amount });
      /* 결제위젯 소개서(소유자 전달본 2026-08-14) 반영: 상점관리자 어드민에서
         만든 결제 UI(프로모션 배지·특정 카드사 강조·무이자 안내·A/B 등)는
         variantKey 로 지정한다. 계약 후 어드민에서 UI 를 만들면 Vercel 에
         NEXT_PUBLIC_TOSS_WIDGET_VARIANT_KEY 만 넣으면 된다 — 코드 수정 없이
         운영(소개서의 "유지보수 5분" 경로). 미설정이면 기본 UI. */
      const variantKey = process.env.NEXT_PUBLIC_TOSS_WIDGET_VARIANT_KEY?.trim();
      await Promise.all([
        widgets.renderPaymentMethods({
          selector: "#toss-payment-methods",
          ...(variantKey ? { variantKey } : {}),
        }),
        widgets.renderAgreement({ selector: "#toss-agreement" }),
      ]);
      return widgets;
    }

    /* [968 · T1] 게스트 미리보기 — 서버 주문 없이 표시용 금액으로 위젯만 그린다.
       widgetsRef 는 채우지 않는다: 주문번호 없는 requestPayment 경로를 아예 만들지
       않기 위해서다(pay() 는 phase.kind === "ready" 에서만 돈다). */
    async function startGuestPreview(q: NonNullable<ReturnType<typeof parseParams>>) {
      const amount = previewAmount(q.tier, q.billing);
      const loginHref = checkoutLoginCallback(window.location.pathname, window.location.search);
      if (amount === null) {
        setPhase({ kind: "error", msg: "결제할 수 있는 상품이 아니에요. 구독 페이지에서 다시 골라 주세요." });
        return;
      }
      if (!isWidgetKey()) {
        /* ck(결제창형) 키: payment().requestPayment 는 orderId 가 필수라 주문 없이는
           결제창을 열 수 없다 — 요약·안내·로그인 버튼만 보여 준다. */
        setPhase({ kind: "preview", amount, widget: "none", loginHref });
        return;
      }
      setPhase({ kind: "loading", msg: "결제 수단 불러오는 중…" });
      try {
        await renderWidgets(amount);
        setPhase({ kind: "preview", amount, widget: "shown", loginHref });
      } catch {
        /* 실패를 숨기지 않는다 — 안내 카드가 "불러오지 못했어요"를 말한다. */
        setPhase({ kind: "preview", amount, widget: "failed", loginHref });
      }
    }

    void (async () => {
      // 1) 로그인 확인 — [968 · T1] 세션이 없으면 로그인 카드 대신 미리보기
      let sessionEmail: string | null = null;
      try {
        const res = await fetch("/api/auth/session", { cache: "no-store" });
        const j = (await res.json().catch(() => null)) as
          | { user?: { email?: string | null } }
          | null;
        sessionEmail = j?.user?.email ?? null;
      } catch {
        sessionEmail = null;
      }
      if (!sessionEmail) {
        await startGuestPreview(p);
        return;
      }
      setEmail(sessionEmail);

      // 2) 서버 주문 생성 (금액은 서버 계산 — 클라이언트 금액을 믿지 않는다)
      setPhase({ kind: "loading", msg: "주문 생성 중…" });
      let orderId: string;
      let amount: number;
      try {
        const res = await fetch("/api/payments/toss/create", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tier: p.tier,
            billing: p.billing,
            source: "subscription",
            campaign: "widget-checkout",
            ...(p.returnTo ? { returnTo: p.returnTo } : {}),
          }),
        });
        const j = (await res.json().catch(() => ({}))) as {
          orderId?: string;
          amount?: number;
          error?: string;
        };
        if (res.status === 401) {
          /* 세션 응답과 서버 판정이 어긋난 경우(만료 직후 등) — 같은 미리보기로 */
          await startGuestPreview(p);
          return;
        }
        if (!res.ok || !j.orderId || !Number.isFinite(j.amount)) {
          setPhase({
            kind: "error",
            msg: j.error ?? "주문을 생성하지 못했어요. 잠시 후 다시 시도해 주세요.",
          });
          return;
        }
        orderId = j.orderId;
        amount = Number(j.amount);
      } catch {
        setPhase({ kind: "error", msg: "네트워크 오류로 주문을 생성하지 못했어요." });
        return;
      }

      // 3) 키 종류 분기 — ck(API 개별 연동 키)면 위젯을 그릴 수 없다(gck 전용).
      //    결제창형(payment().requestPayment)으로 바로 간다.
      if (!isWidgetKey()) {
        setPhase({ kind: "window-ready", orderId, amount });
        /* SDK 를 지금 미리 로드해 둔다(사파리 팝업 차단 대책 — 실측 2026-08-04).
           버튼 탭 후에 SDK 를 네트워크에서 받기 시작하면, 받는 동안 사용자
           제스처 맥락이 끊겨 iOS 사파리가 결제창 열기를 차단한다. 미리 받아
           두면 탭 시점의 loadTossSdk() 는 캐시 즉답이라 제스처 안에서
           결제창이 열린다. 프리로드 실패는 무시 — 탭 때 다시 시도된다. */
        void loadTossSdk().catch(() => {});
        return;
      }

      // 4) 위젯 렌더 (gck 키) — 게스트 미리보기와 같은 renderWidgets
      setPhase({ kind: "loading", msg: "결제 수단 불러오는 중…" });
      try {
        widgetsRef.current = await renderWidgets(amount);
        setPhase({ kind: "ready", orderId, amount });
      } catch {
        /* 위젯 렌더 실패 → 결제창형으로 후퇴. 주문은 이미 만들어져 있으므로
           빈 화면 대신 "카드 결제창 열기" 경로를 준다 — 실패를 숨기는 게
           아니라 같은 주문의 대체 결제 경로다(결제창도 실패하면 그때 오류 표시). */
        setPhase({ kind: "window-ready", orderId, amount });
      }
    })();
  }, []);

  async function pay() {
    if (paying || phase.kind !== "ready" || !widgetsRef.current || !params) return;
    setPaying(true);
    try {
      const origin = window.location.origin;
      await widgetsRef.current.requestPayment({
        orderId: phase.orderId,
        orderName:
          params.billing === "weekly"
            ? `내집나우 ${planLabel(params.tier)} 주간권 (7일 · 단건)`
            : `내집나우 ${planLabel(params.tier)} ${params.billing === "annual" ? "연간" : "월간"} 구독`,
        successUrl: `${origin}/payment/success`,
        failUrl: `${origin}/payment/fail`,
        ...(email ? { customerEmail: email } : {}),
      });
    } catch (e) {
      const code =
        e && typeof e === "object" && "code" in e ? String((e as { code: unknown }).code) : "";
      if (code !== "USER_CANCEL" && code !== "PAY_PROCESS_CANCELED") {
        setPhase({
          kind: "error",
          msg: "결제 요청에 실패했어요. 잠시 후 다시 시도해 주세요.",
        });
      }
    } finally {
      setPaying(false);
    }
  }

  /* 결제창형(ck 키) — LLM Quick Reference §5.B: payment({customerKey})
     .requestPayment({ method, amount: {value, currency}, ... }). V2 는 amount 가
     객체다(정수 value + "KRW"). customerKey 는 예측 가능한 값(이메일 등) 금지 —
     일회성 결제라 비회원 상수 ANONYMOUS 를 쓴다(위젯 흐름과 동일한 이유). */
  async function payWindow() {
    if (paying || phase.kind !== "window-ready" || !params) return;
    setPaying(true);
    try {
      const TossPayments = await loadTossSdk();
      const payment = TossPayments(tossClientKey() as string).payment({
        customerKey: TossPayments.ANONYMOUS,
      });
      const origin = window.location.origin;
      await payment.requestPayment({
        method: "CARD",
        amount: { currency: "KRW", value: phase.amount },
        orderId: phase.orderId,
        orderName:
          params.billing === "weekly"
            ? `내집나우 ${planLabel(params.tier)} 주간권 (7일 · 단건)`
            : `내집나우 ${planLabel(params.tier)} ${params.billing === "annual" ? "연간" : "월간"} 구독`,
        successUrl: `${origin}/payment/success`,
        failUrl: `${origin}/payment/fail`,
        /* 결제 결과 안내 문서: customerEmail 을 주면 승인·취소 때 토스가
           구매자에게 안내 메일을 보낸다. 세션 이메일이 있으면 붙인다. */
        ...(email ? { customerEmail: email } : {}),
      });
    } catch (e) {
      const code =
        e && typeof e === "object" && "code" in e ? String((e as { code: unknown }).code) : "";
      if (code !== "USER_CANCEL" && code !== "PAY_PROCESS_CANCELED") {
        /* 원인을 화면에 그대로 적는다 — "잠시 후 다시"만 보이면 사용자도
           우리도 아무것도 알 수 없다. 실제 장애 때 스크린샷 한 장이 진단이 된다. */
        const detail = [code, e instanceof Error ? e.message : ""]
          .filter(Boolean)
          .join(" · ")
          .slice(0, 140);
        setPhase({
          kind: "error",
          msg: `결제창을 열지 못했어요${detail ? ` (${detail})` : ""}. 잠시 후 다시 시도해 주세요.`,
        });
      }
    } finally {
      setPaying(false);
    }
  }

  const label = params ? (planLabel(params.tier)) : "";
  const billingLabel = params ? previewBillingLabel(params.billing) : "";

  /* [968 · T4] 위젯 자리를 언제 예약할지. gck 키에서만 위젯이 그려지므로 ck 키
     (결제창형)·오류·위젯 실패 뒤에는 예약을 풀어 420px 빈 상자를 남기지 않는다.
     loading 동안은 스켈레톤이 그 자리를 채우고, 위젯이 마운트되면 오버레이만
     걷힌다 — 아래 요소(동의 위젯·버튼)의 위치는 그대로다. */
  const widgetExpected = isWidgetKey();
  const widgetReserved =
    widgetExpected &&
    (phase.kind === "loading" ||
      phase.kind === "ready" ||
      (phase.kind === "preview" && phase.widget === "shown"));
  const showWidgetSkeleton = widgetExpected && phase.kind === "loading";

  return (
    <div className="mx-auto flex w-full max-w-[520px] flex-col gap-3">
      {params && (
        <p className="t-body text-text-2">
          {label} 플랜 · {billingLabel} 결제
        </p>
      )}
      {isTossTestEnv() && (
        <p className="rounded-xl bg-[rgba(245,158,11,.12)] px-3.5 py-2.5 t-sub font-bold text-warning">
          테스트 결제 환경 — 승인이 가상으로 이루어져 실제 금액이 청구되지 않아요.
        </p>
      )}

      {phase.kind === "error" && (
        <div className="card flex flex-col items-center gap-2.5 rounded-2xl px-4 py-8 text-center">
          <p className="t-section text-ink">결제를 시작하지 못했어요</p>
          <p className="t-sub text-text-3">{phase.msg}</p>
          <Link href="/subscription" className="btn-soft btn-sm no-underline">
            구독 페이지로 돌아가기
          </Link>
        </div>
      )}

      {/* [968 · T4] 위젯이 예상되는(gck) 동안의 로딩 문구는 위젯 자리 안에서 보여 준다 —
          이 카드가 사라지며 생기던 점프를 없앤다. ck 키(위젯 없음)에서만 예전 카드. */}
      {phase.kind === "loading" && !widgetExpected && (
        <div role="status" className="card rounded-2xl px-4 py-8 text-center t-body text-text-3">
          {phase.msg}
        </div>
      )}

      {/* [966] 주문 요약을 결제수단 위젯 **위에** 둔다 — 예전엔 카드 입력 UI 를 먼저
          보고 그 아래에서야 무엇을 얼마에 사는지 봤다. 위젯 컨테이너는 렌더 호출 전에
          DOM 에 있어야 하므로 항상 마운트하고(display:none 은 위젯이 크기를 못 잰다),
          순서만 바꾼다. */}
      <div className="flex flex-col gap-2">
        {(phase.kind === "ready" || phase.kind === "window-ready" || phase.kind === "preview") &&
          params && (
            <CheckoutSummary
              planName={label}
              billing={params.billing}
              billingLabel={billingLabel}
              amount={phase.amount}
              /* [968 · T1] 게스트는 주문이 없다 — 있는 척하지 않는다 */
              orderId={phase.kind === "preview" ? "로그인 후 발급" : phase.orderId}
            />
          )}
        {phase.kind === "loading" && widgetExpected && <CheckoutSummarySkeleton />}
        {phase.kind === "preview" && <GuestNotice widget={phase.widget} />}
        <div className={`relative overflow-hidden rounded-2xl ${widgetReserved ? "min-h-[420px]" : ""}`}>
          <div id="toss-payment-methods" className={widgetReserved ? "min-h-[420px]" : ""} />
          {showWidgetSkeleton && phase.kind === "loading" && (
            <WidgetSkeletonOverlay msg={phase.msg} />
          )}
        </div>
        <div
          id="toss-agreement"
          className={`overflow-hidden rounded-2xl ${widgetReserved ? "min-h-[88px]" : ""}`}
        />

        {/* [968 · T1] 게스트의 1차 행동 — 로그인 뒤 이 화면(쿼리 포함)으로 복귀 */}
        {phase.kind === "preview" && (
          <>
            <Link
              href={phase.loginHref}
              className="btn-primary btn-cta rounded-[14px] p-[14px] text-center t-body font-bold no-underline"
            >
              로그인하고 결제하기
            </Link>
            <p className="text-center t-sub text-text-3">
              {phase.amount.toLocaleString("ko-KR")}원 · 로그인하면 같은 화면에서 결제가 이어져요.
            </p>
          </>
        )}

        {phase.kind === "ready" && params && (
          <>
            <button
              type="button"
              onClick={() => void pay()}
              disabled={paying}
              className="btn-primary btn-cta rounded-[14px] p-[14px] text-center t-body font-bold disabled:opacity-60"
            >
              {paying
                ? "결제창 여는 중…"
                : `${phase.amount.toLocaleString("ko-KR")}원 결제하기`}
            </button>
            <p className="text-center t-sub text-text-3">
              결제 완료 후 자동으로 구독이 활성화돼요.
            </p>
          </>
        )}

        {/* 결제창형(ck 키) — 위젯 대신 요약 카드 + 결제창 버튼 */}
        {phase.kind === "window-ready" && params && (
          <>
            <p className="t-sub text-text-3">
              버튼을 누르면 토스페이먼츠 카드 결제창이 열려요.
            </p>
            <button
              type="button"
              onClick={() => void payWindow()}
              disabled={paying}
              className="btn-primary btn-cta rounded-[14px] p-[14px] text-center t-body font-bold disabled:opacity-60"
            >
              {paying
                ? "결제창 여는 중…"
                : `${phase.amount.toLocaleString("ko-KR")}원 카드로 결제하기`}
            </button>
          </>
        )}
        {/* [966] 되돌아갈 길은 오류 상태에만 있었다 — 위젯이 오래 걸리거나 마음이
            바뀌어도 브라우저 뒤로가기뿐이었다. 모든 상태에서 한 줄 링크. */}
        {phase.kind !== "error" && (
          <Link
            href={params?.returnTo ?? "/subscription"}
            className="mt-1 text-center t-sub font-bold text-text-3 no-underline"
          >
            {params?.returnTo ? "← 하던 화면으로 돌아가기" : "← 구독 안내로 돌아가기"}
          </Link>
        )}
      </div>
    </div>
  );
}
