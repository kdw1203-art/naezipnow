/**
 * [1025c · 결정·비서] 기준별 순위 막대(/decide "세 후보 한눈에" 오른쪽) — 순수.
 *
 * 축마다 후보를 앞선 순서로 줄 세우고 막대 길이를 값에 비례시킨다(점수가 아니라 값의 비율 — 시안 "최저가 ÷ 가격"):
 *   · 높을수록 앞(전세가율·거래량): 값 ÷ 최대값
 *   · 낮을수록 앞(가격·학교)      : 최소값 ÷ 값
 * 값이 없는 후보는 순위 없이(—) 맨 뒤, 막대 없음. 같은 값은 같은 자리(공동 순위).
 */
import { DECIDE_AXES, axisValue, type DecideAxis, type DecideCandidateMetrics } from "./score";

export interface RankBarRow {
  id: string;
  name: string;
  /** 후보 순서(색 고르기용) */
  index: number;
  value: number | null;
  /** 1부터 · 값 없으면 null */
  rank: number | null;
  /** 막대 길이 0~1 · 값 없으면 0 */
  ratio: number;
}

export interface RankBarGroup {
  key: DecideAxis;
  label: string;
  /** "낮을수록 앞" · "높을수록 앞" */
  note: string;
  rows: RankBarRow[];
}

/** 한 축의 막대 비율 — 값 목록과 방향으로 */
export function rankBarRatio(value: number | null, values: readonly (number | null)[], better: "low" | "high"): number {
  if (value === null || !Number.isFinite(value) || value <= 0) return 0;
  const have = values.filter((v): v is number => v !== null && Number.isFinite(v) && v > 0);
  if (have.length === 0) return 0;
  const r = better === "high" ? value / Math.max(...have) : Math.min(...have) / value;
  return Math.min(1, Math.max(0, Math.round(r * 1000) / 1000));
}

/** 축마다 순위 행 — `keys` 순서로(보통 레이더 축과 같다) */
export function rankBarGroups(items: readonly DecideCandidateMetrics[], keys: readonly DecideAxis[]): RankBarGroup[] {
  return keys.flatMap((key) => {
    const def = DECIDE_AXES.find((a) => a.key === key);
    if (!def) return [];
    const values = items.map((it) => axisValue(it, key));
    const rows: RankBarRow[] = items.map((it, index) => ({
      id: it.id,
      name: it.name,
      index,
      value: values[index],
      rank: null,
      ratio: rankBarRatio(values[index], values, def.better),
    }));
    const sorted = [...rows].sort((a, b) => {
      if (a.value === null && b.value === null) return a.index - b.index;
      if (a.value === null) return 1;
      if (b.value === null) return -1;
      const d = def.better === "low" ? a.value - b.value : b.value - a.value;
      return d || a.index - b.index;
    });
    let prev: number | null = null;
    let rank = 0;
    sorted.forEach((r, i) => {
      if (r.value === null) return;
      if (prev === null || r.value !== prev) rank = i + 1;
      r.rank = rank;
      prev = r.value;
    });
    return [{ key, label: def.label, note: def.better === "low" ? "낮을수록 앞" : "높을수록 앞", rows: sorted }];
  });
}

/** 한 후보가 축에서 몇 위인지(값 없으면 null) — 결론 줄 "가격 1위 · 전세가율 2위" */
export function axisRankOf(groups: readonly RankBarGroup[], id: string): { key: DecideAxis; label: string; rank: number | null }[] {
  return groups.map((g) => ({ key: g.key, label: g.label, rank: g.rows.find((r) => r.id === id)?.rank ?? null }));
}
