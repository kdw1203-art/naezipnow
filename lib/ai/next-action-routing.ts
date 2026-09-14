/**
 * AI Hero "다음에 할 일" 자동 라우팅 — 도구별로 다음 권장 도구·라우트를 결정.
 *
 * [996] 이제 사용처가 있다 — 워크벤치 판단 카드 아래 "다음 행동 두 개"
 * (app/analysis/ai/[tool]/VerdictBoard.tsx)와 공유 결과 페이지(/analysis/ai/r/[id])가
 * `verdictNextActions` 를 부른다. 핵심 4종(진단·예측·동선·타이밍)의 1순위는
 * **판단을 임장노트로 넘기기**로 고정한다: 결과를 보고 다음에 실제로 하는 일이
 * 임장이고, 노트 메모에 "AI 진단 2026.09.13: …" 이 남아야 나중에 예측과 실제를
 * 대조할 수 있다. 나머지 도구는 예전 점수·도구 매핑(pickNextAction)을 그대로 쓴다.
 *
 * `/ai-analysis/{tool}` 은 라우트가 아니라 엔진 식별자다 — href 는 실존 라우트만.
 *
 * 라우팅 우선순위(pickNextAction):
 *   1) 점수가 매우 낮으면 → 위험(ai-risk) 또는 임장(ai-inspection) 으로
 *   2) 점수가 매우 높으면 → 매수 타이밍(ai-timing) 또는 시뮬레이터(ai-simulator)
 *   3) 그 외엔 도구별 자연스러운 다음 단계 매핑.
 */

import { isCoreAiAnalysisToolId, type AiAnalysisToolId } from "@/lib/ai/ai-tools";
import type { Verdict } from "@/lib/ai/verdict";
import { BOARD_TOOL_LABEL, isBoardToolId } from "@/lib/ai/verdict-board";
import { complexHrefFromId } from "@/lib/seo/complex-slug";

export type NextActionTarget = {
  /** 사용자에게 보여줄 짧은 라벨 */
  label: string;
  /** 클릭 시 이동할 next.js path (?ref= 등 포함 가능) */
  href: string;
  /** 작은 안내 한 줄 */
  hint?: string;
  /** 이모지 */
  emoji?: string;
};

const DEFAULT_NEXT: Record<AiAnalysisToolId, NextActionTarget> = {
  "ai-diagnosis": {
    label: "임장 가서 직접 보기",
    href: "/analysis",
    emoji: "🏃",
    hint: "AI 진단 결과를 바탕으로 우선 임장 후보를 추천해 드려요.",
  },
  "ai-prediction": {
    label: "지금 사기 좋은 타이밍인지 확인",
    href: "/analysis",
    emoji: "⏱️",
    hint: "예측한 흐름을 바탕으로 매수 타이밍을 점검해 보세요.",
  },
  "ai-inspection": {
    label: "임장 노트 바로 작성",
    href: "/notes/new",
    emoji: "📝",
    hint: "AI가 짚은 체크 포인트를 노트에 미리 채워드려요.",
  },
  "ai-timing": {
    label: "리스크 한 번 더 점검",
    href: "/analysis",
    emoji: "🛡️",
    hint: "타이밍이 좋아도 위험은 따로 살펴보는 게 안전해요.",
  },
  "ai-risk": {
    label: "비슷한 안전한 후보 찾기",
    href: "/analysis",
    emoji: "🔁",
    hint: "다른 후보와 위험·기회를 함께 비교해 봐요.",
  },
  "ai-compare": {
    label: "후보 단지 임장 가기",
    href: "/analysis",
    emoji: "🚇",
    hint: "두 후보 모두 임장으로 검증하면 결정이 쉬워져요.",
  },
  "ai-simulator": {
    label: "현금 흐름이 더 좋은 타이밍 찾기",
    href: "/analysis",
    emoji: "📈",
    hint: "시나리오가 흔들리면 타이밍을 다시 점검해야 해요.",
  },
  "ai-gap": {
    label: "위험을 함께 점검",
    href: "/analysis",
    emoji: "🛡️",
    hint: "갭 투자는 역전세 위험과 함께 봐야 해요.",
  },
  "ai-economy": {
    label: "관심 단지 시세 예측",
    href: "/analysis",
    emoji: "📊",
    hint: "거시 흐름을 바탕으로 단지 단위 예측을 이어가세요.",
  },
  "my-checklist": {
    label: "임장 노트로 옮기기",
    href: "/notes/new",
    emoji: "📝",
  },
  "ai-portfolio": {
    label: "포트폴리오 시뮬레이션",
    href: "/analysis",
    emoji: "🧮",
  },
  /* [992 · A1] 전문가 찾기(/town/experts)는 보관(비노출) — 계약 위험 점검 다음 행동은
     그 조항을 노트에 남기는 것. */
  "contract-risk": {
    label: "점검 결과를 임장노트에 남기기",
    href: "/notes/new",
    emoji: "📝",
  },
};

