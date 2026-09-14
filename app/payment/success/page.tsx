import Link from "next/link";
import { planLabel } from "@/lib/subscriptions/labels";
import type { Metadata } from "next";
import { PageShell } from "@/app/components/PageShell";
import { markPaid, getPaymentByOrderId, type PaymentRecord } from "@/lib/payments/store";
import {
  getLiveSubscriptionByEmail,
  toPublic,
  type PublicBillingSubscription,
} from "@/lib/payments/billing-store";
import { applyPlanToUserByEmail } from "@/lib/billing/apply-plan";
import { normalizePlan } from "@/lib/billing/plan";
import { safeAuth } from "@/lib/safe-auth";
import { PaymentSuccessMoment } from "./PaymentSuccessMoment";
import { applyPlanForPayment, confirmTossOrder } from "@/lib/payments/confirm-toss-order";
import { safeInternalPath } from "@/lib/safe-path";
import { readGuestMeta } from "@/lib/payments/guest-order";
import { claimGuestPayments } from "@/lib/payments/guest-claim";

/** 결제 결과 랜딩의 쿼리 파라미터(페이지 본문과 같은 모양) */
type PaymentSuccessSearchParams = {
  orderId?: string;
  paymentKey?: string;
  amount?: string;
  provider?: string;
  session_id?: string;
  source?: string;
  campaign?: string;
  card?: string;
};

/* [970 · A-16] 실패 화면인데 <title> 이 "결제 완료" 로 고정돼 있었다(탭·히스토리·공유 미리보기가
   거짓말). 본문의 `ok` 는 Stripe 세션 조회·토스 승인·원장 조회까지 거쳐 정해지므로 메타에서
   그 호출을 반복하지 않는다(승인 호출은 부작용이 있다). 여기서는 본문이 **검증을 시도조차
   못 하는** 파라미터 조합만 골라 "결제 확인 실패" 로 분기하는 파라미터 근사다 — 검증 정보가
   있는데 실제 승인·조회가 실패한 경우는 제목이 "결제 완료" 로 남는다(본문 분기와 같은 순서). */
function paramsLookVerifiable(sp: PaymentSuccessSearchParams): boolean {
  if (sp.provider === "toss-billing") return sp.card === "changed" || Boolean(sp.orderId);
  /* 본문은 Number(amount) 의 참/거짓으로 본다(0·NaN 은 승인 시도 없이 실패) */
  if (sp.orderId && sp.paymentKey && sp.amount && Number(sp.amount)) return true;
  /* [1001] orderId 만 있는 경우 — 본인 주문이면 본문이 "결제 완료된 주문"을 보여 준다(가입/로그인 뒤 복귀).
     제목은 서버 조회 없이 정하는 자리라 실패로 단정하지 않는다(본문이 최종 사실). 개발은 목업 재확정. */
  return Boolean(sp.orderId);
}

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<PaymentSuccessSearchParams>;
}): Promise<Metadata> {
  const sp = await searchParams;
  return {
    title: paramsLookVerifiable(sp) ? "결제 완료 | 내집나우" : "결제 확인 실패 | 내집나우",
    robots: { index: false, follow: false },
  };
}

export const dynamic = "force-dynamic";

/**
 * 결제 성공 랜딩 통합(감사 P1-4): 토스·카카오페이(orderId·paymentKey) +
 * Stripe(provider=stripe&session_id — 구 /billing/success 흡수, 미들웨어가 1홉 리다이렉트).
 * Stripe 는 Webhook 과 병행해 session_id 로 플랜을 idempotent 하게 반영합니다.
 */
/** [1001] 이 주문이 지금 로그인한 사람의 것이고 이미 결제 완료인가 — orderId 만으로 남의 주문을 열지 못하게 */
async function ownPaidOrder(orderId: string): Promise<boolean> {
  const rec = await getPaymentByOrderId(orderId).catch(() => null);
  if (rec?.status !== "paid") return false;
  const session = await safeAuth();
  const email = session?.user?.email?.trim().toLowerCase() ?? null;
  return Boolean(email && rec.userEmail && email === rec.userEmail.trim().toLowerCase());
}

