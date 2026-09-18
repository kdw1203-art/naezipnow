import Link from "next/link";
import { planLabel } from "@/lib/subscriptions/labels";
import { PageShell } from "@/app/components/PageShell";
import { Icon } from "@/app/components/Icon";
import { safeAuth } from "@/lib/safe-auth";
import { getServiceSupabase } from "@/lib/supabase/service";
import { getUsageSummary, type UsageItem } from "@/lib/subscriptions/usage-summary";
import { loadMeProfile } from "@/lib/me/profile";
import { BILLING_PERIOD_PRICES, periodPrice, WEEKLY_PASS } from "@/lib/subscriptions/billing-periods";
import { PlanCards, type TierPricing } from "./PlanCards";
import { PreOrderCta } from "./PreOrderCta";
import {
  getBusinessInfo,
  isBusinessDisclosureComplete,
} from "@/lib/brand/business-info";
import { isTossPaymentsConfigured } from "@/lib/payments/toss-config";
import { isTossBillingEnabled } from "@/lib/payments/toss-billing";
import { BillingPanel } from "./BillingPanel";
import { getPlan, PLAN_FEATURE_MATRIX } from "@/lib/subscriptions/plans";
import { buildPageMetadata } from "@/lib/seo/page-metadata";
import { faqJsonLd, jsonLdScript, type FaqItem } from "@/lib/seo/jsonld";
import { ComplianceNotice } from "@/app/components/ComplianceNotice";
import { DEFAULT_DESKTOP_ORIGIN } from "@/lib/platform-shell";
import { PAYMENT_METHODS_PATH, REVIEW_CHECKOUT_PATH } from "@/lib/payments/payment-methods";
import { isTierOnSale, SELLABLE_PAID_TIERS } from "@/lib/subscriptions/sell-config";
import { safeInternalPath } from "@/lib/safe-path";

/* 고도화 32 — 구독 FAQ. 사실만 적는다: 수치·규정은 약관·구현과 대조했다. 화면과
   JSON-LD 가 같은 배열을 쓴다.

   [970 · A-22] 결제 방식·해지 경로 문장이 세 갈래였다 — FAQ 는 "월간·연간 정기결제",
   기간별 할인 부제는 "일시불", 하단은 "해지는 고객센터", ComplianceNotice 는 빌링
   개방 전이면 "모든 이용권 단건" 이라 한 화면 안에서 서로 다른 말을 했다. 사실은
   서버 판정(recurringOpen: 토스 빌링 개방 여부) 하나로 갈린다 — 개방 전엔 주간권·
   월간·연간 전부 1회성 단건(자동 반복청구 없음, ComplianceNotice LOCKED 문구와
   동일), 개방 후엔 주간권만 단건·월간·연간은 카드 등록형 자동결제(구독 관리에서
   해지). FAQ·부제·하단 문구가 전부 같은 값을 보게 함수로 바꾼다. 만료 알림은
   plan-expiry-sweep 크론이 하는 그대로(T-7 은 8일 이상 이용권만, T-1 은 전부). */
function subscriptionFaq(recurringOpen: boolean): FaqItem[] {
  return [
    {
      q: "무료로 쓸 수 있는 기능은 무엇인가요?",
      a: "임장노트 작성·저장, 지도 비교, 실거래 조회는 계속 무료예요. 유료 플랜은 AI 분석의 깊이와 월 사용 한도를 넓혀 줘요.",
    },
    {
      q: "결제는 어떻게 하나요?",
      a: recurringOpen
        ? `${WEEKLY_PASS.label}(${WEEKLY_PASS.days}일)은 카드 등록 없이 1회 결제하는 단건 상품이고, 월간·연간은 카드를 등록하면 첫 결제가 진행되는 자동결제(정기결제)예요. 결제는 토스페이먼츠 결제창에서 진행돼요. 포인트는 현금으로 구매(충전)할 수 없는 활동 적립 무상 리워드이며, 이용권 구매와는 무관해요.`
        : `${WEEKLY_PASS.label}(${WEEKLY_PASS.days}일)·월간·연간 모두 1회성 단건 결제예요(자동 반복청구 없음). 결제가 아직 열려 있지 않은 상품은 '오픈 알림 받기'로 등록해 두면 열리는 즉시 알림을 드려요. 포인트는 현금으로 구매(충전)할 수 없는 활동 적립 무상 리워드이며, 이용권 구매와는 무관해요.`,
    },
    {
      q: "이용권은 자동으로 갱신되나요?",
      a: recurringOpen
        ? `상품에 따라 달라요. ${WEEKLY_PASS.label}은 1회성 단건 결제라 자동 갱신되지 않고, 만료 하루 전에 알림을 드려요. 월간·연간 구독은 정기결제(자동 갱신)로, 카드 등록 시 갱신 주기·금액·해지 방법을 고지하고 동의를 받은 뒤에만 개시되며 언제든지 구독 관리에서 해지할 수 있어요(해지 시 다음 결제일부터 청구되지 않음).`
        : `아니요. 지금은 ${WEEKLY_PASS.label}·월간·연간 모두 1회성 단건 결제라 자동 갱신되지 않아요. 기간이 끝나면 자동으로 무료 플랜으로 돌아가고 추가 청구가 없어요. 만료 전(월간·연간은 7일 전과 1일 전, ${WEEKLY_PASS.label}은 하루 전)에 알림을 드려요.`,
    },
    {
      q: "해지·환불은 어떻게 하나요?",
      a: recurringOpen
        ? "결제 후 7일 이내에는 청약철회로 전액 환불돼요(이용약관 제8조). 월간·연간 자동결제 해지는 이 페이지의 구독 관리에서 바로 할 수 있고(해지해도 결제한 기간은 만료일까지 이용), 환불·중도 해지 일할 환불 접수는 고객센터 1:1 문의로 받고 있어요."
        : "결제 후 7일 이내에는 청약철회로 전액 환불돼요(이용약관 제8조). 단건 이용권은 자동 갱신이 없어 따로 해지할 것이 없고, 환불·중도 해지 일할 환불 접수는 고객센터 1:1 문의로 받고 있어요.",
    },
    {
      q: "플랜 배지는 어디에 표시되나요?",
      a: "커뮤니티 글·공개 노트·채팅 등 닉네임이 노출되는 모든 지점에 동일하게 표시되며, 설정에서 숨길 수 있어요.",
    },
  ];
}

