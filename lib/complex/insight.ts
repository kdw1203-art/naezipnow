import "server-only";

/**
 * [1089 · 비용] 단지 화면 "이 단지 결과 요약"(예전 ComplexAxisSummary) · "다요인 분석"(예전 ComplexSignals)의 서버 몫.
 * 규칙 · 예산 · 문장은 예전 두 섹션 그대로다(옮기기만 했다) — 화면은 이 결과를 받아 같은 마크업을 그린다(ComplexInsightView).
 * 왜 옮겼나: lib/complex/insight-query 머리 주석.
 */
import { buildLiveToolContextCached, contextFootnotes, type LiveToolContext } from "@/lib/ai/live-context";
import { diagnosisRadar } from "@/lib/ai/insight-blocks";
import { buildVerdict, type Verdict } from "@/lib/ai/verdict";
import { loadSignalReport } from "@/lib/signals/load";
import type { SignalReport } from "@/lib/signals/engine";
import { applyAxisRule, confirmedAxesLine, emptyTilesLine } from "@/app/complex/[id]/axis-summary-rules";
import type { InsightQuery } from "@/lib/complex/insight-query";
import { logger } from "@/lib/log";

export type InsightRadarItem = { key: string; label: string; score: number | null };

export type ComplexInsightSummary = {
  verdict: Verdict;
  /** 축이 모자랄 때만 — 확인된 축 한 줄 */
  toneLine: string | null;
  emptyTilesLine: string | null;
  /** 투자 점수(링 · 레이더를 그릴 때만) */
  score: number | null;
  radar: InsightRadarItem[] | null;
};

export type ComplexInsight = {
  summary: ComplexInsightSummary | null;
  signals: SignalReport | null;
};

/** 라이브 컨텍스트 대기 상한 — 예전 결과 요약(1.2초)보다 넉넉히(화면을 막지 않는 별도 요청이라) */
const CTX_BUDGET_MS = 2_500;
/** 두 판 전체 상한 — 예전 섹션 공유 예산(3초)과 같은 크기 */
const TOTAL_BUDGET_MS = 3_500;

function timeout<T>(ms: number, value: T): Promise<T> {
  return new Promise((r) => setTimeout(() => r(value), ms));
}

/** 예전 ComplexAxisSummary 의 판단 그대로 — 축 0 이면 판 생략 */
export function summaryFromContext(ctx: LiveToolContext): ComplexInsightSummary | null {
  const raw = buildVerdict({ tool: "ai-diagnosis", ctx, footnotes: contextFootnotes(ctx) });
  if (!raw.metric && raw.numbers.length === 0) return null;
  const radar = diagnosisRadar(ctx);
  const { verdict, axes } = applyAxisRule(raw, radar);
  const score = verdict.metric && verdict.metric.label === "투자 점수" ? Number.parseInt(verdict.metric.value, 10) : NaN;
  const showViz = Number.isFinite(score) && !axes.thin;
  return {
    verdict,
    toneLine: axes.thin ? confirmedAxesLine(axes) : null,
    emptyTilesLine: emptyTilesLine(verdict.tiles),
    score: showViz ? score : null,
    radar: showViz ? radar.map((a) => ({ key: a.key, label: a.label, score: a.score })) : null,
  };
}

export async function loadComplexInsight(q: InsightQuery): Promise<ComplexInsight> {
  const deadline = Date.now() + TOTAL_BUDGET_MS;
  const ctx = await Promise.race([
    buildLiveToolContextCached(q.complexId, q.regionName, { complexDurable: false }).catch((e) => {
      logger.warnSampled("complex-insight-ctx", "[complex-insight] 라이브 컨텍스트 실패", e);
      return null;
    }),
    timeout(CTX_BUDGET_MS, null),
  ]);
  const summary = ctx ? summaryFromContext(ctx) : null;
  const signals = await Promise.race([
    loadSignalReport({ scope: "complex", regionName: q.regionName, complexId: q.complexId, ctx, complexSeries: q.series }).catch(
      (e): null => {
        logger.warnSampled("complex-insight-signals", "[complex-insight] 다요인 분석 실패", e);
        return null;
      },
    ),
    timeout(Math.max(500, deadline - Date.now()), null),
  ]);
  return { summary, signals: signals && signals.coverage.used > 0 ? signals : null };
}
