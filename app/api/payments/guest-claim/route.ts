import { NextRequest, NextResponse } from "next/server";
import { attachGuestOrderEmail } from "@/lib/payments/guest-claim";
import { safeAuth } from "@/lib/safe-auth";
import { rateLimit, getClientIp, tooManyRequests } from "@/lib/rate-limit";
import { logger } from "@/lib/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/payments/guest-claim — 이메일 없이 결제한 비회원이 결제 뒤 이메일을 알려 준다.
 *
 * [1003] 비회원 주간권 결제에서 이메일 칸을 선택으로 바꿨다(토스 심사자는 타이핑 앞에서 멈췄다).
 * 그러면 승인 시점에 "누구의 이용권인가"를 모르는 결제가 생긴다 — 그 답을 결제 **뒤에** 받는다.
 *
 * 열쇠는 `paymentKey` 다. 주문번호는 비밀이 아니지만(주소창·메일에 남는다) paymentKey 는
 * 결제창을 통과한 브라우저에만 돌아온다. 그래서 { orderId, paymentKey } 쌍이 맞을 때만 붙인다.
 * 여기서 이용권이 바로 켜지는 것은 그 이메일의 계정이 이미 있을 때다. 없으면 그대로 대기하고,
 * 그 이메일로 가입하는 순간 `ensureAppUserRow` 가 연결한다(lib/payments/guest-claim.ts).
 */
export async function POST(req: NextRequest) {
  /* 한 사람이 여러 주문번호를 훑으며 paymentKey 를 맞춰 보는 것을 막는다 — 시도 자체를 좁힌다 */
  const rl = rateLimit(`guest-claim:${getClientIp(req)}`, { limit: 10, windowMs: 10 * 60_000 });
  if (!rl.ok) return tooManyRequests(rl.retryAfterSec);

  const body = (await req.json().catch(() => null)) as {
    orderId?: unknown;
    paymentKey?: unknown;
    email?: unknown;
  } | null;
  if (!body) return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });

  const orderId = String(body.orderId ?? "").trim().slice(0, 64);
  const paymentKey = String(body.paymentKey ?? "").trim().slice(0, 200);
  const email = String(body.email ?? "").trim().slice(0, 254);
  if (!orderId || !paymentKey) {
    return NextResponse.json({ error: "결제 정보를 찾을 수 없어요." }, { status: 400 });
  }

  try {
    /* [1003 · 리뷰 HIGH] 이용권을 켜는 것은 그 계정으로 로그인해 있을 때만 —
       세션이 없으면 주문에 이메일만 붙고, 그 이메일로 가입/로그인할 때 켜진다. */
    const session = await safeAuth();
    const sessionEmail = session?.user?.email ?? null;
    const result = await attachGuestOrderEmail({ orderId, paymentKey, email, sessionEmail });
    if (result.ok) {
      return NextResponse.json({ ok: true, applied: result.applied, email: result.email });
    }
    /* 무엇이 틀렸는지는 말하되, 남의 주문 상태를 읽어 내는 도구가 되지 않게 묶는다.
       [1003 · 리뷰 MEDIUM] 문구만 묶고 code 로 사유를 그대로 돌려주면 주문번호를 훑어
       "존재하는 주문"과 그 상태를 가려낼 수 있다 — 사용자가 행동을 바꿀 수 있는 둘만 남긴다. */
    const known = result.reason === "invalid_email" || result.reason === "taken";
    const message =
      result.reason === "invalid_email"
        ? "이메일 주소를 정확히 적어 주세요."
        : result.reason === "taken"
          ? "이 결제에는 이미 다른 이메일이 연결돼 있어요. 고객센터로 문의해 주세요."
          : "이 결제에 이메일을 연결하지 못했어요. 결제 직후 화면에서만 연결할 수 있어요.";
    if (!known) logger.warn("[payments:guest-claim] 연결 거절", { orderId, reason: result.reason });
    const status = result.reason === "invalid_email" ? 400 : 409;
    return NextResponse.json(
      { error: message, code: known ? result.reason : "not_claimable" },
      { status },
    );
  } catch (e) {
    logger.error("[payments:guest-claim]", e);
    return NextResponse.json(
      { error: "지금 연결하지 못했어요. 잠시 후 다시 시도해 주세요." },
      { status: 503 },
    );
  }
}
