"use client";

import {
  nextChargeAtFrom,
  BILLING_CHARGE_LEAD_DAYS,
  billingDurationLabel,
} from "@/lib/subscriptions/billing-periods";
import { useEffect, useState } from "react";
import { planLabel } from "@/lib/subscriptions/labels";
import Link from "next/link";
import { checkoutLoginCallback, previewAmount } from "@/lib/payments/checkout-preview";
import { isTossTestEnv, loadTossSdk, tossBillingClientKey } from "../toss-rail";

/* ============================================================
   자동결제(빌링) 카드 등록 클라이언트.

   흐름 (빌링 결제창 연동 문서):
     1) 서버에 등록 시작 요청(/api/payments/toss/billing/start) —
        customerKey(서버 발급 무작위 UUID)와 서버 계산 금액을 받는다.
     2) SDK payment({ customerKey }).requestBillingAuth({ method: "CARD" }) —
        카드 등록창이 열리고, 완료되면 successUrl 로 customerKey+authKey 가 간다.
     3) successUrl(/api/payments/toss/billing/register)이 서버에서 빌링키를
        발급받아 저장하고 첫 결제를 승인한 뒤 결과 화면으로 보낸다.

   사실 우선:
   - 빌링키·authKey 는 이 컴포넌트에 절대 오지 않는다(서버 전용).
   - 테스트 키면 "실제 청구 없음"을 명시한다.
   - 서버가 503(전자계약 대기)을 주면 그 사실을 그대로 보여 준다 —
     되는 척하는 버튼을 만들지 않는다.

   [1000] 결제 전 확인·동의:
   - 새 구독은 "결제 전 확인" 카드(상품·금액·주기·첫/다음 결제일·해지·환불·결제수단)를
     읽고 체크박스에 동의해야 등록 버튼이 열린다. 서버(start)도 consent 없는 요청은 400.
   - start 호출은 **동의 체크 시점**에 한다: 등록 버튼은 카드 등록창을 여는 자리라
     그 안에서 fetch 를 기다리면 사파리가 창을 막는다(제스처 차단). 체크 → 키 준비 →
     버튼 → 창. 카드 변경(mode=card)은 동의 대상이 아니라(이미 동의한 구독의 결제수단만
     교체) 예전처럼 마운트 때 start 를 부른다.
   ============================================================ */

type Phase =
  | { kind: "loading" }
  /** 로그인됨·새 구독 — 동의 전. 표시 금액은 판매가 단일 출처(previewAmount) */
  | { kind: "consent"; amount: number | null }
  /** 서버가 customerKey·금액을 줬다 — 카드 등록창을 열 수 있다 */
  | { kind: "ready"; amount: number }
  | { kind: "login" }
  | { kind: "unavailable"; msg: string }
  | { kind: "error"; msg: string };

/* 플랜명은 단일 출처 — lib/subscriptions/labels.planLabel (게이트: check:plan-labels) */

type EnrollParams = {
  tier: "pro" | "expert" | null;
  billing: "monthly" | "annual";
  /** mode=card — 살아 있는 구독의 결제 카드만 교체(추가 결제 없음) */
  cardChange: boolean;
};

function parseParams(): EnrollParams | null {
  try {
    const sp = new URLSearchParams(window.location.search);
    const cardChange = sp.get("mode") === "card";
    const tier = sp.get("tier");
    const billing = sp.get("billing") === "annual" ? "annual" : "monthly";
    if (tier !== "pro" && tier !== "expert") {
      // 카드 변경은 서버가 구독에서 플랜을 찾아 주므로 tier 없이도 진행
      return cardChange ? { tier: null, billing, cardChange } : null;
    }
    return { tier, billing, cardChange };
  } catch {
    return null;
  }
}

