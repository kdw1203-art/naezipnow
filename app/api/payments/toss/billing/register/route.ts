import { NextRequest, NextResponse } from "next/server";
import { planLabel } from "@/lib/subscriptions/labels";
import { safeAuth } from "@/lib/safe-auth";
import {
  chargeBillingKey,
  chargeReceiptInfo,
  deleteBillingKey,
  deterministicIdempotencyKey,
  isTossBillingEnabled,
  issueBillingKey,
} from "@/lib/payments/toss-billing";
import {
  activateSubscription,
  attachBillingKey,
  getByCustomerKey,
  replaceSubscriptionCard,
  type BillingSubscription,
} from "@/lib/payments/billing-store";
import { recordSubscriptionEvent } from "@/lib/payments/subscription-events";
import {
  createPayment,
  markFailed,
  markPaid,
  promotePaidAfterProviderConfirmation,
} from "@/lib/payments/store";
import { cancelTossPayment } from "@/lib/payments/toss-cancel";
import { BILLING_DURATION_DAYS, nextChargeAtFrom } from "@/lib/subscriptions/billing-periods";
import { notifyPaymentSettled } from "@/lib/payments/notify-paid";
import { applyPlanToUserByEmail } from "@/lib/billing/apply-plan";
import type { AppPlan } from "@/lib/billing/plan";
import { applyRateLimit, AUTH_RATE_LIMIT } from "@/lib/rate-limit";
import { logger } from "@/lib/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * requestBillingAuth successUrl 랜딩 — authKey → 빌링키 발급 → 첫 결제 → 활성화.
 *
 * 빌링 문서 흐름 그대로다:
 *  1) successUrl 쿼리로 customerKey + authKey 가 온다.
 *  2) POST /v1/billing/authorizations/issue 로 billingKey 발급 (authKey 는 1회용).
 *  3) billingKey 는 서버 저장소에만 두고, 첫 주기 결제를 즉시 승인한다.
 *  4) 다음 청구 시각을 기록하고 크론(billing-renewals)이 이어받는다.
 *
 * 멱등성: 사용자가 이 URL 을 새로고침하면 authKey 재교환은 실패하지만,
 * 구독이 이미 active 면 발급을 건너뛰고 성공 화면으로 보낸다 — 두 번 눌러도
 * 두 번 결제되지 않는다(첫 결제의 멱등키도 구독 id 로 고정).
 *
 * 보안: customerKey 는 무작위 UUID 라 남의 값을 유추할 수 없고, 유추했더라도
 * 세션 이메일과 구독 소유자가 다르면 여기서 끊는다.
 */

/* 상품명은 결제 내역·영수증에 그대로 남는다 — 단일 출처를 쓴다. */

/* [1000] 실패 화면에 어느 레일·플랜·주기였는지 실어 보낸다 — "다른 카드로 등록" 이
   카드 등록창 바로 앞(/subscription/billing?tier&billing[&mode=card])으로 가게. */
function fail(
  origin: string,
  code: string,
  ctx?: { sub?: Pick<BillingSubscription, "plan" | "billing"> | null; cardChange?: boolean },
): NextResponse {
  const u = new URL("/payment/fail", origin);
  u.searchParams.set("code", code);
  u.searchParams.set("provider", "toss-billing");
  if (ctx?.sub) {
    u.searchParams.set("plan", ctx.sub.plan);
    u.searchParams.set("billing", ctx.sub.billing);
  }
  if (ctx?.cardChange) u.searchParams.set("mode", "card");
  return NextResponse.redirect(u, 303);
}

