import type { CompositionArchetype, ResultBlock } from "@/lib/ai/tool-persona";

/* [998] 워크벤치(클라이언트)가 쓰는 건 이 함수 하나다. tool-persona 는 12+4종 페르소나 본문(28KB 소스)을
   들고 있어 클라이언트 번들(/analysis/ai/[tool] 예산 480KB, 실측 480KB)을 통째로 끌고 왔다 — 함수만 떼어
   type-only 로 잇는다(타입은 지워진다). 규칙은 tool-persona 의 것과 같다. */
export function resultOrder(composition: CompositionArchetype): readonly ResultBlock[] {
  switch (composition) {
    case "matrix":
    case "atlas":
    case "console":
    case "workbook":
      return ["headline", "body", "widget", "counters"];
    case "ledger":
      return ["headline", "widget", "counters", "body"];
    default:
      /* gauge · dossier · calculator · allocation · trajectory · route */
      return ["headline", "widget", "body", "counters"];
  }
}
