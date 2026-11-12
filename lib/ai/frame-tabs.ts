/* [1171] 단지 분석 4종을 한 줄 탭으로 — 고른 단지를 들고 옆 도구로 옮겨 간다(도구마다 실행 횟수는 그대로 따로 센다). */
export const FRAME_TABS = [
  { id: "ai-diagnosis", label: "종합 진단" },
  { id: "ai-prediction", label: "시세 예측" },
  { id: "ai-timing", label: "매수 타이밍" },
  { id: "ai-inspection", label: "임장 동선" },
] as const;

export function frameTabHref(toolId: string, complexId: string | null | undefined): string {
  const base = `/analysis/ai/${toolId}`;
  const id = (complexId ?? "").trim();
  return id ? `${base}?complexId=${encodeURIComponent(id)}` : base;
}
