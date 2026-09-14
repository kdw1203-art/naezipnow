import "server-only";
import { getServiceSupabase } from "@/lib/supabase/service";
import { logger } from "@/lib/log";
import {
  isSubscriptionEventType,
  type SubscriptionEventType,
} from "@/lib/payments/subscription-event-labels";

/**
 * [1000] 자동결제 구독 이력 — public.subscription_events (서비스롤 전용).
 *
 * billing_subscriptions 는 "지금 상태" 한 줄뿐이라 언제 등록·갱신·실패·해지됐는지를
 * 화면에서 보여 줄 수 없었다. 여기에 사건을 한 줄씩 남겨 /my/subscription 타임라인이
 * 읽는다. 기록은 곁가지다 — **절대 던지지 않는다**(기록이 실패해도 결제·해지 본작업을
 * 막으면 안 된다). 실패는 로그로만.
 */

export type SubscriptionEventRow = {
  id: string;
  subscriptionId: string | null;
  event: SubscriptionEventType;
  detail: Record<string, unknown>;
  createdAt: string;
};

export async function recordSubscriptionEvent(input: {
  subscriptionId: string | null;
  userEmail: string;
  event: SubscriptionEventType;
  detail?: Record<string, unknown>;
}): Promise<void> {
  try {
    const sb = getServiceSupabase();
    if (!sb) return;
    const email = input.userEmail.trim().toLowerCase();
    if (!email) return;
    const { error } = await sb.from("subscription_events").insert({
      subscription_id: input.subscriptionId,
      user_email: email,
      event: input.event,
      detail: input.detail ?? {},
    });
    if (error) {
      logger.warn("[subscription-events] 기록 실패", { event: input.event, message: error.message });
    }
  } catch (e) {
    logger.warn("[subscription-events] 기록 예외", {
      event: input.event,
      message: e instanceof Error ? e.message : String(e),
    });
  }
}

/** 최근 이력(최신순). 조회 실패는 빈 배열 — 화면은 "이력 없음" 과 구분할 필요가 없다(타임라인은 보조). */
export async function listSubscriptionEvents(
  userEmail: string,
  limit = 30,
): Promise<SubscriptionEventRow[]> {
  try {
    const sb = getServiceSupabase();
    if (!sb) return [];
    const email = userEmail.trim().toLowerCase();
    if (!email) return [];
    const { data, error } = await sb
      .from("subscription_events")
      .select("id, subscription_id, event, detail, created_at")
      .eq("user_email", email)
      .order("created_at", { ascending: false })
      .limit(Math.max(1, Math.min(200, limit)));
    if (error) {
      logger.warn("[subscription-events] 조회 실패", error.message);
      return [];
    }
    const rows: SubscriptionEventRow[] = [];
    for (const r of (data ?? []) as Record<string, unknown>[]) {
      const ev = r.event;
      if (!isSubscriptionEventType(ev)) continue;
      rows.push({
        id: String(r.id ?? ""),
        subscriptionId: r.subscription_id != null ? String(r.subscription_id) : null,
        event: ev,
        detail: r.detail && typeof r.detail === "object" ? (r.detail as Record<string, unknown>) : {},
        createdAt: String(r.created_at ?? ""),
      });
    }
    return rows;
  } catch (e) {
    logger.warn("[subscription-events] 조회 예외", e instanceof Error ? e.message : String(e));
    return [];
  }
}
