import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { layoutScenarioFan } from "../../app/components/viz/price-chart-geometry.ts";
import { buildPriceScenario } from "../../lib/ai/price-scenarios.ts";
import { scenarioBreakEven } from "../../lib/ai/scenario-breakeven.ts";
import { loanCalc } from "../../lib/ai/loan-calc.ts";
import { RADAR_AXIS_FOLLOW_UP, RADAR_AXIS_LOW, radarAxisFollowUp } from "../../lib/ai/next-action-routing.ts";
import {
  countSignals,
  decodeSignalCombo,
  encodeSignalCombo,
  previousEntry,
  scoreHistoryLine,
  shouldRecord,
  signalComboText,
  signalHistoryLine,
} from "../../lib/ai/history-compare.ts";
import type { HistoryEntry } from "../../lib/ai/history-store.ts";
import { PREDICTION_COST_FIELDS } from "../../app/analysis/ai/[tool]/prediction-cost-fields.ts";
import { tuningFields } from "../../lib/ai/tool-tuning-fields.ts";

/* [1022] 지시 3 — 종합 진단·시세 예측·매수 타이밍 고도화. 순수 함수는 값으로, 화면 구조는 소스 문자열로 잠근다
   (클라이언트 컴포넌트는 node --test 로 실행할 수 없다). */

const read = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");
const visible = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const sig = visible("app/analysis/ai/[tool]/signature-cards.tsx");
const resultView = visible("app/analysis/ai/[tool]/ResultView.tsx");
const rail = visible("app/analysis/ai/[tool]/ResultRail.tsx");
const workbench = visible("app/analysis/ai/[tool]/WorkbenchClient.tsx");
const page = visible("app/analysis/ai/[tool]/page.tsx");
const fan = visible("app/components/viz/ScenarioFanChart.tsx");
const radar = visible("app/components/viz/ScoreRadar.tsx");
const css = read("app/globals.css");
const ENGINE = read("lib/ai/analysis-engine.ts");

/* ── 시세 예측 ① 비용 포함 손익분기 — loan-calc 의 보유 기간 이자 + 출발 가격, 재료 없으면 null ─────────── */
test("[1022] 손익분기 = 출발 가격 + 시나리오 기간 동안 낸 이자(loanCalc holdingInterestKrw) · 대출 비율·금리가 없으면 null", () => {
  const start = 650_000_000;
  const be = scenarioBreakEven({ startKrw: start, years: 3, ltvPct: "60", ratePct: "4.2" });
  assert.ok(be);
  const loan = loanCalc({ priceKrw: start, priceKind: "input", ltvPct: 60, ratePct: 4.2, holdingYears: 3 });
  assert.ok(loan && loan.holdingInterestKrw != null);
  assert.equal(be!.interestKrw, loan!.holdingInterestKrw);
  assert.equal(be!.krw, start + loan!.holdingInterestKrw!);
  assert.ok(be!.krw > start, "이자가 양수면 손익분기는 출발 가격보다 높다");
  assert.equal(be!.years, 3);
  /* 상환 기간을 비우면 loan-calc 규칙(30년)대로 — 새 기본값을 만들지 않는다 */
  assert.equal(be!.loan.termYears, 30);
  assert.equal(be!.loan.termAssumed, true);
  assert.equal(scenarioBreakEven({ startKrw: start, years: 3, ltvPct: "", ratePct: "4.2" }), null);
  assert.equal(scenarioBreakEven({ startKrw: start, years: 3, ltvPct: "60", ratePct: undefined }), null);
  assert.equal(scenarioBreakEven({ startKrw: null, years: 3, ltvPct: "60", ratePct: "4.2" }), null);
  assert.equal(scenarioBreakEven({ startKrw: start, years: 0, ltvPct: "60", ratePct: "4.2" }), null);
});

test("[1022] 부채꼴 안내선(guides) — 값이 y 범위에 들어가 그림 안에 놓이고, 없으면 빈 배열(기존 좌표 그대로)", () => {
  const s = buildPriceScenario({ startKrw: 650_000_000, startYm: "202608", yoyPct: 2, horizonMonths: 36 });
  assert.ok(s);
  const box = { width: 640, height: 240, padL: 48, padR: 64, padT: 14, padB: 24 };
  const plain = layoutScenarioFan({ scenario: { startKrw: s!.startKrw, path: s!.path }, box });
  assert.ok(plain?.fan);
  assert.deepEqual(plain!.guides, []);
  /* 낙관 끝값보다 높은 손익분기 — 범위가 늘어나 선이 plotTop 아래에 놓인다 */
  const high = s!.path[s!.path.length - 1].opt * 1.2;
  const withGuide = layoutScenarioFan({ scenario: { startKrw: s!.startKrw, path: s!.path }, guides: [high], box });
  assert.ok(withGuide?.fan);
  assert.equal(withGuide!.guides.length, 1);
  assert.equal(withGuide!.guides[0].valueKrw, high);
  assert.ok(withGuide!.guides[0].y >= withGuide!.plotTop, `안내선 y ${withGuide!.guides[0].y} < plotTop ${withGuide!.plotTop}`);
  assert.ok(withGuide!.guides[0].y < withGuide!.fan!.ends.find((e) => e.key === "opt")!.y, "손익분기가 낙관 끝값보다 위(작은 y)");
  /* 0·음수·NaN 은 그리지 않는다 */
  assert.deepEqual(layoutScenarioFan({ scenario: { startKrw: s!.startKrw, path: s!.path }, guides: [0, -1, Number.NaN], box })!.guides, []);
});