const LOW_SCORE_NEXT: NextActionTarget = {
  label: "우선 위험 점검",
  href: "/analysis",
  emoji: "🛡️",
  hint: "점수가 낮을 땐 위험을 먼저 좁혀봐요.",
};

const HIGH_SCORE_NEXT: NextActionTarget = {
  label: "지금 매수 타이밍 점검",
  href: "/analysis",
  emoji: "⏱️",
  hint: "점수가 높으면 매수 타이밍 검증이 우선이에요.",
};

/**
 * 점수와 도구 종류를 함께 고려해서 다음 행동을 결정한다.
 *
 * @param tool 현재 도구 ID
 * @param score 0~100 점수 (없으면 기본 매핑 사용)
 */
export function pickNextAction(
  tool: AiAnalysisToolId,
  score: number | null,
): NextActionTarget {
  if (typeof score === "number" && Number.isFinite(score)) {
    if (score < 35 && tool !== "ai-risk") return LOW_SCORE_NEXT;
    if (score >= 80 && tool !== "ai-timing") return HIGH_SCORE_NEXT;
  }
  return DEFAULT_NEXT[tool] ?? DEFAULT_NEXT["ai-diagnosis"];
}

/**
 * Hero 의 recommendation 텍스트만 보고 "다음 행동" 으로 사용할 수 있는지 휴리스틱.
 * (현재는 항상 true — 미래에 빈 텍스트일 때 false 등으로 확장)
 */
export function shouldShowNextAction(_recommendation: string | null): boolean {
  return true;
}

/* ── [996] 판단 → 다음 행동 두 개 ─────────────────────────────────────────── */

/** 노트 메모 머리에 적는 도구 이름 — 보드 라벨을 그대로 쓰고 동선만 보탠다 */
export function noteToolLabel(tool: AiAnalysisToolId): string {
  if (isBoardToolId(tool)) return BOARD_TOOL_LABEL[tool];
  if (tool === "ai-inspection") return "임장 동선";
  return "분석";
}

const MEMO_MAX = 600;

/** yyyymm → yyyy.mm · ISO 날짜 → yyyy.mm.dd (그 외는 원문) */
function asOfLabel(asOf: string | null): string | null {
  if (!asOf) return null;
  if (/^\d{6}$/.test(asOf)) return `${asOf.slice(0, 4)}.${asOf.slice(4)}`;
  if (/^\d{4}-\d{2}-\d{2}/.test(asOf)) return asOf.slice(0, 10).replace(/-/g, ".");
  return asOf;
}

/**
 * 판단 카드 → 임장노트 메모 초안.
 *   "AI 종합 진단 2026.09.13: {결론}" + 핵심 숫자 ≤3 을 "라벨 값(기준일)" 줄로.
 * 숫자는 카드가 이미 조립한 것만 옮긴다. URL 에 실리므로 600자에서 자른다.
 */
