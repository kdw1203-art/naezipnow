/**
 * [996 · 4] 임장노트 "판단" — 살까 · 보류 · 패스 · 다시 보기. 순수 모듈.
 *
 * 왜: 상세 첫 화면의 판단 카드(993)는 LLM 결론이 없으면 규칙 요약을 그렸는데,
 * 그 문장은 "입력 4개 축 평균 3.2/5점 — …" 같은 채움말이라 노트가 **무엇을 말하려는지**
 * 답하지 않았다. 991 계획 S3: 저장 직후 판단을 규칙이 **제안**하고 사용자가 **고른다**.
 * 고른 값은 metadata.decision 에 남는다(inspection_notes.verdict 컬럼은 앱이 읽지도
 * 쓰지도 않는 유령 컬럼 — 쓰기 시작하지 않는다).
 *
 * 원칙: 제안은 **받은 입력만** 인용한다(현장 체크·축 점수·체크리스트·넘겨 준 시세).
 * 없는 값은 문장에 넣지 않는다 — 입력이 없으면 "다시 보기"가 정답이다.
 *
 * `server-only`·React 를 import 하지 않는다 — NoteForm(클라이언트)·상세(서버)·
 * API(검증)·node:test 가 같은 규칙을 부른다.
 */

export type DecisionChoice = "buy" | "hold" | "pass" | "revisit";

export const DECISION_CHOICES: readonly DecisionChoice[] = ["buy", "hold", "pass", "revisit"];

const LABELS: Record<DecisionChoice, string> = {
  buy: "살까",
  hold: "보류",
  pass: "패스",
  revisit: "다시 보기",
};

/** 근거 한 줄 상한·줄 수 상한 — 폼 입력(maxLength)·검증·카드가 같은 수를 본다 */
export const DECISION_REASON_MAX = 60;
export const DECISION_REASONS_MAX = 3;

export type NoteDecision = {
  choice: DecisionChoice;
  /** ≤3줄 · 각 ≤60자 · 빈 줄 없음 */
  reasons: string[];
  /** ISO 시각 — 저장 시점(폼이 찍는다) */
  decidedAt: string;
};

export type DecisionScores = {
  location: number;
  school: number;
  transport: number;
  facility: number;
  future: number;
};

export type DecisionMarket = {
  /** "12.5억" 처럼 이미 포맷된 대표가 — 여기서 숫자를 다시 만들지 않는다 */
  priceLabel?: string | null;
  /** 전월비 % (음수 = 하락) */
  momPct?: number | null;
  /** 전세가율 % */
  jeonseRatio?: number | null;
};

export type DecisionInput = {
  /** 현장 체크 9항목 — 값이 좋음·보통·아쉬움인 키만 센다 */
  checks?: Readonly<Record<string, string | undefined>> | null;
  /** 5축 점수(1~5) — 0 은 미입력 */
  scores?: DecisionScores | null;
  checklistDoneCount?: number;
  checklistTotal?: number;
  market?: DecisionMarket | null;
};

export type DecisionSuggestion = {
  choice: DecisionChoice;
  /** ≤3줄 — 전부 입력에서 나온 사실 */
  reasons: string[];
  /** 무엇을 근거로 했는지 한 줄("현장 체크 9개 · 축 점수 4개 기준") */
  basis: string;
};

export function isDecisionChoice(v: unknown): v is DecisionChoice {
  return typeof v === "string" && (DECISION_CHOICES as readonly string[]).includes(v);
}

export function decisionLabel(choice: DecisionChoice): string {
  return LABELS[choice];
}

/** 상세 판단 카드의 띠 색 — 기존 .verdict-band[data-band] 4종을 그대로 쓴다 */
export function decisionBand(choice: DecisionChoice): "strong" | "mixed" | "weak" | "thin" {
  if (choice === "buy") return "strong";
  if (choice === "hold") return "mixed";
  if (choice === "pass") return "weak";
  return "thin";
}

const AXES: Array<{ key: keyof DecisionScores; label: string }> = [
  { key: "location", label: "입지" },
  { key: "school", label: "학군" },
  { key: "transport", label: "교통" },
  { key: "facility", label: "시설" },
  { key: "future", label: "미래가치" },
];

const NO_INPUT_REASON = "아직 기록이 적어요 — 확인 후 판단";

function clampReason(s: string): string {
  const t = s.trim();
  return t.length > DECISION_REASON_MAX ? `${t.slice(0, DECISION_REASON_MAX - 1)}…` : t;
}

/** 시세 한 줄 — 넘겨 준 값만. 하나도 없으면 null */
function marketReason(m: DecisionMarket | null | undefined): string | null {
  if (!m) return null;
  const parts: string[] = [];
  const price = typeof m.priceLabel === "string" ? m.priceLabel.trim() : "";
  if (price) parts.push(`실거래 평균 ${price}`);
  if (typeof m.momPct === "number" && Number.isFinite(m.momPct)) {
    const abs = Math.abs(m.momPct).toFixed(1);
    parts.push(`전월비 ${m.momPct > 0 ? "▲" : m.momPct < 0 ? "▼" : ""}${abs}%`);
  }
  if (typeof m.jeonseRatio === "number" && Number.isFinite(m.jeonseRatio)) {
    parts.push(`전세가율 ${Math.round(m.jeonseRatio)}%`);
  }
  return parts.length ? parts.join(" · ") : null;
}

