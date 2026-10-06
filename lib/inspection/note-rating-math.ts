/* [1043 · 임장노트 참여] 독자 평가(별점 1~5) 셈 — 순수 함수(유닛 테스트: tests/unit/notes-1043.test.ts).
 * 저장소(lib/inspection/note-ratings.ts)와 화면(app/notes/[id]/NoteRating.tsx)이 같은 셈을 쓴다. */

export const RATING_MIN = 1;
export const RATING_MAX = 5;

export type RatingSummary = {
  /** 평가한 사람 수 */
  count: number;
  /** 평균(소수 첫째 자리). 0명이면 null — 0점과 "평가 없음"을 가른다 */
  average: number | null;
};

/** 화면에서 온 값 → 저장할 별점. 정수 1~5 가 아니면 null(반올림해 주지 않는다 — 누른 값과 다른 값이 저장되면 안 된다) */
export function parseStars(raw: unknown): number | null {
  const n = typeof raw === "number" ? raw : typeof raw === "string" && raw.trim() !== "" ? Number(raw) : NaN;
  if (!Number.isInteger(n) || n < RATING_MIN || n > RATING_MAX) return null;
  return n;
}

export function summarizeStars(stars: readonly number[]): RatingSummary {
  const valid = stars.filter((s) => Number.isInteger(s) && s >= RATING_MIN && s <= RATING_MAX);
  if (valid.length === 0) return { count: 0, average: null };
  const sum = valid.reduce((a, b) => a + b, 0);
  return { count: valid.length, average: Math.round((sum / valid.length) * 10) / 10 };
}

/** 내 평가를 바꿨을 때의 새 요약 — 서버 응답을 기다리는 동안 화면이 먼저 그린다(서버 값이 오면 그 값으로 덮는다) */
export function applyMyRating(prev: RatingSummary, prevMine: number | null, nextMine: number): RatingSummary {
  const total = (prev.average ?? 0) * prev.count;
  const count = prevMine ? prev.count : prev.count + 1;
  const sum = total - (prevMine ?? 0) + nextMine;
  return { count, average: count > 0 ? Math.round((sum / count) * 10) / 10 : null };
}

/** 평균 → 채워진 별 수(반올림 · 0~5). 반 별은 그리지 않는다 — 숫자가 옆에 있다 */
export function filledStars(average: number | null): number {
  if (average == null || !Number.isFinite(average)) return 0;
  return Math.max(0, Math.min(RATING_MAX, Math.round(average)));
}

/**
 * 평균만큼 채운 별의 너비(px) — 별 너비 size, 별 사이 gap. 4.5 → 꽉 찬 별 넷 + 반 개.
 * 평균이 없으면 0, 5 를 넘으면 다섯 개 너비에서 멈춘다.
 */
export function filledWidthPx(average: number | null, size: number, gap: number): number {
  if (average == null || !Number.isFinite(average) || average <= 0) return 0;
  const a = Math.min(RATING_MAX, average);
  const full = Math.floor(a);
  const frac = a - full;
  return Math.round((full * (size + gap) + frac * size) * 10) / 10;
}

/** 목록·머리의 한 줄 — "독자 평가 4.3 · 12명". 0명이면 null(그리지 않는다) */
export function ratingFact(s: RatingSummary | null | undefined): string | null {
  if (!s || s.count <= 0 || s.average == null) return null;
  return `독자 평가 ${s.average.toFixed(1)} · ${s.count.toLocaleString("ko-KR")}명`;
}
