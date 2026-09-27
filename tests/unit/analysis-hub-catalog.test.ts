import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { AI_TOOL_IDS, CORE_AI_TOOL_IDS } from "../../lib/ai/ai-tools.ts";
import { TOOL_IDENTITIES } from "../../lib/ai/tool-identity.ts";
import { sparklinePath } from "../../app/analysis/sparkline-path.ts";
import {
  AI_TOOL_COUNT,
  HUB_TOOLS,
  HUB_TOOL_COUNT,
  MARKET_LIVE,
  RECORD_LIVE,
  TIERS,
  WORKBENCH_CORE,
  WORKBENCH_FACTS,
  WORKBENCH_MORE,
  workbenchSub,
} from "../../app/analysis/tool-catalog.ts";

/* ============================================================
   분석 허브 리디자인 회귀 잠금 (UI-01 ~ UI-10, 2026-08-25)

   소유자 피드백("뭐가 중요한지, 어떤 게 어느 기능인지 모르겠다")의 실제 원인은
   이름 중복 5쌍이었다. 이름은 코드 어디서든 쉽게 되돌아온다 — 그래서 규칙을
   테스트로 잠근다. 아이콘도 마찬가지다: 존재하지 않는 아이콘 이름을 쓰면
   화면에는 **빈 자리**가 나고 빌드는 통과한다(런타임 조용한 실패).
   ============================================================ */

/* [v4] 허브 목록 행 파일 — 아이콘 타일·글리프·추세선이 돌아오지 않는지 소스 문자열로 본다(서버 전용 의존이 붙은
   화면 파일은 이 러너에서 불러올 수 없다 — tests/unit/static-pages-1007.test.ts 와 같은 방식). */
const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), "utf8");
const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
const HUB_ROW_FILES = [
  "app/analysis/page.tsx",
  "app/analysis/hub-row.tsx",
  "app/analysis/hub-tiers.tsx",
  "app/analysis/hub-tool-card.tsx",
  "app/analysis/hub-picker.tsx",
  "app/analysis/hub-search.tsx",
];

test("UI-02 — 워크벤치 제목과 허브 도구 제목이 하나도 겹치지 않는다", () => {
  const workbench = AI_TOOL_IDS.map((id) => TOOL_IDENTITIES[id].title);
  const hub = HUB_TOOLS.map((t) => t.title);
  const dup = workbench.filter((w) => hub.includes(w));
  assert.deepEqual(
    dup,
    [],
    `제목 중복: ${dup.join(", ")} — 워크벤치는 도구 이름만(1008 — '이 단지' 접두 제거, 소유자 지시), 허브 도구는 대상(지역·전국·내 기록)을 제목에 넣는다`,
  );
});

test("UI-02 — 제목은 각 목록 안에서도 유일하다", () => {
  const workbench = AI_TOOL_IDS.map((id) => TOOL_IDENTITIES[id].title);
  assert.equal(new Set(workbench).size, workbench.length, "워크벤치 제목 중복");
  const hub = HUB_TOOLS.map((t) => t.title);
  assert.equal(new Set(hub).size, hub.length, "허브 도구 제목 중복");
});

test("UI-03 — 워크벤치는 CORE + MORE 로 정확히 한 번씩 덮인다", () => {
  const all = [...WORKBENCH_CORE, ...WORKBENCH_MORE];
  assert.equal(all.length, AI_TOOL_IDS.length);
  assert.equal(new Set(all).size, all.length, "중복 노출");
  assert.deepEqual([...all].sort(), [...AI_TOOL_IDS].sort(), "누락된 도구");
  assert.deepEqual([...WORKBENCH_CORE], [...CORE_AI_TOOL_IDS]);
  assert.equal(AI_TOOL_COUNT, AI_TOOL_IDS.length);
});

/* [v4] 예전 UI-06 은 "카드 아이콘 이름이 Icon.tsx 에 실존한다"였다. v4 목록 행에는 아이콘 타일이 없다
   (규칙 7 — 행 앞 장식 아이콘 칸 금지) → 아이콘 이름 필드(icon·WORKBENCH_ICONS)를 지웠고, 대신 행 파일에
   아이콘·글리프·추세선이 되돌아오지 않는지를 잠근다. */
test("[v4] UI-06 — 허브 목록 행에 아이콘 타일·글리프·추세선이 없다", () => {
  for (const f of HUB_ROW_FILES) {
    const s = stripComments(read(f));
    assert.ok(!/<Icon\b|<ToolGlyph\b|<Sparkline\b|tile-ico/.test(s), `${f}: 행 앞 장식 아이콘/글리프/추세선`);
  }
});

test("UI-06 — 이모지가 카탈로그에 남아 있지 않다", () => {
  const emoji = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/u;
  for (const t of HUB_TOOLS) {
    assert.ok(!emoji.test(t.title + t.sub), `${t.title} 에 이모지`);
  }
  for (const id of AI_TOOL_IDS) assert.ok(!emoji.test(workbenchSub(id)), `${id} 보조 줄에 이모지`);
});

/* [v4] 예전 UI-04 는 "실데이터 도구와 예시 계산 도구가 완전히 갈린다"(체험 구역)였다. v4 는 예시 계산 3종을
   허브에서 뺐다(규칙 9 — "예시 계산" 같은 곁가지 블록 제거) → 허브의 모든 도구는 실데이터 섹션 둘 중 하나다. */
