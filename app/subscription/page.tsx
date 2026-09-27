import Link from "next/link";
import { planLabel } from "@/lib/subscriptions/labels";
import { PageShell } from "@/app/components/PageShell";
import { BILLING_PERIOD_PRICES, periodPrice, WEEKLY_PASS } from "@/lib/subscriptions/billing-periods";
import { PlanCards, type TierPricing } from "./PlanCards";
import { CurrentPlanBadge, UsageCard, WeeklyPassCta, WeeklyPassFrame } from "./ViewerCards";
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
/* [1007] ISR 1시간 — 예전엔 `searchParams`(plan·billing·returnTo)와 `safeAuth()`+loadMeProfile+
   getUsageSummary+결제 내역을 서버에서 읽어 force-dynamic 이었고, 24h 실측 함수 호출 200회 중
   사람 방문은 한 자릿수였다. 이 HTML 은 **비회원이 보는 화면 그대로**다(토스 심사가 보는 화면 —
   세 카드·주간권 결제 버튼·결제수단 문장·FAQ·JSON-LD 전부 서버 렌더). 로그인한 사람에게만
   달라지는 조각(현재 플랜 배지·사용량·주간권 버튼 문구·카드 CTA 목적지·구독 패널)은
   ViewerCards·PlanCards·BillingPanel(클라이언트)이 세션 판정 뒤 바꾼다. 결제 개통 판정
   (paymentsReady·recurringOpen)은 env 로 배포 단위에 굳는 값이라 ISR 에 실려도 같다. */
/* [1010] 3,600 → 86,400(1일). 비회원 기준 요금 카드·FAQ·JSON-LD 만 있는 고정 문서이고
   (로그인 조각은 클라이언트) 값은 코드 상수다 — 배포로만 바뀐다. 실측 하루 200회 함수 호출. */
export const revalidate = 86_400;

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
/* [v4 · 규칙 6] 열 이름의 장식 기호(✦)를 뗐다 — 이름은 planLabel 단일 출처 그대로 */
const COMPARE_COLS: CompareCol[] = [
  { key: "free", name: planLabel("free"), price: "0원", tone: "text-ink", soft: false },
  { key: "plus", name: planLabel("pro"), price: `${PLUS_MONTHLY}/월`, tone: "text-primary", soft: true },
  ...(isTierOnSale("expert")
    ? [{ key: "pro" as const, name: planLabel("expert"), price: `${PRO_MONTHLY}/월`, tone: "text-warning", soft: false }]
    : []),
];
const COMPARE_GRID_NARROW = COMPARE_COLS.length === 3 ? "grid-cols-3" : "grid-cols-2";
const COMPARE_GRID_WIDE =
  COMPARE_COLS.length === 3 ? "grid-cols-[minmax(0,1fr)_repeat(3,104px)]" : "grid-cols-[minmax(0,1fr)_repeat(2,104px)]";
/* [v4 · 규칙 5·10] 열 강조 면(연파랑 띠)을 뗐다 — 열은 정렬로 맞추고, 플러스 값만 굵은 파랑 */
function cellClass(col: CompareCol, r: (typeof FEATURE_ROWS)[number]): string {
  const v = r[col.key];
  if (v === "—") return "text-text-3";
  if (col.key === "free") return "text-text-2";
  if (col.key === "plus") return "font-bold text-primary";
  return r.proAccent ? "font-bold text-warning" : "font-bold text-ink";
}

/* [966] 단건 이용권 만료(plan_expires_at)는 [1007] 부터 /api/subscriptions/summary 가 읽는다 */

