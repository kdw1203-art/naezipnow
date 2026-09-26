import { NextResponse } from "next/server";
import { safeAuth } from "@/lib/safe-auth";
import { getServiceSupabase } from "@/lib/supabase/service";
import { loadMeProfile } from "@/lib/me/profile";
import {
  loadBillingHistory,
  PAYMENT_PLAN_LABEL,
  PAYMENT_STATUS_LABEL,
} from "@/lib/subscriptions/billing-history";
import { getLiveSubscriptionByEmail, toPublic } from "@/lib/payments/billing-store";
import { isTossBillingEnabled } from "@/lib/payments/toss-billing";
import { billingLabel, planLabel } from "@/lib/subscriptions/labels";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * [1007] GET /api/subscriptions/summary — 요금제 화면 하단 "내 구독 · 최근 결제" 패널의 자료.
 *
 * 왜: /subscription 은 세션·DB 를 서버에서 읽어 force-dynamic 이었고(하루 200회 함수 호출,
 * 사람 방문 한 자릿수), 페이지를 ISR 로 굳히면서 로그인 사용자에게만 보이던 이 패널을
 * 클라이언트(app/subscription/BillingPanel.tsx)가 여기서 받는다. 예전 서버 컴포넌트가 읽던
 * 것과 **같은 함수**(loadBillingHistory · getLiveSubscriptionByEmail · plan_expires_at)를 쓴다.
 * 라벨(상태·플랜·주기)은 서버에서 붙여 보낸다 — 라벨 단일 출처(billing-history·labels)가
 * server-only 모듈과 한 파일이라 클라이언트가 직접 import 하면 안 된다.
 * 응답은 공개 필드뿐이다 — billingKey·customerKey 는 저장소 밖으로 나오지 않는다(toPublic).
 */

/** [966] 단건 이용권 만료 — 구독 관리 헤더·해지 문구에 "언제까지" 를 적기 위해 */
async function loadPlanExpiresAt(email: string): Promise<string | null> {
  const sb = getServiceSupabase();
  if (!sb) return null;
  try {
    const { data } = await sb
      .from("app_users")
      .select("plan_expires_at")
      .eq("email", email)
      .maybeSingle();
    return data?.plan_expires_at ? String(data.plan_expires_at) : null;
  } catch {
    return null;
  }
}

/** 최근 3건 + "더 있음" 판정용 1건 — 예전 BillingPanel(RECENT=3)과 같은 수 */
const RECENT = 3;

export async function GET() {
  const session = await safeAuth();
  const rawEmail = session?.user?.email;
  if (!rawEmail) {
    return NextResponse.json(
      { error: "로그인이 필요합니다." },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }
  const email = rawEmail.trim().toLowerCase();
  const [profile, planExpiresAt, history, liveAutopay] = await Promise.all([
    loadMeProfile(email, {
      name: session.user.name,
      plan: (session.user as { plan?: string }).plan,
      role: (session.user as { role?: string }).role,
    }),
    loadPlanExpiresAt(email),
    loadBillingHistory(email, RECENT + 1),
    getLiveSubscriptionByEmail(email).catch(() => null),
  ]);
  const plan = (profile.plan ?? "free") as "free" | "pro" | "expert";
  const payments = history.payments.slice(0, RECENT).map((p) => ({
    id: p.id,
    orderId: p.orderId,
    plan: p.plan,
    planLabel: p.plan ? (PAYMENT_PLAN_LABEL[p.plan] ?? p.plan) : "—",
    billingLabel: billingLabel(p.billing),
    amount: p.amount,
    status: p.status,
    statusLabel: p.status ? (PAYMENT_STATUS_LABEL[p.status] ?? p.status) : null,
    receiptUrl: p.receiptUrl,
    at: p.paidAt ?? p.requestedAt,
  }));
  return NextResponse.json(
    {
      plan,
      planLabel: PAYMENT_PLAN_LABEL[plan] ?? planLabel(plan),
      planExpiresAt,
      ok: history.ok,
      payments,
      hasMore: history.payments.length > RECENT,
      autopay: liveAutopay ? toPublic(liveAutopay) : null,
      billingOpen: isTossBillingEnabled(),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
