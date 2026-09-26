/**
 * [1008 · Q] 후보 비교 "내 기준" 점수 — 순수(클라이언트 안전).
 *
 * 왜: /analysis/compare 는 표·레이더로 "무엇이 다른가"는 보여 주지만 "그래서 나에게는 어디가
 * 먼저인가"를 말하지 않았다. 결정 순간의 도구 — 사람마다 중요하게 보는 게 달라서, 기준마다
 * 중요도(중요 ×2 · 보통 ×1 · 안 봄 ×0)를 고르면 가중 평균으로 줄을 세운다.
 *
 * 원칙:
 *  - **표에 실제로 있는 값만** 기준으로 쓴다(평균가·평당가·12개월 거래 수·최근 거래 연월 —
 *    /api/analysis/complex-compare 응답 그대로). 없는 지표를 지어내지 않는다.
 *  - 값이 없는 칸은 그 기준에서 **뺀다**(0점 처리하지 않는다) — 그 단지의 점수는 값이 있는
 *    기준들만의 가중 평균이고, 화면은 무엇을 뺐는지 적는다.
 *  - 값이 있는 후보가 한 곳뿐이거나 값이 모두 같은 기준은 **모두에게서** 뺀다(DropReason).
 *  - 점수는 담긴 후보들 사이의 **상대** 위치(가장 좋은 값 = 1, 가장 나쁜 값 = 0)다. 좋고 나쁨의
 *    판정이 아니다 — 표의 "최저·최다" 배지와 같은 성격.
 */

export type CriterionKey = "pyeong" | "avg" | "volume" | "recent";
export type Weight = 0 | 1 | 2;
export type Weights = Record<CriterionKey, Weight>;

export interface CriterionDef {
  key: CriterionKey;
  /** 화면·한 줄 요약에 쓰는 이름 */
  label: string;
  /** 어느 쪽이 앞서는가 */
  better: "low" | "high";
  /** 기준 설명(표의 어느 칸인지) */
  hint: string;
}

export const CRITERIA: readonly CriterionDef[] = [
  { key: "pyeong", label: "평당가", better: "low", hint: "최근 6개월 평당가가 낮을수록" },
  { key: "avg", label: "평균가", better: "low", hint: "최근 6개월 평균가가 낮을수록" },
  { key: "volume", label: "거래량", better: "high", hint: "최근 12개월 거래가 많을수록" },
  { key: "recent", label: "최근 거래", better: "high", hint: "마지막 거래가 최근일수록" },
];

export const WEIGHT_LABEL: Record<Weight, string> = { 2: "중요", 1: "보통", 0: "안 봄" };

export const DEFAULT_WEIGHTS: Weights = { pyeong: 1, avg: 1, volume: 1, recent: 1 };

export const COMPARE_WEIGHTS_KEY = "nz:compare-weights:v1";

/** 비교표 한 행에서 기준에 쓰는 값만 */
export interface CriteriaInput {
  id: string;
  name: string;
  hasData: boolean;
  avg6mKrw: number | null;
  avgPyeong6mKrw: number | null;
  count12m: number;
  /** 최근 거래 계약 연월 YYYYMM */
  latestYm: string | null;
  /** 조회에 실패한 후보(hasData=false 와 함께 온다) — "거래 없음"과 다른 문장으로 순위에서 뺀다 */
  failed?: boolean;
}

function ymIndex(ym: string | null): number | null {
  if (!ym || !/^\d{6}$/.test(ym)) return null;
  return Number(ym.slice(0, 4)) * 12 + Number(ym.slice(4, 6)) - 1;
}

/** 기준 값 — 없으면 null(그 기준에서 뺀다). 실거래가 없는 단지는 모든 기준이 null */
export function criterionValue(item: CriteriaInput, key: CriterionKey): number | null {
  if (!item.hasData) return null;
  const pos = (v: number | null) => (v !== null && Number.isFinite(v) && v > 0 ? v : null);
  switch (key) {
    case "pyeong":
      return pos(item.avgPyeong6mKrw);
    case "avg":
      return pos(item.avg6mKrw);
    case "volume":
      return Number.isFinite(item.count12m) && item.count12m >= 0 ? item.count12m : null;
    case "recent":
      return ymIndex(item.latestYm);
  }
}

export interface ScoredItem {
  id: string;
  name: string;
  /** 0~100(쓴 기준 중 값이 있는 것들의 가중 평균). 쓸 수 있는 기준이 하나도 없으면 null — 순위 제외 */
  score: number | null;
  /** 공동 순위 허용(같은 점수 = 같은 순위). 점수 없으면 null */
  rank: number | null;
  /** 점수에 쓴 기준 중 이 단지에 값이 없어 뺀 것 */
  missing: CriterionKey[];
  /** 점수에 쓴 기준 중 이 단지가 가장 앞선 것 */
  leads: CriterionKey[];
}

