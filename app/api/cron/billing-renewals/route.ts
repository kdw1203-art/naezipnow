import { NextResponse } from "next/server";
import { planLabel } from "@/lib/subscriptions/labels";
import { authorizeCron } from "@/lib/cron/authorize";
import {
  chargeBillingKey,
  chargeReceiptInfo,
  deterministicIdempotencyKey,
  isNonRetryableBillingCode,
  isTossBillingConfigured,
} from "@/lib/payments/toss-billing";
import {
  listDueSubscriptions,
  listUpcomingChargeSubscriptions,
  markNoticeSent,
  recordRenewalFailure,
  recordRenewalSuccess,
  type BillingSubscription,
} from "@/lib/payments/billing-store";
import {
  createPayment,
  getPaymentByOrderId,
  markFailed,
  markPaid,
  promotePaidAfterProviderConfirmation,
} from "@/lib/payments/store";
import { cancelTossPayment } from "@/lib/payments/toss-cancel";
import { BILLING_DURATION_DAYS } from "@/lib/subscriptions/billing-periods";
import { notifyPaymentSettled } from "@/lib/payments/notify-paid";
import { recordSubscriptionEvent } from "@/lib/payments/subscription-events";
import { needsUpcomingNotice, UPCOMING_NOTICE_LEAD_DAYS } from "@/lib/payments/renewal-notice";
import { applyPlanToUserByEmail } from "@/lib/billing/apply-plan";
import type { AppPlan } from "@/lib/billing/plan";
import { appendInboxNotification } from "@/lib/notifications/inbox";
import { isEmailConfigured, sendEmail } from "@/lib/email/send";
import { paymentRenewalFailedEmail, paymentUpcomingChargeEmail } from "@/lib/email/templates";
import { ingestErrorMessage, logIngest } from "@/lib/market/store";
import { logger } from "@/lib/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * 자동결제 갱신 크론 — 토스는 스케줄러를 제공하지 않는다(빌링 문서 명시).
 * 호출원: pg_cron(ops.run_billing_renewals, 10:10·22:10 KST) + Vercel 크론
 * (vercel.json). vault cron_secret 이 없어도 Vercel 쪽은 CRON_SECRET Bearer 로
 * 청구를 돌린다. pg_cron 경보를 끄려면 vault 등록이 필요하다.
 *
 * 이중 청구 불가 구조(세 겹):
 *  1) 멱등키 = 구독 id + 이번 주기(next_charge_at) — 크론이 겹쳐 돌아도 토스가
 *     같은 응답을 돌려준다(승인 API 멱등키, 15일 유효).
 *  2) 주기당 orderId 도 결정적으로 만들어 payments 원장에서 재사용 검사.
 *  3) 성공 시 next_charge_at 을 전진시키므로 다음 조회에서 빠진다.
 *
 * 실패 처리(빌링 문서의 "실패 시 새 카드 등록 유도"):
 *  - 재시도 가능(잔액 부족·일시 오류): fail_count 증가, 다음 크론이 재시도.
 *  - 재시도 무의미(빌링키 삭제·정지 카드 등) 또는 3회 연속 실패: suspended 로
 *    접고 인앱 알림으로 카드 재등록을 안내한다. 이용권은 만료 스윕이 기간 종료
 *    시점에 정상 강등한다 — 여기서 즉시 뺏지 않는다.
 *
 * [1000] 통보 규칙:
 *  - 실패: **첫 실패**(last_error 가 비어 있던 회차)와 **일시중단** 시점에만 알림함+메일.
 *    매 회차 보내면 하루 두 번 같은 메일이 간다(크론 2회/일) — 스팸이 되면 진짜 중단 통보를 안 읽는다.
 *  - 사전 통지: 다음 결제 3일 안이고 이 회차(next_charge_at)에 아직 안 보냈으면 알림함+메일,
 *    notice_sent_for 에 회차를 적는다(회차당 1통).
 */

