/* [1023 · 임장노트] 이달의 노트 카드 — 점수 축 3개(작은 막대) 재료.
 *
 * 규칙(docs/review-1022.md 1장 ①): 각 노트 카드는 총점만 커서 왜 뽑혔는지 카드에서 안 보였다.
 * `month.picks[].breakdown`(5축 · 배점 표에 이미 쓰는 값) 중 배점 대비 얻은 비율이 높은 순으로
 * 3축을 고른다(같으면 배점 표 순서). 막대 폭은 points/max — 새 계산은 없다. 순수 모듈. */

export type AxisLike = { key: string; label: string; points: number; max: number };

export type TopAxis<T extends AxisLike> = T & { ratio: number; pct: number };

export function topBreakdownAxes<T extends AxisLike>(breakdown: ReadonlyArray<T>, count = 3): TopAxis<T>[] {
  return breakdown
    .map((b, order) => {
      const ratio = b.max > 0 ? Math.max(0, Math.min(1, b.points / b.max)) : 0;
      return { b, order, ratio };
    })
    .sort((a, c) => c.ratio - a.ratio || a.order - c.order)
    .slice(0, Math.max(0, count))
    .map(({ b, ratio }) => ({ ...b, ratio, pct: Math.round(ratio * 100) }));
}
