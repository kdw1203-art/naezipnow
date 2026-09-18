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
  /* [1004 · 리뷰] 집행값에 맞춘다 — 광고하는 한도는 코드가 실제로 막는 한도여야 한다.
     · "동네 분석 요약"(ai_chat): /api/ai/chat 에는 플랜 게이트가 없고 전 플랜 시간당 10회
       레이트리밋뿐이다. 무료 월 3회는 아무도 만나지 않는 벽이었고 프로 "무제한"은 무료와 같았다.
     · "비교 트레이": lib/newui/compare-tray.ts COMPARE_TRAY_MAX = 5 로 전 플랜 동일(서버 집계도 5).
     둘 다 플랜별 집행이 생기면 행을 되살린다([992] 가 "모임 개설" 행에 한 것과 같은 판단).
     · CSV 다운로드: 실제 게이트는 /api/inspection/export 의 requirePlan("pdf_export") = 프로 전용이고
       월 횟수 카운터는 없다. "플러스 월 10회"는 눌러도 402 가 나던 문구라 사실대로 고친다. */
  { feature: "CSV 내보내기(임장 기록)", free: "불가", pro: "불가", expert: "가능" },
  { feature: "광고 제거", free: "불가", pro: "가능", expert: "가능" },
];

/** [1004] 한 표에서 세 카드의 기능 줄을 만든다 — 카드마다 손으로 적던 목록을 없앤다.
 *
 *  왜: 카드 셋이 서로 다른 항목·다른 순서로 적혀 있었다(무료 10줄·플러스 9줄·프로 5줄).
 *  요금표는 "무엇을 더 주는가"를 나란히 놓고 읽는 화면인데, 줄이 어긋나면 눈이 비교를
 *  못 하고 프로 카드는 아래가 텅 비었다. 값의 출처는 어차피 아래 비교표와 같은 표다 —
 *  그 표에서 직접 만들면 표와 카드가 영원히 같은 말을 한다(예전엔 손으로 적어 어긋났다). */
function featuresFromMatrix(col: "free" | "pro" | "expert"): PlanFeature[] {
  return PLAN_FEATURE_MATRIX.map((row) => {
    const v = row[col];
    if (v === "불가") return { label: row.feature, included: false as const };
    if (v === "가능") return { label: row.feature, included: true as const };
    /* "무제한" 은 제한이 아니라 혜택이다 — 잠금·부분 제공이 아니라 ✓ + 배지로 읽히게 */
    if (v === "무제한") return { label: row.feature, included: true as const, note: v };
    return { label: row.feature, included: "limited" as const, note: v };
  });
}

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
      /* [992] AI 분석 도구(12종·ai_analysis)는 무료 **누적** 3회 — 월이 바뀌어도 열리지 않는다.
         [1004] 한도 줄은 비교표와 같은 표에서 만든다(featuresFromMatrix). */
      ...featuresFromMatrix("free"),
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
      /* [992] 전문가 상담·리포트 판매 행 제거 — 전문가·자료실은 보관(비노출)이라 팔 수 없는
         혜택을 적지 않는다(수수료 고지는 /legal/fees 가 계속 한다).
         [1004] 한도 줄은 비교표와 같은 표에서(featuresFromMatrix) — 세 카드가 같은 순서로 읽힌다. */
      ...featuresFromMatrix("pro"),
    ],
  },
  {
    tier: "expert",
    name: "EXPERT",
    /* [1004] 파는 것과 주는 것을 같게 — 예전 문구("콘텐츠 판매자"·"수익·운영 올인원")는
       전문가 등록·리포트 판매·상담을 가리켰는데 셋 다 공급이 0이라 992 에서 혜택 줄을 지웠다.
       남은 것이자 코드가 실제로 집행하는 것은 **한도 없음**이다(access.ts 에서 expert = null). */
    tagline: "한도 없이 쓰는 파워유저",
    priceMonthly: monthlyPrice("expert"), // 판매가 단일 출처: billing-periods.ts (18,900원)
    priceAnnualMonthly: annualMonthlyEquivalent("expert"),
    accentClass: "border-violet-500",
    publicVisible: true,
    positioning: "한도 없는 분석",
    bestFor: [
      `한 달에 ${planLabel("pro")} 한도(AI 분석 50회)를 넘기는 사용자`,
      "여러 지역·여러 단지를 한꺼번에 비교하는 사용자",
      "실거래·분석 결과를 CSV 로 따로 정리하는 사용자",
    ],
    features: [
      /* [970 · A-08] "플러스의 모든 혜택 포함" — planLabel 단일 출처 */
      { label: `${planLabel("pro")}의 모든 혜택 포함`, included: true },
      /* [992] "전문가 등록 · 수익 정산"·"우선 배치" 행 제거 — 전문가 마켓은 보관(비노출)이다.
         [1004] 남은 것이자 코드가 실제로 집행하는 것은 한도 없음 — 값은 비교표와 같은 표에서
         읽는다(access.ts FEATURE_RULES 에서 expert 는 전부 null = 무제한). */
      ...featuresFromMatrix("expert"),
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

