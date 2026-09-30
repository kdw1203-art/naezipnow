"use client";
/* [1026b · AI 분석 8종] 나머지 8종(리스크 점검·비교·수익률 계산·갭·경제지표·자산 구성·체크리스트·계약 점검)의 **결론 히어로** —
   4종과 같은 부품(SummaryLine: t-title 결론 + 판정 칩 하나(도구가 이미 가진 verdict.band) + 근거 한 줄(bandReason · 기준 시점) + 다른 도구
   칩 줄) 아래에 대표 수치(verdict.metric — 판정 칩과 같은 말이면 빼고) → 대표 그림(children: 위험 신호 5가지 · 대출 계산 · 비교표 ·
   확인할 항목 · 계약 전에 확인할 것)을 한 카드에. 숫자는 서버(lib/ai/verdict)가 만든 것만 — 새 계산 없음. ResultView 청크(next/dynamic). */

import type { ReactNode } from "react";
import type { Verdict } from "@/lib/ai/verdict";
import { SigCard, SummaryLine } from "./signature-cards";
import { ShownValue } from "./VerdictCard";
import { metricDisplay } from "./verdict-display";

export function ToolSignature({
  verdict,
  asOf,
  label,
  tools = null,
  metricAside = null,
  children = null,
  hideMetric = false,
}: {
  verdict: Verdict;
  /** 기준 시점 라벨(ymLabel 결과) */
  asOf: string | null;
  /** 카드 이름(보조 기술) */
  label: string;
  /** 다른 도구로 본 이 단지 — 칩 한 줄(VerdictChips) */
  tools?: ReactNode;
  /** 대표 수치 이름 옆 ⓘ */
  metricAside?: ReactNode;
  /** 대표 그림 — 없으면 대표 수치까지 */
  children?: ReactNode;
  /** 대표 그림이 같은 수를 제목으로 말할 때(체크리스트 "확인할 항목 N개" · 비교 "N곳") 대표 수치를 뺀다 */
  hideMetric?: boolean;
}) {
  const m = verdict.metric;
  const md = metricDisplay(m);
  /* "위험 수준 = 보통" 처럼 판정 칩과 같은 말을 되풀이하는 수치는 싣지 않는다(칩은 히어로 하나) */
  const echo = m != null && `${m.value}`.trim() === verdict.bandLabel.trim();
  const note = m ? [md?.kind === "delta" && !(m.note ?? "").includes(md.base) ? md.base : null, m.note].filter(Boolean).join(" · ") : "";
  return (
    <SigCard label={label}>
      <SummaryLine verdict={verdict} asOf={asOf} fallback="" tools={tools} />
      {m && !echo && !hideMetric && (
        <div className="mt-3 flex flex-col gap-0.5" data-testid="tool-metric">
          <span className="flex items-center gap-0.5 t-caption text-text-3">
            <span className="min-w-0 break-words">{m.label}</span>
            {metricAside}
          </span>
          <ShownValue value={`${m.value}${m.unit ?? ""}`} display={md} size="t-display" />
          {note && <span className="t-caption text-text-3 break-words">{note}</span>}
        </div>
      )}
      {children}
    </SigCard>
  );
}

/** 히어로 카드 안의 대표 그림 한 칸 — 가는 선 위에 작은 제목(t-body) + 기준 한 줄 */
export function SigFigure({ title, sub, children }: { title: string; sub?: ReactNode; children: ReactNode }) {
  return (
    <div className="mt-3 flex flex-col gap-3 border-t border-line pt-3" role="group" aria-label={title}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
        <h3 className="t-body font-bold text-ink">{title}</h3>
        {sub && <span className="t-caption text-text-3">{sub}</span>}
      </div>
      {children}
    </div>
  );
}
