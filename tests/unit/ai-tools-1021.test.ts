import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { layoutScenarioFan } from "../../app/components/viz/price-chart-geometry.ts";
import { buildPriceScenario } from "../../lib/ai/price-scenarios.ts";
import { CORE_AI_TOOL_IDS } from "../../lib/ai/ai-tools.ts";
import { FRAME_TOOLS, isFrameTool } from "../../app/analysis/ai/[tool]/frame-tools.ts";

/* [1021] 단지 분석 4종(/analysis/ai/ai-diagnosis·ai-prediction·ai-inspection·ai-timing) — 시안(mock8) 뼈대를 잠근다.
   구조는 소스 문자열로 본다(클라이언트 컴포넌트는 node --test 로 실행할 수 없다). 숫자 규칙은 순수 함수로. */

const read = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");
const visible = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const workbench = read("app/analysis/ai/[tool]/WorkbenchClient.tsx");
const page = visible("app/analysis/ai/[tool]/page.tsx");
const resultView = read("app/analysis/ai/[tool]/ResultView.tsx");
const rail = visible("app/analysis/ai/[tool]/ResultRail.tsx");
const sig = visible("app/analysis/ai/[tool]/signature-cards.tsx");
const frames = visible("app/analysis/ai/[tool]/empty-frames.tsx");
const fan = visible("app/components/viz/ScenarioFanChart.tsx");
const css = read("app/globals.css");

/* ── 시나리오 부채꼴 좌표(기존 시나리오 차트 규칙 재사용) ─────────────────────────── */
test("[1021] 부채꼴 — 낙관·기본·비관 끝 라벨 3개가 14px 이상 떨어지고, 연차 눈금 마지막은 고른 기간, 재료 없으면 null", () => {
  const s = buildPriceScenario({ startKrw: 1_820_000_000, startYm: "202608", yoyPct: 4.4, horizonMonths: 60 });
  assert.ok(s);
  const box = { width: 640, height: 240, padL: 48, padR: 64, padT: 14, padB: 24 };
  const l = layoutScenarioFan({ scenario: { startKrw: s!.startKrw, path: s!.path }, box });
  assert.ok(l?.fan);
  assert.deepEqual(l!.fan!.ends.map((e) => e.key), ["opt", "base", "pess"]);
  const ys = [...l!.fan!.ends].map((e) => e.labelY).sort((a, b) => a - b);
  for (let i = 1; i < ys.length; i++) assert.ok(ys[i] - ys[i - 1] >= 13.9, `라벨 간격 ${ys[i] - ys[i - 1]}`);
  assert.equal(l!.fan!.yearTicks.at(-1)?.year, 5);
  /* 출발점은 왼쪽 끝, 끝점은 오른쪽 끝 */
  assert.equal(l!.fan!.startX, box.padL);
  assert.equal(l!.fan!.ends[0].x, box.width - box.padR);
  /* 막대는 없다(barH 0) — 실거래 막대를 지어내지 않는다 */
  assert.ok(l!.bars.every((b) => b.hAll === 0));
  assert.equal(layoutScenarioFan({ scenario: null, box }), null);
  assert.equal(layoutScenarioFan({ scenario: { startKrw: 0, path: s!.path }, box }), null);
});

