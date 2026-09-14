import Link from "next/link";
import {
  loadBillingHistory,
  PAYMENT_STATUS_LABEL,
  PAYMENT_PLAN_LABEL,
} from "@/lib/subscriptions/billing-history";
import { BillingAutopayCard } from "./BillingAutopayCard";
import { isTossBillingEnabled } from "@/lib/payments/toss-billing";
import { getLiveSubscriptionByEmail, toPublic } from "@/lib/payments/billing-store";
import { billingLabel } from "@/lib/subscriptions/labels";

/**
 * 구독 요약 · 최근 결제 (요금제 화면 하단)
 *
 * 이 패널을 만든 이유(E1)는 기능이 모자라서가 아니라 **약속이 어긋나 있었기** 때문이다.
 * `/my` 는 유료 사용자에게 "결제일·플랜 변경·해지는 구독 페이지에서 관리해요"라고
 * 적어 두고 `/subscription` 으로 보냈는데, 그 페이지에는 요금제 카드와 비교표뿐이었다.
 *
 * [1000] 관리의 정본은 이제 /my/subscription(구독 관리) 이다 — 해지(사유)·카드 변경·
 * 전체 결제 내역·영수증·구독 이력·규정이 거기 있다. 여기는 파는 화면 아래의 요약이라
 * 최근 3건과 자동결제 상태만 보여 주고 나머지는 구독 관리로 보낸다.
 *
 * 사실 정정(예전 헤더 주석): "갱신일(만료일)을 표시하지 않는 이유 — 저장되는 곳이 없다" 는
 * 옛 사실이다. 지금은 `app_users.plan_expires_at` 이 단건 이용권의 만료를,
 * `billing_subscriptions.next_charge_at` 이 자동결제의 다음 청구일을 저장한다. 둘 다 여기서 보여 준다.
 */

const cell = "t-sub text-text-2";
const RECENT = 3;

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "—";
  return new Date(t).toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fmtWon(n: number | null): string {
  if (n === null || !Number.isFinite(n)) return "—";
  return `${n.toLocaleString("ko-KR")}원`;
}

/* [966] 주기 표기는 lib/subscriptions/labels.billingLabel 단일 출처 */
const fmtBilling = billingLabel;