/* 상품명은 결제 내역·영수증에 그대로 남는다 — 단일 출처를 쓴다. */
const MAX_CONSECUTIVE_FAILS = 3;
const BATCH = 10;
const NOTICE_BATCH = 100;
/* 크론이 하루 두 번(10:10·22:10 KST) 돈다 — 다음 재시도는 약 12시간 뒤 */
const RETRY_INTERVAL_MS = 12 * 60 * 60 * 1000;
const MANAGE_URL = "https://naezipnow.com/my/subscription";

function cardMaskedLabel(sub: BillingSubscription): string | null {
  const s = `${sub.cardCompany ?? ""} ${sub.cardNumberMasked ?? ""}`.trim();
  return s || null;
}

/** 실패 통보 — 알림함 1건 + 메일 1통(메일 미설정이면 알림함만). 실패해도 갱신 처리를 막지 않는다. */
async function notifyRenewalFailure(
  sub: BillingSubscription,
  input: { error: string; suspended: boolean; amountMismatch?: boolean },
): Promise<void> {
  try {
    await appendInboxNotification({
      userEmail: sub.userEmail,
      title: input.amountMismatch
        ? "자동결제를 확인 중이에요"
        : input.suspended
          ? "자동결제를 잠시 멈췄어요"
          : "자동결제가 되지 않았어요",
      body: input.amountMismatch
        ? /* 카드는 승인됐고 바로 전액 취소했다 — "카드를 다시 등록"하라고 하면 즉시 재청구돼 같은 문제가 반복된다 */
          "결제 금액 확인에 문제가 있어 승인된 금액은 바로 취소하고 자동결제를 멈췄어요. 카드 문제가 아니에요 — 저희가 확인한 뒤 알려 드릴게요. 급하시면 고객센터로 문의해 주세요."
        : input.suspended
          ? "등록된 카드로 결제가 되지 않아 자동결제를 멈췄어요. 카드를 다시 등록하면 바로 결제되고 이어서 이용할 수 있어요."
          : "등록된 카드로 결제가 승인되지 않았어요. 약 12시간 뒤 한 번 더 시도해요 — 그 전에 카드를 바꾸면 새 카드로 결제돼요.",
      actionUrl: input.amountMismatch ? "/support?category=payment" : "/my/subscription",
      channel: "user",
    });
    if (isEmailConfigured()) {
      const r = await sendEmail({
        to: sub.userEmail,
        ...paymentRenewalFailedEmail({
          plan: planLabel(sub.plan),
          billing: sub.billing,
          amount: sub.amount,
          error: input.error,
          retryAt: input.suspended ? null : new Date(Date.now() + RETRY_INTERVAL_MS),
          manageUrl: MANAGE_URL,
        }),
      });
      if (!r.sent) logger.warn("[billing-renewals] 실패 메일 발송 실패", { reason: r.reason });
    }
  } catch (e) {
    logger.warn("[billing-renewals] 실패 알림 발송 실패", e);
  }
}

