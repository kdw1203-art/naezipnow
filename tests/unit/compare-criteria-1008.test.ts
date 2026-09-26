import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_WEIGHTS,
  criterionValue,
  dropReasonText,
  parseWeights,
  scoreByCriteria,
  winnerLine,
  type CriteriaInput,
  type Weights,
} from "@/lib/compare/my-criteria";

/* [1008 · Q] 후보 비교 "내 기준" — 숫자는 테스트용 가짜. */

const item = (id: string, over: Partial<CriteriaInput> = {}): CriteriaInput => ({
  id,
  name: id.toUpperCase(),
  hasData: true,
  avg6mKrw: 1_000_000_000,
  avgPyeong6mKrw: 40_000_000,
  count12m: 10,
  latestYm: "202608",
  ...over,
});

const OFF: Weights = { pyeong: 0, avg: 0, volume: 0, recent: 0 };

test("[1008·Q] 가중 평균 — 중요(×2) 기준에서 앞선 단지가 1위, 한 줄 요약이 그 기준을 말한다", () => {
  const items = [
    item("a", { avgPyeong6mKrw: 30_000_000, count12m: 5 }), // 평당가 최저
    item("b", { avgPyeong6mKrw: 50_000_000, count12m: 40 }), // 거래 최다
  ];
  const w: Weights = { pyeong: 2, avg: 0, volume: 1, recent: 0 };
  const r = scoreByCriteria(items, w);
  assert.deepEqual(r.ranked.map((s) => [s.id, s.rank, s.score]), [
    ["a", 1, 66.7],
    ["b", 2, 33.3],
  ]);
  assert.deepEqual(r.used, ["pyeong", "volume"]);
  assert.equal(winnerLine(r, w), "1위 A — 내가 중요하게 본 평당가에서 앞섬");
  // 거래를 중요로 바꾸면 뒤집힌다
  const w2: Weights = { pyeong: 1, avg: 0, volume: 2, recent: 0 };
  const r2 = scoreByCriteria(items, w2);
  assert.equal(r2.ranked[0].id, "b");
  assert.equal(winnerLine(r2, w2), "1위 B — 내가 중요하게 본 거래량에서 앞섬");
});

test("[1008·Q] 값이 없는 칸은 그 기준에서 빼고(0점 아님) 무엇을 뺐는지 남긴다", () => {
  const items = [
    item("a", { avgPyeong6mKrw: null, avg6mKrw: 900_000_000 }),
    item("b", { avg6mKrw: 1_100_000_000, avgPyeong6mKrw: 45_000_000 }),
    item("c", { avg6mKrw: 1_000_000_000, avgPyeong6mKrw: 35_000_000 }),
  ];
  const w: Weights = { pyeong: 1, avg: 1, volume: 0, recent: 0 };
  const r = scoreByCriteria(items, w);
  const a = r.ranked.find((s) => s.id === "a")!;
  assert.deepEqual(a.missing, ["pyeong"]);
  assert.equal(a.score, 100); // 평균가 하나로만 — 최저라 만점
  const b = r.ranked.find((s) => s.id === "b")!;
  assert.deepEqual(b.missing, []);
  assert.equal(b.score, 0);
});

test("[1008·Q] 리뷰 C — 값이 한 곳에만 있는 기준은 모두에게서 뺀다(그 한 곳에 만점을 주지 않는다)", () => {
  // A: 6개월 거래가 없어 평당가·평균가가 비었다 / B: 있다. 예전엔 평당가 '중요'면 B 80 · A 50.
  const items = [
    item("a", { avg6mKrw: null, avgPyeong6mKrw: null, count12m: 3, latestYm: "202512" }),
    item("b", { avg6mKrw: 1_500_000_000, avgPyeong6mKrw: 60_000_000, count12m: 2, latestYm: "202606" }),
  ];
  const w: Weights = { ...DEFAULT_WEIGHTS, pyeong: 2 };
  const r = scoreByCriteria(items, w);
  assert.deepEqual(r.dropped, [
    { key: "pyeong", reason: "single" },
    { key: "avg", reason: "single" },
  ]);
  assert.deepEqual(r.used, ["volume", "recent"]);
  // 남은 두 기준에서 한 번씩 앞서 동점 — 평당가가 승부를 가르지 않는다
  assert.deepEqual(r.ranked.map((s) => s.score), [50, 50]);
  assert.ok(r.ranked.every((s) => s.missing.length === 0)); // 뺀 기준은 "값 없음"으로 적지 않는다
  assert.equal(winnerLine(r, w), "공동 1위 A · B — 고른 중요도로 낸 점수(가중 평균)가 같아요");
  assert.equal(dropReasonText("single"), "비교할 값이 한 곳뿐이라 뺐어요");
});

