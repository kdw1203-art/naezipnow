/* [1071 · 한 가지 꼴] AI 분석 허브의 "지역 시세"·"내 임장노트" 도구를 단지 분석과 **같은 표**로.
 *
 * 소유자(2026-10-16): "부족해 더 개선해줘 특히 ai분석 관련 디자인을 더 개선해줘" · "디자인 개선을 제대로 해줘".
 * 한 화면 전체를 캡처해 보니(로컬 빌드 1240px) 세 계열이 세 가지 다른 모양이었다 —
 *   단지 분석 = 표 · 지역 시세 = 큰 카드 4장(두 장만 숫자 상자가 있어 들쭉날쭉) ·
 *   내 임장노트 = 카드 2장 + 다른 꼴의 실행 카드 + 버튼 세 개 묶음 · 그 아래 남색 띠.
 * 칸마다 따로 다듬어서는 이 어긋남이 풀리지 않는다. 그래서 계열 셋을 **한 표 모양**으로 맞춘다:
 *   글리프 칩 · 이름 | 하는 일 | 지금 값(또는 결과) | ›
 * 칸 폭은 단지 분석 표와 같은 숫자(TOOL_COL_*)라 세 표의 칸이 위아래로 줄을 맞춘다.
 *
 * 사실은 하나도 빼지 않는다 — 카드에 있던 실측 값·출처 줄·추세선·지역 바꿔 보기(RegionTeaser)·
 * 내 노트 수(HubMyNoteTeaser)·비교 후보 수(CompareTrayCount)가 전부 "지금 값" 칸으로 옮겨 온다.
 * 서버 구성요소 — 줄 클릭만 ClickRow(클라이언트)가 맡는다. */
import type { ReactNode } from "react";
import { Icon } from "@/app/components/Icon";
import { Delta } from "@/app/components/num/Delta";
import { deltaDir, pctChange } from "@/lib/format/delta";
import { marketPersonaByHref, personaVars } from "@/lib/ai/tool-persona";
import { ToolGlyph, HUB_GLYPH } from "./ToolGlyph";
import { Sparkline } from "./Sparkline";
import { ToolLink } from "./tool-cards-client";
import { RegionTeaser } from "./hub-region-teaser";
import { ClickRow } from "./hub-click-row";
import { ACCEPTS_COMPLEX, TIERS, type HubTool } from "./tool-catalog";
import type { HubTeaser } from "./hub-teasers";
import { TOOL_COL_GO, TOOL_COL_NAME, TOOL_COL_RESULT } from "./tool-cols";


function sparkTone(series: readonly number[]): string {
  const dir = series.length >= 2 ? deltaDir(pctChange(series[series.length - 1], series[0])) : null;
  return dir === "up" ? "text-up" : dir === "down" ? "text-down" : "text-text-3";
}

/** 지금 값 칸 — 값(굵게) · 출처 한 줄 · 추세선. 지역 바꿔 보기가 있으면 RegionTeaser 가 그린다. */
function Now({
  teaser,
  byRegion,
  extra,
}: {
  teaser: HubTeaser | null;
  byRegion: Record<string, HubTeaser> | null;
  extra?: ReactNode;
}) {
  const swap = Boolean(byRegion && Object.keys(byRegion).length > 0);
  if (swap) {
    return (
      <span className="flex min-w-0 items-start gap-2">
        <RegionTeaser slot="value" variant="row" fallback={teaser} byRegion={byRegion!} />
        <RegionTeaser slot="spark" variant="row" fallback={teaser} byRegion={byRegion!} />
      </span>
    );
  }
  if (teaser) {
    const spark = teaser.series.length >= 2 ? teaser.series : null;
    return (
      <span className="flex min-w-0 items-start gap-2">
        <span className="flex min-w-0 flex-col gap-0.5">
          {teaser.deltaPct != null ? (
            <Delta pct={teaser.deltaPct} className="t-num t-body font-bold" />
          ) : (
            <span className="t-num t-body font-bold text-ink">{teaser.value}</span>
          )}
          <span className="t-caption text-text-3">{teaser.caption}</span>
        </span>
        {spark && (
          <span className={`inline-flex shrink-0 ${sparkTone(spark)}`}>
            <Sparkline values={spark} width={56} height={20} />
          </span>
        )}
      </span>
    );
  }
  if (extra) return <span className="flex min-w-0 flex-col">{extra}</span>;
  return <span className="t-caption text-text-3">—</span>;
}

export function ToolRows({
  tools,
  nowLabel,
  teasers,
  teasersByRegion,
  extras,
}: {
  tools: readonly HubTool[];
  /** 셋째 칸 머리 — 시장 계열은 "지금 값", 기록 계열은 "내 기록" */
  nowLabel: string;
  teasers?: Partial<Record<string, HubTeaser>>;
  /** regionId → (티저 키 → 티저). 있으면 고른 단지의 지역으로 바꿔 보인다 */
  teasersByRegion?: Record<string, Partial<Record<string, HubTeaser>>>;
  /** 도구 href → 셋째 칸에 둘 클라이언트 조각(내 노트 수 · 비교 후보 수) */
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
            const key = t.teaser;
            const teaser = (key && teasers?.[key]) || null;
            const byRegion: Record<string, HubTeaser> = {};
            if (key && teasersByRegion) {
              for (const [rid, set] of Object.entries(teasersByRegion)) {
                const v = set?.[key];
                if (v) byRegion[rid] = v;
              }
            }
            const persona = marketPersonaByHref(t.href);
            const premise = persona ? persona.premise : t.desc;
            const withPicked = ACCEPTS_COMPLEX.has(t.href);
            const extra = extras?.[t.href];
            const now = <Now teaser={teaser} byRegion={Object.keys(byRegion).length ? byRegion : null} extra={extra} />;
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
                      {/* 폰·태블릿: 하는 일 · 지금 값을 이름 아래로(그 칸들이 숨는 폭).
                          같은 글자 기둥 안에 두어야 이름·설명·값의 왼쪽 끝이 한 줄로 선다 — 따로 들여쓰기 값을
                          주면 칩 폭·간격이 바뀔 때마다 어긋난다(390px 실측: 이름 55px · 값 67px 로 12px 어긋났다). */}
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
