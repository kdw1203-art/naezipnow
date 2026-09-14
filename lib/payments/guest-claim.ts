import "server-only";

import { getServiceSupabase } from "@/lib/supabase/service";
import { applyPlanToUserByEmail } from "@/lib/billing/apply-plan";
import { BILLING_DURATION_DAYS } from "@/lib/subscriptions/billing-periods";
import { readGuestMeta } from "@/lib/payments/guest-order";
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
