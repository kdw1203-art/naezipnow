import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  DECISION_REASON_MAX,
  decisionBand,
  decisionFromMetadata,
  decisionLabel,
  normalizeReasons,
  parseDecision,
  suggestDecision,
} from "../../lib/inspection/decision.ts";

/* [996 · 4] 판단 제안·검증 — 제안은 받은 입력만 인용하고, 쓰레기 metadata 는 null 로 접는다 */

test("입력이 하나도 없으면 다시 보기 — 지어낸 근거 없이 '기록이 적다'고만 말한다", () => {
  const s = suggestDecision({});
  assert.equal(s.choice, "revisit");
  assert.deepEqual(s.reasons, ["아직 기록이 적어요 — 확인 후 판단"]);
  assert.equal(s.basis, "입력된 기록 없음");
  /* 빈 객체·0 축·0 체크도 같은 결과 */
  const s2 = suggestDecision({
    checks: {},
    scores: { location: 0, school: 0, transport: 0, facility: 0, future: 0 },
    checklistDoneCount: 0,
    checklistTotal: 34,
  });
  assert.equal(s2.choice, "revisit");
  assert.equal(s2.reasons.length, 1);
});

test("입력 없음 + 시세만 있으면 시세 줄은 붙이되 판단은 여전히 다시 보기", () => {
  const s = suggestDecision({ market: { priceLabel: "12.5억", momPct: -1.4 } });
  assert.equal(s.choice, "revisit");
  assert.deepEqual(s.reasons, ["아직 기록이 적어요 — 확인 후 판단", "실거래 평균 12.5억 · 전월비 ▼1.4%"]);
});

test("좋음이 많고 아쉬움 0 → 살까 · 근거는 체크 집계와 상위 축", () => {
  const s = suggestDecision({
    checks: { 채광: "좋음", 소음: "좋음", 주차: "보통", 교통: "좋음", 학군: "좋음" },
    scores: { location: 5, school: 5, transport: 5, facility: 4, future: 0 },
    checklistDoneCount: 12,
    checklistTotal: 34,
  });
  assert.equal(s.choice, "buy");
  assert.equal(s.reasons[0], "현장 체크 5개 중 좋음 4");
  assert.equal(s.reasons[1], "입지 5/5 · 학군 5/5");
  assert.equal(s.reasons[2], "체크리스트 12/34");
  assert.equal(s.reasons.length, 3);
  assert.equal(s.basis, "현장 체크 5개 · 축 점수 4개 · 체크리스트 12/34 기준");
});

test("아쉬움 2개 → 보류, 3개 이상 → 패스 (약한 축은 근거에 적힌다)", () => {
  const hold = suggestDecision({
    checks: { 채광: "좋음", 소음: "아쉬움", 주차: "아쉬움", 교통: "보통" },
    scores: { location: 3, school: 0, transport: 3, facility: 2, future: 0 },
  });
  assert.equal(hold.choice, "hold");
  assert.equal(hold.reasons[0], "현장 체크 4개 중 좋음 1 · 아쉬움 2");
  assert.equal(hold.reasons[1], "입지 3/5 · 교통 3/5 · 약한 축 시설 2/5");

  const pass = suggestDecision({
    checks: { 채광: "아쉬움", 소음: "아쉬움", 주차: "아쉬움", 교통: "보통" },
    scores: { location: 3, school: 0, transport: 3, facility: 1, future: 0 },
  });
  assert.equal(pass.choice, "pass");
});

test("축 평균이 2.5 미만이면 아쉬움이 없어도 부정 — 축 3개 이상 평균 <2 면 패스", () => {
  const hold = suggestDecision({
    scores: { location: 2, school: 0, transport: 3, facility: 0, future: 0 },
  });
  assert.equal(hold.choice, "hold");
  const pass = suggestDecision({
    scores: { location: 1, school: 2, transport: 1, facility: 0, future: 0 },
  });
  assert.equal(pass.choice, "pass");
  /* 아쉬움 1개뿐(축 1개 평균 1) — 패스라 하기엔 얇다 → 보류 */
  const thinBad = suggestDecision({ checks: { 주차: "아쉬움" }, scores: { location: 0, school: 0, transport: 0, facility: 1, future: 0 } });
  assert.equal(thinBad.choice, "hold");
});