/**
 * 규칙 제안. 입력에서만 만든다.
 *  · 입력 없음 → revisit("아직 기록이 적어요")
 *  · 아쉬움 ≥2 또는 축 평균 <2.5 → 부정: 아쉬움 ≥3 이거나 (축 ≥3개 평균 <2) 면 pass, 아니면 hold
 *  · 아쉬움 0 이고 (좋음 ≥3 또는 축 ≥3개 평균 ≥4) → buy
 *  · 그 밖에 체크 ≥3 또는 축 ≥2 → hold(섞였다), 더 적으면 revisit(아직 얇다)
 */
export function suggestDecision(input: DecisionInput): DecisionSuggestion {
  const checks = input.checks ?? {};
  let good = 0;
  let mid = 0;
  let bad = 0;
  for (const v of Object.values(checks)) {
    if (v === "좋음") good += 1;
    else if (v === "보통") mid += 1;
    else if (v === "아쉬움") bad += 1;
  }
  const checked = good + mid + bad;

  const scored = AXES.map(({ key, label }) => ({
    label,
    score: Number(input.scores?.[key] ?? 0),
  })).filter((a) => Number.isFinite(a.score) && a.score > 0);
  const avg = scored.length ? scored.reduce((s, a) => s + a.score, 0) / scored.length : null;

  const done = Math.max(0, Math.floor(input.checklistDoneCount ?? 0));
  const total = Math.max(0, Math.floor(input.checklistTotal ?? 0));
  const market = marketReason(input.market);

  const observed = checked > 0 || scored.length > 0 || done > 0;
  if (!observed) {
    return {
      choice: "revisit",
      reasons: [NO_INPUT_REASON, ...(market ? [market] : [])].map(clampReason),
      basis: "입력된 기록 없음",
    };
  }

  /* ── 근거 줄: 체크 → 축 → 시세 → 체크리스트 순, 최대 3줄 ── */
  const reasons: string[] = [];
  if (checked > 0) {
    const tally: string[] = [];
    if (good > 0) tally.push(`좋음 ${good}`);
    if (bad > 0) tally.push(`아쉬움 ${bad}`);
    reasons.push(
      tally.length
        ? `현장 체크 ${checked}개 중 ${tally.join(" · ")}`
        : `현장 체크 ${checked}개 모두 보통`,
    );
  }
  if (scored.length > 0) {
    const sorted = [...scored].sort((a, b) => b.score - a.score);
    const top = sorted.slice(0, 2).map((a) => `${a.label} ${a.score}/5`);
    const weakest = sorted[sorted.length - 1];
    const weakShown = sorted.slice(0, 2).some((a) => a.label === weakest.label);
    if (weakest.score <= 2 && !weakShown) top.push(`약한 축 ${weakest.label} ${weakest.score}/5`);
    reasons.push(top.join(" · "));
  }
  if (market) reasons.push(market);
  if (done > 0 && total > 0) reasons.push(`체크리스트 ${done}/${total}`);

  /* ── 선택 ── */
  const negative = bad >= 2 || (avg != null && avg < 2.5);
  const positive = bad === 0 && (good >= 3 || (avg != null && avg >= 4 && scored.length >= 3));
  let choice: DecisionChoice;
  if (negative) {
    choice = bad >= 3 || (avg != null && avg < 2 && scored.length >= 3) ? "pass" : "hold";
  } else if (positive) {
    choice = "buy";
  } else if (checked >= 3 || scored.length >= 2) {
    choice = "hold";
  } else {
    choice = "revisit";
  }

  const basisParts: string[] = [];
  if (checked > 0) basisParts.push(`현장 체크 ${checked}개`);
  if (scored.length > 0) basisParts.push(`축 점수 ${scored.length}개`);
  if (done > 0 && total > 0) basisParts.push(`체크리스트 ${done}/${total}`);
  if (market) basisParts.push("시세");

  return {
    choice,
    reasons: reasons.slice(0, DECISION_REASONS_MAX).map(clampReason),
    basis: `${basisParts.join(" · ")} 기준`,
  };
}

/** 근거 줄 정리 — 공백 제거·빈 줄 삭제·상한 적용. 폼 저장·API 검증이 같은 규칙 */
export function normalizeReasons(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((x): x is string => typeof x === "string")
    .map((s) => s.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .slice(0, DECISION_REASONS_MAX)
    .map(clampReason);
}

/**
 * metadata.decision 검증 — 모양이 아니면 null(쓰레기는 저장·표시하지 않는다).
 * choice 가 4종 밖이거나 decidedAt 이 시각이 아니면 통째로 버린다; reasons 는 정리해서 남긴다.
 */
export function parseDecision(raw: unknown): NoteDecision | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  if (!isDecisionChoice(o.choice)) return null;
  if (typeof o.decidedAt !== "string" || !Number.isFinite(Date.parse(o.decidedAt))) return null;
  return { choice: o.choice, reasons: normalizeReasons(o.reasons), decidedAt: o.decidedAt };
}

/** 노트 metadata(전체)에서 판단을 꺼낸다 — 없거나 깨졌으면 null */
export function decisionFromMetadata(meta: unknown): NoteDecision | null {
  if (!meta || typeof meta !== "object") return null;
  return parseDecision((meta as Record<string, unknown>).decision);
}