async function renewOne(sub: BillingSubscription): Promise<"charged" | "failed" | "suspended"> {
  const cycle = sub.nextChargeAt ?? "unknown-cycle";
  /* 주기 고정 orderId — 같은 주기 재시도는 같은 주문을 재사용한다(이미 paid 면 skip) */
  const orderId = `BILLING-${deterministicIdempotencyKey(`nuguzip:toss:billing:order:${sub.id}:${cycle}`).slice(0, 23).toUpperCase()}`;
  const existing = await getPaymentByOrderId(orderId);
  if (existing?.status === "paid") {
    // 승인은 성공했는데 next_charge_at 전진 전에 죽었던 경우 — 전진만 마저 한다
    const periodDays = BILLING_DURATION_DAYS[sub.billing === "annual" ? "annual" : "monthly"];
    const base = sub.nextChargeAt ? new Date(sub.nextChargeAt).getTime() : Date.now();
    const advancedTo = new Date(base + periodDays * 86_400_000).toISOString();
    await recordRenewalSuccess({ id: sub.id, nextChargeAt: advancedTo, lastOrderId: orderId });
    await recordSubscriptionEvent({
      subscriptionId: sub.id,
      userEmail: sub.userEmail,
      event: "renewed",
      detail: { orderId, amount: sub.amount, nextChargeAt: advancedTo, recovered: true },
    });
    return "charged";
  }
  if (!existing) {
    await createPayment({
      orderId,
      userEmail: sub.userEmail,
      plan: sub.plan,
      billing: sub.billing,
      amount: sub.amount,
      provider: "toss-billing",
      metadata: { billingSubscriptionId: sub.id, cycle },
    });
  }

  const charged = await chargeBillingKey({
    billingKey: sub.billingKey as string,
    customerKey: sub.customerKey,
    amount: sub.amount,
    orderId,
    orderName: `내집나우 ${planLabel(sub.plan)} ${sub.billing === "annual" ? "연간" : "월간"} 자동결제 갱신`,
    customerEmail: sub.userEmail,
    idempotencyKey: deterministicIdempotencyKey(`nuguzip:toss:billing:${sub.id}:${cycle}`),
  });

  if (!charged.ok) {
    await markFailed(orderId);
    const errorText = `${charged.code ?? "UNKNOWN"}: ${charged.message}`;
    const suspend =
      isNonRetryableBillingCode(charged.code) || sub.failCount + 1 >= MAX_CONSECUTIVE_FAILS;
    /* 이 회차의 첫 실패인가 — recordRenewalFailure 가 last_error 를 덮기 **전** 값으로 판단 */
    const firstFailure = !sub.lastError;
    await recordRenewalFailure({
      id: sub.id,
      error: errorText,
      suspend,
    });
    await recordSubscriptionEvent({
      subscriptionId: sub.id,
      userEmail: sub.userEmail,
      event: "renewal_failed",
      detail: { orderId, code: charged.code, failCount: sub.failCount + 1, amount: sub.amount },
    });
    if (suspend) {
      await recordSubscriptionEvent({
        subscriptionId: sub.id,
        userEmail: sub.userEmail,
        event: "suspended",
        detail: { orderId, code: charged.code, failCount: sub.failCount + 1 },
      });
    }
    if (firstFailure || suspend) {
      await notifyRenewalFailure(sub, { error: errorText, suspended: suspend });
    }
    return suspend ? "suspended" : "failed";
  }

  /* [1000] 승인 응답의 영수증·결제수단 */
  const receipt = chargeReceiptInfo(charged.data);

  if (charged.data.totalAmount != null && Number(charged.data.totalAmount) !== sub.amount) {
    // 승인 금액이 우리 장부와 다르면 반영하지 않고 사람 확인 대상으로 남긴다
    logger.error("[billing-renewals] 갱신 금액 불일치", {
      subscription: sub.id,
      expected: sub.amount,
      got: charged.data.totalAmount,
    });
    /* [965] 승인은 이미 났다 — 즉시 전액 취소한다. 예전엔 구독만 멈추고 청구는 그대로
       남겨 사용자 카드에서 돈이 나간 채 아무도 환불하지 않았다. */
    const cancelled = await cancelTossPayment({
      paymentKey: charged.data.paymentKey ?? "",
      orderId,
      cancelReason: "갱신 결제 금액 불일치 자동 취소",
      rail: "billing",
    });
    if (cancelled.ok) {
      await markFailed(orderId);
    } else {
      logger.error("[billing-renewals] 금액 불일치 자동 취소 실패 — 수동 환불 필요", {
        orderId,
        code: cancelled.code,
      });
      await promotePaidAfterProviderConfirmation({
        orderId,
        providerPaymentKey: charged.data.paymentKey ?? "",
        method: receipt.method,
        receiptUrl: receipt.receiptUrl ?? undefined,
        reason: "갱신 금액 불일치 — 취소 실패로 원장에 paid 보존",
      });
    }
    await recordRenewalFailure({ id: sub.id, error: "AMOUNT_MISMATCH", suspend: true });
    await recordSubscriptionEvent({
      subscriptionId: sub.id,
      userEmail: sub.userEmail,
      event: "suspended",
      detail: { orderId, code: "AMOUNT_MISMATCH" },
    });
    await notifyRenewalFailure(sub, {
      error: "AMOUNT_MISMATCH: 결제 금액 확인 실패(승인분 취소)",
      suspended: true,
      amountMismatch: true,
    });
    return "suspended";
  }

  /* [965] 같은 주기의 앞 회차가 failed 로 남아 있으면 markPaid(requested 전용)는
     null 을 돌려준다 — 예전엔 그 반환값을 버리고 플랜만 켜서, 돈은 받았는데 결제
     내역에는 "실패" 로 남았다. 결제사 승인이 사실이므로 failed 에서도 paid 로 올린다. */
  const paidRow =
    (await markPaid({
      orderId,
      providerPaymentKey: charged.data.paymentKey,
      method: receipt.method,
      receiptUrl: receipt.receiptUrl ?? undefined,
    })) ??
    (await promotePaidAfterProviderConfirmation({
      orderId,
      providerPaymentKey: charged.data.paymentKey ?? "",
      method: receipt.method,
      receiptUrl: receipt.receiptUrl ?? undefined,
      reason: "갱신 승인 성공 — 앞 회차 실패 행 재사용",
    }));
  if (!paidRow) {
    logger.error("[billing-renewals] 승인은 났는데 원장을 paid 로 만들지 못함 — 사람 확인", { orderId });
  }
  const periodDays = BILLING_DURATION_DAYS[sub.billing === "annual" ? "annual" : "monthly"];
  await applyPlanToUserByEmail(sub.userEmail, sub.plan as AppPlan, { durationDays: periodDays });
  const base = sub.nextChargeAt ? new Date(sub.nextChargeAt).getTime() : Date.now();
  const nextChargeAt = new Date(base + periodDays * 86_400_000).toISOString();
  await recordRenewalSuccess({
    id: sub.id,
    nextChargeAt,
    lastOrderId: orderId,
  });
  await recordSubscriptionEvent({
    subscriptionId: sub.id,
    userEmail: sub.userEmail,
    event: "renewed",
    detail: { orderId, amount: sub.amount, nextChargeAt, receipt: Boolean(receipt.receiptUrl) },
  });
  /* [966] 갱신도 확인을 보낸다 — 카드에서 돈이 나갔는데 우리 쪽 통보가 없었다 */
  if (paidRow) await notifyPaymentSettled(paidRow, { kind: "renewal", nextChargeAt });
  return "charged";
}

