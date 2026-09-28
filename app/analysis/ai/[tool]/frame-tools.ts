/* [1021 · 단지 분석 /analysis/ai] 시안(mock8) 뼈대를 쓰는 도구 = 핵심 4종(진단·예측·동선·타이밍). 타입만 있는 파일이라
   서버 페이지·클라이언트·단위테스트(node --test 는 .tsx 를 못 읽는다)가 같은 목록을 본다. */
import type { AiAnalysisToolId } from "@/lib/ai/ai-tools";

export const FRAME_TOOLS = ["ai-diagnosis", "ai-prediction", "ai-inspection", "ai-timing"] as const;
export type FrameToolId = (typeof FRAME_TOOLS)[number];

export function isFrameTool(tool: AiAnalysisToolId): tool is FrameToolId {
  return (FRAME_TOOLS as readonly string[]).includes(tool);
}