export const metadata = buildPageMetadata({
  title: "요금제",
  description:
    "무료·프로·전문가 플랜의 기능 차이와 월간/연간 가격을 비교합니다.",
  path: "/subscription",
});

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* 가격 단일 출처: lib/subscriptions/billing-periods.ts — 화면에 금액을 하드코딩하지 않는다 */
const fmtWon = (n: number) => `${n.toLocaleString("ko-KR")}원`;

function tierPricing(tier: "pro" | "expert"): TierPricing {
  const m1 = periodPrice(tier, 1);
  const m12 = periodPrice(tier, 12);
  return {
    monthly: m1?.monthlyEquivalentKrw ?? 0,
    annualMonthly: m12?.monthlyEquivalentKrw ?? 0,
    annualTotal: m12?.totalKrw ?? 0,
    annualDiscountPct: m12?.discountPct ?? 0,
  };
}

const PLUS_MONTHLY = fmtWon(tierPricing("pro").monthly);
const PRO_MONTHLY = fmtWon(tierPricing("expert").monthly);
/* [970 · A-09 · C-15] 수수료는 marketplace-fees 단일 출처(/legal/fees·정산 계산과 같은 값) */

/* 웹25 — 비교표는 PLAN_FEATURE_MATRIX(access.ts FEATURE_RULES 와 동일화된 단일
   출처)에서 유도한다. 예전에는 이 파일에 손으로 적은 표가 따로 있었고, 코드
   어디에도 집행 로직이 없는 한도를 광고하고 있었다 — "쪽지 일 5건/30건",
   "노트 사진 노트당 50장"(실제 코드는 전 플랜 10장), "알림 지역 3곳·실시간",
   "시나리오 저장 10개", "다자 비교 5개"(실제 비교 트레이 한도는 2/10/무제한),
   "플러스 AI 무제한"(실제 월 30~50회). 기능 없는 약속은 버그다 — 코드가 실제로
   집행하는 한도만 싣는다. 수수료도 REPORT_SELLER_FEE_RATE 단일 출처다
   (예전 20%/15% 표기는 실제 7%와 달라 허위 고지였다). */
const FEATURE_ROWS: { label: string; free: string; plus: string; pro: string; proAccent?: boolean }[] = [
  { label: "임장노트 · 지도 · 실거래", free: "무제한", plus: "무제한", pro: "무제한" },
  ...PLAN_FEATURE_MATRIX.filter((r) => r.feature !== "리포트 판매").map((r) => ({
    label: r.feature,
    free: r.free === "불가" ? "—" : r.free,
    plus: r.pro === "불가" ? "—" : r.pro,
    pro: r.expert === "불가" ? "—" : r.expert,
  })),
  /* [992] "마켓 리포트 발행"·"유료 상담 수신" 행 제거 — 자료실·전문가는 보관(비노출) */
];

/* [992] 비교표 열은 판매 카탈로그(sell-config)에서 유도한다 — 프로(EXPERT)를 내리면 열도
   같이 사라진다. 열 수에 따라 grid 클래스를 **리터럴로** 고른다(Tailwind 는 동적 클래스명을
   못 본다). */
type CompareCol = { key: "free" | "plus" | "pro"; name: string; price: string; tone: string; soft: boolean };
const COMPARE_COLS: CompareCol[] = [
  { key: "free", name: "무료", price: "0원", tone: "text-ink", soft: false },
  { key: "plus", name: "✦ 플러스", price: `${PLUS_MONTHLY}/월`, tone: "text-primary", soft: true },
  ...(isTierOnSale("expert")
    ? [{ key: "pro" as const, name: "✦ 프로", price: `${PRO_MONTHLY}/월`, tone: "text-warning", soft: false }]
    : []),
];
const COMPARE_GRID_NARROW = COMPARE_COLS.length === 3 ? "grid-cols-3" : "grid-cols-2";
const COMPARE_GRID_WIDE =
  COMPARE_COLS.length === 3 ? "grid-cols-[200px_repeat(3,1fr)]" : "grid-cols-[200px_repeat(2,1fr)]";
function cellClass(col: CompareCol, r: (typeof FEATURE_ROWS)[number], narrow: boolean): string {
  const v = r[col.key];
  if (col.key === "free") return narrow ? (v === "—" ? "text-text-3" : "text-text-2") : `text-center ${v === "—" ? "text-text-3" : "text-text-2"}`;
  if (col.key === "plus")
    return narrow
      ? `rounded-md bg-[rgba(29,79,216,.04)] py-0.5 ${v === "—" ? "text-text-3" : "font-bold text-primary"}`
      : `bg-[rgba(29,79,216,.04)] py-1 text-center ${v === "—" ? "text-text-3" : "font-bold text-primary"}`;
  const pro = v === "—" ? (narrow ? "text-text-3" : "font-normal text-text-3") : r.proAccent ? "font-bold text-warning" : "font-bold text-primary";
  return narrow ? pro : `text-center ${pro}`;
}