/**
 * 오늘 등록하면 다음 청구가 언제인가.
 *
 * [966] 서버(register 라우트·갱신 크론)와 **같은 식**(nextChargeAtFrom: 만료 이틀 전)을
 * 쓴다. 예전엔 화면은 "+1개월(말일 보정)", 서버는 "+28일" 이라 등록 화면(10/5)과
 * 직후 성공 화면(10/3)이 다른 날짜를 말했다. 이 값은 표시용이고 실제 청구일은
 * 서버가 결제 성공 시점에 확정한다 — 그래서 "약" 을 붙인다.
 */
function nextChargeLabel(billing: "monthly" | "annual"): string {
  return nextChargeAtFrom(Date.now(), billing).toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function todayLabel(): string {
  return new Date().toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" });
}

type StartResponse = {
  customerKey?: string;
  amount?: number;
  error?: string;
  plan?: string;
  billing?: string;
};

export function BillingEnrollClient() {
  const [phase, setPhase] = useState<Phase>({ kind: "loading" });
  /* [991] 카드 등록창 열기 실패 — ready 상태를 유지한 채 버튼 위에 이유를 적는다 */
  const [authError, setAuthError] = useState<string | null>(null);
  const [params, setParams] = useState<EnrollParams | null>(null);
  const [customerKey, setCustomerKey] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [opening, setOpening] = useState(false);
  /* [1000] 정기결제 조건 동의 — 새 구독만. 서버에 저장하지 않는다(화면 게이트 + start 400). */
  const [consent, setConsent] = useState(false);
  const [starting, setStarting] = useState(false);

  /* [991] 카드 등록창 계측 — 자동결제 등록 3건이 전부 pending(start 만 호출되고 register 는
     한 번도 오지 않았다)인데, 창이 안 열린 건지·열렸다 닫힌 건지·SDK 가 거절한 건지를
     서버는 알 길이 없었다. 누른 순간·SDK 오류 코드·사용자 취소를 남긴다(카드 정보 없음). */
  const track = (eventName: string, metadata: Record<string, unknown> = {}) => {
    try {
      void fetch("/api/platform/event", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventName,
          source: "client",
          campaign: "billing-enroll",
          path: window.location.pathname,
          metadata: { tier: params?.tier ?? null, billing: params?.billing ?? null, ...metadata },
        }),
        keepalive: true,
      }).catch(() => {});
    } catch {
      /* noop */
    }
  };

  /** start 응답을 phase 로 옮긴다 — 카드 변경(마운트)·새 구독(동의 체크) 공용 */
  async function callStart(p: EnrollParams): Promise<void> {
    const res = await fetch("/api/payments/toss/billing/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        p.cardChange ? { mode: "card" } : { tier: p.tier, billing: p.billing, consent: true },
      ),
    });
    const j = (await res.json().catch(() => ({}))) as StartResponse;
    if (res.status === 401) {
      setPhase({ kind: "login" });
      return;
    }
    if (res.status === 503) {
      setPhase({ kind: "unavailable", msg: j.error ?? "자동결제는 아직 준비 중이에요." });
      return;
    }
    if (!res.ok || !j.customerKey || !Number.isFinite(j.amount)) {
      setPhase({ kind: "error", msg: j.error ?? "등록을 시작하지 못했어요." });
      return;
    }
    setCustomerKey(j.customerKey);
    // 카드 변경 — 서버가 구독에서 찾아 준 플랜·주기로 표기를 맞춘다
    if (p.cardChange && (j.plan === "pro" || j.plan === "expert")) {
      setParams({
        tier: j.plan,
        billing: j.billing === "annual" ? "annual" : "monthly",
        cardChange: true,
      });
    }
    setPhase({ kind: "ready", amount: Number(j.amount) });
    void loadTossSdk().catch(() => {}); // 사파리 제스처 차단 대비 프리로드
  }

  useEffect(() => {
    const p = parseParams();
    if (!p) {
      setPhase({ kind: "error", msg: "등록할 플랜 정보가 없어요. 구독 페이지에서 다시 시작해 주세요." });
      return;
    }
    setParams(p);
    void (async () => {
      try {
        const sess = await fetch("/api/auth/session", { cache: "no-store" });
        const sj = (await sess.json().catch(() => null)) as { user?: { email?: string | null } } | null;
        if (!sj?.user?.email) {
          setPhase({ kind: "login" });
          return;
        }
        setEmail(sj.user.email);
        if (p.cardChange) {
          await callStart(p);
          return;
        }
        /* 새 구독 — 동의 전에는 서버 주문(pending 행)을 만들지 않는다 */
        setPhase({ kind: "consent", amount: p.tier ? previewAmount(p.tier, p.billing) : null });
        void loadTossSdk().catch(() => {});
      } catch {
        setPhase({ kind: "error", msg: "네트워크 오류로 등록을 시작하지 못했어요." });
      }
    })();
  }, []);

  /** 동의 체크 — 처음 켜질 때 start 를 불러 customerKey 를 준비해 둔다 */
  async function onConsentChange(checked: boolean) {
    setConsent(checked);
    if (!checked || !params || params.cardChange || customerKey || starting) return;
    setStarting(true);
    track("billing_consent");
    try {
      await callStart(params);
    } catch {
      setPhase({ kind: "error", msg: "네트워크 오류로 등록을 시작하지 못했어요." });
    } finally {
      setStarting(false);
    }
  }

  async function openBillingAuth() {
    if (opening || phase.kind !== "ready" || !customerKey || !params) return;
    if (!params.cardChange && !consent) return;
    setOpening(true);
    setAuthError(null);
    track("billing_auth_open", { cardChange: Boolean(params.cardChange) });
    try {
      const TossPayments = await loadTossSdk();
      /* 자동결제 MID 의 클라이언트 키 — 일반결제 키로는 카드 등록이 안 된다 */
      const payment = TossPayments(tossBillingClientKey() as string).payment({ customerKey });
      const origin = window.location.origin;
      /* [1000] 실패 화면이 "다른 카드로 등록" 을 카드 등록창 바로 앞으로 보낼 수 있게
         레일·플랜·주기(·카드 변경)를 failUrl 에 싣는다. 값은 화이트리스트(pro|expert, monthly|annual). */
      const failQuery = new URLSearchParams({ provider: "toss-billing" });
      if (params.tier) failQuery.set("plan", params.tier);
      failQuery.set("billing", params.billing);
      if (params.cardChange) failQuery.set("mode", "card");
      await payment.requestBillingAuth({
        method: "CARD",
        successUrl: `${origin}/api/payments/toss/billing/register${params.cardChange ? "?mode=card" : ""}`,
        failUrl: `${origin}/payment/fail?${failQuery.toString()}`,
        ...(email ? { customerEmail: email } : {}),
      });
    } catch (e) {
      const code =
        e && typeof e === "object" && "code" in e ? String((e as { code: unknown }).code) : "";
      const cancelled = code === "USER_CANCEL" || code === "PAY_PROCESS_CANCELED";
      track(cancelled ? "billing_auth_cancel" : "billing_auth_fail", {
        code: code.slice(0, 40),
        message: (e instanceof Error ? e.message : "").slice(0, 120),
      });
      if (!cancelled) {
        const detail = [code, e instanceof Error ? e.message : ""].filter(Boolean).join(" · ").slice(0, 140);
        /* [991] 실패해도 ready 로 남긴다 — 버튼을 다시 누를 수 있어야 한다. 예전엔 error
           phase 로 넘어가 "구독 페이지로 돌아가기"만 남았고, 재시도하려면 처음부터였다. */
        setAuthError(`카드 등록창을 열지 못했어요${detail ? ` (${detail})` : ""}. 다시 눌러 주세요.`);
      }
    } finally {
      setOpening(false);
    }
  }

  const label = params?.tier ? (planLabel(params.tier)) : "";
  const billingLabel = params?.billing === "annual" ? "연간" : "월간";
  const cycle: "monthly" | "annual" = params?.billing === "annual" ? "annual" : "monthly";
  /* [970 · A-21] 비로그인 요약 카드용 표시 금액 — 카드 변경(tier 없음)엔 그리지 않는다 */
  const loginPreview =
    phase.kind === "login" && params?.tier && !params.cardChange
      ? previewAmount(params.tier, params.billing)
      : null;

  /* 새 구독의 표시 금액: 서버가 줬으면 서버 값, 그 전엔 미리보기 */
  const shownAmount =
    phase.kind === "ready" ? phase.amount : phase.kind === "consent" ? phase.amount : null;
  const enrollOpen = phase.kind === "ready" && Boolean(customerKey) && (params?.cardChange || consent);
  const showEnroll = phase.kind === "ready" || phase.kind === "consent";

  return (
    <div className="mx-auto flex w-full max-w-[520px] flex-col gap-3">
      {params && (
        <p className="t-body text-text-2">
          {params.cardChange
            ? `자동결제 카드 변경${label ? ` — ${label} 플랜 · ${billingLabel}` : ""}`
            : `${label} 플랜 · ${billingLabel} 자동결제 등록`}
        </p>
      )}
      {isTossTestEnv() && (
        <p className="rounded-xl bg-[rgba(245,158,11,.12)] px-3.5 py-2.5 t-sub font-bold text-warning">
          테스트 환경 — 카드 등록·결제가 가상으로 이루어져 실제 금액이 청구되지 않아요.
        </p>
      )}

      {phase.kind === "loading" && (
        <div className="card rounded-2xl px-4 py-8 text-center t-body text-text-3">
          자동결제 등록 준비 중…
        </div>
      )}

      {phase.kind === "login" && (
        <>
          {/* [970 · A-21] 비로그인 — 예전엔 "로그인이 필요해요" 한 줄과 버튼뿐이라 무엇을
              얼마에 등록하려는지, 마음이 바뀌면 어디로 가는지가 없었다. 체크아웃(CheckoutClient)
              과 같은 규칙: 표시용 금액은 previewAmount(판매가 단일 출처, 클라이언트 안전)로
              그리고 실제 청구액은 로그인 뒤 서버가 다시 계산한다. */}
          {loginPreview !== null && (
            <div className="card flex flex-col gap-2 rounded-2xl px-4 py-5">
              <div className="flex items-center justify-between t-body">
                <span className="text-text-3">플랜</span>
                <span className="font-bold text-ink">
                  {label} · {billingLabel} 자동결제
                </span>
              </div>
              <div className="flex items-center justify-between t-body">
                <span className="text-text-3">결제 금액</span>
                <span className="font-extrabold text-ink">
                  {loginPreview.toLocaleString("ko-KR")}원 / {billingLabel === "연간" ? "년" : "월"}
                </span>
              </div>
              <p className="mt-1 t-sub text-text-3">
                카드를 등록하면 첫 결제가 바로 진행되고, 이후 같은 금액이{" "}
                {billingLabel === "연간" ? "매년" : "매달"} 자동으로 결제돼요. 해지는 언제든
                구독 관리에서 할 수 있어요.
              </p>
            </div>
          )}
          <div className="card flex flex-col items-center gap-2.5 rounded-2xl px-4 py-8 text-center">
            <p className="t-section text-ink">카드를 등록하려면 로그인이 필요해요</p>
            <p className="t-sub text-text-3">로그인하면 이 화면으로 그대로 돌아와요</p>
            <Link
              href={checkoutLoginCallback(
                typeof window !== "undefined" ? window.location.pathname : "/subscription/billing",
                typeof window !== "undefined" ? window.location.search : "",
              )}
              className="btn-primary btn-sm no-underline"
            >
              로그인하기
            </Link>
          </div>
          <Link
            href="/subscription"
            className="mt-1 text-center t-sub font-bold text-text-3 no-underline"
          >
            ← 구독 안내로 돌아가기
          </Link>
        </>
      )}

      {phase.kind === "unavailable" && (
        <div className="card flex flex-col items-center gap-2.5 rounded-2xl px-4 py-8 text-center">
          <p className="t-section text-ink">자동결제는 아직 준비 중이에요</p>
          <p className="t-sub text-text-3">{phase.msg}</p>
          <Link href="/subscription" className="btn-soft btn-sm no-underline">
            단건 결제로 이용하기
          </Link>
        </div>
      )}

      {phase.kind === "error" && (
        <div className="card flex flex-col items-center gap-2.5 rounded-2xl px-4 py-8 text-center">
          <p className="t-section text-ink">등록을 시작하지 못했어요</p>
          <p className="t-sub text-text-3">{phase.msg}</p>
          <Link href="/subscription" className="btn-soft btn-sm no-underline">
            구독 페이지로 돌아가기
          </Link>
        </div>
      )}

      {showEnroll && (
        <>
          <div className="card flex flex-col gap-2 rounded-2xl px-4 py-5">
            <div className="flex items-center justify-between t-body">
              <span className="text-text-3">플랜</span>
              <span className="font-bold text-ink">
                {label} · {billingLabel} 자동결제
              </span>
            </div>
            <div className="flex items-center justify-between t-body">
              <span className="text-text-3">결제 금액</span>
              <span className="font-extrabold text-ink">
                {shownAmount !== null
                  ? `${shownAmount.toLocaleString("ko-KR")}원 / ${billingLabel === "연간" ? "년" : "월"}`
                  : "—"}
              </span>
            </div>
            {/* 다음 결제일을 **날짜로** 적는다. (C43)
                "매달 자동으로 결제돼요"는 언제인지를 말하지 않는다 — 자동결제에서
                사용자가 가장 알고 싶은 한 가지이고, 안 적으면 첫 청구 때 문의가 된다.
                카드 변경은 청구 주기를 바꾸지 않으므로 이 줄을 그리지 않는다. */}
            {!params?.cardChange && (
              <div className="flex items-center justify-between t-body">
                <span className="text-text-3">다음 결제일</span>
                <span className="font-bold text-ink">
                  약 {nextChargeLabel(cycle)}
                  <span className="ml-1 t-caption font-normal text-text-3">
                    (만료 {BILLING_CHARGE_LEAD_DAYS}일 전 자동 청구)
                  </span>
                </span>
              </div>
            )}
            <p className="mt-1 t-sub text-text-3">
              {params?.cardChange ? (
                <>
                  새 카드를 등록하면 지금 등록된 카드를 대체해요 — 추가 결제 없이 다음
                  결제일부터 새 카드로 청구돼요. 결제 실패로 멈춘 구독은 새 카드 등록 즉시
                  재개돼요. 카드 정보는 토스페이먼츠에만 저장되며 내집나우 서버에는 카드번호가
                  남지 않아요.
                </>
              ) : (
                <>
                  카드를 등록하면 첫 결제가 바로 진행되고, 이후 같은 금액이{" "}
                  {billingLabel === "연간" ? "매년" : "매달"} 자동으로 결제돼요. 카드 정보는
                  토스페이먼츠에만 저장되며 내집나우 서버에는 카드번호가 남지 않아요.
                </>
              )}
            </p>
          </div>

          {/* [1000] 결제 전 확인 — 정기결제 조건을 한눈에. 동의 체크가 등록 버튼을 연다.
              전자상거래법 시행령(정기결제 사전 고지) 취지: 상품·금액·주기·결제일·해지 방법·
              환불 규정을 결제 **전**에 보여 준다. 링크는 전부 실재하는 화면. */}
          {!params?.cardChange && (
            <section
              aria-labelledby="billing-precheck-title"
              className="lg-glass flex flex-col gap-3 rounded-lg px-4 py-4"
            >
              <div className="flex items-center justify-between gap-2">
                <h2 id="billing-precheck-title" className="t-section text-ink">
                  결제 전 확인
                </h2>
                <span className="lg-pill">정기결제</span>
              </div>
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 t-sub">
                <dt className="text-text-3">상품</dt>
                <dd className="font-bold text-ink">
                  {label} 플랜 · {billingLabel} 자동결제
                </dd>
                <dt className="text-text-3">금액</dt>
                <dd className="font-bold text-ink">
                  {shownAmount !== null ? `${shownAmount.toLocaleString("ko-KR")}원` : "—"}
                  <span className="ml-1 font-normal text-text-3">(VAT 포함)</span>
                </dd>
                <dt className="text-text-3">결제 주기</dt>
                <dd className="text-text-1">
                  {billingLabel === "연간" ? "매년" : "매달"} · 회당 이용 기간 {billingDurationLabel(cycle)}
                </dd>
                <dt className="text-text-3">첫 결제일</dt>
                <dd className="text-text-1">오늘 ({todayLabel()}) — 카드 등록 즉시</dd>
                <dt className="text-text-3">다음 결제일</dt>
                <dd className="text-text-1">약 {nextChargeLabel(cycle)}</dd>
                <dt className="text-text-3">해지 방법</dt>
                <dd className="text-text-1">
                  <Link href="/my/subscription" className="inline-block py-[5px] font-bold text-primary underline underline-offset-2">
                    마이 › 구독 관리
                  </Link>
                  에서 언제든 — 남은 기간은 그대로 이용돼요
                </dd>
                <dt className="text-text-3">환불 규정</dt>
                <dd className="text-text-1">
                  결제 후 7일 이내 청약철회(전액 환불) ·{" "}
                  <Link href="/legal/terms#refund" className="inline-block py-[5px] font-bold text-primary underline underline-offset-2">
                    약관 제8조
                  </Link>
                </dd>
                <dt className="text-text-3">결제수단</dt>
                <dd className="text-text-1">
                  신용·체크카드(토스페이먼츠) ·{" "}
                  <Link href="/subscription/payment-methods" className="inline-block py-[5px] font-bold text-primary underline underline-offset-2">
                    결제수단 안내
                  </Link>
                </dd>
              </dl>
              <div className="lg-hairline" />
              <label className="flex cursor-pointer items-start gap-2.5 t-body text-ink">
                <input
                  type="checkbox"
                  checked={consent}
                  onChange={(e) => void onConsentChange(e.target.checked)}
                  className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--primary)]"
                />
                <span>
                  <span className="font-bold">정기결제 조건을 확인했고 동의합니다</span>
                  <span className="mt-0.5 block t-sub text-text-3">
                    동의하면 카드 등록을 시작할 수 있어요. 동의 내용은 저장하지 않아요.
                  </span>
                </span>
              </label>
            </section>
          )}

          {authError && (
            <p role="alert" className="rounded-xl bg-danger-soft px-3.5 py-2.5 t-sub font-bold text-danger">
              {authError}
            </p>
          )}
          <button
            type="button"
            onClick={() => void openBillingAuth()}
            disabled={opening || starting || !enrollOpen}
            aria-disabled={!enrollOpen}
            className="btn-primary btn-cta rounded-[14px] p-[14px] text-center t-body font-bold disabled:opacity-60"
          >
            {opening
              ? "카드 등록창 여는 중…"
              : starting
                ? "등록 준비 중…"
                : params?.cardChange
                  ? "새 카드로 변경하기"
                  : !consent
                    ? "위 조건에 동의하면 등록할 수 있어요"
                    : "카드 등록하고 자동결제 시작"}
          </button>
          <p className="text-center t-sub text-text-3">
            결제 7일 이내 청약철회(전액 환불) 가능 ·{" "}
            <Link href="/legal/terms#refund" className="underline underline-offset-2">
              환불 규정
            </Link>
          </p>
        </>
      )}
    </div>
  );
}
