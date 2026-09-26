/**
 * [996] 종합 판단 보드 — "같은 단지, 네 가지 눈".
 * [1008 · W] 화면 이름은 "다른 도구로 본 이 단지" — "눈·구간·갈림" 은 내부 말이었다(소유자 캡처:
 * "4개 눈 모두 '갈림' 구간"). 합의 문장도 "네 도구 모두 '보통'" 처럼 쉬운 말로 쓴다.
 *
 * 왜: 도구 12종이 각자 판단 카드를 내지만, 사용자는 한 단지를 두고 "진단은 좋다는데
 * 리스크는?" 을 도구를 바꿔 가며 네 번 실행해야 알 수 있었다. 이 모듈은 네 도구의
 * 판단 카드(lib/ai/verdict.ts 가 이미 만든 것)를 **한 줄로 요약**하고, 구간(band)만
 * 세어 합의 문장을 만든다.
 *
 * 새 수치를 만들지 않는다 — 카드가 준 구간·결론·대표 수치를 그대로 옮기고, 합의는
 * 구간 개수만 센다(점수 평균 같은 파생 수치를 지어내지 않는다).
 *
 * 순수 함수 — 클라이언트 보드(app/analysis/ai/[tool]/VerdictBoard.tsx)와 단위테스트가
 * 같은 값을 본다. verdict.ts 는 타입만 가져온다(insight-blocks 를 브라우저에 싣지 않는다).
 */

import type { Verdict } from "@/lib/ai/verdict";
import type { OutcomeBand } from "@/lib/ai/outcome-band";

/** 보드에 서는 네 눈 — 허브의 핵심 4종 중 임장 동선은 판단이 아니라 동선이라 리스크로 바꿨다 */
export const BOARD_TOOLS = ["ai-diagnosis", "ai-prediction", "ai-timing", "ai-risk"] as const;
export type BoardToolId = (typeof BOARD_TOOLS)[number];

export const BOARD_TOOL_LABEL: Record<BoardToolId, string> = {
  "ai-diagnosis": "종합 진단",
  "ai-prediction": "시세 예측",
  "ai-timing": "매수 타이밍",
  "ai-risk": "리스크 점검",
};

export function isBoardToolId(v: string): v is BoardToolId {
  return (BOARD_TOOLS as readonly string[]).includes(v);
}

export type BoardSummary = {
  band: OutcomeBand;
  bandLabel: string;
  headline: string;
  metric?: { label: string; value: string; unit?: string; asOf?: string } | null;
};

/**
 * 판단 카드 → 미니 카드 한 장 분량. 대표 수치가 없으면 칸을 비운다.
 * stripName: 결론이 "{단지명}: …" 으로 시작하면 그 머리를 뗀다 — 보드는 이미 한 단지의
 * 것이라 네 칸이 같은 이름으로 시작하면 한 줄 칸에서 결론이 밀려난다.
 */
export function summarizeForBoard(
  verdict: Pick<Verdict, "band" | "bandLabel" | "headline" | "metric">,
  opts: { stripName?: string } = {},
): BoardSummary {
  const m = verdict.metric;
  const prefix = opts.stripName ? `${opts.stripName}: ` : null;
  const headline =
    prefix && verdict.headline.startsWith(prefix) ? verdict.headline.slice(prefix.length) : verdict.headline;
  return {
    band: verdict.band,
    bandLabel: verdict.bandLabel,
    headline,
    metric: m
      ? {
          label: m.label,
          value: `${m.value}`,
          ...(m.unit ? { unit: m.unit } : {}),
          ...(m.asOf ? { asOf: m.asOf } : {}),
        }
      : null,
  };
}

export type BoardItem = {
  tool: BoardToolId;
  band: OutcomeBand;
  bandLabel: string;
};

/**
 * 합의 한 줄 — 구간(좋음·보통·주의·자료 부족)만 센다.
 *   전부 같음   → "4개 도구 모두 '좋음'"
 *   과반        → "4개 도구 중 3개가 '좋음' · 리스크 점검만 '주의'"
 *   과반 없음   → "도구마다 달라요 — 종합 진단·시세 예측 '좋음' · 매수 타이밍·리스크 점검 '주의'"
 * 2개 미만이면 null(한 도구로 "합의"를 말하지 않는다). agree = 가장 많은 구간의 개수.
 */
export function boardConsensus(items: readonly BoardItem[]): { line: string; agree: number; total: number } | null {
  const total = items.length;
  if (total < 2) return null;

  /* 구간별 묶음 — 등장 순서를 지켜 문장에서 도구 순서가 흔들리지 않게 한다 */
  const groups = new Map<OutcomeBand, { bandLabel: string; tools: BoardToolId[] }>();
  for (const it of items) {
    const g = groups.get(it.band);
    if (g) g.tools.push(it.tool);
    else groups.set(it.band, { bandLabel: it.bandLabel, tools: [it.tool] });
  }
  const ranked = [...groups.values()].sort((a, b) => b.tools.length - a.tools.length);
  const top = ranked[0];
  const agree = top.tools.length;
  const names = (tools: BoardToolId[]) => tools.map((t) => BOARD_TOOL_LABEL[t]).join("·");

  if (ranked.length === 1) {
    return { line: `${total}개 도구 모두 '${top.bandLabel}'`, agree, total };
  }
  const majority = agree * 2 > total;
  if (!majority) {
    const parts = ranked.map((g) => `${names(g.tools)} '${g.bandLabel}'`).join(" · ");
    return { line: `도구마다 달라요 — ${parts}`, agree, total };
  }
  const rest = ranked
    .slice(1)
    .map((g) => (g.tools.length === 1 ? `${names(g.tools)}만 '${g.bandLabel}'` : `${names(g.tools)}는 '${g.bandLabel}'`))
    .join(" · ");
  return { line: `${total}개 도구 중 ${agree}개가 '${top.bandLabel}' · ${rest}`, agree, total };
}
