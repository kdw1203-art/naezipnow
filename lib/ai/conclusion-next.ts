/* [1026b · AI 분석 8종] 나머지 8종도 같은 틀 — 다음 행동 카드의 채움 파랑(주 행동)을 도구마다 하나로 정한다(RAIL_PRIMARY):
   단지 분석 4종 + 리스크 점검·갭투자 진단·수익률 계산 = "임장노트에 담기"(같은 노트 링크 규칙) · 다른 단지와 비교 = "결정 카드에 담기"
   (비교함 → /decide) · 경제지표 모니터 = "이 지역 알림 받기"(/notifications) · 내 자산 구성 진단·계약 리스크 점검·투자 체크리스트 =
   그 도구의 기존 다음 행동 첫째(이 단지 임장노트 쓰기 · 체크리스트로 노트 시작). 체크리스트 → 노트 고려사항 이관 목록(checklistHandoffItems)
   은 예전 ResultView NextActions 규칙 그대로(아직 체크하지 않은 항목 · 4~60자 · 최대 10개). 새 계산·새 조회 없음. */
/* [1026 · 단지 분석 4종] 결론 히어로의 "다음 행동 한 줄" + 판정 칩 색 — 순수 함수(화면이 이미 가진 값만 쓴다).
   소유자 1026 "1025 표준을 AI 분석 단지 분석에도" — 결론 한 줄 바로 아래에 **가장 약한 축/신호 → 이어서 볼 도구** 한 줄.
   새 계산·새 조회 없음: 레이더 축(insight.radar)·신호(insight.signals)·시나리오 연평균(scenario.annual.base)을 그대로 옮기고,
   축 → 도구 매핑은 기존 next-action-routing(RADAR_AXIS_FOLLOW_UP · radarAxisFollowUp · 50점 미만 = 주의)을 재사용한다.
   예) 종합 진단 "공급 여유 0점 → 리스크 점검에서 앞으로 입주 4,169세대 확인 ›"
       매수 타이밍 "가격 흐름 주의 → 시세 예측에서 지역 시세 한 달 +1.03% 확인 ›" */

import type { AiAnalysisToolId } from "@/lib/ai/ai-tools";
import type { OutcomeBand } from "@/lib/ai/outcome-band";
import { radarAxisFollowUp, RADAR_AXIS_FOLLOW_UP } from "@/lib/ai/next-action-routing";
import { signedPct } from "@/lib/ai/price-scenarios";

/** 판정 칩 — 1025 표준(좋음 초록 · 보통 파랑 · 주의 주황 · 자료 부족 회색). 토큰 유틸만 */
export const BAND_CHIP_CLASS: Record<OutcomeBand, string> = {
  strong: "bg-success-soft text-success",
  mixed: "bg-primary-soft text-primary",
  weak: "bg-warning-soft text-warning",
  thin: "bg-bg text-text-3",
};

export type ConclusionNext = {
  /** 약한 곳 한 토막 — "공급 여유 0점" · "가격 흐름 주의" · "기본 연 +4%" */
  lead: string;
  /** 링크 글자 — "리스크 점검에서 앞으로 입주 4,169세대 확인" */
  label: string;
  /** 같은 단지 딥링크(?complexId=) */
  href: string;
};

type Axis = { key: string; label: string; score: number | null; basis: string };
type Signal = { key: string; label: string; state: "green" | "yellow" | "red" | "na"; basis: string };

/** "지역 시세 한 달 +1.03% — 빠르게 오르는 중…" → "지역 시세 한 달 +1.03%"(사실 토막만). 자료 없음 문장은 null */
export function basisFact(basis: string | null | undefined): string | null {
  const head = (basis ?? "").split(" — ")[0].trim();
  if (!head || /없(음|어요)$/.test(head)) return null;
  return head;
}

/** 점수가 있는 축 중 가장 낮은 축(동점이면 앞 축). 축이 없으면 null */
export function weakestAxis(radar: readonly Axis[]): Axis | null {
  let low: Axis | null = null;
  for (const a of radar) {
    if (a.score == null || !Number.isFinite(a.score)) continue;
    if (!low || (a.score as number) < (low.score as number)) low = a;
  }
  return low;
}

/** 가장 약한 신호 — 주의(빨강) 먼저, 없으면 보통(노랑). 좋음·자료 없음뿐이면 null */
export function weakestSignal(signals: readonly Signal[]): Signal | null {
  return signals.find((s) => s.state === "red") ?? signals.find((s) => s.state === "yellow") ?? null;
}

const SIGNAL_WORD: Record<Signal["state"], string> = { green: "좋음", yellow: "보통", red: "주의", na: "자료 없음" };

/** 신호 → 그 신호를 깊게 보는 도구(같은 단지). 가격 → 시세 예측 · 거래 → 종합 진단 · 입주 → 리스크 점검 */
export const SIGNAL_FOLLOW_UP: Record<string, { tool: AiAnalysisToolId; label: string }> = {
  price: { tool: "ai-prediction", label: "시세 예측" },
  volume: { tool: "ai-diagnosis", label: "종합 진단" },
  supply: { tool: "ai-risk", label: "리스크 점검" },
};

