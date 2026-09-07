/**
 * 거래·전문가 수수료 (크몽 대비 예측 가능·저렴 체계)
 * 공개 페이지: /pricing#fees · /legal/fees
 *
 * [970 · A-09 · C-15] 수수료 **단일 출처**. 예전엔 같은 리포트 판매 수수료가 세 벌
 * 이었다 — /subscription 비교표·lib/creator/sales.ts 7%, /legal/fees 10%,  // [971] 10% 로 확정
 * EXPERT_CERT_FEES 8%, /seller 12%/10%/7%/5%. 돈에 관한 표기가 화면마다 다르면
 * 그 자체로 허위 고지다. 코드가 실제로 떼는 값(lib/creator/sales.ts 정산 계산)은
 * 아래 상수 하나이고, 표·문구는 전부 여기서 파생한다 — 숫자를 다른 파일에 적지 않는다.
 * 순수 상수 파일(서버 전용 import 없음)이라 클라이언트 컴포넌트도 가져다 쓴다.
 */

/** 디지털 리포트(자료실) 판매 시 플랫폼이 떼는 몫 — 정산 계산과 모든 표기의 원천.
 *  [971] 소유자 확정: 10%. 970 에서 코드가 떼던 7% 로 임시 통일했으나, 공시 정책은
 *  /legal/fees 에 적혀 있던 10% 가 맞다는 결정(2026-09-06). 이 상수 하나만 바꾸면
 *  /legal/fees·/subscription 비교표·플랜 카드·크리에이터 정산 문구가 함께 움직인다. */
export const REPORT_SELLER_FEE_RATE = 0.10;

/** 인증 전문가 우대 요율 — 리포트·상담·자료 판매 공통.
 *  기본 10% 대비 4%p 우대(구 /legal/fees 표기와 동일). */
export const VERIFIED_EXPERT_FEE_RATE = 0.06;

/** 요율 → "7%" 표기. 소수 요율을 화면마다 손으로 반올림하지 않게 한다. */
export function feePct(rate: number): string {
  return `${Math.round(rate * 100)}%`;
}

export type FeeRow = {
  id: string;
  label: string;
  kmongPublic?: string;
  /** [970 · A-10] 구 브랜드 필드명(nuguzip) → ours. 화면 헤더는 "내집나우". */
  ours: string;
  note?: string;
};

/** 구매자 결제·판매자 정산 */
export const MARKETPLACE_FEES: FeeRow[] = [
  {
    id: "buyer_checkout",
    label: "구매자 결제 수수료",
    kmongPublic: "4.5% (VAT 포함)",
    ours: "2.9%",
  },
  {
    id: "report_seller",
    label: "디지털 리포트 판매자 수수료",
    kmongPublic: "카테고리별 상이",
    ours: feePct(REPORT_SELLER_FEE_RATE),
  },
  {
    /* 자료실(/reports)에서 파는 것은 리포트 한 종류다 — 별도 전자책 상품·요율은
       코드에 없으므로 같은 요율을 쓴다(따로 적어 두면 다시 갈라진다). */
    id: "ebook_seller",
    label: "전자책·자료 판매자 수수료",
    kmongPublic: "카테고리별 상이",
    ours: feePct(REPORT_SELLER_FEE_RATE),
  },
  {
    id: "consult_seller",
    label: "전문가 상담 수수료",
    kmongPublic: "카테고리별 상이",
    ours: "8%",
  },
  {
    id: "verified_expert",
    label: "인증 전문가 우대",
    kmongPublic: "공개 페이지마다 다름",
    ours: feePct(VERIFIED_EXPERT_FEE_RATE),
    note: "리포트·상담·자료 판매 공통 우대율",
  },
  {
    id: "offline_escort",
    label: "오프라인 현장 동행 성사",
    kmongPublic: "별도 협의형",
    ours: "5% + PG 실비",
  },
];

/** 전문가 인증·매칭 */
export const EXPERT_CERT_FEES = [
  { label: "전문가 가입 심사비", rate: "무료" },
  { label: "서류 재심사", rate: "5,000원" },
  { label: "상담 매칭 수수료", rate: "8%" },
  { label: "인증 전문가 매칭 수수료", rate: feePct(VERIFIED_EXPERT_FEE_RATE) },
  { label: "전자책·리포트 판매 수수료", rate: feePct(REPORT_SELLER_FEE_RATE) },
  { label: "모임 참가비 정산 수수료", rate: "3%" },
  { label: "광고형 상단 노출", rate: "월 정액 상품 별도" },
] as const;

/** 경쟁 서비스 포지셔닝 (사업·요금 페이지용) */
export const COMPETITIVE_POSITIONING = [
  {
    service: "직방",
    strength: "AI중개사, 채팅 문의, 지킴진단, 공공분양, 중개사 양면 시장",
    lesson: "소비자용 지도 + 전문가용 리드 관리 대시보드 동시 설계",
  },
  {
    service: "다방",
    strength: "동네정보, 동네이야기, 안전시설, 도형 검색, AI 분석, 우리집 관리",
    lesson: "지도에 주거 판단 자료를 강하게 결합",
  },
  {
    service: "크몽",
    strength: "패키지 비교, 리뷰, 안전 거래, 구매자 수수료 4.5% 공개",
    lesson: "전문가 상담·리포트·자료 패키지화·수수료 명확화",
  },
] as const;
