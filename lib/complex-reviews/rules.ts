/**
 * [1058 · C3] 거주민 후기 — 순수 규칙(서버·클라이언트 공용 · 단위 시험 대상).
 *
 * 목록 쪽수(offset) 해석과 "수정됨" 판정을 한 곳에. DB·Date.now() 를 모른다.
 */

/** 한 번에 내려보내는 후기 수 — 예전 listReviews 는 상한이 없어 PostgREST 1,000행 상한에 조용히 잘렸다 */
export const REVIEW_PAGE_SIZE = 50;
/** offset 상한 — 더 보기를 수백 번 눌러도 질의가 터무니없이 커지지 않게 */
export const REVIEW_MAX_OFFSET = 10_000;

/** `?offset=` 해석 — 0 이상 정수만, 아니면 0. 상한을 넘으면 상한 */
export function parseReviewOffset(raw: string | null | undefined): number {
  const s = String(raw ?? "").trim();
  if (!/^\d{1,6}$/.test(s)) return 0;
  const n = Number(s);
  if (!Number.isSafeInteger(n) || n < 0) return 0;
  return Math.min(n, REVIEW_MAX_OFFSET);
}

/** 다음 쪽 offset — 이번 쪽이 꽉 찼으면 다음 시작점, 아니면 null(더 없음) */
export function nextReviewOffset(offset: number, got: number, pageSize: number = REVIEW_PAGE_SIZE): number | null {
  if (got < pageSize) return null;
  const next = offset + got;
  return next > REVIEW_MAX_OFFSET ? null : next;
}

/** 재작성(upsert)의 수정 시각 — 처음 저장 때도 updated_at 이 적히므로(JS now 와 DB default now 가 ms 단위로 다르다)
 *  created_at 보다 1분 넘게 뒤일 때만 "수정"으로 본다. 파싱 실패·없음은 null */
export const REVIEW_EDIT_MIN_GAP_MS = 60_000;
export function reviewEditedAt(createdAt: string, updatedAt: string | null | undefined): string | null {
  if (!updatedAt) return null;
  const c = Date.parse(createdAt);
  const u = Date.parse(updatedAt);
  if (!Number.isFinite(c) || !Number.isFinite(u)) return null;
  return u - c > REVIEW_EDIT_MIN_GAP_MS ? updatedAt : null;
}