/** 약한 곳이 없을 때 도구마다 이어서 볼 곳 하나(같은 단지) */
export const TOOL_FOLLOW_UP: Record<"ai-diagnosis" | "ai-prediction" | "ai-inspection" | "ai-timing", { tool: AiAnalysisToolId; label: string }> = {
  "ai-diagnosis": { tool: "ai-inspection", label: "임장 동선에서 함께 볼 단지 확인" },
  "ai-prediction": { tool: "ai-timing", label: "매수 타이밍에서 신호 3개 확인" },
  "ai-timing": { tool: "ai-risk", label: "리스크 점검에서 위험 신호 5가지 확인" },
  "ai-inspection": { tool: "ai-diagnosis", label: "종합 진단에서 5가지 항목 점수 확인" },
};

function toolHref(tool: AiAnalysisToolId, complexId: string | null): string {
  return `/analysis/ai/${tool}${complexId ? `?complexId=${encodeURIComponent(complexId)}` : ""}`;
}

/**
 * 결론 아래 "다음 행동 한 줄". 단지 분석 4종 밖의 도구는 null.
 *  · 종합 진단: 가장 낮은 축이 50점 미만이면 그 축 → radarAxisFollowUp 도구("{축} {점수}점 → {도구}에서 {근거} 확인").
 *  · 매수 타이밍: 주의(없으면 보통) 신호 → SIGNAL_FOLLOW_UP 도구.
 *  · 시세 예측: 기본 시나리오 연평균 → 매수 타이밍.
 *  · 약한 곳이 없으면 TOOL_FOLLOW_UP(lead 는 빈 문자열).
 */
export function conclusionNext(params: {
  tool: AiAnalysisToolId;
  complexId: string | null;
  radar?: readonly Axis[] | null;
  signals?: readonly Signal[] | null;
  /** 시세 예측 — scenario.annual.base(%) */
  annualBasePct?: number | null;
  /** 임장 동선 — 함께 볼 단지 수 */
  similarCount?: number | null;
}): ConclusionNext | null {
  const { tool, complexId } = params;
  if (tool !== "ai-diagnosis" && tool !== "ai-prediction" && tool !== "ai-inspection" && tool !== "ai-timing") return null;
  const fallback = (lead: string): ConclusionNext => ({ lead, label: TOOL_FOLLOW_UP[tool].label, href: toolHref(TOOL_FOLLOW_UP[tool].tool, complexId) });

  if (tool === "ai-diagnosis") {
    const a = weakestAxis(params.radar ?? []);
    const link = a ? radarAxisFollowUp(a.key, a.score, complexId) : null;
    if (a && link) {
      const fact = basisFact(a.basis);
      const tl = RADAR_AXIS_FOLLOW_UP[a.key]?.label ?? link.label;
      return { lead: `${a.label} ${a.score}점`, label: `${tl}에서 ${fact ? `${fact} ` : ""}확인`, href: link.href };
    }
    return fallback("");
  }
  if (tool === "ai-timing") {
    const s = weakestSignal(params.signals ?? []);
    const m = s ? SIGNAL_FOLLOW_UP[s.key] : null;
    if (s && m) {
      const fact = basisFact(s.basis);
      return { lead: `${s.label} ${SIGNAL_WORD[s.state]}`, label: `${m.label}에서 ${fact ? `${fact} ` : ""}확인`, href: toolHref(m.tool, complexId) };
    }
    return fallback("");
  }
  if (tool === "ai-prediction") {
    const p = params.annualBasePct;
    return fallback(p != null && Number.isFinite(p) ? `기본 연 ${signedPct(p)}` : "");
  }
  const n = params.similarCount ?? 0;
  return fallback(n > 0 ? `함께 볼 단지 ${n}곳` : "");
}

/* ── [1026b · AI 분석 8종] 다음 행동 카드의 채움 파랑 — 도구마다 하나 ─────────────────────────────── */

export type RailPrimaryKind = "note" | "checklist" | "decide" | "alert";

export const RAIL_PRIMARY: Record<AiAnalysisToolId, { kind: RailPrimaryKind; label: string }> = {
  "ai-diagnosis": { kind: "note", label: "임장노트에 담기" },
  "ai-prediction": { kind: "note", label: "임장노트에 담기" },
  "ai-inspection": { kind: "note", label: "임장노트에 담기" },
  "ai-timing": { kind: "note", label: "임장노트에 담기" },
  "ai-risk": { kind: "note", label: "임장노트에 담기" },
  "ai-gap": { kind: "note", label: "임장노트에 담기" },
  "ai-simulator": { kind: "note", label: "임장노트에 담기" },
  "ai-compare": { kind: "decide", label: "결정 카드에 담기" },
  "ai-economy": { kind: "alert", label: "이 지역 알림 받기" },
  "ai-portfolio": { kind: "note", label: "이 단지 임장노트 쓰기" },
  "contract-risk": { kind: "note", label: "이 단지 임장노트 쓰기" },
  "my-checklist": { kind: "checklist", label: "체크리스트로 노트 시작" },
};

/** 체크리스트 → 노트 고려사항으로 옮길 항목 — 아직 체크하지 않은 것 · 4~60자 · 최대 10개(NoteForm 이 10개까지 받는다) */
export function checklistHandoffItems(
  groups: readonly { items: readonly { id: string; label: string }[] }[] | null | undefined,
  checked: ReadonlySet<string>,
): string[] {
  return (groups ?? [])
    .flatMap((g) => g.items)
    .filter((i) => !checked.has(i.id))
    .map((i) => i.label)
    .filter((l) => l.length >= 4 && l.length <= 60)
    .slice(0, 10);
}
