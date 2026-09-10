"use client";
import { tiltHandlers } from "@/app/components/motion/Magnetic";

import { useEffect, useState } from "react";
import { annualSavingKrw } from "@/lib/subscriptions/billing-periods";
import { scrollIntoViewSafely } from "@/lib/ui/scroll";
import Link from "next/link";
import { PlanCheckoutButton, type CheckoutTier } from "./PlanCheckoutButton";
import { PreOrderCta } from "./PreOrderCta";
import { getPlan, type PlanFeature } from "@/lib/subscriptions/plans";

/* 구독 플랜 카드 3종 + 월간/연간 토글 (item 13, 클라이언트 상호작용)
   가격은 서버(page.tsx)에서 billing-periods 단일 출처로 주입 — 하드코딩 없음.

   기능 목록도 단일 출처(lib/subscriptions/plans PLAN_DEFINITIONS)에서 온다.
   예전에는 여기 축약 사본 4줄이 따로 있었는데, 실제 한도(access.ts)와 숫자가
   어긋나기 시작했다 — 한도는 결제 근거라 사본이 생기면 반드시 거짓이 된다.
   tagline·전체 기능·한도 표기를 그대로 그려 "기능 설명"을 카드에서 끝낸다. */

export type TierPricing = {
  monthly: number;
  annualMonthly: number;
  annualTotal: number;
  annualDiscountPct: number;
};

type Billing = "monthly" | "annual";
type PlanKind = "free" | "pro" | "expert";
/** [970 · A-07] 서버가 ?plan=·?billing=weekly 에서 판정한 강조 대상 */
export type HighlightPlan = "pro" | "expert" | "weekly" | null;

/** [970 · A-07] 카드·주간권 섹션의 앵커 id — page.tsx 의 주간권 섹션이 weekly-pass 를 쓴다 */
function highlightAnchorId(h: HighlightPlan): string | null {
  if (h === "weekly") return "weekly-pass";
  if (h === "pro" || h === "expert") return `plan-card-${h}`;
  return null;
}

const fmtWon = (n: number) => `${n.toLocaleString("ko-KR")}원`;

type PlanCard = {
  kind: PlanKind;
  /** 단일 출처(PLAN_DEFINITIONS) 조회용 내부 tier */
  defTier: "basic" | "pro" | "expert";
  name: string;
  nameTone: string;
  dark: boolean;
  badge: string | null;
  checkoutTier: CheckoutTier | null;
  cta: string;
  ctaClass: string;
};

/* 표시명·톤·CTA 만 여기서 정하고, tagline·기능·한도는 PLAN_DEFINITIONS 가 준다.
   (예전 "14일 무료 체험" 같은 없는 혜택 문구 사고의 재발 방지 — 혜택 문장은
   전부 단일 출처를 거친다.) */
const CARDS: PlanCard[] = [
  {
    kind: "free",
    defTier: "basic",
    name: "무료",
    nameTone: "text-ink",
    dark: false,
    badge: null,
    checkoutTier: null,
    cta: "무료로 시작",
    ctaClass: "bg-bg text-text-1",
  },
  {
    kind: "pro",
    defTier: "pro",
    name: "플러스",
    nameTone: "text-ai-accent",
    dark: true,
    badge: "가장 인기",
    checkoutTier: "pro",
    cta: "플러스 시작하기",
    ctaClass: "btn-primary btn-cta",
  },
  {
    kind: "expert",
    defTier: "expert",
    /* 토스 심사 회신에 적어 낸 상품명은 "프로" 다(가격 잠금 주석 참고).
       여기만 "프로 (전문가)" 라 같은 페이지 비교표의 "프로" 와 어긋났다. */
    name: "프로",
    nameTone: "text-warning",
    dark: false,
    badge: null,
    checkoutTier: "expert",
    cta: "전문가로 시작",
    ctaClass: "border-[1.5px] border-ink bg-surface text-ink",
  },
];

/** 기능 한 줄 — ✓(제공) / ✓+한도(부분) / —(미포함·잠금) */
/* 모바일18 — 모바일 상위 5줄 + 토글, md+ 전체. 접힌 항목은 md+ 에서 CSS 로
   항상 보이므로 토글 상태는 모바일에만 영향을 준다. */
