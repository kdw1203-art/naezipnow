/**
 * [1025 · 결정·비서] 결정 카드(/decide) 점수 — 순수(클라이언트·서버·테스트 공용).
 *
 * 후보(최대 3곳)마다 기준 4개(가격 · 전세가율 · 거래량 · 학교)의 값이 있으면 후보들 사이 상대 위치
 * (가장 앞선 값 1 · 가장 뒤진 값 0 — min-max 정규화)를 내고, 슬라이더 가중치(0~10)로 가중합을 낸다.
 *
 * 원칙(1008 · lib/compare/my-criteria 와 같다):
 *  - 값이 없는 후보는 그 기준에서 **뺀다**(0점 처리하지 않는다). 그 후보의 점수는 값이 있는 기준들만의
 *    가중 평균이고, `missing` 에 무엇을 뺐는지 남긴다 — 화면이 그대로 적는다.
 *  - 값이 있는 후보가 한 곳 이하(single) · 값이 모두 같음(same) · 가중치 0(off) · 자료 자체가 없음(unavailable —
 *    학교 POI 0행) 인 기준은 **모두에게서** 빼고 이유를 `dropped` 에 남긴다.
 *  - 점수는 후보들 사이의 상대 위치일 뿐 좋고 나쁨의 판정이 아니다. 지어내는 숫자는 없다 — 없으면 null.
 */

export type DecideAxis = "price" | "jeonse" | "volume" | "school";

export interface DecideAxisDef {
  key: DecideAxis;
  label: string;
  /** 어느 쪽이 앞서는가 */
  better: "low" | "high";
  /** 값의 출처(사실 한 줄) */
  hint: string;
}

export const DECIDE_AXES: readonly DecideAxisDef[] = [
  { key: "price", label: "가격", better: "low", hint: "최근 12개월 매매 중앙값 · 낮을수록" },
  { key: "jeonse", label: "전세가율", better: "high", hint: "6개월 전세 중앙 ÷ 매매 중앙 · 높을수록(갭이 작다)" },
  { key: "volume", label: "거래량", better: "high", hint: "최근 12개월 매매 건수 · 많을수록" },
  { key: "school", label: "학교", better: "low", hint: "가장 가까운 초·중·고 거리 · 가까울수록" },
];

export type DecideWeights = Record<DecideAxis, number>;

export const WEIGHT_MIN = 0;
export const WEIGHT_MAX = 10;
export const WEIGHT_DEFAULT = 5;

export const DEFAULT_DECIDE_WEIGHTS: DecideWeights = { price: 5, jeonse: 5, volume: 5, school: 5 };

/** 후보 최대 수 — 시안(mock1025/decide) 3열 */
export const DECIDE_MAX_CANDIDATES = 3;

/** 슬라이더 값 정리 — 0~10 정수, 아니면 기본 5 */
export function clampWeight(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return WEIGHT_DEFAULT;
  return Math.min(WEIGHT_MAX, Math.max(WEIGHT_MIN, Math.round(n)));
}

/** 저장값(JSON 문자열 또는 객체) → 가중치. 모르는 키·값은 기본값(예외를 던지지 않는다) */
export function parseDecideWeights(raw: unknown): DecideWeights {
  const out: DecideWeights = { ...DEFAULT_DECIDE_WEIGHTS };
  let o: unknown = raw;
  if (typeof raw === "string") {
    try {
      o = JSON.parse(raw);
    } catch {
      return out;
    }
  }
  if (!o || typeof o !== "object") return out;
  const rec = o as Record<string, unknown>;
  for (const a of DECIDE_AXES) {
    if (rec[a.key] !== undefined) out[a.key] = clampWeight(rec[a.key]);
  }
  return out;
}

/**
 * user_preferences 의 페르소나 우선순위(0~100 · school/transport/price/future) → 슬라이더 초기값(0~10).
 * 가격·학교만 대응되는 축이 있다. 전세가율·거래량은 대응 축이 없어 기본 5. 우선순위가 없으면 전부 기본.
 */
export function weightsFromPriorities(p: { price?: unknown; school?: unknown } | null | undefined): DecideWeights {
  const out: DecideWeights = { ...DEFAULT_DECIDE_WEIGHTS };
  if (!p || typeof p !== "object") return out;
  const to10 = (v: unknown): number | null => {
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) ? clampWeight(n / 10) : null;
  };
  const price = to10(p.price);
  const school = to10(p.school);
  if (price !== null) out.price = price;
  if (school !== null) out.school = school;
  return out;
}

/** 후보 한 곳의 기준 값 — 없으면 null. `schoolAvailable=false` 는 POI 자료 자체가 없다는 뜻(0행) */
export interface DecideCandidateMetrics {
  id: string;
  name: string;
  /** 최근 12개월 매매 중앙값(원) */
  priceKrw: number | null;
  /** 전세가율(%) */
  jeonsePct: number | null;
  /** 최근 12개월 매매 건수 */
  count12m: number | null;
  /** 가장 가까운 학교 거리(m) — POI 없음이면 null */
  schoolM: number | null;
}