/* ── 빈 틀 도구 = 핵심 4종 ────────────────────────────────────────────────── */
test("[1021] 빈 틀을 쓰는 도구는 핵심 4종(진단·예측·동선·타이밍)과 같다 · 빈 틀 SVG 에는 글자·숫자가 없다", () => {
  assert.deepEqual([...FRAME_TOOLS], [...CORE_AI_TOOL_IDS]);
  assert.equal(isFrameTool("ai-risk"), false);
  assert.equal(isFrameTool("ai-diagnosis"), true);
  assert.doesNotMatch(frames, /<text/, "빈 틀에 글자가 있다 — 값 없는 틀에 라벨을 넣지 않는다");
  assert.doesNotMatch(frames, /#[0-9a-fA-F]{3,6}\b/, "빈 틀에 raw hex 색");
});

/* ── 워크벤치 뼈대 ─────────────────────────────────────────────────────────── */
test("[1021→1026→1026b] 워크벤치 — 12종 한 틀: 2열 그리드(base grid-cols-1 · minmax(0,1fr)_340px) + 규칙대로 된 레일 + 빈 틀 위 단지 고르기", () => {
  /* [1026b] 4종 분기(if (header && isFrameTool(tool)))와 나머지 8종의 옛 3칸 화면(380px 좌 열)이 한 틀로 합쳐졌다 */
  const i = workbench.indexOf("const condNode: ReactNode =");
  assert.ok(i > 0, "12종 공통 틀이 없다");
  const branch = workbench.slice(i);
  assert.doesNotMatch(workbench, /if \(header && isFrameTool\(tool\)\)|lg:grid-cols-\[380px_minmax\(0,1fr\)\]/, "옛 분기·옛 3칸 화면이 남았다");
  /* [1026] 레일 300 → 340(1025 표준) · 단지를 고른 뒤에만 2열([1026b] 경제지표 모니터는 단지 없이 늘) · 레일은 한 번만(폰은 본문 뒤로 이어진다) */
  assert.match(branch, /grid grid-cols-1 gap-3 lg:gap-6 \$\{twoCol \? "lg:grid-cols-\[minmax\(0,1fr\)_340px\]" : ""\}/);
  assert.match(branch, /const twoCol = isEconomy \|\| Boolean\(picked\);/);
  assert.match(branch, /flex min-w-0 flex-col gap-3 lg:sticky lg:top-\[76px\] lg:self-start/);
  assert.equal((branch.match(/<ResultRailLazy/g) ?? []).length, 1, "[1026] 레일은 한 번만 그린다");
  assert.match(branch, /<EmptyFrame tool=\{tool\} \/>/);
  assert.match(branch, /<ComplexPicker/);
  assert.match(branch, /<ResultViewLazy/);
  assert.match(branch, /<ResultRailLazy/);
  /* "이렇게 써요 ①②" 카드는 없다([1026b] 12종 모두 — 옛 8종의 첫 방문 안내도 걷었다) */
  assert.doesNotMatch(workbench.replace(/\/\*[\s\S]*?\*\//g, ""), /FirstVisitGuide|이렇게 써요/);
  /* 단지 줄 — 단지 바꾸기 · 지도에서 */
  assert.match(branch, /단지 바꾸기/);
  assert.match(branch, /지도에서/);
  /* 기존 로직 유지 — 딥링크·재계산·지도 서랍은 그대로 */
  assert.match(workbench, /sp\.get\("complexId"\)/);
  assert.match(workbench, /const run = useCallback\(async \(override\?/);
  /* 기간 칩 — 새 상태 없이 TuningForm 의 horizonMonths 로 */
  assert.match(branch, /horizonMonths: months/);
});

test("[1021] 머리 — 4종은 페르소나 전제문 없이 identity.useCase 한 줄 + 기준 시점 칩(있을 때만) · 면책은 그대로", () => {
  assert.match(page, /useCase: identity\.useCase/);
  assert.match(page, /header=\{complexHeader\}/);
  /* premise 는 4종이 아닌 히어로 분기 안에만 */
  const hero = page.slice(page.indexOf("{!complexHeader && ("), page.indexOf("<WorkbenchClient"));
  assert.match(hero, /persona\.premise/);
  assert.equal((page.match(/persona\.premise/g) ?? []).length, 1);
  assert.match(page, /data-ai-compliance="notice"/);
  assert.match(page, /export const revalidate = 86_400;/);
  /* [1026b] 머리는 header 가 있을 때(4종)만 — 8종은 서버 PageHead */
  assert.match(workbench, /\{header && \(/);
  assert.match(workbench, /headChip && \(/);
  assert.match(workbench, /\{header\.useCase\}/);
});

/* ── 결과 화면 — 대표 그림 → 타일 → 근거·출처 ───────────────────────────────── */
test("[1021→1026b] ResultView — 대표 그림 4종(+ 8종 ToolSignature) · 타일(VerdictTiles) · 근거·출처 카드 · 자세히 보기는 출처를 되풀이하지 않는다", () => {
  /* [1026b] variant="complex" 분기가 12종 공통 본문이 됐다(옛 8종 순서는 걷었다) */
  const i = resultView.indexOf("export function ResultView(");
  assert.ok(i > 0);
  assert.doesNotMatch(resultView, /variant === "complex"/);
  const branch = resultView.slice(i);
  for (const c of ["DiagnosisSignature", "PredictionSignature", "TimingSignature", "InspectionSignature", "VerdictTiles", "EvidenceCard", "ScenarioTables"]) {
    assert.match(branch, new RegExp(`<${c}`), c);
  }
  assert.match(branch, /hideEvidence/);
  assert.match(branch, /공공데이터 자동 계산/);
  /* 노트·관심·비교 버튼은 레일(ResultRail)로 — [1026] 다음 행동 카드(노트 링크는 next-action-routing · 관심 단지는 같은 훅 useWatchAdd)
     [1026b] 옛 8종의 버튼 줄(NextActions · 도구 색 채움)은 걷었다 — 12종 모두 레일 */
  assert.doesNotMatch(resultView, /export function NextActions|tool-fill/);
  assert.match(resultView, /export function useWatchAdd/);
  assert.match(rail, /useWatchAdd\(picked\)/);
  assert.match(rail, /verdictNextActions\(/);
  /* 근거 카드의 다음 행동은 next-action-routing */
  assert.match(resultView, /verdictNextActions\(\{ tool, verdict, complexId: picked\.id, complexName: picked\.name, region: picked\.region \}\)\.secondary/);
});

test("[1021] 대표 그림 — 기존 부품(ScoreRadar·Sparkline·시나리오 기하) 재사용 · 도보 시간·거리 없음 · raw hex 없음 · 굵기 800 없음", () => {
  assert.match(sig, /from "@\/app\/components\/viz\/ScoreRadar"/);
  assert.match(sig, /from "@\/app\/analysis\/Sparkline"/);
  assert.match(fan, /layoutScenarioFan/);
  assert.doesNotMatch(sig, /도보|km|분 뒤|\d+분/, "계산 함수가 없는 도보 시간·거리를 넣었다");
  for (const [name, src] of [["signature-cards", sig], ["ScenarioFanChart", fan], ["ResultRail", rail]] as const) {
    assert.doesNotMatch(src, /#[0-9a-fA-F]{3,6}\b/, `${name}: raw hex`);
    assert.doesNotMatch(src, /font-extrabold|font-black|fontWeight=\{?["']?8\d\d/, `${name}: 굵기 800`);
    assert.doesNotMatch(src, /rounded-\[\d+px\]/, `${name}: 임의 반경`);
  }
  /* 비관 = warning · 낙관 = success · 기본 = primary(도구 색) — dataviz 토큰 규칙 */
  assert.match(fan, /pess: "stroke-warning"/);
  assert.match(fan, /opt: "stroke-success"/);
  assert.match(fan, /base: "stroke-primary"/);
  /* 시나리오 "지금 대비"는 scenario 두 값의 비율(pctChange)만 — 새 계산 없음 */
  assert.match(sig, /pctChange\(last\.base, scenario\.startKrw\)/);
  /* 신호등 흐름선은 시계열이 있을 때만(result-series) — [1022] signalFlow(달·마지막 값 라벨 포함)로 바뀜, 2개 미만 규칙 그대로 */
  assert.match(sig, /flow && flow\.values\.length >= 2 &&/);
  /* 임장 동선 — 좌표가 없어 지도 카드는 없다(순서 목록만) */
  assert.doesNotMatch(sig, /MapFrame|<svg[^>]*map/i);
});

test("[1021→1026] 채움 파랑 — 레일 파일에 btn-primary 1개(네 도구 공통 \"임장노트에 담기\" · 도구별 초록·주황 채움 없음)", () => {
  assert.equal((rail.match(/\bbtn-primary\b/g) ?? []).length, 1);
  assert.doesNotMatch(rail, /btn-soft|tool-fill/);
  /* 폰 조작 하한 — 칩·버튼 40px */
  assert.match(rail, /min-h-\[40px\]/);
});

test("[1021] 리퀴드 목록은 흰 카드 안에서 data-tone=\"plain\" · 전역 CSS 는 맨 끝 append-only 블록", () => {
  const plain = (sig.match(/divide-y divide-line" data-tone="plain"/g) ?? []).length;
  assert.ok(plain >= 3, `data-tone="plain" ${plain}곳`);
  assert.match(resultView, /divide-y divide-line" data-tone="plain"/);
  const i = css.lastIndexOf("/* [1021 · 단지 분석 /analysis/ai]");
  assert.ok(i > 0, "1021 단지 분석 CSS 블록이 없다");
  const block = css.slice(i);
  for (const c of [".cxw-frame", ".cxw-frame-svg", ".cxw-radar svg", ".cxw-score"]) assert.ok(block.includes(c), c);
  assert.doesNotMatch(block, /gradient|#[0-9a-fA-F]{6}\b|font-weight:\s*8/);
});
