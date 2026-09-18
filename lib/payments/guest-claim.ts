import "server-only";

import { getServiceSupabase } from "@/lib/supabase/service";
import { applyPlanToUserByEmail } from "@/lib/billing/apply-plan";
import { BILLING_DURATION_DAYS } from "@/lib/subscriptions/billing-periods";
import { normalizeGuestEmail, readGuestMeta } from "@/lib/payments/guest-order";
import { guestAttachDecision } from "@/lib/payments/guest-attach";
import { getPaymentByOrderId } from "@/lib/payments/store";
import { notifyPaymentSettled } from "@/lib/payments/notify-paid";
import { logger } from "@/lib/log";

/**
 * [1001] 비회원 결제의 이용권 연결.
 *
 * 비회원이 주간권을 결제하면 payments.user_email 에는 결제 때 적은 이메일이 들어가고
 * metadata.guest=true · claimPending=true 로 남는다. 그 이메일의 app_users 행이 아직 없으면
 * 승인 시점에는 플랜을 켤 수 없다 — 나중에 같은 이메일로 가입/로그인한 순간 여기서 켠다.
 * 호출처: /payment/success(로그인 상태) · /my · /my/subscription. 여러 번 불려도 한 번만 적용된다
 * (claimPending 을 조건으로 선점 UPDATE).
 */
export async function claimGuestPayments(email: string | null | undefined): Promise<number> {
  const em = email?.trim().toLowerCase();
  if (!em) return 0;
  const sb = getServiceSupabase();
  if (!sb) return 0;
  const { data, error } = await sb
    .from("payments")
    .select("id, order_id, plan, billing, metadata")
    .eq("user_email", em)
    .eq("status", "paid")
    .eq("metadata->>guest", "true")
    .eq("metadata->>claimPending", "true")
    .order("paid_at", { ascending: true })
    .limit(20);
  if (error || !data?.length) return 0;

  let applied = 0;
  for (const row of data as Array<Record<string, unknown>>) {
    const meta = (row.metadata ?? {}) as Record<string, unknown>;
    if (!readGuestMeta(meta)?.claimPending) continue;
    const plan = String(row.plan ?? "");
    if (plan !== "pro" && plan !== "expert" && plan !== "enterprise") continue;
    const billing = String(row.billing ?? "monthly") as keyof typeof BILLING_DURATION_DAYS;
    /* 선점 — 같은 행을 두 요청이 동시에 잡아도 하나만 통과 */
    const stamp = new Date().toISOString();
    const { data: claimed } = await sb
      .from("payments")
      .update({ metadata: { ...meta, claimPending: false, claimedAt: stamp } })
      .eq("id", row.id as string)
      .eq("metadata->>claimPending", "true")
      .select("id")
      .maybeSingle();
    if (!claimed) continue;
    const ok = await applyPlanToUserByEmail(em, plan, {
      durationDays: BILLING_DURATION_DAYS[billing] ?? BILLING_DURATION_DAYS.monthly,
    });
    if (!ok) {
      /* app_users 행이 아직 없으면 되돌려서 다음 기회에 다시 시도한다 */
      await sb
        .from("payments")
        .update({ metadata: { ...meta, claimPending: true } })
        .eq("id", row.id as string);
      continue;
    }
    applied += 1;
    logger.info("[payments:guest] 이용권 연결", { orderId: row.order_id, email: em });
  }
  return applied;
}

export type AttachGuestEmailResult =
  | { ok: true; applied: boolean; email: string }
  | { ok: false; reason: "invalid_email" | "not_found" | "not_paid" | "not_guest" | "mismatch" | "taken" };

/**
 * [1003] 이메일 없이 결제한 비회원이 결제 뒤 이메일을 알려 줄 때.
 *
 * 왜 paymentKey 를 요구하나: 주문번호는 비밀이 아니다(성공 화면 주소·메일에 남는다).
 * 주문번호만으로 이메일을 붙일 수 있으면, 남이 결제한 주간권을 자기 계정으로 가져갈 수 있다.
 * paymentKey 는 결제창을 실제로 통과한 사람의 브라우저에만 돌아온다 — 그것을 열쇠로 쓴다.
 *
 * 이미 이메일이 붙어 있는 주문은 같은 이메일일 때만 통과시킨다(붙은 이메일을 바꿔치기하면
 * 먼저 결제한 사람의 이용권이 사라진다). 연결은 기존 claimGuestPayments 에 맡긴다 —
 * 계정이 아직 없으면 claimPending 으로 남고, 그 이메일로 가입하는 순간 켜진다.
 */