test("[1022] 시세 예측 내 조건 — 대출 비율·금리·상환 기간은 엔진이 실제로 읽는 키(calc)만, 기존 필드 뒤에 붙는다", () => {
  assert.deepEqual(
    PREDICTION_COST_FIELDS.map((f) => f.key),
    ["ltvPct", "mortgageRatePct", "loanTermYears"],
  );
  for (const f of PREDICTION_COST_FIELDS) {
    assert.ok(ENGINE.includes(`in_.${f.key}`), `엔진이 읽지 않는 입력 ${f.key}`);
    assert.equal(f.calc, true, `${f.key} 는 손익분기 선이 실제로 쓴다 — calc`);
  }
  const base = tuningFields("ai-prediction").map((f) => f.key);
  for (const f of PREDICTION_COST_FIELDS) assert.ok(!base.includes(f.key), `${f.key} 중복`);
  assert.match(page, /tid === "ai-prediction" \? \[\.\.\.tuningFields\(tid\), \.\.\.PREDICTION_COST_FIELDS\] : tuningFields\(tid\)/);
  /* 워크벤치 → ResultView 로 내 조건 현재 값이 간다(손익분기 선은 입력 즉시) */
  assert.match(workbench, /tuning=\{tuning\}/);
  assert.match(resultView, /scenarioBreakEven\(\{ startKrw: scenario\.startKrw, years: scenario\.years, ltvPct: tuning\.ltvPct, ratePct: tuning\.mortgageRatePct, termYears: tuning\.loanTermYears \}\)/);
});