export function axisValue(c: DecideCandidateMetrics, key: DecideAxis): number | null {
  const pos = (v: number | null) => (v !== null && Number.isFinite(v) && v > 0 ? v : null);
  switch (key) {
    case "price":
      return pos(c.priceKrw);
    case "jeonse":
      return pos(c.jeonsePct);
    case "volume":
      return c.count12m !== null && Number.isFinite(c.count12m) && c.count12m >= 0 ? c.count12m : null;
    case "school":
      return pos(c.schoolM);
  }
}

export type DropReason = "off" | "single" | "same" | "unavailable";

export interface DecideScored {
  id: string;
  name: string;
  /** 0~100 · 쓸 수 있는 기준이 하나도 없으면 null(순위 제외) */
  score: number | null;
  /** 공동 순위 허용. 점수 없으면 null */
  rank: number | null;
  /** 점수에 쓴 기준 중 이 후보에 값이 없어 뺀 것 */
  missing: DecideAxis[];
  /** 점수에 쓴 기준 중 이 후보가 가장 앞선 것 */
  leads: DecideAxis[];
  /** 기준별 정규화 값(0~1) — 값이 없으면 키 없음 */
  norm: Partial<Record<DecideAxis, number>>;
}

export interface DecideResult {
  ranked: DecideScored[];
  used: DecideAxis[];
  dropped: { key: DecideAxis; reason: DropReason }[];
}

/**
 * 가중합 순위. `opts.schoolAvailable=false` 면 학교 축은 가중치와 무관하게 unavailable 로 뺀다.
 */
export function scoreCandidates(
  items: readonly DecideCandidateMetrics[],
  weightsIn: DecideWeights,
  opts: { schoolAvailable?: boolean } = {},
): DecideResult {
  const weights = parseDecideWeights(weightsIn);
  const schoolAvailable = opts.schoolAvailable !== false;
  const norm = new Map<string, Partial<Record<DecideAxis, number>>>();
  const leads = new Map<string, DecideAxis[]>();
  for (const it of items) {
    norm.set(it.id, {});
    leads.set(it.id, []);
  }
  const used: DecideAxis[] = [];
  const dropped: DecideResult["dropped"] = [];
  for (const a of DECIDE_AXES) {
    if (a.key === "school" && !schoolAvailable) {
      dropped.push({ key: a.key, reason: "unavailable" });
      continue;
    }
    if (weights[a.key] <= 0) {
      dropped.push({ key: a.key, reason: "off" });
      continue;
    }
    const vals = items
      .map((it) => ({ id: it.id, v: axisValue(it, a.key) }))
      .filter((x): x is { id: string; v: number } => x.v !== null);
    if (vals.length < 2) {
      dropped.push({ key: a.key, reason: "single" });
      continue;
    }
    const lo = Math.min(...vals.map((x) => x.v));
    const hi = Math.max(...vals.map((x) => x.v));
    if (hi === lo) {
      dropped.push({ key: a.key, reason: "same" });
      continue;
    }
    used.push(a.key);
    const best = a.better === "low" ? lo : hi;
    for (const { id, v } of vals) {
      norm.get(id)![a.key] = a.better === "low" ? (hi - v) / (hi - lo) : (v - lo) / (hi - lo);
      if (v === best) leads.get(id)!.push(a.key);
    }
  }
  const scored = items.map((it): DecideScored => {
    const m = norm.get(it.id)!;
    let sum = 0;
    let wsum = 0;
    const missing: DecideAxis[] = [];
    for (const key of used) {
      const n = m[key];
      if (n === undefined) {
        missing.push(key);
        continue;
      }
      sum += n * weights[key];
      wsum += weights[key];
    }
    return {
      id: it.id,
      name: it.name,
      score: wsum > 0 ? Math.round((sum / wsum) * 1000) / 10 : null,
      rank: null,
      missing,
      leads: leads.get(it.id)!,
      norm: m,
    };
  });
  const ranked = scored
    .map((s, i) => ({ s, i }))
    .sort((a, b) => {
      if (a.s.score === null && b.s.score === null) return a.i - b.i;
      if (a.s.score === null) return 1;
      if (b.s.score === null) return -1;
      return b.s.score - a.s.score || a.i - b.i;
    })
    .map((x) => x.s);
  let prev: number | null = null;
  let rank = 0;
  ranked.forEach((s, i) => {
    if (s.score === null) return;
    if (prev === null || s.score !== prev) rank = i + 1;
    s.rank = rank;
    prev = s.score;
  });
  return { ranked, used, dropped };
}

export function axisLabel(key: DecideAxis): string {
  return DECIDE_AXES.find((a) => a.key === key)?.label ?? key;
}

/** 모두에게서 뺀 기준 한 줄(사실 문장) */
export function dropReasonText(reason: DropReason): string {
  switch (reason) {
    case "off":
      return "가중치 0";
    case "single":
      return "값이 한 곳뿐";
    case "same":
      return "값이 모두 같음";
    case "unavailable":
      return "자료 없음";
  }
}