/**
 * 켜 놓았지만 **모두에게서** 뺀 기준과 그 이유.
 *  - single: 값이 있는 후보가 한 곳 이하 — 비교할 상대가 없다. 예전엔 그 한 곳에 만점을 줘서,
 *            6개월 거래가 없어 평당가가 빈 후보 옆의 다른 후보가 평당가 "중요" 한 번에 앞서 나갔다
 *            (리뷰 C 재현: B 80 · A 50, 요약 "1위 B — 최근 거래에서 앞섬").
 *  - same:   값이 모두 같다 — 이 기준으로는 아무도 갈리지 않는다. 남겨 두면 값이 있는 후보만
 *            만점을 받아, 값이 빈 후보와의 평균이 괜히 벌어진다.
 */
export type DropReason = "single" | "same";

export interface CriteriaResult {
  /** 점수 높은 순, 점수 없는 단지는 맨 뒤(입력 순서 유지) */
  ranked: ScoredItem[];
  /** 실제로 점수에 쓴 기준 */
  used: CriterionKey[];
  dropped: { key: CriterionKey; reason: DropReason }[];
}

/** 가중 평균 순위 — 기준마다 후보들 사이 상대 위치(가장 앞선 값 1 · 가장 뒤진 값 0)를 중요도로 평균 */
export function scoreByCriteria(items: readonly CriteriaInput[], weights: Weights): CriteriaResult {
  const active = CRITERIA.filter((c) => weights[c.key] > 0);
  const norm = new Map<string, Map<CriterionKey, number>>();
  const leads = new Map<string, CriterionKey[]>();
  for (const it of items) {
    norm.set(it.id, new Map());
    leads.set(it.id, []);
  }
  const used: CriterionKey[] = [];
  const dropped: CriteriaResult["dropped"] = [];
  for (const c of active) {
    const vals = items
      .map((it) => ({ id: it.id, v: criterionValue(it, c.key) }))
      .filter((x): x is { id: string; v: number } => x.v !== null);
    if (vals.length < 2) {
      dropped.push({ key: c.key, reason: "single" });
      continue;
    }
    const lo = Math.min(...vals.map((x) => x.v));
    const hi = Math.max(...vals.map((x) => x.v));
    if (hi === lo) {
      dropped.push({ key: c.key, reason: "same" });
      continue;
    }
    used.push(c.key);
    const best = c.better === "low" ? lo : hi;
    for (const { id, v } of vals) {
      norm.get(id)!.set(c.key, c.better === "low" ? (hi - v) / (hi - lo) : (v - lo) / (hi - lo));
      if (v === best) leads.get(id)!.push(c.key);
    }
  }
  const scored = items.map((it): ScoredItem => {
    const m = norm.get(it.id)!;
    let sum = 0;
    let wsum = 0;
    const missing: CriterionKey[] = [];
    for (const key of used) {
      const n = m.get(key);
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

export function labelOf(key: CriterionKey): string {
  return CRITERIA.find((c) => c.key === key)?.label ?? key;
}

/** 모두에게서 뺀 기준 한 줄 설명 */
export function dropReasonText(reason: DropReason): string {
  return reason === "single" ? "비교할 값이 한 곳뿐이라 뺐어요" : "후보들 값이 모두 같아 뺐어요";
}

/** "1위 ○○ — 내가 중요하게 본 평당가·거래량에서 앞섬" — 순위를 낼 수 없으면 null */
export function winnerLine(result: CriteriaResult, weights: Weights): string | null {
  const { ranked } = result;
  const firsts = ranked.filter((s) => s.rank === 1);
  if (firsts.length === 0 || ranked.filter((s) => s.score !== null).length < 2) return null;
  if (firsts.length > 1) {
    /* "차이가 없다"가 아니다 — 기준마다 앞서는 곳이 달라도 가중 평균이 같을 수 있다 */
    return `공동 1위 ${firsts.map((s) => s.name).join(" · ")} — 고른 중요도로 낸 점수(가중 평균)가 같아요`;
  }
  const w = firsts[0];
  const important = w.leads.filter((k) => weights[k] === 2);
  if (important.length > 0) return `1위 ${w.name} — 내가 중요하게 본 ${important.map(labelOf).join("·")}에서 앞섬`;
  if (w.leads.length > 0) return `1위 ${w.name} — ${w.leads.map(labelOf).join("·")}에서 앞섬`;
  return `1위 ${w.name} — 한 기준에서 1등은 아니지만 고른 중요도로 낸 점수(가중 평균)가 가장 높아요`;
}

/** 저장값 → 가중치. 모르는 키·값은 기본값(예외를 던지지 않는다) */
export function parseWeights(raw: string | null | undefined): Weights {
  const out: Weights = { ...DEFAULT_WEIGHTS };
  if (!raw) return out;
  try {
    const o = JSON.parse(raw) as Record<string, unknown>;
    for (const c of CRITERIA) {
      const v = o[c.key];
      if (v === 0 || v === 1 || v === 2) out[c.key] = v;
    }
  } catch {
    /* 깨진 저장값 — 기본값 */
  }
  return out;
}
