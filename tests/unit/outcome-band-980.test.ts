import test from "node:test";
import assert from "node:assert/strict";
import { outcomeBand, degradedByData, type BandInput } from "../../lib/ai/outcome-band.ts";

const base: BandInput = { hasInsight: true, radar: [], signals: [], flags: [] };

test("판정 자체가 없으면 thin — 없는 판단을 지어내지 않는다", () => {
  assert.equal(outcomeBand({ ...base, hasInsight: false }), "thin");
});

test("잰 축도 없고 선 신호도 없으면 thin", () => {
  assert.equal(outcomeBand({ ...base, radar: [null, null], signals: ["na", "na"] }), "thin");
});

test("데이터 부족으로 축소 실행됐으면 thin", () => {
  assert.equal(
    outcomeBand({ ...base, radar: [80], signals: ["green"], degraded: true, reasonCode: "THIN_SAMPLE" }),
    "thin",
  );
});

test("AI 키가 없어 서술만 빠진 것은 thin 이 아니다 — 규칙 계산은 멀쩡하다", () => {
  assert.equal(degradedByData(true, "LLM_KEY_MISSING"), false);
  assert.equal(
    outcomeBand({ ...base, radar: [80, 72], signals: ["green"], degraded: true, reasonCode: "LLM_KEY_MISSING" }),
    "strong",
  );
});

test("빨간 신호가 초록보다 많으면 weak", () => {
  assert.equal(outcomeBand({ ...base, signals: ["red", "red", "green"] }), "weak");
});

test("경고 플래그 둘이면 초록이 있어도 weak — 좋은 신호가 경고를 덮지 않는다", () => {
  assert.equal(outcomeBand({ ...base, signals: ["green", "green"], flags: ["warn", "warn"] }), "weak");
});

test("평균 점수가 45 미만이면 weak", () => {
  assert.equal(outcomeBand({ ...base, radar: [40, 38, 50], signals: ["green"] }), "weak");
});

test("빨강 없고 경고 없고 평균 65 이상이면 strong", () => {
  assert.equal(outcomeBand({ ...base, radar: [72, 68, 80], signals: ["green", "yellow"] }), "strong");
});

test("점수는 높은데 경고가 하나 있으면 mixed — strong 으로 올리지 않는다", () => {
  assert.equal(outcomeBand({ ...base, radar: [80, 78], signals: ["green"], flags: ["warn"] }), "mixed");
});

test("점수가 중간이면 mixed", () => {
  assert.equal(outcomeBand({ ...base, radar: [55, 60], signals: ["green"] }), "mixed");
});

test("못 잰 축(null)은 평균에서 빼고 센다", () => {
  /* [70, null, 80] 의 평균은 50 이 아니라 75 다 — null 을 0 으로 세면
     축을 못 쟀다는 이유로 화면이 "나쁘다"고 말하게 된다. */
  assert.equal(outcomeBand({ ...base, radar: [70, null, 80], signals: ["green"] }), "strong");
});

test("info 플래그는 경고로 세지 않는다", () => {
  assert.equal(outcomeBand({ ...base, radar: [70, 72], signals: ["green"], flags: ["info", "info"] }), "strong");
});

test("신호만 있고 점수가 없어도 판정한다", () => {
  assert.equal(outcomeBand({ ...base, signals: ["green", "green"] }), "strong");
  assert.equal(outcomeBand({ ...base, signals: ["red"] }), "weak");
  assert.equal(outcomeBand({ ...base, signals: ["yellow"] }), "mixed");
});
