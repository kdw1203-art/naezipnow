/**
 * Supabase 읽기 상한 — **한 곳에서만** 정한다.
 *
 * ── 지켜야 하는 부등식 ─────────────────────────────────────────────────────
 *     한 페이지의 직렬 조회 수 × 총 예산  ≤  그 실행 환경의 상한
 *
 * 빌드(prerender)  : next.config staticPageGenerationTimeout = 120초
 * 런타임(서버리스) : Vercel 함수 상한 = 120초
 *
 * 이 부등식이 깨지면 DB 지연이 "조회 실패" 화면이 아니라 **함수 통째 타임아웃**
 * 으로 번진다. 사용자는 빈 화면을 120초 본다.
 *
 * ── 실제로 두 번 깨졌다 ────────────────────────────────────────────────────
 * 2026-07-27 (빌드): 시도별 25s × 3 + 백오프 1.2s = 76.2s > 페이지 예산 60s →
 *   네 페이지가 `next build` 를 죽였다. 그래서 총 예산 개념이 생겼다.
 * 2026-09-08 (런타임): 총 예산이 45s 라 **직렬 두 건**이 한계였는데,
 *   lib/newui/board-posts 의 3단 재시도가 45×3 = 135s > 120s 였다.
 *   실측: `Vercel Runtime Timeout Error: Task timed out after 120 seconds`
 *   295건 · 79명, 경로 대부분이 /town/*.
 *
 * ── 왜 런타임 20초인가 (2026-09-08 실측) ───────────────────────────────────
 * PostgREST 는 authenticator 세션의 statement_timeout=8s 로 이미 잘린다
 * (pg_stat_statements 상 어떤 질의도 max 7,9xx ms 를 못 넘긴다). 8초를 넘겨
 * 기다리는 시간은 질의 시간이 아니라 **연결 풀 대기**다. 풀이 20초 넘게 안 비면
 * 그 요청은 이미 죽은 요청이고, 계속 붙들고 있으면 풀이 더 마른다.
 * 20초면 직렬 6건까지 부등식이 성립한다.
 */

/** 실행 환경의 상한(ms) — 빌드 페이지 예산과 서버리스 함수 상한이 둘 다 120초다. */
export const HOST_LIMIT_MS = 120_000;

/** 이 예산으로 안전하게 이어 붙일 수 있는 직렬 조회 수. */
export function maxSerialReads(totalBudgetMs: number): number {
  if (!Number.isFinite(totalBudgetMs) || totalBudgetMs <= 0) return 0;
  return Math.floor(HOST_LIMIT_MS / totalBudgetMs);
}

/** 직렬 n건이 환경 상한 안에 들어가는가. */
export function fitsHostLimit(totalBudgetMs: number, serialReads: number): boolean {
  return totalBudgetMs > 0 && totalBudgetMs * serialReads <= HOST_LIMIT_MS;
}

/**
 * 환경변수 우선, 없으면 기본값. 어느 쪽이든 **한 시도는 온전히 돌 수 있게**
 * 시도별 상한 + 1초를 하한으로 둔다.
 */
export function resolveTotalBudgetMs(
  envRaw: string | undefined,
  perAttemptMs: number,
  fallbackMs: number,
): number {
  const raw = Number(envRaw);
  const base =
    Number.isFinite(raw) && raw >= 1_000 && raw <= HOST_LIMIT_MS ? raw : fallbackMs;
  return Math.max(base, perAttemptMs + 1_000);
}

/** 읽기 총 예산 기본값(ms) — 빌드·런타임 모두 20초. */
export const DEFAULT_TOTAL_BUDGET_MS = 20_000;
/** 읽기 한 시도 기본 상한(ms). DB 가 8초에 자르므로 여유 2초. */
export const DEFAULT_ATTEMPT_MS = 10_000;
/** 빌드 prerender 는 더 짧게 — 실패가 페이지 예산 안에서 화면에 드러나야 한다. */
export const BUILD_ATTEMPT_MS = 8_000;
