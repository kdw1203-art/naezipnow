/* [1026b · AI 분석 8종] 절차 한 줄(StepLine) 재료 — AI 분석 12종이 같은 틀을 쓴다. 순수 함수(화면이 이미 가진 값만).
   단지 도구 "단지 · {단지명} → 내 조건 → 결과 · {판정} → 다음 행동" · 비교는 담은 수("단지 · 3곳") ·
   경제지표 모니터는 첫 칸 "지역" · 내 자산 구성 진단은 "관심 단지 · N곳 → 단지 · {단지명} → 결과 → 다음 행동"
   (넣을 조건이 없는 도구라 "내 조건" 대신 고른 단지). WorkbenchClient(첫 로드)가 부른다 — 타입 import 만, 런타임 의존 0. */

import type { AiAnalysisToolId } from "@/lib/ai/ai-tools";

export type ToolStep = { label: string; note?: string };

export function toolSteps(p: {
  tool: AiAnalysisToolId;
  /** 고른 단지 이름 — 없으면 null */
  pickedName: string | null;
  /** 비교 도구에 담은 단지 수 */
  compareCount?: number;
  /** 내 자산 구성 진단 — 불러온 관심 단지 수(불러오기 전 null) */
  portfolioCount?: number | null;
  /** 경제지표 모니터 — 지표를 읽은 지역 이름 */
  regionName?: string | null;
  /** 결과가 섰나 */
  ready: boolean;
  /** 결과 판정(좋음·보통·주의·자료 부족) — 결과가 섰을 때만 단계 옆에 */
  bandLabel?: string | null;
}): { steps: ToolStep[]; current: number } {
  const result: ToolStep = { label: "결과", ...(p.ready && p.bandLabel ? { note: p.bandLabel } : {}) };
  const next: ToolStep = { label: "다음 행동" };
  if (p.tool === "ai-economy") {
    const region = (p.regionName ?? "").trim();
    return { steps: [{ label: region ? `지역 · ${region}` : "지역" }, { label: "내 조건" }, result, next], current: p.ready ? 2 : 0 };
  }
  if (p.tool === "ai-portfolio") {
    const n = p.portfolioCount ?? 0;
    return {
      steps: [{ label: n > 0 ? `관심 단지 · ${n}곳` : "관심 단지" }, { label: p.pickedName ? `단지 · ${p.pickedName}` : "단지" }, result, next],
      current: p.pickedName ? 2 : n > 0 ? 1 : 0,
    };
  }
  const n = p.compareCount ?? 0;
  const first = p.tool === "ai-compare" && n >= 2 ? `단지 · ${n}곳` : p.pickedName ? `단지 · ${p.pickedName}` : "단지";
  return { steps: [{ label: first }, { label: "내 조건" }, result, next], current: p.pickedName ? 2 : 0 };
}
