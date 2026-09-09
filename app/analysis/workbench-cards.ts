/**
 * 워크벤치 12칸 카드 데이터 — **서버에서 조립한다.**
 *
 * [980] 왜 서버인가: 카드에 도구 성격(색·성격 라벨·한 줄)을 붙이려면
 * lib/ai/tool-persona.ts 와 lib/ai/tool-identity.ts 가 필요한데, 둘 다 12~16종의
 * 문자열·아이콘을 통째로 들고 있는 큰 모듈이다. 이걸 클라이언트 컴포넌트
 * (hub-tiers.tsx, "use client")가 직접 import 하면 두 모듈이 **그대로 브라우저
 * 번들에 실린다.** 실제로 그렇게 붙였다가 /analysis First Load 가
 * 486KB → 502KB 가 되어 예산(490KB)을 넘겼다.
 *
 * 예산을 올리는 대신 조립을 서버로 옮긴다. 카드에 필요한 건 문자열 몇 개와
 * CSS 변수 네 개뿐이라 직렬화가 싸고, 그리드는 이제 **그리기와 클릭**만 한다.
 * (같은 이유로 tool-identity 도 클라이언트에서 사라져 예산이 이전보다 내려간다.)
 */

import type { AiAnalysisToolId } from "@/lib/ai/ai-tools";
import { TOOL_IDENTITIES } from "@/lib/ai/tool-identity";
import { TOOL_PERSONAS, personaVars } from "@/lib/ai/tool-persona";
import { WORKBENCH_CORE, WORKBENCH_MORE, WORKBENCH_ICONS } from "./tool-catalog";
import { WORKBENCH_GLYPH, type ToolGlyphId } from "./ToolGlyph";

export type WorkbenchCardDto = {
  id: AiAnalysisToolId;
  href: string;
  title: string;
  /** 결과물 모양 글리프 id */
  glyph: ToolGlyphId;
  /** 성격 한 낱말 — 12칸이 제목만 다르고 나머지가 같아 보이던 것을 가른다 */
  character: string;
  /** 이 화면이 하는 일 한 줄(기능 설명 tagline 과 역할이 다르다) */
  premise: string;
  /** "투자 점수(점)" 같은 결과 라벨 — 없으면 null */
  result: string | null;
  /** 도구 색 네 개 — 카드 래퍼에 style 로 꽂는다 */
  vars: Record<string, string>;
};

function build(id: AiAnalysisToolId): WorkbenchCardDto {
  const idn = TOOL_IDENTITIES[id];
  const persona = TOOL_PERSONAS[id];
  const result =
    idn.metricLabel && idn.metricLabel !== "결과"
      ? `${idn.metricLabel}${idn.metricUnit ? `(${idn.metricUnit})` : ""}`
      : null;
  return {
    id,
    href: `/analysis/ai/${id}`,
    title: idn.title,
    glyph: WORKBENCH_GLYPH[id] ?? "radar",
    character: persona.character,
    premise: persona.premise,
    result,
    vars: personaVars(persona),
  };
}

/** 자주 쓰는 4개(앞) + 나머지 8개(접힘) — 순서는 tool-catalog 가 정한다 */
export function workbenchCardData(): { core: WorkbenchCardDto[]; more: WorkbenchCardDto[] } {
  return {
    core: WORKBENCH_CORE.map(build),
    more: WORKBENCH_MORE.map(build),
  };
}

/** 아이콘 이름은 글리프가 없는 자리의 대비책 — 카드 DTO 밖에서 쓸 일이 있어 남긴다 */
export { WORKBENCH_ICONS };