export async function BillingPanel({
  email,
  currentPlan,
  planExpiresAt = null,
}: {
  email: string;
  currentPlan: "free" | "pro" | "expert";
  /** [966] app_users.plan_expires_at — 단건 이용권의 만료(남은 일수 표기) */
  planExpiresAt?: string | null;
}) {
  /* 최근 3건 + "더 있음" 판정용 1건 */
  const { ok, payments: fetched } = await loadBillingHistory(email, RECENT + 1);
  const payments = fetched.slice(0, RECENT);
  const hasMore = fetched.length > RECENT;

  /* 자동결제(토스 빌링) 구독 — 있으면 상태·다음 결제일을 보여 준다. next_charge_at 은
     billing_subscriptions 에 실제로 저장되는 값이다. 빌링 미개방(전자계약 전) 상태에서는
     조회 자체가 빈손이라 아무것도 안 그린다. */
  const liveAutopay = await getLiveSubscriptionByEmail(email.trim().toLowerCase()).catch(
    () => null,
  );
  const autopay = liveAutopay ? toPublic(liveAutopay) : null;
  const billingOpen = isTossBillingEnabled();

  const expiry = planExpiresAt ? new Date(planExpiresAt) : null;
  const expiryValid = expiry !== null && Number.isFinite(expiry.getTime());
  const daysLeft = expiryValid
    ? Math.max(0, Math.ceil((expiry!.getTime() - Date.now()) / 86_400_000))
    : null;
  const expiryLabel = expiryValid
    ? expiry!.toLocaleDateString("ko-KR", { month: "long", day: "numeric", timeZone: "Asia/Seoul" })
    : null;

  const supportHref = (p: { orderId: string | null; amount: number | null; plan: string | null }) => {
    const q = new URLSearchParams({ category: "payment" });
    if (p.orderId) q.set("order", p.orderId);
    if (p.amount != null) q.set("amount", String(p.amount));
    if (p.plan) q.set("plan", p.plan);
    return `/support?${q}`;
  };

  return (
    <section
      id="billing"
      className="rise-in-3 card mx-auto mt-8 w-full max-w-[1080px] scroll-mt-24 rounded-[18px] px-[22px] py-5"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="t-section text-ink">내 구독 · 최근 결제</h2>
        <span className="t-sub text-text-3">
          현재 플랜 · {PAYMENT_PLAN_LABEL[currentPlan] ?? currentPlan}
          {currentPlan !== "free" && expiryLabel && !autopay
            ? ` · ${expiryLabel}까지${daysLeft !== null ? ` (${daysLeft}일 남음)` : ""}`
            : ""}
        </span>
      </div>

      {/* 자동결제 이용 중이면 상태 카드를 먼저 */}
      {autopay && (
        <div className="mt-3">
          <BillingAutopayCard
            plan={autopay.plan}
            billing={autopay.billing}
            amount={autopay.amount}
            status={autopay.status}
            cardCompany={autopay.cardCompany}
            cardNumberMasked={autopay.cardNumberMasked}
            nextChargeAt={autopay.nextChargeAt}
            planExpiresAt={expiryValid ? expiry!.toISOString() : null}
          />
        </div>
      )}

      <div className="mt-3">
        {!ok ? (
          /* 조회 실패를 "내역 없음"으로 보여 주면, 결제한 사람이 자기 기록이
             사라졌다고 오해한다. 두 상태는 반드시 구분한다. */
          <div className="rounded-xl bg-warning-soft px-4 py-5 t-sub text-text-2">
            결제 내역을 지금 불러오지 못했어요. 잠시 후 새로고침해 주세요 — 결제 기록이
            사라진 것은 아닙니다.
          </div>
        ) : payments.length === 0 ? (
          <div className="rounded-xl bg-bg px-4 py-6 text-center t-sub text-text-3">
            아직 결제 내역이 없어요.
            <br />
            결제가 완료되면 금액·이용 기간·영수증 링크가 구독 관리에 쌓입니다.
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            {payments.map((p) => (
              <li
                key={p.id}
                className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-xl border border-line px-3.5 py-2.5"
              >
                <span className="flex min-w-0 flex-col">
                  <span className="t-body font-bold text-ink">
                    {p.plan ? (PAYMENT_PLAN_LABEL[p.plan] ?? p.plan) : "—"} · {fmtBilling(p.billing)}
                  </span>
                  <span className={cell}>{fmtDate(p.paidAt ?? p.requestedAt)}</span>
                </span>
                <span className="flex items-center gap-2">
                  <StatusChip status={p.status} />
                  <span className="t-body font-extrabold text-ink t-num">{fmtWon(p.amount)}</span>
                  {p.receiptUrl ? (
                    <a
                      href={p.receiptUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-block py-[5px] t-sub font-bold text-primary underline underline-offset-2"
                    >
                      영수증
                    </a>
                  ) : p.status === "paid" ? (
                    <Link
                      href={supportHref(p)}
                      className="inline-block py-[5px] t-sub text-text-3 underline underline-offset-2"
                    >
                      영수증 요청
                    </Link>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* [1000] 관리의 정본으로 — 전체 내역·영수증·해지·카드 변경·구독 이력 */}
      <Link
        href="/my/subscription"
        className="tile mt-3 flex items-center justify-between rounded-xl bg-primary-soft px-4 py-3 no-underline"
      >
        <span className="flex min-w-0 flex-col">
          <span className="t-body font-extrabold text-ink">전체 결제 내역 · 구독 관리</span>
          <span className="t-sub text-text-2">
            {hasMore ? "이전 결제 더 보기 · " : ""}영수증 · 해지 · 카드 변경 · 구독 이력
          </span>
        </span>
        <span className="shrink-0 t-body font-extrabold text-primary">→</span>
      </Link>

      <div className="mt-4 flex flex-col gap-2 rounded-xl bg-bg px-4 py-3">
        <div className="t-sub font-extrabold text-ink">플랜 변경 · 해지 · 환불</div>
        {autopay ? (
          <p className="t-sub text-text-2">
            자동결제 해지는{" "}
            <Link href="/my/subscription#manage" className="inline-block py-[5px] font-bold text-primary underline underline-offset-2">
              구독 관리
            </Link>
            에서 즉시 처리돼요 — 다음 결제일에 청구되지 않고, 이미 결제한 기간은 만료일까지
            이용할 수 있어요. 결제 후 7일 이내 청약철회(환불)는 결제 내역의 <b>환불·문의</b>로
            접수해 주세요. 처리 기준은{" "}
            <Link href="/legal/terms#refund" className="inline-block py-[5px] font-bold text-primary underline underline-offset-2">
              약관 제8조
            </Link>
            .
          </p>
        ) : (
          <p className="t-sub text-text-2">
            {currentPlan !== "free" && expiryLabel ? (
              <>
                지금 이용권은 <b>{expiryLabel}까지</b>이고 자동 반복청구가 없어 그 뒤에는 추가
                청구 없이 무료 플랜으로 돌아가요.{" "}
              </>
            ) : null}
            환불(결제 후 7일 이내 청약철회)·문의는 결제 내역의 <b>환불·문의</b> 또는{" "}
            <Link href="/support?category=payment" className="inline-block py-[5px] font-bold text-primary underline underline-offset-2">
              고객센터
            </Link>
            로 접수해 주세요. 접수 후 <b>영업일 1일 이내</b> 확인 안내. 처리 기준은{" "}
            <Link href="/legal/terms#refund" className="inline-block py-[5px] font-bold text-primary underline underline-offset-2">
              약관 제8조
            </Link>
            .
          </p>
        )}
        {billingOpen && !autopay && currentPlan !== "free" && (
          <p className="t-sub text-text-2">
            매번 결제하기 번거롭다면{" "}
            <Link
              href={`/subscription/billing?tier=${currentPlan}&billing=monthly`}
              className="inline-block py-[5px] font-bold text-primary underline underline-offset-2"
            >
              자동결제 등록
            </Link>
            으로 전환할 수 있어요.
          </p>
        )}
        <p className="t-sub text-text-3">
          상위 플랜으로 올리는 것은 위 요금제 카드에서 바로 결제하면 적용됩니다.
        </p>
      </div>
    </section>
  );
}

const STATUS_TONE: Record<string, string> = {
  paid: "bg-primary-soft text-primary",
  done: "bg-primary-soft text-primary",
  requested: "bg-bg text-text-2",
  failed: "bg-danger-soft text-danger",
  cancelled: "bg-bg text-text-3",
  canceled: "bg-bg text-text-3",
  refunded: "bg-warning-soft text-warning",
};

function StatusChip({ status }: { status: string | null }) {
  if (!status) return <span className="text-text-3">—</span>;
  const tone = STATUS_TONE[status] ?? "bg-bg text-text-2";
  return (
    <span className={`inline-block rounded-md px-1.5 py-px t-caption font-bold ${tone}`}>
      {PAYMENT_STATUS_LABEL[status] ?? status}
    </span>
  );
}