test("[1008·Q] 값이 모두 같은 기준도 모두에게서 뺀다 — 가를 수 있는 기준이 없으면 순위 없음", () => {
  const same = [item("a"), item("b")];
  const r = scoreByCriteria(same, DEFAULT_WEIGHTS);
  assert.deepEqual(
    r.dropped.map((d) => d.reason),
    ["same", "same", "same", "same"],
  );
  assert.deepEqual(r.used, []);
  assert.ok(r.ranked.every((s) => s.score === null && s.rank === null));
  assert.equal(winnerLine(r, DEFAULT_WEIGHTS), null);
  assert.equal(dropReasonText("same"), "후보들 값이 모두 같아 뺐어요");
  // 같은 달에 거래한 두 곳 — 최근 거래는 빠지고 나머지로만 가른다
  const r2 = scoreByCriteria([item("a", { count12m: 30 }), item("b", { count12m: 5 })], DEFAULT_WEIGHTS);
  assert.deepEqual(r2.used, ["volume"]);
  assert.equal(r2.ranked[0].id, "a");
});

test("[1008·Q] 실거래 없는 후보는 순위 제외(맨 뒤), 모든 기준이 꺼지면 순위 없음", () => {
  const items = [
    item("a", { count12m: 12 }),
    item("x", { hasData: false, avg6mKrw: null, avgPyeong6mKrw: null, count12m: 0, latestYm: null }),
    item("b", { count12m: 30 }),
  ];
  const r = scoreByCriteria(items, DEFAULT_WEIGHTS);
  const last = r.ranked[r.ranked.length - 1];
  assert.equal(last.id, "x");
  assert.equal(last.score, null);
  assert.equal(last.rank, null);
  const none = scoreByCriteria(items, OFF);
  assert.ok(none.ranked.every((s) => s.score === null && s.rank === null));
  assert.deepEqual(none.dropped, []);
  assert.equal(winnerLine(none, OFF), null);
  assert.equal(criterionValue(items[1], "volume"), null);
});

test("[1008·Q] 최근 거래는 연월이 늦을수록, 보통 기준만 앞서면 '내가 중요하게 본' 없이 말한다", () => {
  const items = [item("a", { latestYm: "202601" }), item("b", { latestYm: "202608" })];
  const w: Weights = { pyeong: 0, avg: 0, volume: 0, recent: 1 };
  const r = scoreByCriteria(items, w);
  assert.equal(r.ranked[0].id, "b");
  assert.equal(winnerLine(r, w), "1위 B — 최근 거래에서 앞섬");
});

test("[1008·Q] 1위가 어느 기준에서도 1등이 아니면 그렇게 말한다", () => {
  // a: 평당가 2등·거래 2등(중간값), b·c 가 각각 한 기준씩 1등이지만 다른 기준에서 꼴찌
  const items = [
    item("a", { avgPyeong6mKrw: 40_000_000, count12m: 20, avg6mKrw: null }),
    item("b", { avgPyeong6mKrw: 30_000_000, count12m: 1, avg6mKrw: null }),
    item("c", { avgPyeong6mKrw: 50_000_000, count12m: 30, avg6mKrw: null }),
  ];
  const w: Weights = { pyeong: 1, avg: 0, volume: 1, recent: 0 };
  const r = scoreByCriteria(items, w);
  assert.equal(r.ranked[0].id, "a");
  assert.equal(
    winnerLine(r, w),
    "1위 A — 한 기준에서 1등은 아니지만 고른 중요도로 낸 점수(가중 평균)가 가장 높아요",
  );
});

test("[1008·Q] parseWeights — 저장값 복원, 틀린 값은 기본값", () => {
  assert.deepEqual(parseWeights(null), DEFAULT_WEIGHTS);
  assert.deepEqual(parseWeights("{broken"), DEFAULT_WEIGHTS);
  assert.deepEqual(parseWeights(JSON.stringify({ pyeong: 2, avg: 0, volume: 5, x: 1 })), {
    pyeong: 2,
    avg: 0,
    volume: 1,
    recent: 1,
  });
});