/**
 * [1000] 청구 사전 통지 패스 — 다음 결제 3일 안인 active 구독에 회차당 1통.
 * 갱신 패스 뒤에 돈다(방금 갱신된 구독은 next_charge_at 이 한 주기 뒤라 창 밖).
 */
async function sendUpcomingNotices(): Promise<{ noticed: number; skipped: number }> {
  let noticed = 0;
  let skipped = 0;
  const candidates = await listUpcomingChargeSubscriptions({
    withinDays: UPCOMING_NOTICE_LEAD_DAYS,
    limit: NOTICE_BATCH,
  });
  const now = Date.now();
  for (const sub of candidates) {
    if (!sub.nextChargeAt) continue;
    if (!needsUpcomingNotice({ nextChargeAt: sub.nextChargeAt, noticeSentFor: sub.noticeSentFor, now })) {
      skipped += 1;
      continue;
    }
    try {
      /* 표식을 **먼저** 선점한다 — 크론이 겹쳐 돌아도(pg_cron + Vercel) 한쪽만 통과한다.
         조건부 UPDATE 라 회차가 바뀌었거나 이미 적혔으면 null → 건너뛴다. */
      const claimed = await markNoticeSent({ id: sub.id, nextChargeAt: sub.nextChargeAt });
      if (!claimed) {
        skipped += 1;
        continue;
      }
      const chargeAt = new Date(sub.nextChargeAt);
      const dateLabel = chargeAt.toLocaleDateString("ko-KR", {
        month: "long",
        day: "numeric",
        timeZone: "Asia/Seoul",
      });
      const card = cardMaskedLabel(sub);
      await appendInboxNotification({
        userEmail: sub.userEmail,
        title: `${dateLabel}에 자동결제될 예정이에요`,
        body: `${planLabel(sub.plan)} ${sub.billing === "annual" ? "연간" : "월간"} · ${sub.amount.toLocaleString("ko-KR")}원${card ? ` · ${card}` : ""} — 계속 이용하시면 따로 할 일은 없어요. 해지·카드 변경은 구독 관리에서.`,
        actionUrl: "/my/subscription",
        channel: "user",
      });
      if (isEmailConfigured()) {
        const r = await sendEmail({
          to: sub.userEmail,
          ...paymentUpcomingChargeEmail({
            plan: planLabel(sub.plan),
            billing: sub.billing,
            amount: sub.amount,
            chargeAt,
            cardMasked: card,
            manageUrl: MANAGE_URL,
          }),
        });
        if (!r.sent) logger.warn("[billing-renewals] 사전 통지 메일 발송 실패", { reason: r.reason });
      }
      await recordSubscriptionEvent({
        subscriptionId: sub.id,
        userEmail: sub.userEmail,
        event: "notice_sent",
        detail: { nextChargeAt: sub.nextChargeAt, amount: sub.amount, email: isEmailConfigured() },
      });
      noticed += 1;
    } catch (e) {
      logger.warn("[billing-renewals] 사전 통지 실패", {
        subscription: sub.id,
        err: e instanceof Error ? e.message : String(e),
      });
    }
  }
  return { noticed, skipped };
}