export default async function PaymentSuccessPage({
  searchParams,
}: {
  searchParams: Promise<{
    orderId?: string;
    paymentKey?: string;
    amount?: string;
    provider?: string;
    session_id?: string;
    source?: string;
    campaign?: string;
    card?: string;
  }>;
}) {
  const sp = await searchParams;
  const orderId = sp.orderId;
  const paymentKey = sp.paymentKey;
  const amount = sp.amount ? Number(sp.amount) : null;

  let status: "ok" | "mock" | "error" = "error";
  let message = "결제 정보를 확인할 수 없습니다.";

  /* [992] Stripe 분기(session_id 백업 검증) 삭제 — 레일 자체가 없다. 옛 /billing/success
     링크로 provider=stripe 가 들어오면 아래 기본 분기의 "확인할 수 없습니다" 로 떨어진다. */
  if (sp.provider === "toss-billing" && sp.card === "changed") {
    /* 카드 변경(재등록) — 결제 없이 빌링키·카드만 교체된 경우. 사실 확인은
       아래 자동결제 정보 카드가 서버 저장값(구독 행)으로 한다. */
    status = "ok";
    message = "결제 카드가 변경됐어요. 다음 결제부터 새 카드로 청구됩니다.";
  } else if (sp.provider === "toss-billing" && orderId) {
    /* 자동결제 등록 — 발급·첫 결제·활성화는 /api/payments/toss/billing/register 가
       서버에서 이미 끝냈다. 화면은 원장 기록으로만 사실을 확인한다(쿼리스트링을
       믿지 않는 기존 원칙 그대로). */
    const rec = await getPaymentByOrderId(orderId).catch(() => null);
    if (rec?.status === "paid") {
      status = "ok";
      message = "자동결제 등록과 첫 결제가 완료됐어요. 다음 결제부터는 등록한 카드로 자동으로 진행돼요.";
    } else {
      message = "자동결제 등록 결과를 확인할 수 없어요. 구독 페이지에서 상태를 확인해 주세요.";
    }
  } else if (orderId && paymentKey && amount) {
    /* [965] 승인은 같은 프로세스의 함수로 — 예전엔 Host 헤더로 만든 주소에 HTTP 를
       다시 쏴서 (a) Host 조작 시 paymentKey 유출, (b) 서버 IP 하나로 모든 구매자가
       속도 제한 한 버킷을 나눠 쓰는 문제, (c) 세션 없는 호출이라 본인 확인이 비는
       문제가 있었다. */
    try {
      const auth = await safeAuth();
      const result = await confirmTossOrder({
        orderId,
        paymentKey,
        amount,
        currentEmail: auth?.user?.email ?? null,
      });
      if (result.status < 400 && result.body.ok && result.body.payment) {
        status = "ok";
        message = result.body.recovered
          ? "결제가 완료되어 구독이 활성화됐습니다. (승인 응답이 늦어 결제 내역으로 다시 확인했어요)"
          : "결제가 완료되어 구독이 활성화됐습니다.";
      } else {
        message = result.body.error ?? message;
      }
    } catch (e) {
      message = e instanceof Error ? e.message : message;
    }
  } else if (orderId && (await ownPaidOrder(orderId))) {
    /* [1001] 이미 승인된 주문을 다시 연 경우(비회원 결제 → 가입/로그인 뒤 복귀) — 원장이 사실이다.
       단 **본인 주문일 때만**: orderId 는 비밀이 아니라(문의 프리필·스크린샷으로 새어 나간다) 아무나 열면
       남의 영수증·이메일을 보게 된다. paymentKey 가 있는 정상 복귀 경로는 위 분기가 이미 처리한다. */
    status = "ok";
    message = "결제가 완료된 주문이에요.";
  } else if (orderId) {
    // 클라이언트 측에서 paymentKey 없이 redirect 한 경우(=목업 재확정)
    if (process.env.NODE_ENV === "production") {
      status = "error";
      message = "결제 검증 정보가 누락되었습니다. 고객지원으로 문의해 주세요.";
    } else {
      const paid = await markPaid({ orderId, providerPaymentKey: "MOCK-PAYMENT-KEY" });
      if (paid) {
        /* 목업 재확정도 실제 경로와 같은 기간 규칙(BILLING_DURATION_DAYS)·같은 소유자 기준 */
        await applyPlanForPayment(paid);
        status = "mock";
        message = "결제가 기록되었습니다. (테스트 모드)";
      }
    }
  }

  const ok = status !== "error";

  /* 자동결제 안내 카드 재료 — 등록 카드·다음 결제일도 서버 저장값(구독 행)으로만
     그린다(쿼리스트링 불신 원칙 동일). 등록 직후·카드 변경 직후 화면에서
     "등록 카드·적용 플랜·다음 결제일"이 한눈에 확인된다. */
  let billingSub: PublicBillingSubscription | null = null;
  if (ok && sp.provider === "toss-billing") {
    const session = await safeAuth();
    const email = session?.user?.email?.trim().toLowerCase();
    if (email) {
      const live = await getLiveSubscriptionByEmail(email).catch(() => null);
      if (live) billingSub = toPublic(live);
    }
  }

  /* 영수증 카드 재료 — 주문 기록에서 읽는다. 화면에 보이는 값은 전부 서버에
     저장된 값이다. 쿼리스트링의 amount 를 그대로 그리면 주소창을 고친 값이
     "결제 완료 5,900원"처럼 보일 수 있다. */
  let record: PaymentRecord | null = null;
  if (ok && orderId) {
    record = await getPaymentByOrderId(orderId).catch(() => null);
  }
  /* [1001] 비회원 결제 — 계정이 아직 없어 이용권이 대기 중이면 가입/로그인 안내를, 로그인해 돌아왔으면
     그 자리에서 연결한다(claimGuestPayments 는 선점 UPDATE 라 여러 번 불려도 한 번만 적용). */
  const guestMeta = record ? readGuestMeta(record.metadata) : null;
  let guestPending = Boolean(guestMeta?.claimPending);
  let guestBuyerEmail: string | null = null;
  if (guestPending) {
    const session = await safeAuth();
    const sessionEmail = session?.user?.email?.trim().toLowerCase() ?? null;
    if (sessionEmail && record?.userEmail && sessionEmail === record.userEmail.toLowerCase()) {
      const n = await claimGuestPayments(sessionEmail).catch(() => 0);
      if (n > 0) guestPending = false;
    }
    /* 이메일은 방금 결제한 본인(세션 없음, paymentKey 로 승인해 이 화면에 온 경우)에게만 보여 준다 */
    if (guestPending && !sessionEmail && paymentKey) guestBuyerEmail = record?.userEmail ?? null;
  }
  const selfHref = `/payment/success?${new URLSearchParams({
    ...(orderId ? { orderId } : {}),
    ...(sp.provider ? { provider: String(sp.provider) } : {}),
  }).toString()}`;
  const returnTo =
    ok && typeof record?.metadata?.returnTo === "string"
      ? safeInternalPath(record.metadata.returnTo, "")
      : "";
  /* 결제 완료 화면의 플랜명 — 단일 출처(lib/subscriptions/labels). "베이직"은
     어디에도 없는 이름이었다. */
  const METHOD_LABEL: Record<string, string> = {
    "카드": "카드 (토스페이먼츠)",
    "카드(자동결제)": "카드 자동결제 (토스페이먼츠)",
    "mock-card": "테스트 결제",
  };
  const receiptRows: { label: string; value: string }[] = record
    ? [
        {
          label: "플랜",
          value: `${planLabel(record.plan)} · ${
            record.billing === "annual" ? "연간" : record.billing === "weekly" ? "주간권(7일)" : "월간"
          }`,
        },
        {
          label: "결제 금액",
          value: `${record.amount.toLocaleString("ko-KR")}원`,
        },
        ...(record.method
          ? [{ label: "결제 수단", value: METHOD_LABEL[record.method] ?? record.method }]
          : []),
        ...(record.paidAt
          ? [{ label: "결제 일시", value: record.paidAt.slice(0, 16).replace("T", " ") }]
          : []),
      ]
    : [];

  return (
    <PageShell breadcrumb="구독 · 결제 결과">
      <PaymentSuccessMoment status={status} />
      <section className="rise-in mx-auto flex w-full max-w-[480px] flex-col items-center gap-3 pt-10 text-center">
        {/* 체크 배지 — 이모지 대신 브랜드 색 원형. 실패면 경고색. */}
        <span
          aria-hidden
          className={`flex h-16 w-16 items-center justify-center rounded-full text-[28px] text-white shadow-[0_10px_28px_rgba(16,28,54,.18)] ${
            ok ? "bg-primary" : "bg-danger"
          }`}
        >
          {ok ? "✓" : "!"}
        </span>
        <h1 className="text-[21px] font-extrabold tracking-[-0.4px] text-ink">
          {ok ? "결제가 완료되었습니다" : "결제 확인에 실패했습니다"}
        </h1>
        <p className="text-[13px] leading-[1.6] text-text-2">{message}</p>

        {/* 영수증 카드 — 무엇을 얼마에 샀는지 이 화면에서 확인된다.
            예전에는 "완료되었습니다" 한 줄과 주문번호뿐이라, 방금 얼마가
            나갔는지 보려면 카드사 알림을 열어야 했다. */}
        {receiptRows.length > 0 && (
          <div className="mt-2 w-full overflow-hidden rounded-[18px] border border-line bg-surface text-left shadow-[0_8px_24px_rgba(16,28,54,.06)]">
            <div className="border-b border-dashed border-line px-5 py-3.5">
              <div className="text-[12px] font-bold text-text-3">결제 내역</div>
            </div>
            <dl className="flex flex-col gap-2.5 px-5 py-4">
              {receiptRows.map((r) => (
                <div key={r.label} className="flex items-baseline justify-between gap-3">
                  <dt className="text-[12px] text-text-3">{r.label}</dt>
                  <dd className="text-[13px] font-extrabold text-ink">{r.value}</dd>
                </div>
              ))}
              {orderId && (
                <div className="flex items-baseline justify-between gap-3 border-t border-divider pt-2.5">
                  <dt className="text-[12px] text-text-3">주문번호</dt>
                  <dd className="break-all text-right text-[12px] text-text-3">{orderId}</dd>
                </div>
              )}
            </dl>
            {record?.receiptUrl && (
              <a
                href={record.receiptUrl}
                target="_blank"
                rel="noreferrer"
                className="block border-t border-line bg-bg px-5 py-3 text-center text-[12px] font-extrabold text-primary"
              >
                매출전표(영수증) 보기 ›
              </a>
            )}
          </div>
        )}
        {receiptRows.length === 0 && orderId && (
          <p className="text-xs text-text-3">주문번호 {orderId}</p>
        )}

        {/* 자동결제 정보 — 등록 완료·카드 변경 화면의 핵심 확인값 */}
        {billingSub && (
          <div className="w-full overflow-hidden rounded-[18px] border border-line bg-surface text-left shadow-[0_8px_24px_rgba(16,28,54,.06)]">
            <div className="border-b border-dashed border-line px-5 py-3.5">
              <div className="text-[12px] font-bold text-text-3">자동결제 정보</div>
            </div>
            <dl className="flex flex-col gap-2.5 px-5 py-4">
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-[12px] text-text-3">적용 플랜</dt>
                <dd className="text-[13px] font-extrabold text-ink">
                  {planLabel(billingSub.plan)} ·{" "}
                  {billingSub.billing === "annual" ? "연간" : "월간"} 자동결제
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-[12px] text-text-3">등록 카드</dt>
                <dd className="text-[13px] font-extrabold text-ink">
                  {billingSub.cardCompany || billingSub.cardNumberMasked
                    ? `${billingSub.cardCompany ?? "카드"} ${billingSub.cardNumberMasked ?? ""}`.trim()
                    : "카드"}
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-[12px] text-text-3">결제 금액</dt>
                <dd className="text-[13px] font-extrabold text-ink">
                  {billingSub.amount.toLocaleString("ko-KR")}원 /{" "}
                  {billingSub.billing === "annual" ? "년" : "월"}
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-3 border-t border-divider pt-2.5">
                <dt className="text-[12px] text-text-3">다음 결제일</dt>
                <dd className="text-[13px] font-extrabold text-ink">
                  {billingSub.nextChargeAt
                    ? new Date(billingSub.nextChargeAt).toLocaleDateString("ko-KR", {
                        timeZone: "Asia/Seoul",
                        year: "numeric",
                        month: "long",
                        day: "numeric",
                      })
                    : "—"}
                </dd>
              </div>
            </dl>
            <p className="border-t border-line bg-bg px-5 py-3 text-[12px] leading-[1.6] text-text-3">
              해지·카드 변경은 구독 페이지의 구독 관리에서 언제든 가능해요 — 해지하면 다음
              결제일에 청구되지 않아요.
            </p>
          </div>
        )}

        {/* [966] 페이월에 막혀 결제한 사람은 원래 하던 일로 — 주문 metadata 의 returnTo
            (toss/create 가 내부 경로만 저장)를 1차 행동으로. 없으면 마이 페이지.
            [970 · A-16] 실패(!ok) 상태는 다음 행동이 "마이 페이지에서 플랜 확인" 이었다 —
            확인 안 된 결제를 마이에서 볼 수 있을 리 없다. 1차 행동을 고객센터 결제·환불
            문의(주문번호 프리필: SupportContactForm 이 ?category=payment&order= 를 읽는다)로,
            2차를 구독 안내로 바꾼다. 제목(metadata)은 정적 블록이라 I5 몫 — 본문 h1 만 분기. */}
        <div className="mt-3 flex w-full flex-col gap-2.5">
          {!ok ? (
            <>
              <Link
                href={`/support?category=payment${orderId ? `&order=${encodeURIComponent(orderId)}` : ""}`}
                className="btn-primary rounded-[14px] p-[13px] text-center text-[13px] font-bold"
              >
                고객센터에 결제 확인 문의하기
              </Link>
              <Link
                href="/subscription"
                className="rounded-[14px] border border-line bg-surface p-[13px] text-center text-[13px] font-bold text-text-1"
              >
                구독 안내로 돌아가기
              </Link>
              <p className="text-[12px] leading-[1.6] text-text-3">
                이 화면이 떴다면 이용권은 아직 켜지지 않았어요. 다시 결제하기 전에 문의를
                먼저 남겨 주세요{orderId ? " — 주문번호가 문의에 함께 담겨요" : ""}.
              </p>
            </>
          ) : guestPending ? (
            <>
              {/* [1001] 비회원 결제 — 이용권은 결제 이메일로 발급됐고, 같은 이메일로 가입/로그인하면 자동 연결 */}
              <p className="text-[13px] leading-[1.6] text-text-2">
                이용권은 결제할 때 적은 이메일{guestBuyerEmail ? ` (${guestBuyerEmail})` : ""}로 발급됐어요.
                같은 이메일로 가입하거나 로그인하면 바로 연결돼요.
              </p>
              <Link
                href={`/signup?callbackUrl=${encodeURIComponent(selfHref)}`}
                className="btn-primary rounded-[14px] p-[13px] text-center text-[13px] font-bold"
              >
                가입하고 이용권 연결하기
              </Link>
              <Link
                href={`/login?callbackUrl=${encodeURIComponent(selfHref)}`}
                className="rounded-[14px] border border-line bg-surface p-[13px] text-center text-[13px] font-bold text-text-1"
              >
                이미 계정이 있어요 — 로그인
              </Link>
            </>
          ) : returnTo ? (
            <>
              <Link href={returnTo} className="btn-primary rounded-[14px] p-[13px] text-center text-[13px] font-bold">
                이어서 사용하기
              </Link>
              <Link
                href="/my"
                className="rounded-[14px] border border-line bg-surface p-[13px] text-center text-[13px] font-bold text-text-1"
              >
                마이 페이지에서 플랜 확인
              </Link>
            </>
          ) : (
            <>
              {/* [991] 결제 직후의 첫 행동은 "플랜 확인"이 아니라 **방금 산 것을 쓰는 것**이다.
                  유료의 실체는 AI 분석 깊이·한도(구독 페이지 문구 그대로) — 이 단지 종합
                  진단으로 바로 보낸다. 플랜 확인은 둘째 버튼. */}
              <Link
                href="/analysis/ai/ai-diagnosis"
                className="btn-primary rounded-[14px] p-[13px] text-center text-[13px] font-bold"
              >
                바로 AI 분석 시작하기
              </Link>
              <Link
                href="/my"
                className="rounded-[14px] border border-line bg-surface p-[13px] text-center text-[13px] font-bold text-text-1"
              >
                마이 페이지에서 플랜 확인
              </Link>
            </>
          )}
        </div>
        {ok && (
          <p className="mt-1 text-[12px] leading-[1.6] text-text-3">
            결제 7일 이내 청약철회(환불)가 가능합니다 ·{" "}
            <Link href="/legal/terms#refund" className="underline underline-offset-2">
              환불 규정
            </Link>
          </p>
        )}
      </section>
    </PageShell>
  );
}
