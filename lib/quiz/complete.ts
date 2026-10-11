/**
 * [1056 · A7] 실거래가 게임 완주 적립 — 요청 본문 검증(순수).
 *
 * 게임 자체는 기기(localStorage)에만 기록되고 서버는 점수를 믿지 않는다 — 적립은 "오늘 한 판 완주"
 * 참여 1회(quiz_daily 10P, refId=KST 날짜 멱등)이지 점수 보상이 아니다. 그래도 본문은 정수·범위를
 * 확인해 아무 값이나 받지 않는다(0 ≤ score ≤ total ≤ 20 · 하루 판은 최대 20문제).
 */

export const QUIZ_COMPLETE_MAX_TOTAL = 20;

export interface QuizCompleteBody {
  score: number;
  total: number;
}

export function parseQuizCompleteBody(body: unknown): QuizCompleteBody | null {
  if (!body || typeof body !== "object") return null;
  const { score, total } = body as { score?: unknown; total?: unknown };
  if (!Number.isInteger(score) || !Number.isInteger(total)) return null;
  const s = score as number;
  const t = total as number;
  if (t < 1 || t > QUIZ_COMPLETE_MAX_TOTAL) return null;
  if (s < 0 || s > t) return null;
  return { score: s, total: t };
}