function FeatureList({ features, dark }: { features: PlanFeature[]; dark: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const VISIBLE = 5;
  const hidden = features.length - VISIBLE;
  return (
    <div
      className={`flex flex-col divide-y text-[13px] leading-[1.5] ${
        /* [970 · A-28] 구분선 raw hex → divide-line 토큰(다크에서 밝은 선이 그대로 남았다) */
        dark ? "divide-white/[.06] text-ai-text" : "divide-line text-text-1"
      }`}
    >
      {features.map((f, i) => (
        <div
          key={f.label}
          className={i >= VISIBLE && !expanded ? "hidden md:block" : undefined}
        >
          <FeatureRow f={f} dark={dark} />
        </div>
      ))}
      {hidden > 0 && !expanded && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          /* [989] 실측 36px — 모바일에서만 보이는 버튼인데 손가락 기준에 못 미쳤다 */
          className={`min-h-[44px] py-2 text-left text-[13px] font-bold md:hidden ${
            dark ? "text-ai-muted" : "text-primary"
          }`}
        >
          전체 기능 {features.length}개 보기 ▾
        </button>
      )}
    </div>
  );
}

function FeatureRow({ f, dark }: { f: PlanFeature; dark: boolean }) {
  const off = f.included === false;
  return (
    <div
      className={`flex items-start justify-between gap-2 py-[5px] ${
        off ? (dark ? "text-white/35" : "text-text-3") : ""
      }`}
    >
      <span className="flex min-w-0 gap-2">
        <span
          aria-hidden
          className={
            off
              ? ""
              : `font-extrabold ${dark ? "text-ai-accent" : "text-primary"}`
          }
        >
          {off ? "—" : "✓"}
        </span>
        <span className="min-w-0">{f.label}</span>
      </span>
      {f.note && !off && (
        <span
          className={`shrink-0 rounded-md chip-pad-tight text-[10px] font-bold ${
            dark ? "bg-white/10 text-ai-accent" : "bg-primary-soft text-primary"
          }`}
        >
          {f.note}
        </span>
      )}
    </div>
  );
}

