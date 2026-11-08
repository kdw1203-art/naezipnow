/* [1071 · 한 가지 꼴] 도구 표 — 단지 분석 표와 **같은 표**(글리프 칩 · 이름 | 하는 일 | 내 기록 | ›). 칸 폭은 TOOL_COL_*.
 *
 * [1110 · AI 분석 2차 통폐합] 지역 시세 줄(티저 · 추세선 · 지역 바꿔 보기 — hub-teasers · hub-region-teaser)은 없어졌다: 지역 시세는
 * 도구 5줄이 아니라 "지역 시세 분석" 하나(region-sise-entry)다. 이 표는 이제 임장노트 분석 화면(/notes/analysis)의 기록 계열
 * (후보 단지 비교 · 에이전트)이 쓴다 — 셋째 칸은 클라이언트 조각(extras · 비교 후보 수)만.
 * 서버 구성요소 — 줄 클릭만 ClickRow(클라이언트)가 맡는다. */
import type { ReactNode } from "react";
import { Icon } from "@/app/components/Icon";
import { marketPersonaByHref, personaVars } from "@/lib/ai/tool-persona";
import { ToolGlyph, HUB_GLYPH } from "./ToolGlyph";
import { ToolLink } from "./tool-cards-client";
import { ClickRow } from "./hub-click-row";
import { ACCEPTS_COMPLEX, TIERS, type HubTool } from "./tool-catalog";
import { TOOL_COL_GO, TOOL_COL_NAME, TOOL_COL_RESULT } from "./tool-cols";

export function ToolRows({
  tools,
  nowLabel,
  extras,
}: {
  tools: readonly HubTool[];
  /** 셋째 칸 머리 — 기록 계열은 "내 기록" */
  nowLabel: string;
  /** 도구 href → 셋째 칸에 둘 클라이언트 조각(비교 후보 수) */
  extras?: Partial<Record<string, ReactNode>>;
}) {
  return (
    <div className="card overflow-hidden rounded-2xl">
      <table className="w-full border-collapse md:table-fixed">
        <thead className="max-md:hidden">
          <tr className="border-b border-line bg-bg text-left t-caption text-text-3">
            <th scope="col" className={`px-3 py-2 font-bold ${TOOL_COL_NAME}`}>도구</th>
            <th scope="col" className="px-2 py-2 font-bold">하는 일</th>
            <th scope="col" className={`hidden px-2 py-2 font-bold lg:table-cell ${TOOL_COL_RESULT}`}>{nowLabel}</th>
            <th scope="col" className={`px-3 py-2 ${TOOL_COL_GO}`}>
              <span className="sr-only">열기</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {tools.map((t) => {
            const persona = marketPersonaByHref(t.href);
            const premise = persona ? persona.premise : t.desc;
            const withPicked = ACCEPTS_COMPLEX.has(t.href);
            const extra = extras?.[t.href];
            const now = extra ? <span className="flex min-w-0 flex-col">{extra}</span> : <span className="t-caption text-text-3">—</span>;
            return (
              <ClickRow
                key={t.href}
                href={t.href}
                title={t.title}
                withPicked={withPicked}
                className="cursor-pointer border-b border-line align-top last:border-b-0 hover:bg-bg"
              >
                <td className="px-3 py-2">
                  <ToolLink
                    href={t.href}
                    title={t.title}
                    withPicked={withPicked}
                    className={`press flex min-h-11 min-w-0 items-start gap-2.5 no-underline${persona ? " tool-scope" : ""}`}
                    style={persona ? personaVars(persona) : undefined}
                  >
                    <span
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                        persona ? "tool-soft-bg tool-ink" : TIERS[t.tier].iconClass
                      }`}
                      aria-hidden="true"
                    >
                      {HUB_GLYPH[t.href] ? <ToolGlyph id={HUB_GLYPH[t.href]} size={24} /> : <Icon name={t.icon} size={16} />}
                    </span>
                    <span className="flex min-w-0 flex-col gap-0.5 pt-1.5">
                      <span className="t-body font-bold text-ink">{t.title}</span>
                      {/* 폰·태블릿: 하는 일 · 내 기록을 이름 아래로(그 칸들이 숨는 폭) — 같은 글자 기둥 안에 두어야 왼쪽 끝이 한 줄로 선다 */}
                      <span className="t-caption text-text-3 md:hidden">{premise}</span>
                      <span className="mt-1 lg:hidden">{now}</span>
                    </span>
                  </ToolLink>
                </td>
                <td className="hidden px-2 py-2 pt-[15px] t-sub text-text-2 md:table-cell">{premise}</td>
                <td className={`hidden px-2 py-2 pt-[13px] lg:table-cell ${TOOL_COL_RESULT}`}>{now}</td>
                <td className={`px-3 pt-[15px] text-right t-body text-text-3 ${TOOL_COL_GO}`} aria-hidden="true">
                  {/* dead-control-ok: 줄 전체가 링크(ClickRow) — › 는 이 줄이 열린다는 표시 */}
                  ›
                </td>
              </ClickRow>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
