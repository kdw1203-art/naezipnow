import Link from "next/link";
import type { Metadata } from "next";
import { PageShell } from "@/app/components/PageShell";
import { GuestGate } from "@/app/components/GuestGate";
import { safeAuth } from "@/lib/safe-auth";
import { claimGuestPayments } from "@/lib/payments/guest-claim";
import { loadMeProfile } from "@/lib/me/profile";
import { getServiceSupabase } from "@/lib/supabase/service";
import { isTossBillingEnabled } from "@/lib/payments/toss-billing";
import {
  getLatestSubscriptionByEmail,
  getLiveSubscriptionByEmail,
  toPublic,
} from "@/lib/payments/billing-store";
import { listSubscriptionEvents } from "@/lib/payments/subscription-events";
import {
  SUBSCRIPTION_EVENT_LABEL,
  SUBSCRIPTION_EVENT_TONE,
} from "@/lib/payments/subscription-event-labels";
import { CANCEL_REASONS, isCancelReason } from "@/lib/payments/cancel-reasons";
import { loadBillingHistory, PAYMENT_STATUS_LABEL } from "@/lib/subscriptions/billing-history";
import { billingLabel, isPaidPlan, planLabel } from "@/lib/subscriptions/labels";
import { billingDurationLabel, type PaymentBilling } from "@/lib/subscriptions/billing-periods";
import { formatKstDateTime, formatKstLongDate } from "@/lib/format/kst";
import { SubscriptionManageClient } from "./SubscriptionManageClient";
import { PaymentHistoryList, type HistoryRow } from "./PaymentHistoryList";