export async function attachGuestOrderEmail(input: {
  orderId: string;
  paymentKey: string;
  email: string;
  /**
   * 지금 로그인해 있는 사람의 이메일(없으면 null).
   * [1003 · 리뷰 HIGH] 이용권을 **켜는** 것은 그 계정으로 로그인해 있을 때만 한다.
   * 이메일만 적으면 남의 계정에 붙는 셈이라, 1,100원으로 상위 플랜 사용자를 7일 주간권으로
   * 강등시키고 환불로 끊을 수 있다(confirm-toss-order 의 applyPlanForPayment 가 세운 규칙과 같다).
   * 로그인하지 않은 사람은 주문에 이메일만 붙고, 그 이메일로 가입/로그인하는 순간 켜진다.
   */
  sessionEmail?: string | null;
}): Promise<AttachGuestEmailResult> {
  const email = normalizeGuestEmail(input.email);
  if (!email) return { ok: false, reason: "invalid_email" };
  const orderId = String(input.orderId ?? "").trim();
  const paymentKey = String(input.paymentKey ?? "").trim();
  if (!orderId || !paymentKey) return { ok: false, reason: "not_found" };

  const sb = getServiceSupabase();
  if (!sb) return { ok: false, reason: "not_found" };
  const { data, error } = await sb
    .from("payments")
    .select("id, order_id, user_email, status, provider_payment_key, metadata")
    .eq("order_id", orderId)
    .maybeSingle();
  if (error) throw new Error(`payments 조회 실패: ${error.message || "알 수 없는 오류"}`);
  if (!data) return { ok: false, reason: "not_found" };

  const row = data as Record<string, unknown>;
  const meta = (row.metadata ?? {}) as Record<string, unknown>;
  const current = typeof row.user_email === "string" ? row.user_email.trim().toLowerCase() : null;
  const verdict = guestAttachDecision({
    status: row.status as string | null,
    isGuest: Boolean(readGuestMeta(meta)),
    storedPaymentKey: row.provider_payment_key as string | null,
    givenPaymentKey: paymentKey,
    currentEmail: current,
    email,
  });
  if (!verdict.ok) return { ok: false, reason: verdict.reason };

  if (!current) {
    const { data: updated, error: upErr } = await sb
      .from("payments")
      .update({ user_email: email })
      .eq("id", row.id as string)
      .is("user_email", null)
      .select("id")
      .maybeSingle();
    if (upErr) throw new Error(`payments 갱신 실패: ${upErr.message || "알 수 없는 오류"}`);
    /* 그 사이 누가 먼저 붙였다면(동시 요청) 다시 읽어 같은 이메일인지만 본다 */
    if (!updated) {
      const { data: again } = await sb
        .from("payments")
        .select("user_email")
        .eq("id", row.id as string)
        .maybeSingle();
      const now = typeof again?.user_email === "string" ? again.user_email.trim().toLowerCase() : null;
      if (now && now !== email) return { ok: false, reason: "taken" };
    }
  }

  /* 켜는 것은 본인이 그 계정으로 로그인해 있을 때만(위 sessionEmail 주석) */
  const sessionEmail = input.sessionEmail?.trim().toLowerCase() || null;
  const applied = sessionEmail === email ? (await claimGuestPayments(email)) > 0 : false;

  /* [1003 · 리뷰 MEDIUM] 영수증·알림. 승인 시점에는 보낼 주소가 없어 건너뛴 상태였다
     (confirm-toss-order 의 applyPlanForPayment 가 userEmail 없으면 통보 전에 멈춘다).
     주소를 알게 된 지금 보낸다 — notifyPaymentSettled 는 receiptNotifiedAt 선점이라 두 번 가지 않는다.
     실패해도 연결 자체는 되돌리지 않는다(메일이 안 갔다고 이용권을 뺏을 이유가 없다). */
  try {
    const fresh = await getPaymentByOrderId(orderId);
    if (fresh) await notifyPaymentSettled(fresh, { kind: "one_off", guestPending: !applied });
  } catch (e) {
    logger.error("[payments:guest] 영수증 통보 실패", e);
  }
  /* 운영에서 info 는 출력되지 않는다 — 이 한 줄은 "결제 뒤 연결이 실제로 일어나는가"의 유일한 흔적이라 warn */
  logger.warn("[payments:guest] 결제 뒤 이메일 연결", { orderId, applied, session: Boolean(sessionEmail) });
  return { ok: true, applied, email };
}