export function verdictNoteMemo(params: {
  tool: AiAnalysisToolId;
  verdict: Pick<Verdict, "headline" | "numbers"> & { computedAt?: string };
  now?: Date;
}): string {
  /* 날짜는 판단이 계산된 시각(공유 페이지는 실행 스냅샷) — 없으면 지금. 서버(UTC)에서도
     한국 날짜로 적는다: 밤 실행이 "어제" 로 적히면 대조 근거가 어긋난다. */
  const computed = params.verdict.computedAt ? new Date(params.verdict.computedAt) : null;
  const d = params.now ?? (computed && !Number.isNaN(computed.getTime()) ? computed : new Date());
  const ymd = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" })
    .formatToParts(d)
    .filter((p) => p.type === "year" || p.type === "month" || p.type === "day")
    .map((p) => p.value)
    .join(".");
  const lines = [`AI ${noteToolLabel(params.tool)} ${ymd}: ${params.verdict.headline}`];
  for (const n of params.verdict.numbers.slice(0, 3)) {
    const when = asOfLabel(n.asOf);
    lines.push(`${n.label} ${n.value}${when ? `(${when})` : ""}`);
  }
  const memo = lines.join("\n");
  return memo.length > MEMO_MAX ? `${memo.slice(0, MEMO_MAX - 1)}…` : memo;
}

export type VerdictNextActions = {
  /** 1순위 — 핵심 4종은 노트 이관, 그 외는 점수·도구 매핑 */
  primary: NextActionTarget;
  /** 2순위 — 단지 홈(근거 보기). 단지가 없으면 null */
  secondary: NextActionTarget | null;
};

/**
 * 판단 카드 아래 "다음 행동 두 개" — 어느 도구든 같은 자리에 같은 모양으로.
 * 단지가 없으면(경제 모니터·계약 점검 등) 노트 링크는 대상 없이 /notes/new 로 간다.
 */
export function verdictNextActions(params: {
  tool: AiAnalysisToolId;
  verdict: (Pick<Verdict, "headline" | "numbers" | "metric"> & { computedAt?: string }) | null;
  complexId: string | null;
  complexName?: string | null;
  region?: string | null;
  now?: Date;
  /** 핵심 4종이 아니어도 노트 이관을 1순위로(공유 페이지 — 받은 사람의 다음 일은 임장이다) */
  noteHandoff?: boolean;
}): VerdictNextActions {
  const { tool, verdict, complexId } = params;
  const secondary: NextActionTarget | null = complexId
    ? { label: "단지 홈에서 근거 보기", href: complexHrefFromId(complexId), emoji: "🏘️" }
    : null;

  if (isCoreAiAnalysisToolId(tool) || params.noteHandoff) {
    const qs = new URLSearchParams();
    if (params.complexName) qs.set("apt", params.complexName);
    if (params.region) qs.set("region", params.region);
    if (complexId) qs.set("complexId", complexId);
    if (verdict) qs.set("memo", verdictNoteMemo({ tool, verdict, now: params.now }));
    const q = qs.toString();
    return {
      primary: {
        label: "이 판단으로 임장노트 쓰기",
        href: `/notes/new${q ? `?${q}` : ""}`,
        emoji: "📝",
        hint: "결론과 핵심 숫자가 메모 초안으로 들어가요.",
      },
      secondary,
    };
  }

  /* 나머지 도구 — 예전 매핑. 대표 수치가 숫자일 때만 점수로 읽는다(verdictToSummary 와 같은 규칙). */
  const score = verdict?.metric && /^\d+(\.\d+)?$/.test(verdict.metric.value) ? Number(verdict.metric.value) : null;
  const base = pickNextAction(tool, score);
  const href = complexId ? `${base.href}${base.href.includes("?") ? "&" : "?"}complexId=${encodeURIComponent(complexId)}` : base.href;
  return { primary: { ...base, href }, secondary };
}
