/**
 * 워크벤치 12종 행 데이터 — **서버에서 조립한다.**
 *
 * [980] 왜 서버인가: 도구 성격(성격 라벨·한 줄)을 붙이려면
 * lib/ai/tool-persona.ts 와 lib/ai/tool-identity.ts 가 필요한데, 둘 다 12~16종의
 * 문자열·아이콘을 통째로 들고 있는 큰 모듈이다. 이걸 클라이언트 컴포넌트
 * (hub-tiers.tsx, "use client")가 직접 import 하면 두 모듈이 **그대로 브라우저
 * 번들에 실린다.** 실제로 그렇게 붙였다가 /analysis First Load 가
 * 486KB → 502KB 가 되어 예산(490KB)을 넘겼다.
 *
 * 예산을 올리는 대신 조립을 서버로 옮긴다. 목록 행에 필요한 건 문자열 몇 개뿐이라
 * 직렬화가 싸고, 목록은 **그리기와 클릭**만 한다.
 *
 * [v4] 허브 목록 행 = 이름 + 결과 한 줄(`sub` — "투자 점수 · 5개 항목"). 행마다 붙던 커버리지 꼬리
 * ("실거래 있는 단지 N곳 · 국토교통부 신고분")와 결과 줄("결과: 투자 점수(점)")은 한 줄로 합쳤다.
 * 임장노트 상세(app/notes/[id]/NoteToolsRow.tsx)가 character·result 를 읽으므로 DTO 에는 남긴다.
 */

import type { AiAnalysisToolId } from "@/lib/ai/ai-tools";
import { TOOL_IDENTITIES } from "@/lib/ai/tool-identity";
import { TOOL_PERSONAS, personaVars } from "@/lib/ai/tool-persona";
import { WORKBENCH_CORE, WORKBENCH_MORE, workbenchSub } from "./tool-catalog";
import { WORKBENCH_GLYPH, type ToolGlyphId } from "./ToolGlyph";

export type WorkbenchCardDto = {
  id: AiAnalysisToolId;
  href: string;
  title: string;
  /** 결과물 모양 글리프 id */
  glyph: ToolGlyphId;
  /** 성격 한 낱말 — 12종이 제목만 다르고 나머지가 같아 보이던 것을 가른다 */
  character: string;
  /** 이 화면이 하는 일 한 줄(기능 설명 tagline 과 역할이 다르다) */
  premise: string;
  /** "투자 점수(점)" 같은 결과 라벨 — 없으면 null */
  result: string | null;
  /** [v4] 허브 목록 행 보조 한 줄 — 결과 이름 + 코드에 있는 개수("투자 점수 · 5개 항목") */
  sub: string;
  /** 도구 색 네 개 — 목록(허브·노트)은 쓰지 않는다(회색 1종). 도구 상세 화면 정체성의 재료로 남긴다. */
  vars: Record<string, string>;
};

/** 허브 목록 행이 클라이언트로 받는 최소 모양 — 직렬화 크기를 줄인다 */
export type WorkbenchRow = Pick<WorkbenchCardDto, "id" | "href" | "title" | "sub">;

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
    sub: workbenchSub(id),
    vars: personaVars(persona),
  };
}

/** 자주 쓰는 4개(앞) + 나머지 8개 — 순서는 tool-catalog 가 정한다 */
export function workbenchCardData(): { core: WorkbenchCardDto[]; more: WorkbenchCardDto[] } {
  return {
    core: WORKBENCH_CORE.map(build),
    more: WORKBENCH_MORE.map(build),
  };
}

/** [v4] 허브 목록 12행(자주 쓰는 4개 → 나머지 순) — 클라이언트로 넘길 최소 필드만 */
export function workbenchRows(): WorkbenchRow[] {
  return [...WORKBENCH_CORE, ...WORKBENCH_MORE].map((id) => ({
    id,
    href: `/analysis/ai/${id}`,
    title: TOOL_IDENTITIES[id].title,
    sub: workbenchSub(id),
  }));
}