/**
 * [1000] 구독 관리 — 현재 플랜·자동결제 상태·해지/카드 변경·결제 내역·구독 이력·규정.
 *
 * 왜 /subscription 이 아니라 /my 아래인가: /subscription 은 **파는 화면**(요금제 카드·비교표)
 * 이고, 이미 산 사람의 관리(다음 결제일·해지·영수증)는 그 아래에 접혀 있었다. 관리는
 * 마이의 일이다. 화면은 실데이터만 — 없으면 정직한 빈 상태.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "구독 관리 | 내집나우",
  description: "현재 플랜·자동결제 상태·결제 내역·영수증·해지를 한곳에서 관리해요.",
  robots: { index: false, follow: false },
};

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

function supportHref(p: { orderId: string | null; amount: number | null; plan: string | null }): string {
  const q = new URLSearchParams({ category: "payment" });
  if (p.orderId) q.set("order", p.orderId);
  if (p.amount != null) q.set("amount", String(p.amount));
  if (p.plan) q.set("plan", p.plan);
  return `/support?${q}`;
}

function durationLabelOf(billing: string | null): string | null {
  if (billing === "weekly" || billing === "monthly" || billing === "annual") {
    return billingDurationLabel(billing as PaymentBilling);
  }
  return null;
}

const TONE_DOT: Record<"ok" | "warn" | "bad" | "muted", string> = {
  ok: "bg-success",
  warn: "bg-warning",
  bad: "bg-danger",
  muted: "bg-line-strong",
};

function eventDetailLine(event: string, detail: Record<string, unknown>): string | null {
  const parts: string[] = [];
  if (typeof detail.amount === "number") parts.push(`${detail.amount.toLocaleString("ko-KR")}원`);
  if (event === "canceled") {
    const r = detail.reason;
    if (isCancelReason(r)) parts.push(`사유: ${CANCEL_REASONS[r]}`);
  }
  if (event === "renewal_failed" || event === "suspended") {
    if (typeof detail.code === "string" && detail.code) parts.push(detail.code);
  }
  if (event === "card_changed" || event === "enrolled") {
    const c = `${typeof detail.cardCompany === "string" ? detail.cardCompany : ""} ${
      typeof detail.cardNumberMasked === "string" ? detail.cardNumberMasked : ""
    }`.trim();
    if (c) parts.push(c);
  }
  if (event === "notice_sent" && typeof detail.nextChargeAt === "string") {
    parts.push(`결제 예정 ${formatKstLongDate(detail.nextChargeAt)}`);
  }
  if ((event === "activated" || event === "renewed") && typeof detail.nextChargeAt === "string") {
    parts.push(`다음 결제 ${formatKstLongDate(detail.nextChargeAt)}`);
  }
  if (event === "deleted" && detail.via === "webhook") parts.push("토스페이먼츠에서 카드 등록 해제");
  return parts.length ? parts.join(" · ") : null;
}

export default async function MySubscriptionPage() {
  const session = await safeAuth();
  if (!session?.user?.email) {
    return (
      <PageShell>
        {/* [v4 · 규칙 1·3·5] 문장 제목 → 짧은 제목 + 사실 한 줄, 아래 카드 → 1px 선 행 */}
        <GuestGate
          title="로그인하고 구독 관리"
          desc="현재 플랜 · 자동결제 · 결제 내역 · 영수증 · 해지"
          pathname="/my/subscription"
        >
          <ul data-tone="mint" className="rise-in-1 divide-y divide-line border-y border-line">
            <li>
              <Link href="/subscription" className="press flex min-h-14 items-center justify-between gap-3 py-3 no-underline">
                <span className="t-body font-bold text-ink">플랜 둘러보기</span>
                <span aria-hidden="true" className="t-body text-text-3">
                  ›
                </span>
              </Link>
            </li>
          </ul>
        </GuestGate>
      </PageShell>
    );
  }

  const email = session.user.email.trim().toLowerCase();
  /* [1001] 비회원 결제 이용권 연결(대기 중인 것이 있을 때만 실제로 쓴다) */
  await claimGuestPayments(email).catch(() => 0);
  const billingOpen = isTossBillingEnabled();

  const [profile, planExpiresAt, liveSub, latestSub, history, events] = await Promise.all([
    loadMeProfile(email, { plan: (session.user as { plan?: string }).plan }),
    loadPlanExpiresAt(email),
    getLiveSubscriptionByEmail(email).catch(() => null),
    getLatestSubscriptionByEmail(email).catch(() => null),
    loadBillingHistory(email, 100),
    listSubscriptionEvents(email, 30),
  ]);

  const plan = profile.plan;
  const paid = isPaidPlan(plan);
  const autopay = liveSub ? toPublic(liveSub) : null;
  const expiresLabel = planExpiresAt ? formatKstLongDate(planExpiresAt) : null;
  const daysLeft =
    planExpiresAt && Number.isFinite(Date.parse(planExpiresAt))
      ? Math.max(0, Math.ceil((Date.parse(planExpiresAt) - Date.now()) / 86_400_000))
      : null;

  /* 히어로 3분기 — active / suspended / none */
  const heroState: "active" | "suspended" | "none" =
    autopay?.status === "active" ? "active" : autopay?.status === "suspended" ? "suspended" : "none";
  const badge =
    heroState === "active"
      ? "자동결제 이용 중"
      : heroState === "suspended"
        ? "자동결제 일시중단"
        : paid
          ? "이용권"
          : "무료";
  const cardText = autopay
    ? `${autopay.cardCompany ?? ""} ${autopay.cardNumberMasked ?? ""}`.trim() || null
    : null;

  const historyRows: HistoryRow[] = history.payments.map((p) => ({
    id: p.id,
    orderId: p.orderId,
    planLabel: planLabel(p.plan),
    billingLabel: billingLabel(p.billing),
    durationLabel: durationLabelOf(p.billing),
    amount: p.amount,
    status: p.status,
    statusLabel: p.status ? (PAYMENT_STATUS_LABEL[p.status] ?? p.status) : "—",
    method: p.method,
    receiptUrl: p.receiptUrl,
    atLabel: formatKstDateTime(p.paidAt ?? p.requestedAt) || "—",
    cancelledAtLabel: p.cancelledAt ? formatKstDateTime(p.cancelledAt) || null : null,
    supportHref: supportHref(p),
  }));

  const quickActions = [
    { href: "/subscription", label: "플랜 보기" },
    { href: "/subscription/payment-methods", label: "결제수단" },
    { href: "/support?category=payment", label: "문의" },
  ];

  /* [v4 · 한 화면 한 가지] 가운데 한 줄(760px): 제목 + 사실 한 줄 → 주인공(현재 플랜 이름 하나 + 상태 한 줄) →
     자동결제 관리 → 결제 내역 → 구독 이력 → 규정 요약(1px 선 행). 지운 것: 유리 히어로·아이콘 알약·알약 캡슐 ·
     섹션마다 카드 · 히어로의 다음 결제일·금액·카드 칸(자동결제 관리가 같은 사실을 말한다 — 한 번만). */
  const heroLine =
    heroState === "active" && autopay
      ? `다음 결제 ${autopay.nextChargeAt ? formatKstLongDate(autopay.nextChargeAt) : "—"} · ${autopay.amount.toLocaleString("ko-KR")}원/${autopay.billing === "annual" ? "년" : "월"}`
      : heroState === "suspended"
        ? `등록 카드 결제 실패 · 자동결제 멈춤${expiresLabel && paid ? ` · 이용권 ${expiresLabel}까지 유지` : ""}${cardText ? ` · 현재 카드 ${cardText}` : ""}`
        : paid
          ? expiresLabel
            ? `${expiresLabel}까지${daysLeft !== null ? `(${daysLeft}일 남음)` : ""} · 자동 반복청구 없음 · 만료 뒤 무료 전환`
            : "기간 없는 이용권(관리자 부여 등) · 문의는 고객센터"
          : /* [1004 · 리뷰] "AI 비교 리포트 무제한"은 집행되지 않는 약속이었다 — 요금표(PLAN_FEATURE_MATRIX)의 집행값 */
            `${planLabel("pro")}: AI 분석 월 50회 · AI 임장노트 자동정리 월 30회`;

  return (
    <PageShell>
      <div className="mx-auto flex w-full max-w-[760px] flex-col gap-8">
        <header className="flex flex-col gap-0.5">
          <h1 className="t-title text-ink">구독 관리</h1>
          <p className="t-sub text-text-3">
            {badge} · 결제 내역 {history.ok ? `${history.payments.length}건` : "조회 실패"}
          </p>
        </header>

        {/* ── (a) 주인공 — 현재 플랜 이름 하나 + 상태 한 줄 ── */}
        <section aria-labelledby="sub-hero-title" className="rise-in flex flex-col gap-3">
          <div className="flex flex-col gap-0.5">
            <p id="sub-hero-title" className="t-sub text-text-3">
              현재 플랜
            </p>
            <p className="t-display text-ink">{planLabel(plan)}</p>
            <p className={`t-sub ${heroState === "suspended" ? "font-bold text-warning" : "text-text-2"}`}>{heroLine}</p>
          </div>
          {heroState === "suspended" && (
            <Link
              href={`/subscription/billing?tier=${autopay!.plan}&billing=${autopay!.billing}&mode=card`}
              className="btn-primary btn-md self-start no-underline"
            >
              카드 다시 등록
            </Link>
          )}
          <nav aria-label="구독 바로가기" className="flex flex-wrap gap-x-4 t-sub">
            {quickActions.map((q) => (
              <a key={q.href} href={q.href} className="inline-flex min-h-10 items-center font-bold text-primary no-underline">
                {q.label} ›
              </a>
            ))}
          </nav>
        </section>

        {/* [1004] 프로 전용 혜택의 **입구**. 요금표는 "CSV 내보내기 — 프로 가능"이라고 적는데
            실제 라우트(/api/inspection/export, requirePlan("pdf_export") = 프로)로 가는 버튼이
            화면 어디에도 없었다. 적어 놓고 누를 데가 없으면 그것도 지키지 않은 약속이다. */}
        {plan === "expert" && (
          <section aria-labelledby="export-title" className="rise-in-1 flex flex-col gap-2">
            <h2 id="export-title" className="t-section text-ink">
              임장 기록 CSV 내보내기
            </h2>
            <p className="t-sub text-text-3">
              {planLabel("expert")} 이용 중 · 임장 세션 기록 최근 100건 · 엑셀·구글 시트에서 열림
            </p>
            <a
              href="/api/inspection/export?format=csv"
              download
              className="btn-outline btn-md self-start no-underline"
            >
              CSV로 내려받기
            </a>
          </section>
        )}

        {/* ── (b) 자동결제 관리 ── */}
        <section id="manage" aria-labelledby="manage-title" className="rise-in-1 flex scroll-mt-24 flex-col gap-3">
          <div className="flex items-center justify-between gap-2">
            <h2 id="manage-title" className="t-section text-ink">자동결제 관리</h2>
            {autopay && (
              <span className="t-caption font-bold text-text-3">
                {autopay.status === "active" ? "정상" : "일시중단"}
              </span>
            )}
          </div>
          <SubscriptionManageClient
            autopay={
              autopay
                ? {
                    plan: autopay.plan,
                    billing: autopay.billing,
                    amount: autopay.amount,
                    status: autopay.status,
                    cardCompany: autopay.cardCompany,
                    cardNumberMasked: autopay.cardNumberMasked,
                    nextChargeAt: autopay.nextChargeAt,
                    lastError: autopay.lastError,
                  }
                : null
            }
            billingOpen={billingOpen}
            planExpiresAt={planExpiresAt}
            currentPlan={plan}
            lastSubscription={
              !autopay && latestSub
                ? {
                    status: latestSub.status,
                    canceledAt: latestSub.canceledAt,
                    plan: latestSub.plan,
                    billing: latestSub.billing,
                  }
                : null
            }
          />
        </section>

        {/* ── (c) 결제 내역 ── */}
        <section aria-labelledby="history-title" className="rise-in-2 flex flex-col gap-2">
          <div className="flex items-baseline justify-between gap-2">
            <h2 id="history-title" className="t-section text-ink">결제 내역</h2>
            {history.ok && history.payments.length > 0 && (
              <span className="t-caption text-text-3">최근 {history.payments.length}건</span>
            )}
          </div>
          <PaymentHistoryList ok={history.ok} rows={historyRows} />
        </section>

        {/* ── (d) 구독 이력 타임라인 ── */}
        <section aria-labelledby="timeline-title" className="rise-in-3 flex flex-col gap-2">
          <h2 id="timeline-title" className="t-section text-ink">구독 이력</h2>
          {events.length === 0 ? (
            /* [v4 · 규칙 8·10] 가운데 정렬 회색 상자 → 한 줄 */
            <p className="border-y border-line py-3 t-sub text-text-3">자동결제 이력 없음 · 카드 등록 뒤 등록·결제·변경 기록</p>
          ) : (
            <ol className="relative flex flex-col gap-0 border-l border-line pl-4">
              {events.map((ev) => (
                <li key={ev.id} className="relative py-2">
                  <span
                    aria-hidden="true"
                    className={`absolute -left-[21px] top-3.5 h-2.5 w-2.5 rounded-full ring-2 ring-surface ${TONE_DOT[SUBSCRIPTION_EVENT_TONE[ev.event]]}`}
                  />
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                    <span className="t-body font-bold text-ink">{SUBSCRIPTION_EVENT_LABEL[ev.event]}</span>
                    <time dateTime={ev.createdAt} className="t-caption text-text-3">
                      {formatKstDateTime(ev.createdAt) || "—"}
                    </time>
                  </div>
                  {(() => {
                    const line = eventDetailLine(ev.event, ev.detail);
                    return line ? <p className="mt-0.5 t-sub text-text-2">{line}</p> : null;
                  })()}
                </li>
              ))}
            </ol>
          )}
        </section>

        {/* ── (e) 환불·해지 규정 요약 ── */}
        <section aria-labelledby="policy-title" className="rise-in-3 mb-2 flex flex-col gap-2">
          <h2 id="policy-title" className="t-section text-ink">환불·해지 규정 요약</h2>
          <ul data-tone="sand" className="flex flex-col divide-y divide-line border-y border-line t-sub text-text-2 [&>li]:py-2.5">
            <li>
              <b className="text-ink">자동결제 해지</b>는 위 자동결제 관리에서 즉시 — 다음 결제일부터 청구되지 않고,
              이미 결제한 기간은 만료일까지 그대로 이용돼요.
            </li>
            <li>
              <b className="text-ink">환불(청약철회)</b>은 결제 후 7일 이내 전액 — 결제 내역의 <b>환불·문의</b>로 접수하면
              영업일 1일 이내 확인 안내를 드려요. 기준은{" "}
              <Link href="/legal/terms#refund" className="inline-block py-[5px] font-bold text-primary underline underline-offset-2">
                약관 제8조
              </Link>
              .
            </li>
            <li>
              <b className="text-ink">영수증(매출전표)</b>은 결제 내역의 <b>영수증 보기</b> — 링크가 없는 결제는{" "}
              <b>영수증 요청</b>으로 고객센터가 발급해 드려요.
            </li>
            <li>
              단건 이용권(주간권 등)은 자동 반복청구가 없어 해지할 것이 없고, 만료 뒤 무료 플랜으로 돌아가요.
            </li>
            <li>
              결제수단·안전 안내는{" "}
              <Link href="/subscription/payment-methods" className="inline-block py-[5px] font-bold text-primary underline underline-offset-2">
                결제수단 안내
              </Link>
              , 그 밖의 문의는{" "}
              <Link href="/support?category=payment" className="inline-block py-[5px] font-bold text-primary underline underline-offset-2">
                고객센터
              </Link>
              .
            </li>
          </ul>
        </section>
      </div>
    </PageShell>
  );
}