export async function POST(req: Request) {
  return handle(req);
}
export async function GET(req: Request) {
  return handle(req);
}

async function handle(req: Request) {
  const authorized = await authorizeCron(req);
  if (!authorized) {
    return NextResponse.json({ error: "권한이 필요합니다." }, { status: 403 });
  }
  if (!isTossBillingConfigured()) {
    return NextResponse.json({ ok: true, note: "TOSS_SECRET_KEY 미설정 — 갱신 없음" });
  }

  try {
    const due = await listDueSubscriptions(BATCH);
    let charged = 0;
    let failed = 0;
    let suspended = 0;
    for (const sub of due) {
      try {
        const r = await renewOne(sub);
        if (r === "charged") charged += 1;
        else if (r === "suspended") suspended += 1;
        else failed += 1;
      } catch (e) {
        failed += 1;
        logger.error("[billing-renewals] 갱신 처리 예외", {
          subscription: sub.id,
          err: e instanceof Error ? e.message : String(e),
        });
      }
    }
    /* 사전 통지는 갱신과 독립 — 여기서 죽어도 갱신 결과는 이미 반영돼 있다 */
    const notice = await sendUpcomingNotices().catch((e: unknown) => {
      logger.error("[billing-renewals] 사전 통지 단계 실패", e);
      return { noticed: 0, skipped: 0 };
    });
    if (due.length > 0 || notice.noticed > 0) {
      await logIngest({
        source: "billing-renewals",
        dataset: "billing_subscriptions",
        origin: "cron-fetch",
        rows: charged,
        status: failed + suspended > 0 && charged === 0 && due.length > 0 ? "error" : "ok",
        message: `갱신 ${charged}건 · 재시도 예정 ${failed}건 · 중단 ${suspended}건 (대상 ${due.length}건) · 사전 통지 ${notice.noticed}건`,
      });
    }
    return NextResponse.json({
      ok: true,
      due: due.length,
      charged,
      failed,
      suspended,
      noticed: notice.noticed,
    });
  } catch (e) {
    logger.error("[billing-renewals]", e);
    await logIngest({
      source: "billing-renewals",
      dataset: "billing_subscriptions",
      origin: "cron-fetch",
      rows: 0,
      status: "error",
      message: ingestErrorMessage(e),
    }).catch(() => {});
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "renewal failed" },
      { status: 500 },
    );
  }
}
