import type { PlanTier } from "@/lib/subscriptions/access";
import { annualMonthlyEquivalent, monthlyPrice } from "@/lib/subscriptions/billing-periods";
import { planLabel } from "@/lib/subscriptions/labels";

export type PlanFeature = {
  label: string;
  /** `false` 면 해당 플랜에서 잠금 표시 (🔒). `"limited"` 면 부분 제공. */
  included: boolean | "limited";
  note?: string;
};

export type PlanDefinition = {
  tier: PlanTier;
  /** 공개 노출명 */
  name: string;
  tagline: string;
  /** 월 결제 가격 (원). */
  priceMonthly: number;
  /** 연 결제 시 월 환산가 (12개월 패키지 ÷ 12). */
  priceAnnualMonthly?: number;
  accentClass: string;
  highlight?: boolean;
  /** 요금제 그리드·요약에 노출 여부 (B2B enterprise 등) */
  publicVisible?: boolean;
  positioning?: string;
  bestFor: string[];
  features: PlanFeature[];
};

/**
 * FREE · PRO · EXPERT 3단계 (2026 재설계).
 * 내부 tier: basic=FREE, pro=PRO, expert=EXPERT, enterprise=B2B(비공개).
 */
export const PLAN_DEFINITIONS: PlanDefinition[] = [
  {
    tier: "basic",
    name: "FREE",
    tagline: "탐색·저장·일부 AI 체험",
    priceMonthly: 0,
    accentClass: "border-slate-200",
    publicVisible: true,
    positioning: "기본 멤버십",
    bestFor: [
      "동네·지도·커뮤니티를 둘러보는 입문자",
      "AI·임장 기능을 제한적으로 체험하고 싶은 사용자",
      "유료 플랜 결제 전 플랫폼을 알아보는 방문자",
    ],
    features: [
      { label: "커뮤니티 열람 / 작성 / 댓글", included: true },
      { label: "지역 탐색 지도 · 동네 맥락", included: true },
      { label: "북마크 · 관심단지", included: "limited", note: "10개" },
      /* [992] AI 분석 도구(12종·ai_analysis)는 무료 **누적** 3회 — 월이 바뀌어도 열리지 않는다 */
      { label: "AI 분석 도구", included: "limited", note: "누적 3회" },
      { label: "AI 임장노트 자동정리", included: "limited", note: "월 2회" },
      { label: "AI 노트 초안·예습 브리핑", included: "limited", note: "월 10회" },
      { label: "동네 분석 요약", included: "limited", note: "월 3회" },
      { label: "비교 트레이", included: "limited", note: "2개" },
      { label: "CSV 다운로드", included: false },
      { label: "광고 제거", included: false },
    ],
  },
  {
    tier: "pro",
    name: "PRO",
    tagline: "임장 루틴 사용자",
    /* 판매가는 billing-periods.ts 단일 출처에서 읽는다 (2026-07-25 운영자 확정: 2,900원).
       예전엔 여기 하드코딩된 2,900원과 billing-periods 의 6,900원이 따로 놀아서,
       화면은 6,900원을 보여 주고 청구는 2,900원을 하고 있었다. */
    priceMonthly: monthlyPrice("pro"),
    priceAnnualMonthly: annualMonthlyEquivalent("pro"),
    accentClass: "border-[#3182f6]",
    highlight: true,
    publicVisible: true,
    positioning: "가장 인기",
    bestFor: [
      "월 1회 이상 임장·동네 분석을 루틴으로 돌리는 실수요자",
      "관심 단지·비교 트레이를 자주 쓰는 사용자",
      "광고 없이 집중 탐색하고 싶은 사람",
    ],
    features: [
      /* [970 · A-08] "FREE"·"PRO" 는 카드에 없는 이름이다(카드는 무료·플러스·프로) —
         planLabel 단일 출처로 "무료의 모든 혜택 포함". */
      { label: `${planLabel("free")}의 모든 혜택 포함`, included: true },
      { label: "북마크 · 관심단지", included: true, note: "100개" },
      { label: "AI 분석 도구", included: true, note: "월 50회" },
      { label: "AI 임장노트 자동정리", included: true, note: "월 30회" },
      { label: "AI 노트 초안·예습 브리핑", included: true, note: "월 100회" },
      { label: "동네 분석 요약", included: true, note: "월 50회" },
      { label: "비교 트레이", included: true, note: "10개" },
      { label: "CSV 다운로드", included: true, note: "월 10회" },
      /* [992] 전문가 상담·리포트 판매 행 제거 — 전문가·자료실은 보관(비노출)이라 팔 수 없는
         혜택을 적지 않는다(수수료 고지는 /legal/fees 가 계속 한다). */
      { label: "광고 제거", included: true },
    ],
  },
  {
    tier: "expert",
    name: "EXPERT",
    tagline: "전문가 · 파워유저 · 콘텐츠 판매자",
    priceMonthly: monthlyPrice("expert"), // 판매가 단일 출처: billing-periods.ts (18,900원)
    priceAnnualMonthly: annualMonthlyEquivalent("expert"),
    accentClass: "border-violet-500",
    publicVisible: true,
    positioning: "수익·운영 올인원",
    bestFor: [
      "여러 지역을 동시에 분석하는 공인중개사·컨설턴트",
      "콘텐츠를 운영하는 크리에이터",
      "데이터·AI를 무제한으로 쓰는 파워유저",
    ],
    features: [
      /* [970 · A-08] "플러스의 모든 혜택 포함" — planLabel 단일 출처 */
      { label: `${planLabel("pro")}의 모든 혜택 포함`, included: true },
      { label: "북마크 · 관심단지 · AI · 분석 · CSV", included: true, note: "무제한" },
      /* [992] "전문가 등록 · 수익 정산"·"우선 배치" 행 제거 — 전문가는 보관(비노출), 프로 플랜은
         판매 카탈로그(sell-config)에서 내려가 있다. */
    ],
  },
  {
    tier: "enterprise",
    name: "ENTERPRISE",
    tagline: "팀 · API · B2B (문의)",
    priceMonthly: 0,
    accentClass: "border-slate-900",
    publicVisible: false,
    positioning: "법인 · 데이터 파트너",
    bestFor: ["중개법인·리서치 팀 B2B", "API·대량 PDF·전담 SLA"],
    features: [
      { label: `${planLabel("expert")} 전체 + 팀 관리자`, included: true },
      { label: "B2B API · 대량 PDF", included: true },
      { label: "전담 매니저 · 인보이스", included: true },
    ],
  },
];