export function PlanCards({
  currentPlan,
  pro,
  expert,
  initialBilling = "monthly",
  paymentsReady = true,
  recurringReady,
  highlightPlan = null,
}: {
  /** [970 · A-06] null = 비로그인. 게스트는 어떤 카드도 "현재 이용 중" 이 아니고,
      무료 카드 CTA 가 가입 입구("무료로 시작" → /signup)가 된다. */
  currentPlan: PlanKind | null;
  pro: TierPricing;
  expert: TierPricing;
  /** 결제 실패 후 재시도 등 — 서버가 쿼리로 넘긴 초기 결제 주기 */
  initialBilling?: Billing;
  /** 서버 판정(항목 33): 사업자 고지 완료 + PSP 설정 여부. false 면 결제
      버튼 대신 사전 등록(오픈 알림)을 그린다 — 눌러 보기 전엔 알 수 없는
      실패 문구보다 사실을 먼저 말하는 쪽이 맞다. */
  paymentsReady?: boolean;
  /** [965] 월간·연간을 실제로 팔 수 있는 레일이 있는가(빌링 개방 또는 카카오페이·카드
      단건). false 면 월간·연간 CTA 는 사전 등록으로 그린다 — 주간권은 별도 섹션. */
  recurringReady?: boolean;
  /** [970 · A-07] 로그인 복귀·결제 실패 재시도로 돌아온 사람이 골랐던 플랜 —
      해당 카드(주간권이면 주간권 섹션)에 링을 두르고 그리로 스크롤한다. */
  highlightPlan?: HighlightPlan;
}) {
  const [billing, setBilling] = useState<Billing>(initialBilling);
  const canCheckout = paymentsReady && (recurringReady ?? true);
  const pricing: Record<"pro" | "expert", TierPricing> = { pro, expert };
  const isGuest = currentPlan === null;

  /* [970 · A-07] 마운트 후 한 번만 — 서버 렌더에는 스크롤이 없으므로 hydration 과
     무관하다. 주간권 섹션은 이 컴포넌트 밖(page.tsx)에 있어 id 로 찾는다.
     scrollIntoViewSafely 가 감속 모션 설정을 존중한다(smooth → auto). */
  useEffect(() => {
    const id = highlightAnchorId(highlightPlan);
    if (!id) return;
    const t = window.setTimeout(() => {
      scrollIntoViewSafely(document.getElementById(id), { block: "start" });
    }, 60);
    return () => window.clearTimeout(t);
  }, [highlightPlan]);

  return (
    <div className="flex flex-col items-center gap-6">
      {/* 월간 / 연간 토글 */}
      <div className="rise-in inline-flex gap-1 rounded-full border border-line bg-surface p-1 t-body">
        {(["monthly", "annual"] as const).map((b) => (
          <button
            key={b}
            type="button"
            onClick={() => setBilling(b)}
            className={`rounded-full px-4 py-1.5 font-bold transition-colors ${
              /* [970 · A-04] 네이비 토글 글자 text-surface → text-on-dark(다크에서 안 보였다) */
              billing === b ? "bg-brand-navy text-on-dark" : "text-text-3"
            }`}
          >
            {b === "monthly" ? "월간" : `연간 최대 -${Math.round(Math.max(pro.annualDiscountPct, expert.annualDiscountPct))}%`}
          </button>
        ))}
      </div>

      <div className="grid w-full max-w-[1080px] gap-5 md:grid-cols-3">
        {CARDS.map((p, i) => {
          const def = getPlan(p.defTier);
          /* [970 · A-06] 게스트(currentPlan=null)는 어느 카드도 현재 이용 중이 아니다 */
          const isCurrent = currentPlan === p.kind;
          /* [970 · A-07] 돌아온 사람이 골랐던 카드 — 현재 이용 중 링과 같은 스타일 */
          const isHighlighted = !isCurrent && p.checkoutTier !== null && highlightPlan === p.checkoutTier;
          const tierPrice = p.checkoutTier ? pricing[p.checkoutTier] : null;
          const monthlyShown =
            tierPrice == null
              ? 0
              : billing === "annual"
                ? tierPrice.annualMonthly
                : tierPrice.monthly;

          return (
            <div
              key={p.kind}
              /* [970 · A-07] 앵커 id + scroll-mt(헤더 62px 아래) — 강조 스크롤의 목적지 */
              id={p.checkoutTier ? `plan-card-${p.checkoutTier}` : undefined}
              /* [961] 프리미엄 카드 = 브랜드 네이비 + 3D 기울임(데스크톱, 최대 ±9°).
                 예전 잉크색(rgba(25,31,40))은 "어두운 면 = 네이비" 규칙 위반이었다. */
              {...(p.dark ? tiltHandlers(9) : {})}
              className={`rise-in-${Math.min(i + 1, 6)} relative flex scroll-mt-24 flex-col gap-4 rounded-3xl p-7 ${
                p.dark
                  ? "njn-tilt bg-brand-navy shadow-[0_24px_60px_rgba(16,28,54,.28)] md:-translate-y-2"
                  : "card"
              } ${isCurrent || isHighlighted ? "ring-2 ring-primary" : ""}`}
            >
              {isCurrent ? (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-brand-navy px-3.5 py-[5px] t-sub font-extrabold text-ai-accent">
                  현재 이용 중
                </span>
              ) : (
                p.badge && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-primary px-3.5 py-[5px] t-sub font-extrabold text-white shadow-[0_6px_16px_rgba(29,79,216,.4)]">
                    {p.badge}
                  </span>
                )
              )}

              <div className="flex flex-col gap-1">
                <div className={`text-[15px] font-extrabold ${p.nameTone}`}>{p.name}</div>
                {/* 단일 출처 tagline — "누구를 위한 플랜인가" 한 줄 */}
                <div className={`text-[12px] ${p.dark ? "text-ai-muted" : "text-text-3"}`}>
                  {def.tagline}
                </div>
              </div>

              <div className="flex flex-col gap-0.5">
                <div className="flex items-baseline gap-1.5">
                  <span className={`text-[28px] font-extrabold ${p.dark ? "text-white" : "text-ink"}`}>
                    {tierPrice == null ? "0원" : fmtWon(monthlyShown)}
                  </span>
                  {tierPrice != null && (
                    <span className={`text-[13px] ${p.dark ? "text-ai-muted" : "text-text-3"}`}>/월</span>
                  )}
                </div>
                {tierPrice != null && billing === "annual" && (
                  <>
                    <span className={`text-[12px] ${p.dark ? "text-ai-muted" : "text-text-3"}`}>
                      연 {fmtWon(tierPrice.annualTotal)} · -{Math.round(tierPrice.annualDiscountPct)}%
                    </span>
                    {/* 월 환산가는 싸 보이게 만드는 표기일 뿐, **얼마를 아끼는지**는
                        말하지 않는다. 연간을 고르는 사람이 알고 싶은 건 그쪽이다. (C48) */}
                    {/* [966] 카드에 실제로 찍히는 건 연 총액이다 — 월 환산가만 크게 보이면
                        27,600원이 한 번에 나가는 사실을 결제창에서야 안다 */}
                    <span className={`t-caption font-bold ${p.dark ? "text-white/80" : "text-text-2"}`}>
                      오늘 {fmtWon(tierPrice.annualTotal)} 결제 · 이후 매년 갱신
                    </span>
                    {p.defTier !== "basic" &&
                      annualSavingKrw(p.defTier as "pro" | "expert") !== null && (
                        <span
                          className="mt-0.5 w-fit rounded-md px-1.5 py-px t-caption font-extrabold"
                          style={
                            p.dark
                              ? { background: "rgba(255,255,255,.12)", color: "var(--ai-accent)" }
                              : { background: "var(--success-soft)", color: "var(--success)" }
                          }
                        >
                          1년에 {fmtWon(annualSavingKrw(p.defTier as "pro" | "expert")!)} 절약
                        </span>
                      )}
                  </>
                )}
              </div>

              {/* 모바일18 — 기능 7~11줄이 모바일에서 카드를 길게 만든다.
                  모바일은 상위 5줄 + "전체 N개 보기" 토글, md+ 는 전체 노출.
                  숨긴 개수를 버튼에 적는다(몇 개가 접혔는지 모르게 하지 않는다). */}
              <FeatureList features={def.features} dark={p.dark} />


              <div className="flex-1" />

              {isCurrent ? (
                <button
                  type="button"
                  disabled
                  className="rounded-[14px] bg-bg p-[13px] text-center text-[15px] font-bold text-text-1 opacity-70"
                >
                  현재 이용 중
                </button>
              ) : p.checkoutTier ? (
                <>
                  {canCheckout ? (
                    <PlanCheckoutButton
                      tier={p.checkoutTier}
                      billing={billing}
                      label={p.cta}
                      className={p.ctaClass}
                    />
                  ) : (
                    <PreOrderCta
                      tier={p.checkoutTier}
                      billing={billing}
                      className={p.ctaClass}
                      dark={p.dark}
                      weeklyAvailable={paymentsReady && recurringReady === false}
                      guest={isGuest}
                    />
                  )}
                  {/* 2026-08-23: "포인트로 교환하기" 링크 제거 — 포인트↔구독 교환
                      상품이 토스 회신으로 내려가면서(catalog.ts 주석) 진입점도 삭제 */}
                </>
              ) : (
                /* [970 · A-06] 무료 카드 CTA — 게스트는 가입 입구(가입 후 이 화면으로 복귀),
                   로그인(유료 이용 중)은 예전처럼 노트 작성으로. 예전엔 게스트도
                   currentPlan="free" 로 들어와 "현재 이용 중" 비활성 버튼만 보였다. */
                <Link
                  href={isGuest ? "/signup?callbackUrl=%2Fsubscription" : "/notes/new"}
                  className={`rounded-[14px] p-[13px] text-center text-[15px] font-bold no-underline ${p.ctaClass}`}
                >
                  {p.cta}
                </Link>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
