/* [1026b · 시나리오·비교] 기준 지역 목록(서울 25구 + 수도권) — ScenarioClient.tsx 에 있던 REGION_OPTIONS 를 그대로 옮겼다.
   lib/map/seoul-districts 묶음(≈7.5KB)이 첫 묶음에 앉지 않게, 이 모듈은 조건 손잡이(ScenarioControls · 지연 조각)가 정적으로,
   본체(ScenarioClient)는 import() 로만 읽는다(딥링크 ?region= 해석 · 지역 이름 표기). 목록·매칭 규칙은 바뀌지 않았다. */
import { SEOUL_DISTRICTS, METRO_EXPLORE_DISTRICTS } from "@/lib/map/seoul-districts";
import { pickRegionByAnyName } from "@/lib/regions/param";

export type RegionOption = { id: string; label: string };

export const REGION_OPTIONS: RegionOption[] = [
  ...SEOUL_DISTRICTS.map((d) => ({ id: d.id, label: `서울 ${d.name}` })),
  /* [999] 폐지 구(인천 서구·중구, 2026-07)는 선택지에서 뺀다 — 후속 구가 있다 */
  ...METRO_EXPLORE_DISTRICTS.filter((d) => !d.retired).map((d) => ({
    id: d.id,
    label: `${d.city ?? "서울"} ${d.name}`,
  })),
];

/** [D62] 지역은 어느 말로 와도 받는다 — "서울 강남구" · "서울-강남구" · "gangnam". 못 찾으면 null */
export function regionIdFromParam(raw: string): string | null {
  return pickRegionByAnyName(raw, REGION_OPTIONS)?.id ?? null;
}

/** id → "서울 강남구"(목록에 없으면 null) */
export function regionLabelOf(id: string): string | null {
  return REGION_OPTIONS.find((r) => r.id === id)?.label ?? null;
}