/* ── 시세 예측 ② 시나리오 강조 · ③ 연평균 ───────────────────────────────────────────── */
test("[1022] 시나리오 강조 — 부채꼴(focus·onFocus)과 해마다 표(focus)가 같은 상태를 본다 · 지금 대비 옆 연평균은 scenario.annual.base", () => {
  assert.match(resultView, /const \[scenarioFocus, setScenarioFocus\] = useState<ScenarioKey \| null>\(null\)/);
  assert.match(resultView, /focus=\{scenarioFocus\}\s+onFocus=\{setScenarioFocus\}/);
  assert.match(resultView, /<ScenarioTables[^>]*focus=\{scenarioFocus\}/);
  assert.match(sig, /aria-pressed=\{on\}/);
  assert.match(sig, /onFocus\?\.\(on \? null : k\)/);
  assert.match(sig, /연평균 \{signedPct\(scenario\.annual\.base\)\}/);
  /* 부채꼴: 강조 안 된 선은 흐리게(값은 그대로), 손익분기 선은 재료가 있을 때만 */
  assert.match(fan, /focus && focus !== k \? 0\.3 : 1/);
  assert.match(fan, /\{guide && breakEven && \(/);
  assert.match(fan, /strokeDasharray="4 3"/);
  /* 폰에서 잘리지 않게 — svg 는 max-w-full, 폭은 컨테이너를 잰다 */
  assert.match(fan, /className="block max-w-full"/);
  assert.match(fan, /useWidth<HTMLDivElement>\(\)/);
});

/* ── 종합 진단 ① 축별 이어서 볼 도구 · ② 이전 점수 · ④ 근거 요약 ──────────────────────── */
test("[1022] 축별 이어서 볼 도구 — 5축 전부 실존 도구 딥링크(?complexId=) · 낮음 기준은 화면 색 규칙과 같은 50점 미만", () => {
  assert.deepEqual(Object.keys(RADAR_AXIS_FOLLOW_UP).sort(), ["field", "liquidity", "macro", "momentum", "supply"]);
  assert.equal(RADAR_AXIS_LOW, 50);
  assert.match(sig, /score < 50 \? "text-warning"/, "signature-cards scoreTone 의 주의 경계가 50 이 아니다 — RADAR_AXIS_LOW 와 맞춰라");
  const t = radarAxisFollowUp("liquidity", 32, "abc def");
  assert.deepEqual(t, { label: "매수 타이밍", href: "/analysis/ai/ai-timing?complexId=abc%20def" });
  assert.equal(radarAxisFollowUp("liquidity", 50, "x"), null, "50점은 링크 없음");
  assert.equal(radarAxisFollowUp("liquidity", null, "x"), null, "자료 없음은 링크 없음");
  assert.equal(radarAxisFollowUp("nope", 10, "x"), null);
  assert.equal(radarAxisFollowUp("macro", 10, null)?.href, "/analysis/ai/ai-simulator");
  assert.match(sig, /radarAxisFollowUp\(a\.key, a\.score, complexId \?\? null\)/);
});

test("[1022] 이전 실행 기록 — 같은 날 같은 값은 다시 저장하지 않고, 지난번 점수·신호 조합을 한 줄로", () => {
  const now = new Date("2026-09-28T03:00:00Z");
  const e = (createdAt: string, score: number | null, oneLine: string | null = null): HistoryEntry => ({ tool: "ai-diagnosis", groupKey: "k", score, oneLine, createdAt });
  const entries = [e("2026-09-28T02:00:00Z", 74), e("2026-09-20T02:00:00Z", 72), e("2026-09-01T02:00:00Z", 60)];
  /* 지금(첫 항목)을 뺀 가장 최근 = 9.20 */
  assert.equal(previousEntry(entries, "2026-09-28T02:00:00Z")?.score, 72);
  assert.equal(scoreHistoryLine(entries, { score: 74, createdAt: "2026-09-28T02:00:00Z" }, now), "지난번 72점(9.20) → 지금 74점");
  assert.equal(scoreHistoryLine([], { score: 74, createdAt: "x" }, now), null, "이전 기록 없음");
  assert.equal(scoreHistoryLine(entries, { score: null, createdAt: "x" }, now), null, "지금 점수 없음");
  /* 다른 해는 연도까지 */
  assert.equal(scoreHistoryLine([e("2025-12-03T02:00:00Z", 55)], { score: 60, createdAt: "2026-09-28T02:00:00Z" }, now), "지난번 55점(2025.12.3) → 지금 60점");
  /* 저장 규칙 — 같은 날(KST) 같은 점수면 건너뛰고, 점수가 바뀌면 같은 날이라도 저장 */
  assert.equal(shouldRecord(entries, { score: 74, oneLine: null, createdAt: "2026-09-28T05:00:00Z" }), false);
  assert.equal(shouldRecord(entries, { score: 75, oneLine: null, createdAt: "2026-09-28T05:00:00Z" }), true);
  assert.equal(shouldRecord(entries, { score: 74, oneLine: null, createdAt: "2026-09-29T05:00:00Z" }), true);
  assert.equal(shouldRecord([], { score: 74, oneLine: null, createdAt: "2026-09-29T05:00:00Z" }), true);
  assert.equal(shouldRecord(entries, { score: 74, oneLine: null, createdAt: "2026-09-28T02:00:00Z" }), false, "같은 computedAt");
  /* 신호 조합 — 자료 없음은 세지 않고, 0 인 것은 적지 않는다 */
  const c = countSignals(["green", "green", "red", "na"]);
  assert.deepEqual(c, { green: 2, yellow: 0, red: 1 });
  assert.equal(encodeSignalCombo(c), "g2y0r1");
  assert.deepEqual(decodeSignalCombo("g2y0r1"), c);
  assert.equal(decodeSignalCombo("nope"), null);
  assert.equal(signalComboText(c), "좋음 2 : 주의 1");
  assert.equal(signalComboText({ green: 0, yellow: 0, red: 0 }), null);
  const tl = [e("2026-09-28T02:00:00Z", null, "g1y1r1"), e("2026-09-20T02:00:00Z", null, "g2y0r1")];
  assert.equal(signalHistoryLine(tl, "2026-09-28T02:00:00Z", now), "지난번 좋음 2 : 주의 1(9.20)");
  assert.equal(signalHistoryLine([e("2026-09-28T02:00:00Z", null, "g1y1r1")], "2026-09-28T02:00:00Z", now), null);
  /* 화면 — 종합 진단은 단지, 매수 타이밍은 지역 키. 저장은 verdict.computedAt 기준 */
  assert.match(resultView, /buildGroupKey\(tool, \[picked\.id\]\)/);
  assert.match(resultView, /buildGroupKey\(tool, \[ctx\.region\.name\]\)/);
  assert.match(resultView, /createdAt: verdict\?\.computedAt \?\? null/);
  assert.match(resultView, /근거 \$\{evidenceN\}개 · 오래된 자료 \$\{staleN\}개/);
  assert.match(resultView, /e\.confidence === "stale"/);
});

/* ── 매수 타이밍 ① 흐름선 더 길게 + 마지막 값 · ③ 이 지역 알림 ─────────────────────────────── */
test("[1022] 신호 흐름선 — 최근 12개월 창 · 가격은 거래 없는 달을 건너뛰고 2개 미만이면 없음 · 마지막 값 라벨 · 레일에 이 지역 알림(링크만)", () => {
  assert.match(sig, /export const SIGNAL_FLOW_MONTHS = 12/);
  assert.match(sig, /series\.months\.slice\(-SIGNAL_FLOW_MONTHS\)/);
  assert.match(sig, /months\.filter\(\(m\) => m\.avgMan != null\)/);
  assert.match(sig, /if \(pts\.length < 2\) return null/);
  assert.match(sig, /lastLabel: formatKrwWon\(\(last\.avgMan as number\) \* 10_000, \{ style: "short" \}\)/);
  assert.match(sig, /lastLabel: `\$\{last\.nAll\.toLocaleString\("ko-KR"\)\}건`/);
  assert.match(sig, /<Sparkline values=\{flow\.values\} width=\{320\} height=\{56\}/);
  assert.match(sig, /cxw-flow-last/);
  /* 입주 물량 신호는 시계열이 없다 — 그리지 않는다 */
  assert.match(sig, /return null;\n\}/);
  assert.match(rail, /tool === "ai-timing" && picked && \(/);
  assert.match(rail, /<RailCard title="이 지역 알림">/);
  assert.match(rail, /href="\/notifications"/);
  assert.match(rail, /<Icon name="bell"/);
  /* 새 알림 API 를 만들지 않았다 */
  assert.doesNotMatch(rail, /fetch\(/);
});

/* ── 셋 다: 한 줄 요약 세 토막 ──────────────────────────────────────────────────── */
test("[1022] 한 줄 요약 세 토막(SummaryLine: headline · bandReason · 기준 시점)이 진단·예측·타이밍 카드 맨 위에 같은 부품으로", () => {
  assert.match(sig, /export function SummaryLine\(/);
  assert.match(sig, /cxw-sum-h t-body font-bold text-ink/);
  assert.match(sig, /cxw-sum-r t-sub text-text-2/);
  assert.match(sig, /cxw-sum-t t-caption tabular-nums text-text-3/);
  assert.equal((sig.match(/<SummaryLine /g) ?? []).length, 4, "진단 1 · 예측 2(자료 없음 분기 포함) · 타이밍 1");
  /* 세 카드 모두 asOf 를 받는다 */
  for (const c of ["DiagnosisSignature", "PredictionSignature", "TimingSignature"]) {
    assert.match(resultView, new RegExp(`<${c}[\\s\\S]*?asOf=\\{asOf\\}`), c);
  }
  /* 규칙 — raw hex · 굵기 800 · 임의 반경 · 임의 px 없음. ScoreRadar 의 800 도 700 으로 */
  for (const [name, src] of [["signature-cards", sig], ["ScenarioFanChart", fan], ["ResultRail", rail], ["ScoreRadar", radar]] as const) {
    assert.doesNotMatch(src, /#[0-9a-fA-F]{3,6}\b/, `${name}: raw hex`);
    assert.doesNotMatch(src, /font-extrabold|font-black|fontWeight=\{?["']?8\d\d/, `${name}: 굵기 800`);
    assert.doesNotMatch(src, /rounded-\[\d+px\]|text-\[\d+px\]/, `${name}: 임의 반경·px`);
  }
  /* 폰 40px 하한 — 범례·기간 칩 */
  assert.ok((sig.match(/min-h-\[40px\]/g) ?? []).length >= 2);
  /* CSS — 맨 끝 append-only 블록, 토큰만 */
  const i = css.lastIndexOf("/* [1022 · 단지 분석 고도화]");
  assert.ok(i > 0, "1022 단지 분석 CSS 블록이 없다");
  const block = css.slice(i);
  for (const c of [".cxw-sum", ".cxw-sum-h", ".cxw-flow", ".cxw-flow-last"]) assert.ok(block.includes(c), c);
  assert.doesNotMatch(block, /gradient|#[0-9a-fA-F]{6}\b|font-weight:\s*8|font-size:\s*\d/);
});

/* ── 없는 데이터는 넣지 않았다 ─────────────────────────────────────────────────────── */
test("[1022] 지역 평균 레이더 겹치기는 지역 축 점수가 없어 넣지 않았다 · 도보 시간·거리 없음", () => {
  assert.doesNotMatch(radar, /regionAvg|region-avg|지역 평균 점/);
  assert.doesNotMatch(sig, /regionRadar|지역 평균 겹/);
  assert.doesNotMatch(sig, /도보|km|분 뒤|\d+분/);
});
