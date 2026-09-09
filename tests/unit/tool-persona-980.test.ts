import test from "node:test";
import assert from "node:assert/strict";
import {
  TOOL_PERSONAS,
  PERSONA_IDS,
  MARKET_TOOL_IDS,
  MARKET_TOOL_BY_HREF,
  getToolPersona,
  marketPersonaByHref,
  personaVars,
  resultOrder,
  type ToolPersona,
} from "../../lib/ai/tool-persona.ts";
import { AI_TOOL_IDS } from "../../lib/ai/ai-tools.ts";

/* 980 — 도구 16종의 성격.
   눈으로 고른 색을 믿지 않는다. 여기서 실제로 대비를 계산해 막는다.
   (globals.css 의 check-contrast-tokens 는 토큰만 보므로 이 값들은 못 본다.) */

const LIGHT_SURFACE = "#ffffff";
const DARK_SURFACE = "#171b22";

function srgb(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}
function luminance(hex: string): number {
  const m = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  assert.ok(m, `hex 형식이 아님: ${hex}`);
  const n = parseInt(m![1], 16);
  return (
    0.2126 * srgb((n >> 16) & 255) + 0.7152 * srgb((n >> 8) & 255) + 0.0722 * srgb(n & 255)
  );
}
function contrast(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

test("대비 계산기 자체가 맞다 — 알려진 값으로 검산", () => {
  assert.equal(Math.round(contrast("#000000", "#ffffff") * 100) / 100, 21);
  assert.equal(Math.round(contrast("#ffffff", "#ffffff") * 100) / 100, 1);
  /* WCAG 예시: #767676 on white = 4.54 */
  assert.ok(Math.abs(contrast("#767676", "#ffffff") - 4.54) < 0.02);
});

test("16종 전부 페르소나가 있다 — 하나라도 비면 화면이 기본색으로 떨어진다", () => {
  assert.equal(PERSONA_IDS.length, 16);
  assert.equal(AI_TOOL_IDS.length + MARKET_TOOL_IDS.length, 16);
  for (const id of PERSONA_IDS) {
    const p: ToolPersona | undefined = TOOL_PERSONAS[id];
    assert.ok(p, `페르소나 없음: ${id}`);
    assert.equal(p.id, id);
  }
  assert.equal(Object.keys(TOOL_PERSONAS).length, 16);
});

test("라이트 액센트는 흰 바탕 위 4.5:1 이상", () => {
  const bad: string[] = [];
  for (const id of PERSONA_IDS) {
    const r = contrast(TOOL_PERSONAS[id].palette.accent, LIGHT_SURFACE);
    if (r < 4.5) bad.push(`${id} ${TOOL_PERSONAS[id].palette.accent} = ${r.toFixed(2)}:1`);
  }
  assert.deepEqual(bad, []);
});

test("다크 액센트는 어두운 표면(#171b22) 위 4.5:1 이상", () => {
  const bad: string[] = [];
  for (const id of PERSONA_IDS) {
    const r = contrast(TOOL_PERSONAS[id].palette.accentDark, DARK_SURFACE);
    if (r < 4.5) bad.push(`${id} ${TOOL_PERSONAS[id].palette.accentDark} = ${r.toFixed(2)}:1`);
  }
  assert.deepEqual(bad, []);
});

test("도구끼리 색이 붙어 보이지 않는다 — 같은 hex 재사용 금지", () => {
  const seen = new Map<string, string>();
  for (const id of PERSONA_IDS) {
    const hex = TOOL_PERSONAS[id].palette.accent.toLowerCase();
    const prev = seen.get(hex);
    assert.equal(prev, undefined, `${id} 와 ${prev} 가 같은 액센트(${hex})를 쓴다`);
    seen.set(hex, id);
  }
  assert.equal(seen.size, 16);
});

test("실행 중 문구는 도구마다 다르다 — 같은 4줄이면 화면이 같아 보인다", () => {
  const joined = new Map<string, string>();
  for (const id of PERSONA_IDS) {
    const key = TOOL_PERSONAS[id].runStages.join("|");
    const prev = joined.get(key);
    assert.equal(prev, undefined, `${id} 와 ${prev} 의 실행 중 문구가 같다`);
    joined.set(key, id);
    assert.equal(TOOL_PERSONAS[id].runStages.length, 4);
    for (const s of TOOL_PERSONAS[id].runStages) assert.ok(s.trim().length >= 6, `${id}: 너무 짧은 단계 "${s}"`);
  }
});

test("결과 말투 4구간이 전부 채워져 있고 서로 다르다", () => {
  for (const id of PERSONA_IDS) {
    const t = TOOL_PERSONAS[id].tone;
    const vals = [t.strong, t.mixed, t.weak, t.thin];
    for (const v of vals) assert.ok(v.trim().length >= 10, `${id}: 말투가 비었거나 짧다`);
    assert.equal(new Set(vals).size, 4, `${id}: 구간별 말투가 겹친다`);
  }
});

test("데이터가 모자랄 때(thin) 좋게 말하지 않는다 — '모자'/'이릅니다'/'않았' 중 하나는 있어야 한다", () => {
  for (const id of PERSONA_IDS) {
    const thin = TOOL_PERSONAS[id].tone.thin;
    assert.ok(
      /모자|이릅니다|않았|넣어 주세요|넓혀/.test(thin),
      `${id}: thin 문구가 부족함을 말하지 않는다 — "${thin}"`,
    );
  }
});

test("화면 구성이 한 종류로 몰리지 않는다 — 아키타입 7종 이상 사용", () => {
  const kinds = new Set(PERSONA_IDS.map((id) => TOOL_PERSONAS[id].composition));
  assert.ok(kinds.size >= 7, `아키타입이 ${kinds.size}종뿐 — 화면이 같아 보인다`);
});

test("실행 연출·결과 등장도 골고루 쓰인다", () => {
  const run = new Set(PERSONA_IDS.map((id) => TOOL_PERSONAS[id].runMotion));
  const rev = new Set(PERSONA_IDS.map((id) => TOOL_PERSONAS[id].reveal));
  assert.ok(run.size >= 5, `실행 연출 ${run.size}종`);
  assert.ok(rev.size >= 4, `결과 등장 ${rev.size}종`);
});

test("다음 행동은 자기 자신으로 보내지 않는다", () => {
  for (const id of PERSONA_IDS) {
    const { href, label } = TOOL_PERSONAS[id].nextAction;
    assert.ok(href.startsWith("/"), `${id}: 상대 경로가 아님`);
    assert.notEqual(href, `/analysis/ai/${id}`, `${id}: 다음 행동이 자기 화면이다`);
    assert.ok(label.trim().length >= 4);
  }
});

test("지역·시장 4종은 경로로도 찾을 수 있다", () => {
  assert.equal(Object.keys(MARKET_TOOL_BY_HREF).length, 4);
  for (const [href, id] of Object.entries(MARKET_TOOL_BY_HREF)) {
    assert.equal(marketPersonaByHref(href)?.id, id);
  }
  assert.equal(marketPersonaByHref("/analysis/cycle"), null);
});

test("모르는 id 는 화면을 죽이지 않고 기본 성격으로 떨어진다", () => {
  assert.equal(getToolPersona("없는-도구").id, "ai-diagnosis");
  assert.equal(getToolPersona("ai-gap").id, "ai-gap");
});

test("CSS 변수 네 개가 나온다 — 색은 래퍼 한 곳에서만 준다", () => {
  const v = personaVars(TOOL_PERSONAS["ai-timing"]);
  assert.deepEqual(Object.keys(v).sort(), [
    "--tool-accent",
    "--tool-accent-dark",
    "--tool-soft",
    "--tool-soft-dark",
  ]);
  assert.equal(v["--tool-accent"], "#C2410C");
});

test("결과 블록 순서가 아키타입마다 다르다 — 12종이 전부 같은 순서였던 것을 가른다", () => {
  const orders = new Set(PERSONA_IDS.map((id) => resultOrder(TOOL_PERSONAS[id].composition).join(">")));
  assert.ok(orders.size >= 3, `순서가 ${orders.size}종뿐`);
  /* 표·목록형은 표(body)가 위젯보다 먼저 */
  const matrix = resultOrder("matrix");
  assert.ok(matrix.indexOf("body") < matrix.indexOf("widget"));
  /* 장부형은 위험(widget) 바로 뒤에 "틀리는 조건"(counters) */
  const ledger = resultOrder("ledger");
  assert.equal(ledger[ledger.indexOf("widget") + 1], "counters");
  /* 계기판·점수형은 눈금(widget)이 본문보다 먼저 */
  const gauge = resultOrder("gauge");
  assert.ok(gauge.indexOf("widget") < gauge.indexOf("body"));
});

test("어느 아키타입이든 블록 네 개가 정확히 한 번씩 나온다 — 빠지거나 겹치면 결과가 사라진다", () => {
  const kinds = new Set(PERSONA_IDS.map((id) => TOOL_PERSONAS[id].composition));
  for (const k of kinds) {
    const o = resultOrder(k);
    assert.equal(o.length, 4, `${k}: 블록 수 ${o.length}`);
    assert.deepEqual([...o].sort(), ["body", "counters", "headline", "widget"], `${k}: 블록 구성이 다르다`);
  }
});
