import { test } from "node:test";
import assert from "node:assert/strict";
import {
  BREAKER_STRIKES,
  BREAKER_WINDOW_MS,
  createTimeoutBreaker,
  recordSuccess,
  recordTimeout,
  shouldSkipRetry,
} from "../../lib/db/timeout-breaker.ts";

/* [973] 조회 시간 초과가 몰릴 때 재시도를 멈추는 차단기.
 *
 * 2026-09-07 사고에서 이 판단이 없어서, DB 가 밀리는 동안 요청 하나가 살아 있는
 * 질의를 둘씩 만들었다(상한이 질의를 취소하지 않은 것과 겹쳐서). 아래는 "언제
 * 끄고 언제 다시 켜는가" 를 못 박는다. 시계는 인자로 넣는다. */

test("평시에는 재시도를 막지 않는다", () => {
  const b = createTimeoutBreaker();
  assert.equal(shouldSkipRetry(b, 1_000), false);
  recordTimeout(b, 1_000);
  assert.equal(shouldSkipRetry(b, 1_100), false, "한 번 실패로 끄면 일시적 오류를 못 넘긴다");
});

test("창 안에서 연속 N회 시간 초과면 재시도를 끈다", () => {
  const b = createTimeoutBreaker();
  let t = 1_000;
  for (let i = 0; i < BREAKER_STRIKES; i++) {
    recordTimeout(b, t);
    t += 1_000;
  }
  assert.equal(b.strikes, BREAKER_STRIKES);
  assert.equal(shouldSkipRetry(b, t), true);
});

test("성공 한 번이면 즉시 원상복귀한다", () => {
  const b = createTimeoutBreaker();
  let t = 1_000;
  for (let i = 0; i < BREAKER_STRIKES; i++) {
    recordTimeout(b, t);
    t += 1_000;
  }
  assert.equal(shouldSkipRetry(b, t), true);
  recordSuccess(b);
  assert.equal(b.strikes, 0);
  assert.equal(shouldSkipRetry(b, t), false, "포화가 지나갔는데 계속 꺼 두면 안 된다");
});

test("창을 벗어나면 연속이 아니다 — 다시 1부터 센다", () => {
  const b = createTimeoutBreaker();
  recordTimeout(b, 1_000);
  recordTimeout(b, 2_000);
  assert.equal(b.strikes, 2);
  // 창을 훌쩍 넘긴 뒤의 실패는 새 연속의 시작
  recordTimeout(b, 2_000 + BREAKER_WINDOW_MS + 1);
  assert.equal(b.strikes, 1);
  assert.equal(shouldSkipRetry(b, 2_000 + BREAKER_WINDOW_MS + 1), false);
});

test("연속으로 채웠어도 창이 지나면 다시 재시도한다", () => {
  const b = createTimeoutBreaker();
  let t = 1_000;
  for (let i = 0; i < BREAKER_STRIKES; i++) {
    recordTimeout(b, t);
    t += 100;
  }
  assert.equal(shouldSkipRetry(b, t), true);
  assert.equal(
    shouldSkipRetry(b, b.lastAt + BREAKER_WINDOW_MS + 1),
    false,
    "차단이 영구가 되면 일시적 포화 뒤에도 한 번의 기회를 잃는다",
  );
});
