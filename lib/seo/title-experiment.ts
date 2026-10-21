/* [#102] 타이틀 클릭률 실험 프레임 — 페이지군별 title 패턴 A/B.
 *
 * 원칙:
 *  - 배정은 **id 해시로 결정적**이다. 페이지의 title 이 요청마다 바뀌면 검색엔진이
 *    신뢰를 깎는다 — 한 페이지는 실험 기간 내내 한 패턴만 갖는다.
 *  - 저장 테이블 없음: 배정은 순수 함수라 어디서든 재현되고, 관리자 화면(/admin/seo)
 *    이 같은 함수로 배정표를 보여 준다.
 *  - 측정은 GSC(페이지별 CTR) — #101 연동 전에는 관리자 배정표 + GSC 수동 대조로
 *    읽는다. 판정 기준: 4주 노출 500+ 페이지군에서 CTR 차 20%+ 면 승자 채택.
 *  - 현재 대상: 지역 페이지(62) 한 군만. 승부가 나면 단지·리포트로 확대.
 */

export type TitleVariant = "A" | "B";

export function titleVariantFor(experimentKey: string, id: string): TitleVariant {
  let h = 0;
  const s = `${experimentKey}:${id}`;
  for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h % 2 === 0 ? "A" : "B";
}

/** 지역 페이지 title — A: 기존(정보 나열) / B: 질문·총정리형
 *  [1081 · #20] 데이터 기준 월(ymLabel · "2026년 9월")을 받으면 끝에 붙인다 — 최신성이 보이는 제목이 클릭을 받고, 달이 바뀌면
 *  ISR 재생성과 함께 자동으로 갱신된다. 실험 배정(A/B)은 그대로. */
export function regionTitle(id: string, name: string, ymLabel?: string | null): { title: string; variant: TitleVariant } {
  const variant = titleVariantFor("region-title-v1", id);
  const tail = ymLabel ? ` — ${ymLabel}` : "";
  return {
    variant,
    title:
      variant === "A"
        ? `${name} 아파트 시세·실거래·정비사업${tail} | 내집나우`
        : `${name} 아파트 값 총정리 — 시세·실거래·입주 물량${tail} | 내집나우`,
  };
}

/** [1081] "202609" → "2026년 9월" (꼴이 다르면 null) */
export function ymLabelKo(period: string | null | undefined): string | null {
  const m = /^(\d{4})(\d{2})$/.exec(String(period ?? "").trim());
  if (!m) return null;
  const month = Number(m[2]);
  if (month < 1 || month > 12) return null;
  return `${m[1]}년 ${month}월`;
}

/** 실험 메타 — 관리자 배정표·문서가 함께 읽는 단일 정의 */
export const TITLE_EXPERIMENTS = [
  {
    key: "region-title-v1",
    label: "지역 페이지 title (정보 나열 vs 총정리형)",
    startedAt: "2026-08-23",
    judge: "4주 후 GSC 페이지군 CTR — 노출 500+ 에서 상대차 20%+ 면 승자 채택",
  },
] as const;
