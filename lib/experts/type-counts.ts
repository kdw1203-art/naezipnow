import { findExpertType, type ExpertTypeId } from "./taxonomy";

/**
 * [1052] 직업군별 인원 — /town/experts 의 자격 칩(ExpertsClient)과 "분야별 전문가" 칸(page.tsx)이 같이 쓴다.
 * 저장된 category 문자열을 findExpertType 으로 맞춘다 — 예전 저장값("건축사")이 지금 라벨("건축사·설계")로,
 * id("tax")로 저장된 값도 같은 직업군으로 센다. 예전 page.tsx 의 `category.includes(label)` 은 "건축사"를
 * 0명으로 셌다. 분류 체계에 없는 값은 목록 필터와 같게 기타(other)로 센다. 순수(클라이언트 · 단위 시험 공용).
 */
export function countExpertTypes(
  rows: ReadonlyArray<{ category: string | null | undefined }>,
): Map<ExpertTypeId, number> {
  const m = new Map<ExpertTypeId, number>();
  for (const r of rows) {
    const id = findExpertType(r.category)?.id ?? "other";
    m.set(id, (m.get(id) ?? 0) + 1);
  }
  return m;
}
