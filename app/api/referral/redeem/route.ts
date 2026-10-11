import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { safeAuth } from "@/lib/safe-auth";
import { getReferralByCode, redeemReferral } from "@/lib/referral/store";
import { getServiceSupabase } from "@/lib/supabase/service";
import { appendInboxNotification } from "@/lib/notifications/inbox";
import { formatKstDate } from "@/lib/format/kst";
import { EARN_RULES } from "@/lib/points/catalog";
import { logger } from "@/lib/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * [1056 · A8] 초대 성사는 양쪽 300P 를 적립하면서 아무에게도 알리지 않았다 — 추천인은 지갑 내역을
 * 열어 봐야 알았다. 리딤이 끝나면 추천인 수신함에 한 줄 남긴다. "지급됐을 때만": 추천인 적립은
 * store.redeemReferral 안에서 refId=`referee:<피추천인>` 로 원장에 기록되므로 그 행의 존재를 확인한다
 * (dailyCap 5 초과·원장 오류로 추천인 적립이 건너뛰어진 경우엔 보내지 않는다).
 * 알림 실패는 로그만 — 리딤 응답을 바꾸지 않는다.
 */
async function notifyReferrer(code: string, refereeEmail: string): Promise<void> {
  try {
    const ref = await getReferralByCode(code);
    const sb = getServiceSupabase();
    if (!ref || !sb) return;
    const { count, error } = await sb
      .from("point_ledger")
      .select("id", { count: "exact", head: true })
      .eq("user_email", ref.referrerEmail)
      .eq("reason", "referral")
      .eq("ref_id", `referee:${refereeEmail}`);
    if (error || !count) return;
    const points = EARN_RULES.referral.points;
    await appendInboxNotification({
      userEmail: ref.referrerEmail,
      title: `친구 초대 성사 · +${points}P`,
      body: `${formatKstDate(new Date())} · 초대 코드로 가입한 친구 1명 · ${points}P 적립`,
      actionUrl: "/my/points?tab=referral",
    });
  } catch (e) {
    logger.warn("[referral/redeem] 추천인 알림 실패", e);
  }
}

/**
 * POST /api/referral/redeem — body { code }.
 * 현재 로그인 사용자를 피추천인으로 리딤한다.
 * 자기추천/중복 등 방어는 store.redeemReferral 이 담당한다.
 *
 * → { ok, reason? } — 단, 2xx 는 **결론이 난 경우에만** 준다.
 *   클라이언트(components/ReferralRedeem)는 2xx 를 "이 초대는 끝났다"로 읽고
 *   ref_code 쿠키를 지운다. 그래서 DB 가 잠깐 안 될 때까지 2xx 로 답하면,
 *   조회 실패 한 번에 초대가 영구히 사라진다 — 초대한 쪽도 받은 쪽도 300P 를
 *   못 받고, 다시 시도할 방법도 없다. 일시적 실패는 503 으로 돌려 쿠키를
 *   남기고, 다음 마운트에서 재시도되게 한다.
 * → 비로그인 401 (아직 리딤 불가 → 쿠키 유지)
 */

/** 다시 시도하면 결과가 달라질 수 있는 사유 — 쿠키를 지우면 안 된다. */
const RETRYABLE_REASONS = new Set(["unavailable", "db", "error"]);
export async function POST(req: NextRequest) {
  const session = await safeAuth();
  const email = session?.user?.email ?? null;
  if (!email) {
    return NextResponse.json(
      { ok: false, reason: "unauthenticated" },
      { status: 401 },
    );
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, reason: "invalid" }, { status: 400 });
  }

  const code = typeof body.code === "string" ? body.code : "";
  if (!code) {
    return NextResponse.json({ ok: false, reason: "invalid" }, { status: 400 });
  }

  const result = await redeemReferral(code, email);
  if (!result.ok && result.reason && RETRYABLE_REASONS.has(result.reason)) {
    return NextResponse.json(
      { ok: false, reason: result.reason },
      { status: 503, headers: { "Retry-After": "30" } },
    );
  }
  /* [1057] 기존 계정(가입 7일 초과)의 리딤 — 결론이 난 상태(409). 클라이언트는 쿠키를 지우고 토스트는 띄우지 않는다. */
  if (!result.ok && result.reason === "not_new") {
    return NextResponse.json(
      { ok: false, reason: "not_new", error: "초대 코드는 가입 7일 안에만 적용" },
      { status: 409 },
    );
  }
  /* [1056 · A8] 성사 시 추천인 수신함 알림(await — 서버리스는 응답 뒤 작업을 보장하지 않는다) */
  if (result.ok) await notifyReferrer(code, email);
  /* awarded: 피추천인(지금 로그인한 사람)에게 실제 지급된 포인트 — 클라이언트 토스트 문구용 */
  return NextResponse.json({ ok: result.ok, reason: result.reason, awarded: result.awarded ?? 0 });
}