export default async function SubscriptionPage() {
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
  /* [970 · A-07] ?plan=·?billing=·?returnTo= 는 [1007] 부터 PlanCards·WeeklyPassCta·WeeklyPassFrame 이
     마운트 뒤 읽는다(lib/subscriptions/page-params) — 판정 규칙은 예전 그대로다. */

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
  /* [1012] 히어로 한 줄에 쓰는 AI 분석 도구 한도 — 비교표와 같은 행에서 읽는다(손으로 적지 않는다) */
  const aiToolRow = PLAN_FEATURE_MATRIX.find((r) => r.feature === "AI 분석 도구") ?? null;
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


  /* [v4 · 규칙 1] 머리 사실 한 줄 — AI 분석 한도(비교표와 같은 행)만. "임장노트·지도는 무료" 문장은 비교표 첫 행이 말한다 */
  const headFact = aiToolRow
    ? `AI 분석 ${planLabel("free")} ${aiToolRow.free} · ${planLabel("pro")} ${aiToolRow.pro} · ${planLabel("expert")} ${aiToolRow.expert}`
    : null;
  /* [v4 · 규칙 2] 채움 파랑은 화면에 1개 — 지금 카드로 바로 살 수 있는 상품이 주인공이다.
     월간·연간이 열려 있으면(결제 개통 + 빌링 개방) 플러스 카드 CTA, 아니면 주간권 버튼. */
  const plansPrimary = paymentsReady && recurringReady;
  const weeklyDaily = Math.round(WEEKLY_PASS.totalKrw / WEEKLY_PASS.days).toLocaleString("ko-KR");
  const monthlyDaily = Math.round(tierPricing("pro").monthly / 30).toLocaleString("ko-KR");

  return (
    /* [v4 · 규칙 12] 가운데 한 줄(760px) — PageShell 브레드크럼("멤버십 상세")은 1240 컨테이너 왼쪽 끝에 떨어져
       본문 줄과 어긋났다(글자뿐, 링크 아님). h1 이 이 줄 맨 위에 선다. */
    <PageShell>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(plansJsonLd) }}
      />
      <div className="mx-auto flex w-full max-w-[760px] flex-col gap-8">
        {/* ── 머리: 제목 한 줄 + 사실 한 줄(+ 로그인 시 현재 플랜 한 줄) ──
            [v4 · 규칙 1·3] "무료 플랜에서도 한도 없이 쓸 수 있어요 · …" 문장 → 한도 숫자만 */}
        <header className="flex flex-col gap-0.5">
          <h1 className="t-title text-ink">멤버십 요금제</h1>
          {headFact && <p className="t-sub text-text-3">{headFact}</p>}
          {/* [1007] 로그인한 사람에게만 — 세션 판정 뒤 클라이언트가 붙인다 */}
          <CurrentPlanBadge />
        </header>

        {/* 이번 달 사용량 — 로그인한 사람에게만, 값이 있을 때만(/api/me/usage, ViewerCards.UsageCard) */}
        <UsageCard />

        {/* 플러스 주간권 — 1회성 단건 결제(자동갱신 없음). 운영자 확정 2026-08-12: 토스 심사 회신 A-1(a) 의 단건 상품.
            [1003] 요금제 카드 **위** — 지금 카드로 곧장 살 수 있는 상품이라 첫 화면 안에 둔다(심사가 찾는
            "신용/체크카드 결제창"이 스크롤 없이 보여야 한다). [970 · A-07] id·scroll-mt — ?billing=weekly 복귀 스크롤.
            [v4 · 규칙 3·6·10] 모바일 가운데 정렬 → 왼쪽 정렬 · 설명 배지("카드 등록 없이") → 사실 줄 · 문장 3개 → 사실 줄 3개.
            사실(7일·단건·자동 반복청구 없음·만료 후 무료 전환·하루 단가와 월간 비교·결제수단·카드번호 미저장)은 그대로 남긴다. */}
        <section id="weekly-pass" aria-labelledby="weekly-pass-h" className="scroll-mt-24">
          <WeeklyPassFrame className="card flex flex-col gap-4 rounded-lg p-4 md:flex-row md:items-center md:justify-between md:p-5">
            <div className="flex min-w-0 flex-col gap-1">
              <h2 id="weekly-pass-h" className="t-section text-ink">
                {WEEKLY_PASS.label} · <span className="t-num">{WEEKLY_PASS.totalKrw.toLocaleString("ko-KR")}원</span>
              </h2>
              <p className="t-sub text-text-3">
                {WEEKLY_PASS.days}일 {planLabel("pro")} 전체 · 카드 등록 없이 1회성 단건 결제 · 자동 반복청구 없음 · 만료 후{" "}
                {planLabel("free")} 전환(추가 청구 없음)
              </p>
              {/* 하루 단가는 월간이 더 싸다 — 그 사실을 감추지 않는다 */}
              <p className="t-sub text-text-3">
                하루 {weeklyDaily}원 · 월간은 하루 {monthlyDaily}원
              </p>
              {/* [1003] 취급 결제수단 — 결제 버튼 옆에서 읽혀야 한다(2026-09 토스 반려 사유 자리). 결제수단의 단일 출처 */}
              <p className="t-sub text-text-3">
                <span className="font-bold text-ink">신용카드 · 체크카드</span> 결제(토스페이먼츠 결제창) · 카드번호는
                내집나우 서버에 저장되지 않음 ·{" "}
                <Link
                  href={PAYMENT_METHODS_PATH}
                  /* 문장 속 링크의 기준은 WCAG 2.5.8(24px) — inline-block + 세로 패딩 */
                  className="inline-block py-[5px] font-bold text-primary underline"
                >
                  결제 수단 안내
                </Link>
              </p>
            </div>
            {/* [966] 상태별로 정직하게 — 미개통이면 사전 등록, 이미 프로(expert)면 사지 못하게.
                [1003] 링크 직행(2단계 확인 제거). [1007] 로그인 판정은 WeeklyPassCta 가 세션으로. */}
            <div className="w-full shrink-0 md:w-[236px]">
              <WeeklyPassCta
                paymentsReady={paymentsReady}
                checkoutBase={REVIEW_CHECKOUT_PATH}
                weeklyTotalKrw={WEEKLY_PASS.totalKrw}
                weeklyDays={WEEKLY_PASS.days}
                primary={!plansPrimary}
              />
            </div>
          </WeeklyPassFrame>
          {/* P2-8: 환불 규정 직링크 — 약관 제8조(청약철회) 앵커. 상품·금액·환불 규정이 한 화면에 붙어 있어야 한다.
              [v4 · 규칙 10] 가운데 정렬 → 왼쪽 캡션 한 줄 */}
          <p className="mt-2 t-sub text-text-3">
            결제 7일 이내 청약철회(환불) 가능 ·{" "}
            <Link
              href="/legal/terms#refund"
              /* [990] 문장 속 링크 24px 히트 — inline-block + 세로 패딩(44px 히트를 겹치면 윗줄·아랫줄 탭을 가져간다) */
              className="inline-block py-[5px] font-bold text-primary underline underline-offset-2"
            >
              환불 규정 안내
            </Link>
          </p>
        </section>

        {/* 요금제 카드 3종 + 월간/연간 토글 (item 13)
            [970 · A-06] 비로그인은 currentPlan=null. [1007] 현재 플랜·?billing·?plan·?returnTo 는 PlanCards 가 마운트 뒤 판정. */}
        <section aria-labelledby="plans-h" className="flex flex-col gap-3">
          <h2 id="plans-h" className="t-section text-ink">
            플랜별 가격
          </h2>
          <PlanCards
            pro={tierPricing("pro")}
            expert={tierPricing("expert")}
            paymentsReady={paymentsReady}
            recurringReady={recurringReady}
            primary={plansPrimary}
          />
          {/* [966] 결제 신뢰 스트립 → [v4 · 규칙 7·8] 아이콘 타일 두 칸 → 캡션 한 줄.
              "7일 이내 청약철회"는 위 환불 줄이 이미 말한다(같은 사실 한 번) — 남는 사실(즉시 적용·영수증·일할 환불)만 */}
          <p className="t-caption text-text-3">
            결제 즉시 이용권 적용 · 알림함·이메일로 영수증 발송 · 7일 이후 중도 해지는 잔여기간 일할 환불(약관 제8조)
          </p>
        </section>

        {/* E1 — 구독 관리·결제 내역(로그인한 사람에게만 — BillingPanel 이 세션 판정 뒤 /api/subscriptions/summary 로 그린다) */}
        <BillingPanel />

        {/* 기능 비교표 (9k · [C49] 좁은 화면 배치 · [992] 열은 COMPARE_COLS 에서 유도) + 기간별 할인
            [v4 · 규칙 5·10] 두 카드 → 한 섹션(제목 + 1px 선 행). 열은 정렬로 맞춘다 */}
        <section aria-labelledby="compare-h" className="flex flex-col gap-2">
          <h2 id="compare-h" className="t-section text-ink">
            기능 비교
          </h2>
          {/* ── 좁은 화면(< md): 기능 이름 한 줄 + 값 N칸 ── */}
          <div className="md:hidden">
            {/* [v4.1 · 리퀴드 목록] 머리 열은 유리판 안쪽 여백(14px)과 같은 px — 아래 행과 열이 맞는다 */}
            <div className={`sticky top-[62px] z-10 grid ${COMPARE_GRID_NARROW} gap-1.5 border-b border-line bg-bg px-3.5 py-1.5`}>
              {COMPARE_COLS.map((c) => (
                <div key={c.key} className="flex flex-col">
                  <span className={`t-sub font-bold ${c.tone}`}>{c.name}</span>
                  <span className="t-sub t-num text-text-3">{c.price}</span>
                </div>
              ))}
            </div>
            <ul data-tone="blue" className="divide-y divide-line">
              {FEATURE_ROWS.map((r) => (
                <li key={r.label} className="py-2">
                  <div className="t-sub font-bold text-text-2">{r.label}</div>
                  <div className={`mt-0.5 grid ${COMPARE_GRID_NARROW} gap-1.5 t-sub`}>
                    {COMPARE_COLS.map((c) => (
                      <span key={c.key} className={cellClass(c, r)}>
                        {r[c.key]}
                      </span>
                    ))}
                  </div>
                </li>
              ))}
              <li className="py-2">
                <div className="t-sub font-bold text-text-2">프로필 인증배지</div>
                <div className={`mt-0.5 grid ${COMPARE_GRID_NARROW} gap-1.5 t-sub`}>
                  {COMPARE_COLS.map((c) => (
                    <span key={c.key} className={c.key === "free" ? "text-text-3" : "font-bold text-text-1"}>
                      {c.key === "free" ? "—" : `${c.name} 배지`}
                    </span>
                  ))}
                </div>
              </li>
            </ul>
          </div>

          {/* ── 넓은 화면(md+): 기능 열 + 값 N열 ── */}
          <div className="hidden md:block">
            <div className={`grid ${COMPARE_GRID_WIDE} items-end gap-2 border-b border-line px-3.5 pb-2`}>
              <span />
              {COMPARE_COLS.map((c) => (
                <div key={c.key} className="flex flex-col">
                  <span className={`t-body font-bold ${c.tone}`}>{c.name}</span>
                  <span className="t-sub t-num text-text-3">{c.price}</span>
                </div>
              ))}
            </div>
            <ul data-tone="blue" className="divide-y divide-line">
              {FEATURE_ROWS.map((r) => (
                <li key={r.label} className={`grid ${COMPARE_GRID_WIDE} items-center gap-2 py-2.5 t-sub`}>
                  <span className="text-text-2">{r.label}</span>
                  {COMPARE_COLS.map((c) => (
                    <span key={c.key} className={cellClass(c, r)}>
                      {r[c.key]}
                    </span>
                  ))}
                </li>
              ))}
              <li className={`grid ${COMPARE_GRID_WIDE} items-center gap-2 py-2.5 t-sub`}>
                <span className="text-text-2">프로필 인증배지</span>
                {COMPARE_COLS.map((c) => (
                  <span key={c.key} className={c.key === "free" ? "text-text-3" : "font-bold text-text-1"}>
                    {c.key === "free" ? "—" : `${c.name} 배지`}
                  </span>
                ))}
              </li>
            </ul>
          </div>

          {/* 기간별 할인 (9k) — 월 환산가. [970 · A-05] 열이 셋(라벨 + 월간 + 12개월)이라 가로 스크롤 없음.
              [970 · A-22] 결제 방식은 recurringOpen 사실 그대로 — 개방 전엔 전부 단건 */}
          <h3 className="mt-4 t-sub font-bold text-text-2">기간별 할인(월 환산가)</h3>
          <ul data-tone="mint" className="divide-y divide-line border-y border-line">
            <li className="grid grid-cols-[88px_repeat(2,1fr)] gap-2 py-1.5 t-sub text-text-3 md:grid-cols-[minmax(0,1fr)_repeat(2,104px)]">
              <span />
              {BILLING_PERIOD_PRICES.pro.map((p) => (
                <span key={p.months}>{p.months === 1 ? "월간" : `${p.months}개월`}</span>
              ))}
            </li>
            {(["pro", ...(isTierOnSale("expert") ? (["expert"] as const) : [])] as const).map((tier) => (
              <li
                key={tier}
                className="grid grid-cols-[88px_repeat(2,1fr)] items-center gap-2 py-2.5 t-sub md:grid-cols-[minmax(0,1fr)_repeat(2,104px)]"
              >
                <span className={`font-bold ${tier === "pro" ? "text-primary" : "text-warning"}`}>{planLabel(tier)}</span>
                {BILLING_PERIOD_PRICES[tier].map((p) => (
                  <span key={p.months} className="t-num font-bold text-text-1">
                    {fmtWon(p.monthlyEquivalentKrw)}
                    {p.discountPct > 0 && (
                      <span className="ml-0.5 t-caption font-medium text-text-3">-{Math.round(p.discountPct)}%</span>
                    )}
                  </span>
                ))}
              </li>
            ))}
          </ul>
          <p className="t-caption text-text-3">
            {recurringOpen
              ? "월간·연간은 카드 등록형 자동결제 · 중도 해지 시 잔여기간 일할 환불(고객센터 접수)"
              : "1회성 단건 결제(자동 갱신 없음) · 중도 해지 시 잔여기간 일할 환불(고객센터 접수)"}
          </p>
        </section>

        {/* 고도화 32 — 구독 FAQ. 아래 JSON-LD 는 이 배열 그대로에서 생성한다(화면에 없는 질문을 스키마에만 넣지 않는다).
            [v4 · 규칙 3·11] 질문 한 줄 행 + 답은 접힘(<details>) — 접혀 있어도 HTML 에 있어 FAQPage 규칙(보이는 내용과 일치)을 지킨다 */}
        <section aria-labelledby="faq-h" className="flex flex-col">
          <h2 id="faq-h" className="t-section text-ink">
            자주 묻는 질문
          </h2>
          <ul data-tone="hanji" className="mt-1 divide-y divide-line">
            {faq.map((f) => (
              <li key={f.q}>
                <details className="group">
                  <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 py-2 t-body font-bold text-text-1 [&::-webkit-details-marker]:hidden">
                    {f.q}
                    <span aria-hidden="true" className="shrink-0 t-body text-text-3 transition-transform group-open:rotate-90">
                      ›
                    </span>
                  </summary>
                  {/* t-body — 폰 배율의 "li 안 t-sub 한 줄" 규칙에 답이 잘리지 않게(답은 끝까지 읽혀야 한다) */}
                  <p className="pb-3 t-body text-text-2">{f.a}</p>
                </details>
              </li>
            ))}
          </ul>
        </section>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: jsonLdScript(faqJsonLd(faq)) }}
        />

        {/* [969] 하이드레이션 — <p> 안에 <div> 를 두지 않는다(형제로 분리). 수익 문구 미기재 방침 + 서비스 제공기간 */}
        <div className="flex flex-col gap-3">
          <ComplianceNotice variant="payment" recurringOpen={recurringOpen} />
          {/* "언제든 해지 가능"만 적어 두면 화면 어딘가에 해지 버튼이 있다는 뜻으로 읽힌다 — [970 · A-22]
              위 FAQ·ComplianceNotice 와 같은 recurringOpen 을 본다. */}
          <p className="t-caption text-text-3">
            {recurringOpen
              ? `${WEEKLY_PASS.label}은 단건, 월간·연간은 자동결제(해지는 구독 관리에서) · 환불 접수는 고객센터 1:1 문의 · 결제 7일 이내 전액 환불 · 부가세 포함 · `
              : "모든 이용권은 1회성 단건 결제(자동 갱신 없음) · 환불 접수는 고객센터 1:1 문의 · 결제 7일 이내 전액 환불 · 부가세 포함 · "}
            커뮤니티 글·공개 노트·채팅 등 모든 닉네임 노출 지점에 동일 배지 적용
          </p>
        </div>
      </div>
    </PageShell>
  );
}