export async function GET(req: NextRequest) {
  const limited = await applyRateLimit(req, AUTH_RATE_LIMIT);
  if (limited) return limited;

  const origin = req.nextUrl.origin;
  if (!isTossBillingEnabled()) return fail(origin, "NOT_CONFIGURED");

  const customerKey = req.nextUrl.searchParams.get("customerKey")?.trim() ?? "";
  const authKey = req.nextUrl.searchParams.get("authKey")?.trim() ?? "";
  if (!customerKey || !authKey) return fail(origin, "MISSING_PARAMS");

  const session = await safeAuth();
  const userEmail = session?.user?.email?.trim().toLowerCase() ?? null;
  if (!userEmail) {
    const u = new URL("/login", origin);
    u.searchParams.set("callbackUrl", req.nextUrl.pathname + req.nextUrl.search);
    return NextResponse.redirect(u, 303);
  }

  const sub = await getByCustomerKey(customerKey).catch(() => null);
  if (!sub) return fail(origin, "MISSING_PARAMS");
  if (sub.userEmail !== userEmail) return fail(origin, "FORBIDDEN");

  /* 카드 변경(재등록) — 결제 없이 빌링키·카드 정보만 새 카드로 교체한다.
     suspended(결제 실패 정지) 구독은 교체와 함께 active 로 복구하고
     next_charge_at 을 지금으로 당겨 다음 크론이 새 카드로 즉시 재청구한다. */
  if (req.nextUrl.searchParams.get("mode") === "card") {
    if (sub.status !== "active" && sub.status !== "suspended") {
      return fail(origin, "NOT_CONFIGURED", { sub, cardChange: true });
    }
    const issued = await issueBillingKey(authKey, customerKey);
    if (!issued.ok) {
      logger.warn("[toss-billing] 카드 변경 — 빌링키 발급 실패", {
        code: issued.code,
        status: issued.status,
      });
      return fail(origin, issued.code ?? "PROVIDER_ERROR", { sub, cardChange: true });
    }
    const oldKey = sub.billingKey;
    const wasSuspended = sub.status === "suspended";
    const replaced = await replaceSubscriptionCard({
      id: sub.id,
      billingKey: issued.data.billingKey,
      cardCompany: issued.data.cardCompany,
      cardNumberMasked: issued.data.cardNumberMasked,
      reactivate: wasSuspended,
    });
    if (!replaced) return fail(origin, "PROVIDER_ERROR", { sub, cardChange: true });
    if (oldKey && oldKey !== issued.data.billingKey) {
      // 옛 카드 대체값을 청구 가능 상태로 남기지 않는다 — 실패해도 교체는 유효
      await deleteBillingKey(oldKey).catch(() => {});
    }
    /* [1000] 이력 — 카드 정보는 카드사·마스킹 번호까지만(빌링키 절대 금지) */
    await recordSubscriptionEvent({
      subscriptionId: sub.id,
      userEmail,
      event: "card_changed",
      detail: { cardCompany: issued.data.cardCompany, cardNumberMasked: issued.data.cardNumberMasked },
    });
    if (wasSuspended) {
      await recordSubscriptionEvent({
        subscriptionId: sub.id,
        userEmail,
        event: "reactivated",
        detail: { via: "card_change" },
      });
    }
    const u = new URL("/payment/success", origin);
    u.searchParams.set("provider", "toss-billing");
    u.searchParams.set("card", "changed");
    return NextResponse.redirect(u, 303);
  }

  // 새로고침 멱등 — 이미 활성화된 구독이면 성공 화면으로
  if (sub.status === "active" && sub.billingKey) {
    const u = new URL("/payment/success", origin);
    u.searchParams.set("provider", "toss-billing");
    if (sub.lastOrderId) u.searchParams.set("orderId", sub.lastOrderId);
    return NextResponse.redirect(u, 303);
  }
  if (sub.status !== "pending") return fail(origin, "NOT_CONFIGURED", { sub });

  // 1) 빌링키 발급 (이미 발급돼 있으면 재사용 — authKey 만료 새로고침 대비)
  let billingKey = sub.billingKey;
  if (!billingKey) {
    const issued = await issueBillingKey(authKey, customerKey);
    if (!issued.ok) {
      logger.warn("[toss-billing] 빌링키 발급 실패", {
        code: issued.code,
        status: issued.status,
      });
      return fail(origin, issued.code ?? "PROVIDER_ERROR", { sub });
    }
    const saved = await attachBillingKey({
      id: sub.id,
      billingKey: issued.data.billingKey,
      cardCompany: issued.data.cardCompany,
      cardNumberMasked: issued.data.cardNumberMasked,
    });
    if (!saved) return fail(origin, "PROVIDER_ERROR", { sub });
    billingKey = issued.data.billingKey;
    await recordSubscriptionEvent({
      subscriptionId: sub.id,
      userEmail,
      event: "enrolled",
      detail: {
        plan: sub.plan,
        billing: sub.billing,
        cardCompany: issued.data.cardCompany,
        cardNumberMasked: issued.data.cardNumberMasked,
      },
    });
  }

  // 2) 첫 주기 결제 — 단건 결제와 같은 원장(payments)에 기록한다
  const orderId = `BILLING-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
  const orderName = `내집나우 ${planLabel(sub.plan)} ${sub.billing === "annual" ? "연간" : "월간"} 자동결제`;
  try {
    await createPayment({
      orderId,
      userEmail,
      plan: sub.plan,
      billing: sub.billing,
      amount: sub.amount,
      provider: "toss-billing",
      metadata: { billingSubscriptionId: sub.id, cycle: "init" },
    });
  } catch (e) {
    logger.error("[toss-billing] 첫 결제 주문 기록 실패", e);
    return fail(origin, "PROVIDER_ERROR", { sub });
  }

  const charged = await chargeBillingKey({
    billingKey,
    customerKey,
    amount: sub.amount,
    orderId,
    orderName,
    customerEmail: userEmail,
    idempotencyKey: deterministicIdempotencyKey(`nuguzip:toss:billing:${sub.id}:init`),
  });
  if (!charged.ok) {
    await markFailed(orderId);
    logger.warn("[toss-billing] 첫 결제 승인 실패", { code: charged.code, status: charged.status });
    return fail(origin, charged.code ?? "PROVIDER_ERROR", { sub });
  }
  /* [1000] 승인 응답의 영수증·결제수단 — 결제 내역 "영수증 보기" 가 자동결제에도 뜨게 */
  const receipt = chargeReceiptInfo(charged.data);

  // 금액 재검증 — 승인 응답의 totalAmount 가 우리가 청구한 금액과 달라선 안 된다
  if (charged.data.totalAmount != null && Number(charged.data.totalAmount) !== sub.amount) {
    logger.error("[toss-billing] 첫 결제 금액 불일치", {
      expected: sub.amount,
      got: charged.data.totalAmount,
    });
    /* [965] 승인은 이미 났다 — 돈이 나간 상태다. 예전엔 여기서 그냥 실패 화면으로
       보내 원장은 requested(45분 뒤 cancelled)·플랜 없음·환불 없음이 됐다.
       즉시 전액 취소하고, 취소가 안 되면 원장에 paid 로 남겨 운영자가 환불하게 한다. */
    const cancelled = await cancelTossPayment({
      paymentKey: charged.data.paymentKey ?? "",
      orderId,
      cancelReason: "결제 금액 불일치 자동 취소",
      rail: "billing",
    });
    if (cancelled.ok) {
      await markFailed(orderId);
    } else {
      logger.error("[toss-billing] 금액 불일치 자동 취소 실패 — 수동 환불 필요", {
        orderId,
        code: cancelled.code,
      });
      await markPaid({
        orderId,
        providerPaymentKey: charged.data.paymentKey,
        method: receipt.method,
        receiptUrl: receipt.receiptUrl ?? undefined,
      });
    }
    return fail(origin, "AMOUNT_MISMATCH", { sub });
  }

  const paidRow =
    (await markPaid({
      orderId,
      providerPaymentKey: charged.data.paymentKey,
      method: receipt.method,
      receiptUrl: receipt.receiptUrl ?? undefined,
    })) ??
    /* requested 가 아니었다(동시 요청 등) — 결제사 승인이 사실이므로 어떤 상태에서든 paid 로 */
    (await promotePaidAfterProviderConfirmation({
      orderId,
      providerPaymentKey: charged.data.paymentKey ?? "",
      method: receipt.method,
      receiptUrl: receipt.receiptUrl ?? undefined,
      reason: "빌링 첫 결제 승인 — requested 가 아니던 주문",
    }));
  const cycle = sub.billing === "annual" ? "annual" : "monthly";
  const periodDays = BILLING_DURATION_DAYS[cycle];
  await applyPlanToUserByEmail(userEmail, sub.plan as AppPlan, { durationDays: periodDays });

  /* 다음 청구는 만료 이틀 전 — [966] 등록 화면과 같은 식(nextChargeAtFrom) */
  const nextChargeAt = nextChargeAtFrom(Date.now(), cycle).toISOString();
  const activated = await activateSubscription({
    id: sub.id,
    userEmail,
    nextChargeAt,
    lastOrderId: orderId,
  });
  if (!activated) {
    // 결제는 성공했으므로 실패로 돌리지 않는다 — 로그만 남기고 성공 화면으로
    logger.error("[toss-billing] 활성화 전이 실패(결제는 성공)", { orderId });
  } else {
    await recordSubscriptionEvent({
      subscriptionId: sub.id,
      userEmail,
      event: "activated",
      detail: { orderId, amount: sub.amount, plan: sub.plan, billing: sub.billing, nextChargeAt },
    });
  }
  /* [966] 결제 직후 확인 — 알림함 + 영수증 메일(다음 결제 예정일 포함) */
  if (paidRow) await notifyPaymentSettled(paidRow, { kind: "billing_first", nextChargeAt });

  const u = new URL("/payment/success", origin);
  u.searchParams.set("provider", "toss-billing");
  u.searchParams.set("orderId", orderId);
  /* [1006] 광고 전환 집계용 표시 값 — GA4 purchase 의 value 는 이 쿼리로만 채워진다
     (components/ga4-gtag-loader.tsx). 서버 분기(toss-billing)는 이 값을 읽지 않고 원장으로
     사실을 확인하므로 주소창을 고쳐도 돈은 움직이지 않는다. 첫 결제가 있었을 때만 싣는다. */
  if (paidRow && Number.isFinite(sub.amount) && sub.amount > 0) {
    u.searchParams.set("amount", String(sub.amount));
  }
  return NextResponse.redirect(u, 303);
}