/** 요금제 페이지·비교표용 공개 플랜만 */
export const PUBLIC_PLAN_DEFINITIONS = PLAN_DEFINITIONS.filter(
  (p) => p.publicVisible !== false,
);

export function getPlan(tier: PlanTier): PlanDefinition {
  const p = PLAN_DEFINITIONS.find((x) => x.tier === tier);
  if (!p) return PLAN_DEFINITIONS[0];
  return p;
}

export function annualSavings(plan: PlanDefinition): number {
  if (plan.priceMonthly <= 0) return 0;
  if (plan.priceAnnualMonthly == null) return 0;
  return Math.max(0, (plan.priceMonthly - plan.priceAnnualMonthly) * 12);
}

export { TIER_PACKAGES, type TierPackage } from "./tier-packages";

/** 기능 비교표 (요금제 페이지) */
/* [992] "모임 개설" 행 삭제 — 임장 모임은 보관(비노출) 상태(참여 0). 팔지 않는 혜택을 요금표에
   적지 않는다. 게이팅(access.ts group_create)은 그대로라 되살릴 때 행만 다시 넣으면 된다. */
export const PLAN_FEATURE_MATRIX: Array<{
  feature: string;
  free: string;
  pro: string;
  expert: string;
}> = [
  { feature: "북마크·관심단지", free: "10개", pro: "100개", expert: "무제한" },
  { feature: "AI 분석 도구", free: "누적 3회", pro: "월 50회", expert: "무제한" },
  { feature: "AI 임장노트 자동정리", free: "월 2회", pro: "월 30회", expert: "무제한" },
  { feature: "AI 노트 초안·예습 브리핑", free: "월 10회", pro: "월 100회", expert: "무제한" },
  { feature: "동네 분석 요약", free: "월 3회", pro: "월 50회", expert: "무제한" },
  { feature: "비교 트레이", free: "2개", pro: "10개", expert: "무제한" },
  { feature: "CSV 다운로드", free: "불가", pro: "월 10회", expert: "무제한" },
  { feature: "광고 제거", free: "불가", pro: "가능", expert: "가능" },
];
