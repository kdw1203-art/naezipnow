import { NextRequest, NextResponse } from "next/server";
import { isTierOnSale } from "@/lib/subscriptions/sell-config";
import { safeAuth } from "@/lib/safe-auth";
import { assertCheckoutAllowed } from "@/lib/payments/checkout-guard";
import { getPlan } from "@/lib/subscriptions/plans";
import { isTossBillingEnabled } from "@/lib/payments/toss-billing";
import { startPendingSubscription, getLiveSubscriptionByEmail } from "@/lib/payments/billing-store";
import { applyRateLimit, AUTH_RATE_LIMIT } from "@/lib/rate-limit";

export const runtime = "nodejs";

/**
 * 자동결제 카드 등록 시작 — 서버가 customerKey(무작위 UUID)를 발급한다.
 *
 * 빌링 문서: customerKey 는 이메일처럼 유추 가능한 값 금지, 무작위 고유값 필수.
 * 그래서 클라이언트가 만들지 않고 서버(DB gen_random_uuid)가 만들어 내려 준다.
 * 금액도 단건 결제(toss/create)와 같은 원칙 — 서버가 계산·저장하고, 클라이언트
 * 금액은 믿지 않는다.
 *
 * 주기는 월간·연간뿐이다. 주간권(1,100원)은 "단건 결제·자동 반복청구 없음"으로
 * 심사에 고지한 상품이라 자동결제 대상이 아니다 — weekly 요청은 400.
 */

type Body = { tier?: string; billing?: string; mode?: string; consent?: unknown };

export async function POST(req: NextRequest) {
  const limited = await applyRateLimit(req, AUTH_RATE_LIMIT);
  if (limited) return limited;

  if (!isTossBillingEnabled()) {
    /* 정직한 대기 — 전자계약 승인 전에는 등록을 받지 않는다(등록만 되고 승인이
       전부 거절되는 화면을 만들지 않는다). */
    return NextResponse.json(
      { error: "자동결제는 아직 준비 중이에요. 지금은 단건 결제를 이용해 주세요." },
      { status: 503 },
    );
  }

  const session = await safeAuth();
  const userEmail = session?.user?.email?.trim().toLowerCase() ?? null;
  if (!userEmail) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  }
  /* [965] 전자상거래법 고지 게이트 — 모든 유료 레일에 같은 문(lib/payments/checkout-guard) */
  const blocked = assertCheckoutAllowed("payments:toss:billing:start");
  if (blocked) return blocked;

  const body = (await req.json().catch(() => ({}))) as Body;

  /* 카드 변경(재등록) — 살아 있는 구독의 customerKey 를 그대로 내려 준다.
     새 pending 행을 만들지 않는다(만들면 첫 결제가 또 나간다). 실제 교체는
     register 콜백의 mode=card 분기에서 결제 없이 수행된다. */
  if (body.mode === "card") {
    const live = await getLiveSubscriptionByEmail(userEmail);
    if (!live) {
      return NextResponse.json(
        { error: "변경할 자동결제 구독이 없어요. 먼저 자동결제를 등록해 주세요." },
        { status: 404 },
      );
    }
    return NextResponse.json({
      customerKey: live.customerKey,
      amount: live.amount,
      mode: "card",
      plan: live.plan,
      billing: live.billing,
    });
  }

  /* [1000] 정기결제 조건 동의 — 새 구독(첫 결제가 나가는 길)에만 요구한다. 카드 변경은
     이미 동의한 구독의 결제수단만 바꾸는 것이라 위에서 갈라졌다. 서버에 저장하지는
     않는다(약관 동의 기록은 결제 원장·이벤트가 아니라 화면 게이트의 몫) — 다만 동의
     없이 오는 요청은 화면을 우회한 것이므로 받지 않는다. */
  if (body.consent !== true) {
    return NextResponse.json(
      { error: "정기결제 조건을 확인하고 동의해야 카드 등록을 시작할 수 있어요." },
      { status: 400 },
    );
  }

  const tier = body.tier === "pro" || body.tier === "expert" ? body.tier : null;
  const billing = body.billing === "annual" ? "annual" : body.billing === "monthly" ? "monthly" : null;
  if (!tier || !billing) {
    return NextResponse.json(
      { error: "자동결제는 플러스·프로 플랜의 월간/연간 주기만 지원해요." },
      { status: 400 },
    );
  }
  /* [992] 판매 카탈로그 밖의 티어는 새 구독을 열지 않는다 — 화면에서 내린 상품이
     옛 링크로 팔리면 안 된다. 카드 변경(mode=card)은 위에서 이미 갈라져 기존 구독을 따른다. */
  if (!isTierOnSale(tier)) {
    return NextResponse.json(
      { error: "지금 판매하지 않는 플랜이에요. 요금제 화면에서 다시 골라 주세요." },
      { status: 400 },
    );
  }

  /* [1004 · 리뷰 HIGH] 이미 살아 있는 자동결제가 있는데 **다른 플랜**으로 새 구독을 열지 않는다.
     열어 주면 이런 일이 벌어진다: 연간 플러스(잔여 300일) 사용자가 프로를 누르면 18,900원이
     즉시 승인되고, applyPlanToUserByEmail 이 "다른 플랜"으로 보아 plan_expires_at 을
     오늘+30일로 덮어쓴다 — 잔여 300일이 환불도 일할 계산도 없이 사라지고, 옛 구독 행은
     조용히 canceled 로 접힌다. 유료 카드가 하나였을 때는 이 클릭 자체가 없었다(992).
     변경은 해지 뒤에 — 주간권 블록이 이미 같은 이유로 막고 있다(app/subscription/page.tsx). */
  const live = await getLiveSubscriptionByEmail(userEmail);
  if (live && (live.plan !== tier || live.billing !== billing)) {
    return NextResponse.json(
      {
        error:
          "이미 이용 중인 자동결제가 있어요. 구독 관리에서 지금 구독을 해지한 뒤 새 플랜을 시작해 주세요 — 지금 바꾸면 남은 기간이 사라집니다.",
        code: "LIVE_SUBSCRIPTION_EXISTS",
      },
      { status: 409 },
    );
  }

  const planDef = getPlan(tier);
  const amount =
    billing === "annual" && planDef.priceAnnualMonthly
      ? planDef.priceAnnualMonthly * 12
      : planDef.priceMonthly;
  if (!Number.isInteger(amount) || amount <= 0) {
    return NextResponse.json({ error: "결제 가능한 플랜이 아닙니다." }, { status: 400 });
  }

  try {
    const sub = await startPendingSubscription({ userEmail, plan: tier, billing, amount });
    /* billingKey 는 아직 없고, customerKey 는 requestBillingAuth 호출에 필요한
       본인 소유 값이라 내려 보낸다(다른 사용자의 키는 register 단계의 세션 대조가 막는다). */
    return NextResponse.json({
      customerKey: sub.customerKey,
      plan: sub.plan,
      billing: sub.billing,
      amount: sub.amount,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "unknown" },
      { status: 500 },
    );
  }
}
