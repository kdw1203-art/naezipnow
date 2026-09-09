import test from "node:test";
import assert from "node:assert/strict";
import { orderSigunguByStaleness } from "../../lib/national-data/sigungu-rotation.ts";

/* 982 — 대장 수집이 어느 시군구를 훑을지 고르는 규칙.
   예전 규칙(시계)이 절반을 영구히 건너뛰던 것을 여기서 재현해 두고,
   새 규칙이 그 구멍을 메우는지 고정한다. */

/** 예전 규칙 그대로 — floor(now/12h) % ceil(total/12) */
function clockSlice(nowMs: number, total: number, slice: number): number {
  return Math.floor(nowMs / (1000 * 60 * 60 * 12)) % Math.ceil(total / slice);
}

test("예전 시계 규칙은 하루 한 번 돌면 슬라이스의 절반을 영원히 건너뛴다", () => {
  const TOTAL = 264;
  const SLICE = 12;
  const slices = Math.ceil(TOTAL / SLICE); // 22
  const visited = new Set<number>();
  /* 하루 한 번, 같은 시각(UTC 10시)에 1년 동안 실행 */
  for (let day = 0; day < 365; day++) {
    visited.add(clockSlice(((day * 24 + 10) * 3600) * 1000, TOTAL, SLICE));
  }
  assert.equal(slices, 22);
  assert.equal(visited.size, 11, "절반만 방문해야 재현이 맞다");
  /* 홀수 슬라이스 = 약 132개 시군구가 1년을 돌려도 한 번도 안 잡힌다 */
  assert.deepEqual([...visited].sort((a, b) => a - b), [0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20]);
});

test("새 규칙: 대장에 한 행도 없는 시군구가 맨 앞으로 온다", () => {
  const all = ["11110", "41110", "46110", "28110"];
  const seen = new Map([
    ["11110", Date.parse("2026-09-09")],
    ["41110", Date.parse("2026-08-20")],
    ["28110", Date.parse("2026-08-06")],
    // 46110(전남)은 대장에 없다 — 실제로 그랬다
  ]);
  assert.deepEqual(orderSigunguByStaleness(all, seen), ["46110", "28110", "41110", "11110"]);
});

test("그다음은 오래된 순 — 실측 순서를 그대로 고정한다", () => {
  /* 2026-09-09 실측: 대전 44일 · 광주 43일 · 인천 34일 · 경기 20일 · 서울 0일 */
  const seen = new Map([
    ["30110", Date.parse("2026-07-27")],
    ["29110", Date.parse("2026-07-28")],
    ["28110", Date.parse("2026-08-06")],
    ["41110", Date.parse("2026-08-20")],
    ["11110", Date.parse("2026-09-09")],
  ]);
  assert.deepEqual(orderSigunguByStaleness([...seen.keys()], seen), [
    "30110",
    "29110",
    "28110",
    "41110",
    "11110",
  ]);
});

test("모든 시군구가 결국 잡힌다 — 굶는 코드가 없다(한 바퀴 시뮬레이션)", () => {
  const all = Array.from({ length: 264 }, (_, i) => String(10000 + i));
  const seen = new Map<string, number>();
  let clock = Date.parse("2026-01-01");
  const covered = new Set<string>();
  /* 하루 3회 × 12곳 → 22회 실행이면 한 바퀴 */
  for (let run = 0; run < 22; run++) {
    const batch = orderSigunguByStaleness(all, seen).slice(0, 12);
    for (const cd of batch) {
      seen.set(cd, clock);
      covered.add(cd);
    }
    clock += 8 * 3600 * 1000;
  }
  assert.equal(covered.size, 264, `한 바퀴에 ${covered.size}곳만 돌았다`);
});

test("한 번 돈 뒤에도 가장 오래된 것부터 다시 돈다 — 같은 곳만 반복하지 않는다", () => {
  const all = ["A", "B", "C", "D"];
  const seen = new Map<string, number>();
  const order: string[] = [];
  let clock = 1_000_000;
  for (let run = 0; run < 4; run++) {
    const batch = orderSigunguByStaleness(all, seen).slice(0, 2);
    order.push(...batch);
    for (const cd of batch) seen.set(cd, clock);
    clock += 1000;
  }
  /* 처음 두 바퀴에 네 곳이 모두 나오고, 그다음은 가장 오래된 것부터 */
  assert.deepEqual(order, ["A", "B", "C", "D", "A", "B", "C", "D"]);
});

test("동점이면 코드 오름차순 — 순서가 흔들리지 않는다", () => {
  const t = Date.parse("2026-09-01");
  const seen = new Map([["41135", t], ["41110", t], ["41130", t]]);
  assert.deepEqual(orderSigunguByStaleness([...seen.keys()], seen), ["41110", "41130", "41135"]);
});
