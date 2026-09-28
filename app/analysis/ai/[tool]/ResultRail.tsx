"use client";
/* [1021 · 단지 분석 /analysis/ai] 오른쪽 레일(단지 분석 4종) — ① 내 조건(TuningForm · 다시 계산, 기존 로직)
   ② 이 결과로(임장노트에 담기 · 관심 단지 담기 · 다른 단지와 비교 · 결과 링크 복사 — ResultView 의 기존 버튼을 옮겼다, 새 기능 없음)
   ③ 이어서 보기(다른 도구 칩 — verdict-board 의 4종 + 임장 동선, 딥링크 ?complexId=).
   next/dynamic(ssr:false) — 워크벤치 본체 번들(480KB)에 싣지 않는다. 폰에서는 WorkbenchClient 가 같은 카드를 한 열 순서에 맞춰 그린다. */

import Link from "next/link";
import type { ReactNode } from "react";
import type { AiAnalysisToolId } from "@/lib/ai/ai-tools";
import type { Verdict } from "@/lib/ai/verdict";
import { BOARD_TOOLS, BOARD_TOOL_LABEL } from "@/lib/ai/verdict-board";
import { useCopy } from "@/lib/ui/use-copy";
import { Icon } from "@/app/components/Icon";
import { NextActions } from "./ResultView";
import type { PickedLite, RunResult } from "./workbench-types";

const NEXT_TOOLS: readonly { id: AiAnalysisToolId; label: string }[] = [
  ...BOARD_TOOLS.map((t) => ({ id: t, label: BOARD_TOOL_LABEL[t] })),
  { id: "ai-inspection", label: "임장 동선" },
];

export function RailCard({ title, children, id }: { title: string; children: ReactNode; id?: string }) {
  return (
    <section id={id} className="card flex scroll-mt-20 flex-col gap-2 rounded-2xl p-4" aria-label={title}>
      <h2 className="t-caption font-bold text-text-3">{title}</h2>
      {children}
    </section>
  );
}

export function ResultRail({
  tool,
  coreTool,
  picked,
  verdict,
  result,
  condition,
  fallbackAction,
}: {
  tool: AiAnalysisToolId;
  coreTool: boolean;
  picked: PickedLite | null;
  verdict: Verdict | null;
  result: RunResult | null;
  /** 내 조건 카드 안(TuningForm + 다시 계산 버튼) — 없으면 카드를 그리지 않는다 */
  condition?: ReactNode;
  fallbackAction: { label: string; href: string };
}) {
  const shareUrl = result?.ok && result.runId ? `/analysis/ai/r/${result.runId}` : null;
  const { copy, copied } = useCopy("결과 링크를 복사했어요");
  return (
    <>
      {condition && <RailCard title="내 조건">{condition}</RailCard>}
      <RailCard title="이 결과로">
        <NextActions
          tool={tool}
          coreTool={coreTool}
          picked={picked}
          verdict={verdict}
          fallback={fallbackAction}
          stack
          noteClass={tool === "ai-inspection" ? "btn-primary" : "btn-soft"}
          noteLabel={tool === "ai-inspection" ? "이 코스로 임장노트 쓰기" : "임장노트에 담기"}
        />
        {shareUrl && (
          <button type="button" onClick={() => void copy(`${location.origin}${shareUrl}`)} className="btn-secondary btn-md gap-1.5">
            {copied ? (
              <span className="njn-pop-once inline-flex text-primary" aria-hidden="true">
                <Icon name="check" size={14} />
              </span>
            ) : (
              <Icon name="link" size={14} />
            )}
            {copied ? "복사했어요" : "결과 링크 복사"}
          </button>
        )}
      </RailCard>
      {picked && (
        <RailCard title="이어서 보기">
          <ul className="flex flex-wrap gap-1.5">
            {NEXT_TOOLS.filter((t) => t.id !== tool).map((t) => (
              <li key={t.id}>
                <Link
                  href={`/analysis/ai/${t.id}?complexId=${encodeURIComponent(picked.id)}`}
                  className="chip press inline-flex min-h-[40px] items-center border border-line bg-surface px-3 t-sub font-bold text-text-1 no-underline"
                >
                  {t.label}
                </Link>
              </li>
            ))}
          </ul>
        </RailCard>
      )}
    </>
  );
}