test("[v4] UI-04 — 허브에는 예시 계산 도구가 없고, 모든 도구가 지역 시세·내 임장노트 섹션에 한 번씩 든다", () => {
  assert.equal(MARKET_LIVE.length + RECORD_LIVE.length, HUB_TOOLS.length);
  assert.ok(HUB_TOOLS.every((t) => !("sim" in t)), "예시 계산 표시가 남아 있다");
  for (const href of ["/analysis/scenario", "/analysis/portfolio", "/analysis/switch"]) {
    assert.ok(!HUB_TOOLS.some((t) => t.href === href), `${href} 가 허브 목록에 남아 있다`);
  }
  assert.equal(HUB_TOOL_COUNT, AI_TOOL_COUNT + MARKET_LIVE.length + RECORD_LIVE.length);
});

/* [v4] 행 보조 줄 = **결과** 한 줄(규칙 3 — "~해요/~봐요" 기능 설명 문장 금지) */
test("[v4] 행 보조 줄 — 결과 한 줄, 설명 문장·느낌표 없음", () => {
  const lines = [...HUB_TOOLS.map((t) => t.sub), ...AI_TOOL_IDS.map((id) => workbenchSub(id))];
  for (const l of lines) {
    assert.ok(l.trim().length >= 4 && l.length <= 32, `길이: "${l}"`);
    assert.ok(!/(해요|봐요|드려요|줘요|합니다|세요)|!/.test(l), `설명 문장: "${l}"`);
  }
  /* 결과 이름 + 코드에 있는 개수 — 지어낸 수 없음 */
  assert.equal(workbenchSub("ai-diagnosis"), `${TOOL_IDENTITIES["ai-diagnosis"].metricLabel} · ${WORKBENCH_FACTS["ai-diagnosis"]}`);
  assert.equal(workbenchSub("ai-diagnosis"), "투자 점수 · 5개 항목");
});

test("UI-01 — 모든 도구가 계열 3개 중 하나에 속하고 href 는 유일하다", () => {
  const hrefs = HUB_TOOLS.map((t) => t.href);
  assert.equal(new Set(hrefs).size, hrefs.length, "href 중복");
  for (const t of HUB_TOOLS) {
    assert.ok(TIERS[t.tier], `${t.title} 계열 미상`);
    assert.ok(t.href.startsWith("/"), `${t.title} 내부 링크 아님`);
  }
});

/* [v4] workbenchCard()(히어로 빠른 실행 타일용)는 히어로와 함께 지웠다. 목록 행 링크는 서버 조립
   (workbench-cards.ts workbenchRows — ToolGlyph.tsx 를 끌고 와 이 러너에서 못 부른다)이 같은 규칙을 쓴다. */
test("워크벤치 행 링크는 /analysis/ai/{id} 를 그대로 쓴다", () => {
  const src = stripComments(read("app/analysis/workbench-cards.ts"));
  assert.ok(src.includes("href: `/analysis/ai/${id}`"), "행 링크 모양이 바뀌었다");
  for (const id of AI_TOOL_IDS) assert.ok(TOOL_IDENTITIES[id].title.length > 0);
});

/* ---------- UI-09 스파크라인 — "없으면 안 그린다" 정직성 규칙 ---------- */

test("UI-09 — 점이 2개 미만이면 선을 그리지 않는다(빈 데이터를 선으로 위장 금지)", () => {
  assert.equal(sparklinePath([]), null);
  assert.equal(sparklinePath([42]), null);
  assert.equal(sparklinePath([Number.NaN, Number.NaN]), null);
  assert.equal(sparklinePath([1, Number.POSITIVE_INFINITY]), null);
});

test("UI-09 — 좌표가 전부 뷰박스 안에 들어온다", () => {
  const g = sparklinePath([1, 3, 2, 5, 4], 96, 26);
  assert.ok(g);
  const ys = [...g.line.matchAll(/[ML][\d.]+ ([\d.]+)/g)].map((m) => Number(m[1]));
  const xs = [...g.line.matchAll(/[ML]([\d.]+) /g)].map((m) => Number(m[1]));
  assert.ok(ys.every((y) => y >= 0 && y <= 26), `y 벗어남: ${ys.join(",")}`);
  assert.ok(xs.every((x) => x >= 0 && x <= 96), `x 벗어남: ${xs.join(",")}`);
  assert.equal(xs[0], 0);
  assert.equal(xs[xs.length - 1], 96);
  assert.deepEqual([...g.last], [xs[xs.length - 1], ys[ys.length - 1]]);
});

test("UI-09 — 전 구간 같은 값이면 가운데 수평선으로 눕는다(0 나눗셈 없음)", () => {
  const g = sparklinePath([50, 50, 50], 96, 26);
  assert.ok(g);
  const ys = [...g.line.matchAll(/[ML][\d.]+ ([\d.]+)/g)].map((m) => Number(m[1]));
  assert.ok(ys.every((y) => y === 13), `수평선이 아니다: ${ys.join(",")}`);
});

test("UI-09 — 값이 클수록 위로 간다(부호가 뒤집히지 않는다)", () => {
  const g = sparklinePath([1, 2, 3], 90, 30);
  assert.ok(g);
  const ys = [...g.line.matchAll(/[ML][\d.]+ ([\d.]+)/g)].map((m) => Number(m[1]));
  assert.ok(ys[0] > ys[1] && ys[1] > ys[2], `상승인데 내려간다: ${ys.join(",")}`);
});
