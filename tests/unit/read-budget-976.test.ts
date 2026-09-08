import { test } from "node:test";
import assert from "node:assert/strict";
import {
  BUILD_ATTEMPT_MS,
  DEFAULT_ATTEMPT_MS,
  DEFAULT_TOTAL_BUDGET_MS,
  HOST_LIMIT_MS,
  fitsHostLimit,
  maxSerialReads,
  resolveTotalBudgetMs,
} from "../../lib/supabase/read-budget.ts";

/* [976] "직렬 조회 수 × 총 예산 ≤ 환경 상한" — 이 부등식이 두 번 깨졌다.
 *
 * 2026-07-27(빌드): 76.2s > 페이지 예산 60s → next build 실패.
 * 2026-09-08(런타임): board-posts 3단 재시도 45×3=135s > 함수 상한 120s →
 *   `Vercel Runtime Timeout Error: Task timed out after 120 seconds` 295건·79명.
 *
 * 사람이 주석으로만 지키던 규칙이라 두 번 다 놓쳤다. 숫자로 잠근다. */

test("기본 예산으로 직렬 6건까지 환경 상한 안", () => {
  assert.equal(maxSerialReads(DEFAULT_TOTAL_BUDGET_MS), 6);
  assert.equal(fitsHostLimit(DEFAULT_TOTAL_BUDGET_MS, 6), true);
  assert.equal(fitsHostLimit(DEFAULT_TOTAL_BUDGET_MS, 7), false);
});

test("예전 45초 예산은 직렬 두 건이 한계였다 — 3단 재시도가 상한을 넘었다", () => {
  assert.equal(maxSerialReads(45_000), 2);
  assert.equal(fitsHostLimit(45_000, 3), false); // 135s > 120s (실제 사고)
});

test("한 시도는 언제나 온전히 돌 수 있다 — 총 예산 하한 = 시도 + 1초", () => {
  // 환경변수가 시도별 상한보다 작아도 첫 시도가 잘리지 않는다
  assert.equal(resolveTotalBudgetMs("3000", 25_000, DEFAULT_TOTAL_BUDGET_MS), 26_000);
  // 범위 밖 값은 무시하고 기본값
  assert.equal(resolveTotalBudgetMs("0", DEFAULT_ATTEMPT_MS, DEFAULT_TOTAL_BUDGET_MS), 20_000);
  assert.equal(resolveTotalBudgetMs("999999", DEFAULT_ATTEMPT_MS, DEFAULT_TOTAL_BUDGET_MS), 20_000);
  assert.equal(resolveTotalBudgetMs(undefined, DEFAULT_ATTEMPT_MS, DEFAULT_TOTAL_BUDGET_MS), 20_000);
  // 유효한 값은 그대로
  assert.equal(resolveTotalBudgetMs("30000", DEFAULT_ATTEMPT_MS, DEFAULT_TOTAL_BUDGET_MS), 30_000);
});

test("시도별 상한은 DB statement_timeout(8s)보다 크고 총 예산보다 작다", () => {
  assert.ok(DEFAULT_ATTEMPT_MS > 8_000, "DB 가 8초에 자르므로 그보다는 커야 한다");
  assert.ok(BUILD_ATTEMPT_MS <= DEFAULT_ATTEMPT_MS);
  assert.ok(DEFAULT_ATTEMPT_MS < DEFAULT_TOTAL_BUDGET_MS, "재시도 여지가 남아야 한다");
});

test("환경 상한은 빌드 페이지 예산·서버리스 함수 상한과 같은 120초", () => {
  assert.equal(HOST_LIMIT_MS, 120_000);
});