/** "가격 5 · 전세가율 5 · 거래량 5" — 실제로 쓴 기준만 */
export function usedWeightsLine(result: DecideResult, weights: DecideWeights): string {
  return result.used.map((k) => `${axisLabel(k)} ${weights[k]}`).join(" · ");
}

/** 1순위 후보(공동 1위면 여럿). 점수 있는 후보가 2곳 미만이면 빈 배열 — 한 곳짜리 순위는 비교가 아니다 */
export function topCandidates(result: DecideResult): DecideScored[] {
  const withScore = result.ranked.filter((s) => s.score !== null);
  if (withScore.length < 2) return [];
  return result.ranked.filter((s) => s.rank === 1);
}

/* ── 결정 저장 ───────────────────────────────────────────────────────────── */

export const DECIDE_VERDICTS = ["buy", "hold", "pass", "revisit"] as const;
export type DecideVerdict = (typeof DECIDE_VERDICTS)[number];

export const VERDICT_LABEL: Record<DecideVerdict, string> = {
  buy: "살까",
  hold: "보류",
  pass: "패스",
  revisit: "다시 보기",
};

export function isDecideVerdict(v: unknown): v is DecideVerdict {
  return typeof v === "string" && (DECIDE_VERDICTS as readonly string[]).includes(v);
}

/** 문자열·라벨("살까") → verdict. 모르면 null */
export function parseVerdict(v: unknown): DecideVerdict | null {
  if (isDecideVerdict(v)) return v;
  if (typeof v !== "string") return null;
  const t = v.trim();
  for (const k of DECIDE_VERDICTS) if (VERDICT_LABEL[k] === t) return k;
  return null;
}

export const MEMO_MAX = 200;

export interface DecisionRecord {
  id: string;
  complexIds: string[];
  chosenId: string | null;
  /** 화면 표기용 — 저장 시점의 1순위 이름(서버 표에는 없고 게스트 저장에만) */
  chosenName?: string | null;
  verdict: DecideVerdict;
  memo: string | null;
  weights: DecideWeights;
  createdAt: string;
}

/** 저장 요청 본문 검증 — 실패 이유를 문자열로. 성공이면 정리된 값 */
export function parseDecisionInput(body: unknown):
  | { ok: true; value: { complexIds: string[]; chosenId: string | null; verdict: DecideVerdict; memo: string | null; weights: DecideWeights } }
  | { ok: false; error: string } {
  if (!body || typeof body !== "object") return { ok: false, error: "JSON이 필요합니다." };
  const o = body as Record<string, unknown>;
  const ids = Array.isArray(o.complexIds)
    ? o.complexIds.filter((x): x is string => typeof x === "string" && x.trim().length > 0 && x.length <= 200).map((x) => x.trim())
    : [];
  const uniq = [...new Set(ids)].slice(0, DECIDE_MAX_CANDIDATES);
  if (uniq.length === 0) return { ok: false, error: "후보가 필요합니다." };
  const verdict = parseVerdict(o.verdict);
  if (!verdict) return { ok: false, error: "verdict 는 buy·hold·pass·revisit 중 하나입니다." };
  const chosenRaw = typeof o.chosenId === "string" ? o.chosenId.trim() : "";
  const chosenId = chosenRaw && uniq.includes(chosenRaw) ? chosenRaw : null;
  const memoRaw = typeof o.memo === "string" ? o.memo.trim() : "";
  const memo = memoRaw ? memoRaw.slice(0, MEMO_MAX) : null;
  return { ok: true, value: { complexIds: uniq, chosenId, verdict, memo, weights: parseDecideWeights(o.weights) } };
}

/** 저장된 행(서버 JSON · 게스트 localStorage) → DecisionRecord. 모양이 틀리면 null */
export function parseDecisionRecord(raw: unknown): DecisionRecord | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const verdict = parseVerdict(o.verdict);
  if (!verdict || typeof o.id !== "string") return null;
  const complexIds = Array.isArray(o.complexIds) ? o.complexIds.filter((x): x is string => typeof x === "string") : [];
  const createdAt = typeof o.createdAt === "string" ? o.createdAt : "";
  if (!createdAt) return null;
  return {
    id: o.id,
    complexIds,
    chosenId: typeof o.chosenId === "string" ? o.chosenId : null,
    chosenName: typeof o.chosenName === "string" ? o.chosenName : null,
    verdict,
    memo: typeof o.memo === "string" && o.memo ? o.memo : null,
    weights: parseDecideWeights(o.weights),
    createdAt,
  };
}

/** 게스트 결정 목록 localStorage 키 · 상한 */
export const GUEST_DECISIONS_KEY = "nz:decisions:v1";
export const GUEST_DECISIONS_MAX = 30;

/** 목록 JSON 문자열 → 기록(최신순, 상한) — 못 읽으면 빈 배열 */
export function parseDecisionList(raw: string | null | undefined): DecisionRecord[] {
  if (!raw) return [];
  try {
    const arr: unknown = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr
      .map(parseDecisionRecord)
      .filter((x): x is DecisionRecord => x !== null)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, GUEST_DECISIONS_MAX);
  } catch {
    return [];
  }
}
