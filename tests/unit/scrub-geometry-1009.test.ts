import { test } from "node:test";
import assert from "node:assert/strict";
import { layoutScrub, nearestValued, rangeStart, rangeUsable, stepValued, yForValue } from "@/lib/viz/scrub-geometry";

/* [1009] 손가락으로 훑는 추세선 — 좌표·정직성 규칙 */

const box = { width: 300, height: 160, padL: 10, padR: 10, padT: 20, padB: 20 };

test("[1009] 값이 2개 미만이면 선을 그리지 않는다", () => {
  assert.equal(layoutScrub({ values: [null, 5, null], box }), null);
  assert.equal(layoutScrub({ values: [], box }), null);
  assert.ok(layoutScrub({ values: [1, 2], box }));
});

test("[1009] 픽셀 좌표 — 양 끝이 여백 안쪽, 큰 값이 위", () => {
  const L = layoutScrub({ values: [100, 200, 150], box })!;
  assert.equal(L.pts[0].x, 10);
  assert.equal(L.pts[2].x, 290);
  assert.ok((L.pts[1].y as number) < (L.pts[0].y as number));
  assert.ok((L.pts[1].y as number) >= L.plotTop && (L.pts[0].y as number) <= L.plotBottom);
  assert.equal(L.maxAt, 1);
  assert.equal(L.minAt, 0);
  assert.equal(L.solid.length, 1);
  assert.equal(L.dashed.length, 0);
});

test("[1009] 빈 칸은 실선을 끊고 점선으로 잇는다(보간해 지어내지 않는다)", () => {
  const L = layoutScrub({ values: [1, 2, null, 4, 5], box })!;
  assert.equal(L.solid.length, 2);
  assert.equal(L.dashed.length, 1);
  assert.equal(L.pts[2].y, null);
  /* 면은 한 장(빈 칸에 구멍을 내지 않는다) */
  assert.equal(L.areas.length, 1);
});

test("[1009] 적은 표본(건수 < fewBelow)은 실선에서 빼고 속 빈 점 + 점선", () => {
  const L = layoutScrub({ values: [10, 11, 30, 12, 13], counts: [5, 4, 1, 6, 7], fewBelow: 3, box })!;
  assert.equal(L.pts[2].few, true);
  assert.equal(L.pts[1].few, false);
  assert.equal(L.solid.length, 2);
  /* 11→30, 30→12 두 이음이 점선 */
  assert.equal(L.dashed.length, 2);
  /* 최고 표식은 표본이 충분한 칸에서 — 1건짜리 30 이 "최고"가 되지 않는다 */
  assert.equal(L.maxAt, 4);
  assert.equal(L.minAt, 0);
});

test("[1009] 값이 모두 같으면 최고만(최저 표식 중복 금지)", () => {
  const L = layoutScrub({ values: [5, 5, 5], box })!;
  assert.equal(L.minAt, null);
  assert.equal(L.maxAt, 0);
});

test("[1009] 가장 가까운 값 있는 점 · 키보드 한 칸 이동", () => {
  const L = layoutScrub({ values: [1, null, 3, 4], box })!;
  assert.equal(nearestValued(L, 0), 0);
  assert.equal(nearestValued(L, L.pts[1].x), 0);
  assert.equal(nearestValued(L, 999), 3);
  assert.equal(stepValued(L, null, -1), 3);
  assert.equal(stepValued(L, 0, 1), 2);
  assert.equal(stepValued(L, 2, -1), 0);
  assert.equal(stepValued(L, 3, 1), 3);
});

test("[1009] 기간 탭 — 뒤에서 N칸, 값 2개 미만이면 못 쓴다", () => {
  assert.equal(rangeStart(36, 12), 24);
  assert.equal(rangeStart(10, 12), 0);
  assert.equal(rangeStart(10, 0), 0);
  assert.equal(rangeUsable([1, 2, 3, null, 5], 2), false);
  assert.equal(rangeUsable([1, 2, 3, 4, 5], 2), true);
});

test("[1009 · 리뷰 RA] 충분한 칸이 2개 미만이면 최고·최저 표식을 달지 않는다", () => {
  /* 풍림아이원 84㎡ 모양 — 거래 [3,0,1,1,2,0,1] */
  const L = layoutScrub({
    values: [92_000, null, 95_000, 91_000, 99_000, null, 109_000],
    counts: [3, 0, 1, 1, 2, 0, 1],
    fewBelow: 3,
    box,
  })!;
  assert.equal(L.maxAt, null);
  assert.equal(L.minAt, null);
  assert.equal(L.solid.length, 0);
});

test("[1009 · 리뷰] 고정 세로축(점수 0~100) — 좁은 범위가 바닥~꼭대기를 채우지 않는다", () => {
  const free = layoutScrub({ values: [64, 70, 75], box })!;
  const fixed = layoutScrub({ values: [64, 70, 75], box, domain: [0, 100] })!;
  assert.equal(fixed.lo, 0);
  assert.equal(fixed.hi, 100);
  const spanFree = (free.pts[0].y as number) - (free.pts[2].y as number);
  const spanFixed = (fixed.pts[0].y as number) - (fixed.pts[2].y as number);
  assert.ok(spanFixed < spanFree / 3, `${spanFixed} vs ${spanFree}`);
  /* 값이 범위를 넘으면 넘친 만큼만 넓힌다 */
  const over = layoutScrub({ values: [90, 120], box, domain: [0, 100] })!;
  assert.equal(over.hi, 120);
  assert.equal(yForValue(fixed, 100), fixed.plotTop);
  assert.equal(yForValue(fixed, 0), fixed.plotBottom);
});
