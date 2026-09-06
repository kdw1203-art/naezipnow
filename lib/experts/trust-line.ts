/**
 * [967 · 26] 전문가 카드 "신뢰 한 줄" — 이름 아래 한 줄로 믿을 근거를 적는다.
 *
 *   "인증 완료 · 답변 12건 · 약 3시간 내 답변 · 후기 4건"
 *
 * 실측·실기록만 쓴다. 값이 없는 토막은 **빼지**, 0 이나 "—" 로 채우지 않는다
 * (없는 지표를 지표처럼 보이게 하지 않는다 — 카드의 기존 원칙).
 *   · verified       expert_profiles.is_verified — 내집나우가 서류·신원을 확인한 전문가
 *   · consultations  expert_consultations 에서 **답변이 나간** 건수(lib/experts/store-db
 *                    countRepliedConsultations) — 그래서 "상담"이 아니라 "답변"이라 적는다
 *   · responseLabel  responseTimeLabel() 결과(실측 중앙값 또는 전문가가 적은 안내문)
 *   · reviews        expert_reviews 건수 — 평점은 카드의 별 줄이 맡으므로 건수만
 * 순수 함수 — 단위 테스트(tests/unit/town-map-967.test.ts).
 */
export type ExpertTrustInput = {
  verified: boolean;
  consultations: number;
  responseLabel: string | null | undefined;
  reviews: number;
};

export function expertTrustSegments(e: ExpertTrustInput): string[] {
  const out: string[] = [];
  if (e.verified) out.push("인증 완료");
  if (Number.isFinite(e.consultations) && e.consultations > 0) {
    out.push(`답변 ${Math.floor(e.consultations).toLocaleString("ko-KR")}건`);
  }
  const resp = (e.responseLabel ?? "").trim();
  if (resp) out.push(resp);
  if (Number.isFinite(e.reviews) && e.reviews > 0) {
    out.push(`후기 ${Math.floor(e.reviews).toLocaleString("ko-KR")}건`);
  }
  return out;
}

/** 토막을 " · " 로 이어 한 줄로. 적을 것이 하나도 없으면 null(줄 자체를 그리지 않는다). */
export function expertTrustLine(e: ExpertTrustInput): string | null {
  const segs = expertTrustSegments(e);
  return segs.length > 0 ? segs.join(" · ") : null;
}