/* 자체 맵이었다 — 같은 페이지 안에서 카드는 "프로 (전문가)", 비교표는 "프로" 였다.
   단일 출처(lib/subscriptions/labels)로 통일. */

function PlanBadge({ tier }: { tier: "plus" | "pro" }) {
  return (
    <span
      className={`rounded-full bg-brand-navy chip-pad text-[10px] font-extrabold ${
        tier === "plus" ? "text-ai-accent" : "text-brand-red-dark"
      }`}
    >
      ✦ {tier === "plus" ? "플러스" : "프로"}
    </span>
  );
}

/** [966] 단건 이용권 만료 — 구독 관리 헤더·해지 문구에 "언제까지" 를 적기 위해 */
async function loadPlanExpiresAt(email: string): Promise<string | null> {
  const sb = getServiceSupabase();
  if (!sb) return null;
  try {
    const { data } = await sb
      .from("app_users")
      .select("plan_expires_at")
      .eq("email", email.trim().toLowerCase())
      .maybeSingle();
    return data?.plan_expires_at ? String(data.plan_expires_at) : null;
  } catch {
    return null;
  }
}

export default async function SubscriptionPage({
  searchParams,
}: {
  searchParams?: Promise<{ plan?: string; billing?: string; returnTo?: string }>;
}) {
  // 결제 실패 페이지의 "다시 시도하기"가 plan/billing 쿼리를 들고 돌아온다 —
  // 고른 주기를 다시 고르게 하지 않도록 토글 초기값으로 반영한다.
  const sp = (await searchParams) ?? {};
  /* 항목 33 — 결제가 실제로 열릴 수 있는 상태인지 서버에서 판정한다.
     사업자 고지(주소·통신판매업 번호)가 비어 있으면 checkout 라우트들이 전부
     503 을 내고, 토스 키가 없어도 마찬가지다([992] 레일은 토스 하나). 그 상태에서
     결제 버튼을 그리는 건 눌러야만 알 수 있는 거짓 입구다 — 대신 "결제 준비
     중 + 오픈 알림 받기"로 구매 의사를 기록한다. */
  /* 결제 개통 판정 — 토스 포함(빠져 있어서 키를 넣어도 '오픈 알림'만 떴다).
     - 라이브: 사업자 고지 완비(주소·통판번호·유선번호) + PSP 1개 이상.
     - 토스 **테스트 키**: 승인이 가상이라 실청구가 없고(환경 가이드), 상점
       심사역도 운영 도메인에서 테스트 결제를 끝까지 돌려 본다(confirm 라우트
       주석) — 고지 env 완비 전에도 연다. 라이브 키 전환 시 이 우회는 사라지고
       고지 완비가 다시 필수다. */
  const tossTestMode =
    isTossPaymentsConfigured() &&
    (process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY?.trim() ?? "").startsWith("test_ck_");
  /* [992] 레일은 토스 하나 — Stripe·카카오페이 판정을 뺐다(레일 6→1). */
  const paymentsReady =
    (isBusinessDisclosureComplete(getBusinessInfo()) && isTossPaymentsConfigured()) ||
    tossTestMode;
  /* [965] 월간·연간을 실제로 팔 수 있는가. 토스 키만 있고 빌링(전자계약)이 개방되지
     않은 상태에서는 월간·연간이 어느 창으로도 못 가는데, 예전 판정(paymentsReady)은
     토스 키 하나로 true 가 되어 카드의 월간·연간 버튼이 눌러 보기 전엔 안 되는
     버튼이었다. [992] 레일이 토스 하나가 되면서 정기 판매 = 빌링 개방 여부 그 자체다. */
  const recurringOpen = isTossBillingEnabled();
  const recurringReady = recurringOpen;
  /* [970 · A-22] FAQ(화면 + JSON-LD)는 결제 방식 사실(recurringOpen)에 따라 갈린다 */
  const faq = subscriptionFaq(recurringOpen);
  const initialBilling = sp.billing === "annual" ? ("annual" as const) : ("monthly" as const);
  /* [970 · A-07] 로그인 복귀(PlanCheckoutButton) · 결제 실패 재시도(payment/fail)가 붙여
     보내는 ?plan= 을 읽는다 — 예전엔 billing 만 복원해 고른 플랜을 다시 찾아야 했다.
     billing=weekly 는 카드가 아니라 주간권 섹션이 목적지다(앵커 id: weekly-pass). */
  const highlightPlan: "pro" | "expert" | "weekly" | null =
    sp.billing === "weekly"
      ? "weekly"
      : sp.plan === "pro" || sp.plan === "expert"
        ? sp.plan
        : null;
  /* [1003] 주간권 결제창 **직행** 링크.
     2026-09-16 13:57 KST 심사 세션 실측: `/` → `/subscription`(13.5초 체류) → `/` 이탈,
     `/subscription/checkout` 페이지뷰 0건. 1순위 버튼(PlanCheckoutButton)이 누르면
     "…결제창으로 이동합니다 / 취소 / 계속" 2단계로 바뀌는 구조라, 한 번 누르고 아무 일도
     안 일어난 것처럼 보였을 가능성이 크다. 주간권만은 <Link> 한 번으로 체크아웃(=결제창을
     여는 화면)에 닿게 한다. 경로는 REVIEW_CHECKOUT_PATH 단일 출처(심사 메모에 적어 낸 URL).
     페이월이 붙여 보낸 ?returnTo= 는 그대로 이어 붙인다(safeInternalPath — 내부 경로만). */
  const returnTo = sp.returnTo ? safeInternalPath(sp.returnTo, "") : "";
  const weeklyCheckoutHref =
    returnTo && returnTo !== "/"
      ? `${REVIEW_CHECKOUT_PATH}&returnTo=${encodeURIComponent(returnTo)}`
      : REVIEW_CHECKOUT_PATH;
  const session = await safeAuth();
  const email = session?.user?.email ?? null;
  /* 관리자 배지 — 운영 계정은 플랜 대신 "관리자"로 표기한다. */
  const isAdminViewer = (session?.user as { role?: string } | undefined)?.role === "admin";
  let currentPlan: "free" | "pro" | "expert" = "free";
  let usage: UsageItem[] = [];
  let planExpiresAt: string | null = null;
  if (email) {
    const profile = await loadMeProfile(email, {
      name: session?.user?.name,
      plan: (session?.user as { plan?: string } | undefined)?.plan,
      role: (session?.user as { role?: string } | undefined)?.role,
    });
    currentPlan = profile.plan;
    planExpiresAt = await loadPlanExpiresAt(email);
    /* 지금 얼마나 썼는지 — 한도는 카드에 적혀 있는데 내가 얼마 썼는지는 어디에도
       없었다. 살지 말지를 정하는 숫자가 그것인데. 실패해도 페이지는 그대로 산다. */
    usage = await getUsageSummary(email, profile.plan)
      .then((u) => u.items)
      .catch(() => []);
  }

  /* 항목 46d — 요금제를 Product/Offer 로 기술. 가격은 billing-periods 단일
     출처에서만 오고, availability 는 결제 개통 여부 사실을 그대로 싣는다
     (미개통인데 InStock 이라 적으면 구조화 데이터가 거짓이 된다). */
  const availability = paymentsReady
    ? "https://schema.org/InStock"
    : "https://schema.org/PreOrder";
  /* [1004 · 리뷰] 정기(월간·연간)는 빌링 레일이 열려 있어야 살 수 있다 — 단건 주간권과 조건이 다르다.
     결제 키는 있는데 빌링이 미개방이면 화면 CTA 는 "오픈 알림"인데 스키마만 InStock 이라 거짓이 됐다. */
  const recurringAvailability = paymentsReady && recurringReady
    ? "https://schema.org/InStock"
    : "https://schema.org/PreOrder";
  const plansJsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: "내집나우 멤버십 요금제",
    itemListElement: SELLABLE_PAID_TIERS.map((tier, i) => {
      const p = tierPricing(tier);
      return {
        "@type": "ListItem",
        position: i + 1,
        item: {
          "@type": "Product",
          /* [1004 · 리뷰] 고객이 사는 상품명·설명과 같은 말을 쓴다 — 내부 티어명(PRO·EXPERT)도,
             992 에서 화면에서 지운 전문가 마켓 문구도 스키마에만 남겨 두지 않는다(플랜 정의 단일 출처). */
          name: `내집나우 ${planLabel(tier)} 멤버십`,
          description: `${getPlan(tier).tagline} · ${getPlan(tier).positioning}`,
          offers: [
            {
              "@type": "Offer",
              price: p.monthly,
              priceCurrency: "KRW",
              availability: recurringAvailability,
              url: `${DEFAULT_DESKTOP_ORIGIN}/subscription`,
            },
            /* 주간권(단건) — 플러스 전용. 가격은 billing-periods 단일 출처. */
            ...(tier === WEEKLY_PASS.tier
              ? [
                  {
                    "@type": "Offer",
                    price: WEEKLY_PASS.totalKrw,
                    priceCurrency: "KRW",
                    availability,
                    url: `${DEFAULT_DESKTOP_ORIGIN}/subscription?billing=weekly`,
                  },
                ]
              : []),
            ...(p.annualTotal > 0
              ? [
                  {
                    "@type": "Offer",
                    price: p.annualTotal,
                    priceCurrency: "KRW",
                    availability: recurringAvailability,
                    url: `${DEFAULT_DESKTOP_ORIGIN}/subscription?billing=annual`,
                  },
                ]
              : []),
          ],
        },
      };
    }),
  };

  return (
    <PageShell breadcrumb="멤버십 상세" wide>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(plansJsonLd) }}
      />
      {/* 히어로 (6l) */}
      <section className="rise-in flex flex-col items-center gap-2 pt-4 text-center">
        <h1 className="t-title tracking-[-0.5px] text-ink md:t-title">
          기록은 무료, 판단은 더 깊게
        </h1>
        <p className="t-body text-text-2">
          임장노트와 지도는 영원히 무료. AI 분석의 깊이를 선택하세요.
        </p>
        {email && (
          <span className="mt-1 rounded-full bg-primary-soft px-3 py-1 t-sub font-bold text-primary">
            현재 플랜 · {isAdminViewer ? "관리자 (모든 기능 무제한)" : planLabel(currentPlan)}
          </span>
        )}
      </section>

      {/* 이번 달 사용량 — 로그인한 사람에게만, 값이 있을 때만.
          "월 30회"가 카드에 적혀 있어도 내가 12회를 썼는지 29회를 썼는지 모르면
          그 숫자는 판단에 쓸 수 없다. */}
      {email && usage.length > 0 && (
        <section className="mt-5" data-reveal="">
          <div className="card flex flex-col gap-3 rounded-[14px] p-4">
            <div className="flex flex-wrap items-baseline gap-2">
              <span className="t-section text-ink">이번 달 내 사용량</span>
              <span className="t-caption ml-auto text-text-3">
                {planLabel(currentPlan)} 기준 · {usage.some((u) => u.lifetime) ? "AI 분석은 누적, 나머지는 매월 1일 초기화" : "매월 1일 초기화"}
              </span>
            </div>
            <div className="kpi-row">
              {usage.map((u) => {
                const cap = u.limit;
                const unlimited = cap === null;
                const pct =
                  cap === null || cap <= 0 ? 0 : Math.min(100, Math.round((u.used / cap) * 100));
                const tight = cap !== null && cap > 0 && u.used / cap >= 0.8;
                return (
                  <div key={u.key} className="kpi">
                    <span className="kpi-k">{u.lifetime ? `${u.label} (누적)` : u.label}</span>
                    <span className="kpi-v">
                      {u.used.toLocaleString("ko-KR")}
                      <span className="t-sub font-bold text-text-3">
                        {cap === null ? " / 무제한" : ` / ${cap.toLocaleString("ko-KR")}`}
                      </span>
                    </span>
                    {!unlimited && (
                      <span className={`rank-track mt-1 ${tight ? "text-warning" : "text-primary"}`}>
                        <span className="rank-fill" style={{ width: `${Math.max(3, pct)}%` }} />
                      </span>
                    )}
                    {tight && (
                      <span className="kpi-d text-warning">
                        한도의 {pct}% 사용 — 곧 막혀요
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {/* 플러스 주간권 — 1회성 단건 결제(자동갱신 없음). 운영자 확정 2026-08-12:
          토스 심사 회신 A-1(a) 의 단건 상품. 가격·기간은 WEEKLY_PASS 단일 출처.

          [1003] 요금제 카드 **위**로 올렸다. 예전에는 카드 3종 → 신뢰 스트립 →
          결제수단 한 줄을 지나야 이 블록이 나왔다. 2026-09-16 13:57 KST 토스 심사
          세션은 이 화면에 13.5초 머물고 `/subscription/checkout` 에 한 번도 오지
          못한 채 홈으로 돌아갔다(page_view_events 실측). 지금 이 사이트에서 카드로
          곧장 살 수 있는 유일한 상품이 주간권이므로 첫 화면 안에 둔다 — 심사가
          찾는 것("신용/체크카드 결제창")이 스크롤 없이 보여야 한다. */}
      {/* [970 · A-07] id·scroll-mt — ?billing=weekly 로 돌아온 사람을 PlanCards 가 여기로
          스크롤한다(헤더 62px 아래). 강조 링은 그때만 붙인다. */}
      <section
        id="weekly-pass"
        className="rise-in-2 mx-auto mt-6 w-full max-w-[1080px] scroll-mt-24"
      >
        <div
          className={`card flex flex-col items-center gap-4 rounded-3xl p-6 md:flex-row md:justify-between ${
            highlightPlan === "weekly" ? "ring-2 ring-primary" : ""
          }`}
        >
          <div className="flex flex-col gap-1 text-center md:text-left">
            <div className="flex flex-wrap items-center justify-center gap-2 md:justify-start">
              {/* [C38] 주간권이 위 세 플랜과 나란히 놓이면 "네 번째 요금제"로 읽힌다.
                  실제로는 **플러스를 카드 등록 없이 먼저 써보는 길**이다 —
                  월간·연간은 카드 등록형 자동결제(/subscription/billing)이고
                  이것만 단건이다. 그 차이가 고르는 이유이므로 먼저 적는다. */}
              <span className="rounded-md bg-primary-soft chip-pad t-caption font-extrabold text-primary">
                카드 등록 없이
              </span>
              <div className="t-section text-ink">
                {WEEKLY_PASS.label} · {WEEKLY_PASS.totalKrw.toLocaleString("ko-KR")}원
              </div>
            </div>
            <p className="t-sub text-text-3">
              {WEEKLY_PASS.days}일 동안 플러스 기능 전체 이용 · 1회성 단건 결제(자동
              반복청구 없음) · 기간이 끝나면 자동으로 무료 플랜으로 돌아가며 추가
              청구가 없습니다
            </p>
            {/* 하루 단가는 월간이 더 싸다 — 그 사실을 감추지 않는다.
                주간권의 가치는 가격이 아니라 "약정 없이 먼저 써본다"는 데 있다. */}
            <p className="t-sub text-text-3">
              하루 {Math.round(WEEKLY_PASS.totalKrw / WEEKLY_PASS.days).toLocaleString("ko-KR")}원
              꼴이에요. 계속 쓰실 것 같으면 월간(
              {Math.round(tierPricing("pro").monthly / 30).toLocaleString("ko-KR")}원/일)이 더
              저렴합니다.
            </p>
            {/* [1003] 취급 결제수단 — 990 에서 만든 문장을 요금제 카드 아래에서 여기로
                옮겼다. "무엇으로 결제하는가"는 결제 버튼 옆에서 읽혀야 하고, 2026-09
                토스 반려 사유가 정확히 그 자리다("결제수단 신용/체크카드가 확인되지
                않습니다"). 같은 사실이 두 곳에서 읽히지 않도록 아래 신뢰 스트립의
                "카드번호는 남지 않아요" 줄은 뺐다 — 결제수단의 단일 출처는 이 줄이다. */}
            <p className="mt-1 t-sub text-text-3">
              <span className="font-bold text-ink">신용카드 · 체크카드</span> 결제
              (토스페이먼츠 결제창) · 카드번호는 내집나우 서버에 저장되지 않습니다 ·{" "}
              <Link
                href={PAYMENT_METHODS_PATH}
                /* 문장 속 링크의 기준은 WCAG 2.5.8(24px) — inline-block + 세로 패딩으로
                   글자줄만 키운다(44px 히트를 겹치면 위아래 줄의 탭을 훔친다). */
                className="inline-block py-[5px] font-bold text-primary underline"
              >
                결제 수단 안내
              </Link>
            </p>
          </div>
          {/* [966] 상태별로 정직하게: 결제 미개통이면 사전 등록(예전엔 버튼이 통째로
              사라져 설명만 남는 죽은 카드였다), 이미 프로(expert)면 사지 못하게 —
              사면 applyPlan 이 "다른 플랜" 으로 보고 7일짜리 플러스로 **강등**된다. */}
          <div className="w-full shrink-0 md:w-[236px]">
            {currentPlan === "expert" ? (
              <p className="rounded-[14px] bg-bg p-[13px] text-center t-sub font-bold text-text-2">
                프로 이용 중이라 주간권이 필요 없어요 — 플러스 기능은 이미 전부 열려 있습니다.
              </p>
            ) : paymentsReady ? (
              /* [1003] 주간권 버튼은 링크 직행이다(2단계 확인 제거 — 토스 심사 세션이 멈춘 자리).
                 [1004] 월간·연간(PlanCards)의 버튼도 같은 이유로 링크가 됐다 — 확인은 체크아웃·
                 카드 등록 화면이 이미 한 번 더 한다(주문 요약·동의 체크). 목적지 규칙은
                 lib/subscriptions/checkout-href.ts 단일 출처. */
              <div className="flex flex-col gap-1.5">
                <Link
                  href={weeklyCheckoutHref}
                  className="press block w-full rounded-[14px] bg-brand-navy p-[13px] text-center text-[13px] font-bold text-on-dark no-underline"
                >
                  {`카드로 ${WEEKLY_PASS.totalKrw.toLocaleString("ko-KR")}원 결제하기 (${WEEKLY_PASS.days}일 이용권)`}
                </Link>
                <p className="text-center t-caption text-text-3">
                  {currentPlan === "pro"
                    ? "이용 중인 플러스 만료일 뒤로 7일이 이어 붙어요"
                    : "누르면 신용·체크카드 결제창이 열려요 · 결제 버튼을 누르기 전까지 청구되지 않습니다"}
                </p>
              </div>
            ) : (
              /* [970 · A-38] 게스트는 로그인 유도 — 세션 없는 등록은 알림을 보낼 수 없다 */
              <PreOrderCta
                tier="pro"
                billing="weekly"
                className="w-full bg-brand-navy text-on-dark"
                guest={!email}
              />
            )}
          </div>
        </div>
      </section>

      {/* P2-8: 환불 규정 직링크 — 약관 제8조(청약철회) 앵커.
          [1003] 주간권 블록과 함께 위로 올라왔다 — 상품·금액·환불 규정이 한 화면에
          붙어 있어야 한다(전자상거래법 고지이자 심사가 한 번에 확인하는 묶음). */}
      <p className="rise-in-2 mx-auto mt-3 w-full max-w-[1080px] text-center t-sub text-text-3">
        결제 7일 이내 청약철회(환불) 가능 ·{" "}
        <Link
          href="/legal/terms#refund"
          /* [990] 문장 속 링크의 기준은 WCAG 2.5.8(24px) — 44px 히트를 겹쳐 얹으면
             윗줄·아랫줄의 탭을 가져간다(989 에서 되돌린 적 있음). inline-block +
             세로 패딩으로 글자줄만 24px 로 키운다(푸터 대표전화와 같은 방식). */
          className="inline-block py-[5px] font-bold text-primary underline underline-offset-2"
        >
          환불 규정 안내
        </Link>
      </p>

      {/* 요금제 카드 3종 + 월간/연간 토글 (item 13) */}
      <section className="mx-auto mt-8 w-full">
        {/* [970 · A-06] 비로그인은 currentPlan=null — 게스트에게 무료 카드를 "현재 이용 중"
            으로 그리면 가입 입구("무료로 시작")가 사라진다. 로그인 상태만 현재 플랜을 넘긴다. */}
        <PlanCards
          currentPlan={email ? currentPlan : null}
          pro={tierPricing("pro")}
          expert={tierPricing("expert")}
          initialBilling={initialBilling}
          paymentsReady={paymentsReady}
          recurringReady={recurringReady}
          highlightPlan={highlightPlan}
          returnTo={returnTo || null}
        />
        {/* [966] 결제 신뢰 스트립 — 카드 아래에서 "무엇이 보장되는지" 를 짧게.
            전부 코드가 실제로 하는 일이다: 결제 즉시 이용권이 적용되며 영수증 메일·
            알림이 나가고(965·966), 7일 이내 청약철회는 약관 제8조. */}
        {/* [1003] "카드번호는 남지 않아요" 줄을 뺐다 — 같은 사실(수단 + 미저장)이 위
            주간권 블록의 결제수단 한 줄에 모였다. 한 화면에서 두 번 읽히면 어느 쪽이
            최신인지 알 수 없어지고, 실제로 990 에서 만든 결제수단 문장이 이 카드와
            내용이 겹친 채 서로 다른 곳에 떨어져 있었다. 단일 출처는 결제 블록이다. */}
        <ul className="mx-auto mt-4 grid w-full max-w-[1080px] grid-cols-1 gap-2 sm:grid-cols-2">
          {[
            { icon: "receipt", title: "즉시 적용 · 영수증 메일", desc: "결제가 끝나면 바로 이용권이 켜지고, 알림함과 이메일로 영수증을 보내드려요" },
            { icon: "shield", title: "7일 이내 청약철회", desc: "결제 후 7일 이내 전액 환불, 이후 중도 해지는 잔여기간 일할 환불 (약관 제8조)" },
          ].map((t) => (
            <li key={t.title} className="flex items-start gap-2.5 rounded-xl border border-line bg-surface px-3.5 py-3">
              <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-hanji text-brand-hanji-ink">
                <Icon name={t.icon} size={14} />
              </span>
              <span className="flex flex-col gap-0.5">
                <span className="t-sub font-extrabold text-ink">{t.title}</span>
                <span className="t-caption leading-[1.5] text-text-3">{t.desc}</span>
              </span>
            </li>
          ))}
        </ul>
        {/* [1003] 취급 결제수단 한 줄은 위 주간권(결제) 블록으로 올렸다 — 결제수단은
            결제 버튼 옆에서 읽혀야 하고, 심사가 찾는 것도 그 자리다. */}
      </section>
      {/* E1 — 구독 관리·결제 내역. `/my` 가 "구독 페이지에서 관리해요"라고 보내던 목적지.
          로그인하지 않았으면 보여 줄 사실이 없으므로 아예 렌더하지 않는다. */}
      {email && (
        <BillingPanel
          email={email}
          currentPlan={currentPlan}
          planExpiresAt={planExpiresAt}
        />
      )}

      {/* 기능 비교표 (9k · [C49] 좁은 화면 배치 · [992] 열은 COMPARE_COLS 에서 유도) */}
      <section className="rise-in-4 card mx-auto mt-8 w-full max-w-[1080px] rounded-[18px] px-[22px] py-5">
        {/* ── 좁은 화면(< md) ── */}
        <div className="md:hidden">
          <div className="mb-2 t-sub font-bold text-text-3">기능 비교</div>
          <div className={`sticky top-[62px] z-10 grid ${COMPARE_GRID_NARROW} gap-1.5 rounded-[10px] bg-surface py-1.5`}>
            {COMPARE_COLS.map((c) => (
              <div key={c.key} className={`text-center ${c.soft ? "rounded-[8px] bg-[rgba(29,79,216,.06)] py-0.5" : ""}`}>
                <div className={`t-sub font-extrabold ${c.tone}`}>{c.name}</div>
                <div className="t-sub text-text-3">{c.price}</div>
              </div>
            ))}
          </div>
          {FEATURE_ROWS.map((r) => (
            <div key={r.label} className="border-t border-divider py-2">
              <div className="mb-1 t-sub font-semibold text-text-2">{r.label}</div>
              <div className={`grid ${COMPARE_GRID_NARROW} gap-1.5 text-center t-sub`}>
                {COMPARE_COLS.map((c) => (
                  <span key={c.key} className={cellClass(c, r, true)}>
                    {r[c.key]}
                  </span>
                ))}
              </div>
            </div>
          ))}
          <div className="border-t border-divider py-2">
            <div className="mb-1 t-sub font-semibold text-text-2">프로필 인증배지</div>
            <div className={`grid ${COMPARE_GRID_NARROW} items-center gap-1.5 text-center`}>
              {COMPARE_COLS.map((c) => (
                <span key={c.key} className={c.soft ? "rounded-md bg-[rgba(29,79,216,.04)] py-0.5" : ""}>
                  {c.key === "free" ? <span className="t-sub text-text-3">—</span> : <PlanBadge tier={c.key} />}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* ── 넓은 화면(md+) ── */}
        <div className="hidden overflow-x-auto md:block">
          <div className={COMPARE_COLS.length === 3 ? "min-w-[640px]" : "min-w-[520px]"}>
            <div className={`grid ${COMPARE_GRID_WIDE} items-end gap-2 border-b border-divider pb-3 pt-1.5`}>
              <span className="t-sub text-text-3">기능 비교</span>
              {COMPARE_COLS.map((c) => (
                <div key={c.key} className={`text-center ${c.soft ? "rounded-[10px] bg-[rgba(29,79,216,.05)] py-1.5" : ""}`}>
                  <div className={`t-body font-extrabold ${c.tone}`}>{c.name}</div>
                  <div className="t-title text-ink">
                    {c.key === "free" ? "0원" : (
                      <>
                        {c.key === "plus" ? PLUS_MONTHLY : PRO_MONTHLY}
                        <span className="t-sub text-text-3">/월</span>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
            {FEATURE_ROWS.map((r) => (
              <div
                key={r.label}
                className={`grid ${COMPARE_GRID_WIDE} items-center gap-2 border-b border-divider py-2.5 t-sub`}
              >
                <span className="text-text-2">{r.label}</span>
                {COMPARE_COLS.map((c) => (
                  <span key={c.key} className={cellClass(c, r, false)}>
                    {r[c.key]}
                  </span>
                ))}
              </div>
            ))}
            <div className={`grid ${COMPARE_GRID_WIDE} items-center gap-2 py-2.5 t-sub`}>
              <span className="text-text-2">프로필 인증배지</span>
              {COMPARE_COLS.map((c) => (
                <span key={c.key} className={`text-center ${c.soft ? "bg-[rgba(29,79,216,.04)] py-1" : ""}`}>
                  {c.key === "free" ? <span className="text-text-3">—</span> : <PlanBadge tier={c.key} />}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* 기간별 할인 (9k)
          [970 · A-05] 모바일에서 12개월 열·할인율이 화면 밖이었다 — 열이 셋(라벨+월간+12개월)
          뿐이라 가로 스크롤이 필요 없다. 최소 폭은 md+ 에서만, 라벨 칸은 모바일 88px,
          제목 줄은 flex-wrap 으로 부제가 아래로 내려가게. overflow-x-auto 도 md+ 만. */}
      <section className="rise-in-5 card mx-auto mt-4 w-full max-w-[1080px] rounded-2xl px-5 py-4 md:overflow-x-auto">
        <div className="md:min-w-[560px]">
          <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
            <span className="t-section text-ink">기간별 할인 (월 환산가)</span>
            {/* [970 · A-22] 결제 방식은 recurringOpen 사실 그대로 — 개방 전엔 전부 단건 */}
            <span className="t-sub text-text-3">
              {recurringOpen
                ? "월간·연간은 카드 등록형 자동결제 · 중도 해지 시 잔여기간 일할 환불(고객센터 접수)"
                : "1회성 단건 결제(자동 갱신 없음) · 중도 해지 시 잔여기간 일할 환불(고객센터 접수)"}
            </span>
          </div>
          <div className="grid grid-cols-[88px_repeat(2,1fr)] gap-2 border-b border-divider py-[7px] t-sub text-text-3 md:grid-cols-[120px_repeat(2,1fr)]">
            <span />
            {BILLING_PERIOD_PRICES.pro.map((p) => (
              <span key={p.months} className="text-center">
                {p.months === 1 ? "월간" : `${p.months}개월`}
              </span>
            ))}
          </div>
          <div className="grid grid-cols-[88px_repeat(2,1fr)] items-center gap-2 border-b border-divider py-2.5 t-sub md:grid-cols-[120px_repeat(2,1fr)]">
            <span className="font-extrabold text-primary">✦ 플러스</span>
            {BILLING_PERIOD_PRICES.pro.map((p) => (
              <span
                key={p.months}
                className={`text-center ${
                  p.months === 12 ? "font-extrabold text-primary" : "font-bold text-text-1"
                }`}
              >
                {fmtWon(p.monthlyEquivalentKrw)}
                {p.discountPct > 0 && (
                  <span className="ml-0.5 t-caption font-medium text-text-3">
                    -{Math.round(p.discountPct)}%
                  </span>
                )}
              </span>
            ))}
          </div>
          {isTierOnSale("expert") && (
          <div className="grid grid-cols-[88px_repeat(2,1fr)] items-center gap-2 py-2.5 t-sub md:grid-cols-[120px_repeat(2,1fr)]">
            <span className="font-extrabold text-warning">✦ 프로</span>
            {BILLING_PERIOD_PRICES.expert.map((p) => (
              <span
                key={p.months}
                className={`text-center ${
                  p.months === 12 ? "font-extrabold text-warning" : "font-bold text-text-1"
                }`}
              >
                {fmtWon(p.monthlyEquivalentKrw)}
                {p.discountPct > 0 && (
                  <span className="ml-0.5 t-caption font-medium text-text-3">
                    -{Math.round(p.discountPct)}%
                  </span>
                )}
              </span>
            ))}
          </div>
          )}
        </div>
      </section>

      {/* [992] "배지 노출 예시" 3장 삭제 — 꾸민 그림(가공 닉네임·점수)이었고, 유료 티어가
          하나가 되면서 배지 비교 자체가 사라졌다. 배지는 비교표 마지막 줄에 있다. */}

      {/* 고도화 32 — 구독 FAQ. 결제 수단·환불·해지가 화면 곳곳에 흩어져 있던
          것을 한 자리에 모은다. 아래 JSON-LD 는 이 배열 그대로에서 생성한다
          (화면에 없는 질문을 스키마에만 넣지 않는다 — faqJsonLd 규칙). */}
      <section className="rise-in-4 card mx-auto mt-8 w-full max-w-[1080px] rounded-[18px] px-[22px] py-5">
        <h2 className="t-section text-ink">자주 묻는 질문</h2>
        <div className="mt-3 flex flex-col gap-3">
          {faq.map((f) => (
            <div key={f.q} className="border-l-2 border-line pl-3">
              <div className="t-body font-bold text-text-1">{f.q}</div>
              <p className="mt-0.5 t-sub text-text-3">{f.a}</p>
            </div>
          ))}
        </div>
      </section>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript(faqJsonLd(faq)) }}
      />

      {/* [969] 하이드레이션 불일치 원인 수정 — 예전엔 아래 안내 <div>(안에 <p>)가 이 <p>
          **안에** 있었다. 브라우저는 <p> 안의 <div> 를 만나면 <p> 를 먼저 닫아 버리므로
          서버 HTML 과 React 트리가 달라졌고, /subscription 모바일에서 React #418 이 6회 중
          1회꼴로 났다(dev 서버 실측: "In HTML, <p> cannot be a descendant of <p>"). 형제로 분리. */}
      <div className="mx-auto mt-4 w-full max-w-[1080px]">
        {/* 수익 문구 미기재 방침 + 서비스 제공기간(무형재화 판매정책 필수 표기) */}
        <ComplianceNotice variant="payment" recurringOpen={recurringOpen} />
      </div>
      <p className="mx-auto mt-5 w-full max-w-[1080px] t-sub text-text-3">
        {/* "언제든 해지 가능"만 적어 두면 화면 어딘가에 해지 버튼이 있다는 뜻으로 읽힌다.
            [970 · A-22] 빌링 개방 후엔 자동결제 해지 버튼이 구독 관리(BillingAutopayCard)에
            실제로 있다 — 환불 접수만 고객센터. 개방 전엔 전부 단건이라 해지할 것이 없고
            환불 접수만 남는다. 위 FAQ·ComplianceNotice 와 같은 recurringOpen 을 본다. */}
        {recurringOpen
          ? `${WEEKLY_PASS.label}은 단건, 월간·연간은 자동결제(해지는 구독 관리에서) · 환불 접수는 고객센터 1:1 문의 · 결제 7일 이내 전액 환불 · 부가세 포함 · `
          : "모든 이용권은 1회성 단건 결제(자동 갱신 없음) · 환불 접수는 고객센터 1:1 문의 · 결제 7일 이내 전액 환불 · 부가세 포함 · "}
        커뮤니티 글·공개 노트·채팅 등 모든 닉네임 노출 지점에 동일 배지 적용
      </p>
    </PageShell>
  );
}
