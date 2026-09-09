import test from "node:test";
import assert from "node:assert/strict";
import { buildTuningInput } from "../../lib/ai/tool-tuning.ts";
import { TOOL_TUNING, tuningFields } from "../../lib/ai/tool-tuning-fields.ts";
import { AI_TOOL_IDS } from "../../lib/ai/ai-tools.ts";

/* 981 — 도구별 보정 입력.
   가장 중요한 불변식: **엔진이 읽지 않는 입력을 만들지 않는다.**
   그래서 이 테스트는 lib/ai/analysis-engine.ts 를 실제로 읽어, 화면이 올린 키가
   엔진에 존재하는지 대조한다. 눈으로 맞춘 목록은 반드시 어긋난다. */

import { readFileSync } from "node:fs";
const ENGINE = readFileSync(new URL("../../lib/ai/analysis-engine.ts", import.meta.url), "utf8");

test("12종 전부 항목이 정의돼 있다(빈 배열도 정의다)", () => {
  assert.equal(Object.keys(TOOL_TUNING).length, AI_TOOL_IDS.length);
  for (const id of AI_TOOL_IDS) assert.ok(Array.isArray(TOOL_TUNING[id]), id);
});

test("화면이 묻는 입력은 전부 엔진이 실제로 읽는 필드다 — 결과에 영향 없는 칸 금지", () => {
  const missing: string[] = [];
  for (const id of AI_TOOL_IDS) {
    for (const f of tuningFields(id)) {
      if (!ENGINE.includes(`in_.${f.key}`)) missing.push(`${id}.${f.key}`);
    }
  }
  assert.deepEqual(missing, [], `엔진이 읽지 않는 입력: ${missing.join(", ")}`);
});

test("도구마다 묻는 것이 다르다 — 같은 조합이면 화면이 같아 보인다", () => {
  const nonEmpty = AI_TOOL_IDS.filter((id) => tuningFields(id).length > 0);
  const keys = new Map<string, string>();
  for (const id of nonEmpty) {
    const k = tuningFields(id).map((f) => f.key).join(",");
    const prev = keys.get(k);
    assert.equal(prev, undefined, `${id} 와 ${prev} 가 같은 입력 조합을 쓴다`);
    keys.set(k, id);
  }
  assert.ok(nonEmpty.length >= 8, `보정 입력이 있는 도구가 ${nonEmpty.length}종뿐`);
});

test("갭 도구는 매매가·전세가를 묻는다 — 이게 없으면 갭이 늘 0 이었다", () => {
  const keys = tuningFields("ai-gap").map((f) => f.key);
  assert.deepEqual(keys, ["maeMan", "jeonMan"]);
  assert.deepEqual(buildTuningInput(tuningFields("ai-gap"), { maeMan: "125000", jeonMan: "78000" }), {
    maeMan: 125000,
    jeonMan: 78000,
  });
});

test("비운 칸은 키 자체를 안 보낸다 — 빈 문자열은 엔진에서 0 으로 읽힌다", () => {
  assert.deepEqual(buildTuningInput(tuningFields("ai-gap"), { maeMan: "", jeonMan: "  " }), {});
  assert.deepEqual(buildTuningInput(tuningFields("ai-simulator"), { ltvPct: "60", mortgageRatePct: "" }), {
    ltvPct: 60,
  });
});

test("토글은 끈 상태도 보낸다 — '등기부등본 미확인'이 곧 경고 조건이다", () => {
  const out = buildTuningInput(tuningFields("contract-risk"), { hasRegistrationCheck: false, hasInsurance: true });
  assert.equal(out.hasRegistrationCheck, false);
  assert.equal(out.hasInsurance, true);
});

test("숫자 칸에 단위가 섞여 들어와도 숫자로 만든다", () => {
  assert.deepEqual(buildTuningInput(tuningFields("ai-simulator"), { mortgageRatePct: "4.2%" }), {
    mortgageRatePct: 4.2,
  });
  /* 숫자가 하나도 없으면 보내지 않는다 */
  assert.deepEqual(buildTuningInput(tuningFields("ai-simulator"), { ltvPct: "예순" }), {});
});

test("문자 칸은 다듬어서 그대로 보낸다", () => {
  assert.deepEqual(buildTuningInput(tuningFields("ai-inspection"), { mustHaves: "  초품아, 역 10분  " }), {
    mustHaves: "초품아, 역 10분",
  });
});

test("정의되지 않은 키를 넘겨도 새 필드가 생기지 않는다", () => {
  assert.deepEqual(buildTuningInput(tuningFields("ai-gap"), { maeMan: "1", 없는키: "x" } as Record<string, string>), {
    maeMan: 1,
  });
});

test("선택 상자의 '기본' 항목은 빈 값이라 보내지지 않는다", () => {
  assert.deepEqual(buildTuningInput(tuningFields("ai-timing"), { horizonMonths: "", urgency: "" }), {});
  assert.deepEqual(buildTuningInput(tuningFields("ai-timing"), { horizonMonths: "24" }), { horizonMonths: 24 });
});

test("라벨·단위가 비어 있지 않다", () => {
  for (const id of AI_TOOL_IDS) {
    for (const f of tuningFields(id)) {
      assert.ok(f.label.trim().length >= 2, `${id}.${f.key} 라벨이 짧다`);
      if (f.kind === "select") assert.ok(f.options.length >= 2, `${id}.${f.key} 선택지가 모자라다`);
    }
  }
});