test("좋음 하나뿐이면 살까가 아니라 다시 보기 — 근거가 얇다", () => {
  const s = suggestDecision({
    checks: { 채광: "좋음" },
    scores: { location: 0, school: 0, transport: 0, facility: 5, future: 0 },
  });
  assert.equal(s.choice, "revisit");
  assert.equal(s.reasons[0], "현장 체크 1개 중 좋음 1");
  /* 섞였는데 체크가 3개 이상이면 보류 */
  const mixed = suggestDecision({
    checks: { 채광: "좋음", 소음: "보통", 주차: "보통" },
    scores: { location: 0, school: 0, transport: 0, facility: 4, future: 0 },
  });
  assert.equal(mixed.choice, "hold");
});

test("모두 보통이면 '모두 보통'이라 적고, 알 수 없는 값은 세지 않는다", () => {
  const s = suggestDecision({ checks: { 채광: "보통", 소음: "보통", 주차: "이상한값", 교통: undefined } });
  assert.equal(s.reasons[0], "현장 체크 2개 모두 보통");
  assert.equal(s.choice, "revisit");
});

test("근거는 최대 3줄, 각 60자 이내", () => {
  const s = suggestDecision({
    checks: { 채광: "좋음", 소음: "좋음", 주차: "좋음" },
    scores: { location: 5, school: 5, transport: 5, facility: 5, future: 5 },
    checklistDoneCount: 3,
    checklistTotal: 34,
    market: { priceLabel: "x".repeat(200) },
  });
  assert.equal(s.reasons.length, 3);
  for (const r of s.reasons) assert.ok(r.length <= DECISION_REASON_MAX, r);
  /* 시세가 있으면 체크리스트 줄이 밀려난다(우선순위: 체크 → 축 → 시세 → 체크리스트) */
  assert.ok(s.reasons[2].startsWith("실거래 평균"));
});

test("parseDecision — 쓰레기는 null, 정상은 정리해서 돌려준다", () => {
  assert.equal(parseDecision(null), null);
  assert.equal(parseDecision("buy"), null);
  assert.equal(parseDecision([]), null);
  assert.equal(parseDecision({ choice: "maybe", reasons: [], decidedAt: "2026-09-13T00:00:00Z" }), null);
  assert.equal(parseDecision({ choice: "buy", reasons: [], decidedAt: "어제" }), null);
  assert.equal(parseDecision({ choice: "buy", reasons: [] }), null);
  const ok = parseDecision({
    choice: "hold",
    reasons: ["  입지 좋음 ", "", 42, "x".repeat(100), "넷째", "다섯째"],
    decidedAt: "2026-09-13T01:02:03.000Z",
  });
  assert.ok(ok);
  assert.equal(ok.choice, "hold");
  assert.equal(ok.reasons.length, 3);
  assert.equal(ok.reasons[0], "입지 좋음");
  assert.equal(ok.reasons[1].length, DECISION_REASON_MAX);
  assert.equal(ok.reasons[2], "넷째");
  assert.equal(ok.decidedAt, "2026-09-13T01:02:03.000Z");
  /* reasons 가 아예 없어도 판단은 유효 */
  assert.deepEqual(parseDecision({ choice: "pass", decidedAt: "2026-01-01" })?.reasons, []);
});

test("decisionFromMetadata — metadata 전체에서 꺼낸다", () => {
  assert.equal(decisionFromMetadata(null), null);
  assert.equal(decisionFromMetadata({}), null);
  assert.equal(decisionFromMetadata({ decision: "buy" }), null);
  assert.equal(
    decisionFromMetadata({ decision: { choice: "revisit", reasons: ["a"], decidedAt: "2026-09-13" } })?.choice,
    "revisit",
  );
});

test("라벨·띠 색 — 살까/보류/패스/다시 보기 ↔ strong/mixed/weak/thin", () => {
  assert.equal(decisionLabel("buy"), "살까");
  assert.equal(decisionLabel("hold"), "보류");
  assert.equal(decisionLabel("pass"), "패스");
  assert.equal(decisionLabel("revisit"), "다시 보기");
  assert.equal(decisionBand("buy"), "strong");
  assert.equal(decisionBand("hold"), "mixed");
  assert.equal(decisionBand("pass"), "weak");
  assert.equal(decisionBand("revisit"), "thin");
  assert.deepEqual(normalizeReasons(["  a  b ", null, ""]), ["a b"]);
});
