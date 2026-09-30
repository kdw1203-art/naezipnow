import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  BAND_CHIP_CLASS,
  SIGNAL_FOLLOW_UP,
  TOOL_FOLLOW_UP,
  basisFact,
  conclusionNext,
  weakestAxis,
  weakestSignal,
} from "../../lib/ai/conclusion-next.ts";
import { RADAR_AXIS_FOLLOW_UP } from "../../lib/ai/next-action-routing.ts";
import { FRAME_TOOLS } from "../../app/analysis/ai/[tool]/frame-tools.ts";
import { toolSteps } from "../../lib/ai/tool-steps.ts";
import { RAIL_PRIMARY } from "../../lib/ai/conclusion-next.ts";

/* [1026 · 단지 분석 4종] /analysis/ai/{ai-diagnosis,ai-prediction,ai-inspection,ai-timing} 에 1025 표준 —
   절차 한 줄 · 결론 히어로(t-title + 판정 칩 + 다음 행동 한 줄 + 다른 도구 칩 줄) · 대표 그림 · 세부 접힘 · 레일 340(내 조건 +
   다음 행동 카드: 채움 파랑 "임장노트에 담기" 1 + 텍스트 링크) · 폰 하단 바 · 도구별 초록·주황 채움 제거 · 빈 상태 1025 방식.
   순수 함수는 값으로, 화면 구조는 소스 문자열로 잠근다(클라이언트 컴포넌트는 node --test 로 실행할 수 없다). */

const read = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");
const visible = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const workbenchRaw = read("app/analysis/ai/[tool]/WorkbenchClient.tsx");
const workbench = visible("app/analysis/ai/[tool]/WorkbenchClient.tsx");
const resultView = visible("app/analysis/ai/[tool]/ResultView.tsx");
const rail = visible("app/analysis/ai/[tool]/ResultRail.tsx");
const sig = visible("app/analysis/ai/[tool]/signature-cards.tsx");
const board = visible("app/analysis/ai/[tool]/VerdictBoard.tsx");
const page = visible("app/analysis/ai/[tool]/page.tsx");
const frames = visible("app/analysis/ai/[tool]/empty-frames.tsx");

const branchOf = (src: string, from: string, to: string) => {
  const i = src.indexOf(from);
  assert.ok(i >= 0, `${from} 없음`);
  const j = src.indexOf(to, i);
  return src.slice(i, j > i ? j : undefined);
};
/* [1026b] 4종 분기가 12종 공통 틀이 됐다 — 틀 = 내 조건 조립부터 파일 끝 · 결과 본문 = ResultView 함수 전체(옛 8종 순서는 걷었다) */
const frameBranch = branchOf(workbench, "const condNode: ReactNode =", "\u0000");
const complexBranch = branchOf(resultView, "export function ResultView(", "\u0000");

/* 캡처(before1026 · 공작아파트 안양 동안구 2026.08) 그대로의 재료 */
const RADAR = [
  { key: "momentum", label: "가격 흐름", score: 67, basis: "지역 시세 한 달 +1.03%" },
  { key: "liquidity", label: "거래 활발", score: 100, basis: "지역 한 달 거래 448건" },
  { key: "supply", label: "공급 여유", score: 0, basis: "앞으로 입주 4,169세대" },
  { key: "field", label: "이웃 평가", score: null, basis: "공개 임장노트 없음" },
  { key: "macro", label: "금리 환경", score: 60, basis: "기준금리 3%" },
];
const SIGNALS = [
  { key: "price", label: "가격 흐름", state: "red" as const, basis: "지역 시세 한 달 +1.03% — 빠르게 오르는 중이라 따라 사기 조심" },
  { key: "volume", label: "거래 열기", state: "red" as const, basis: "지역 한 달 거래 448건 — 거래가 몰려 파는 쪽이 유리해요" },
  { key: "supply", label: "입주 물량", state: "green" as const, basis: "앞으로 입주 4,169세대 — 입주 무렵 매물이 늘어 고르기 쉬워질 수 있어요" },
];

/* ── 결론 히어로의 다음 행동 한 줄 — 순수 함수 ─────────────────────────────────────── */
test("[1026] 다음 행동 한 줄 — 종합 진단은 가장 낮은 축(50점 미만) → 기존 축 매핑 도구 · 근거 사실 토막을 그대로", () => {
  const n = conclusionNext({ tool: "ai-diagnosis", complexId: "abc def", radar: RADAR });
  assert.deepEqual(n, {
    lead: "공급 여유 0점",
    label: "리스크 점검에서 앞으로 입주 4,169세대 확인",
    href: "/analysis/ai/ai-risk?complexId=abc%20def",
  });
  /* 축 → 도구 매핑은 next-action-routing 그대로(새 매핑 없음) */
  assert.equal(RADAR_AXIS_FOLLOW_UP.supply.tool, "ai-risk");
  /* 점수 없는 축(이웃 평가 —)은 가장 약한 축이 아니다 */
  assert.equal(weakestAxis(RADAR)?.key, "supply");
  assert.equal(weakestAxis([{ key: "field", label: "이웃 평가", score: null, basis: "" }]), null);
  /* 모든 축이 50점 이상이면 약한 곳 없음 → 도구 기본 이어서 보기(임장 동선) · lead 빈 문자열 */
  const ok = conclusionNext({ tool: "ai-diagnosis", complexId: "x", radar: RADAR.map((a) => ({ ...a, score: a.score == null ? null : 70 })) });
  assert.deepEqual(ok, { lead: "", label: TOOL_FOLLOW_UP["ai-diagnosis"].label, href: "/analysis/ai/ai-inspection?complexId=x" });
});

test("[1026] 다음 행동 한 줄 — 매수 타이밍은 주의 신호 먼저(없으면 보통) · 시세 예측은 기본 연평균 · 임장 동선은 함께 볼 단지 수 · 나머지 8종은 null", () => {
  assert.deepEqual(conclusionNext({ tool: "ai-timing", complexId: "c1", signals: SIGNALS }), {
    lead: "가격 흐름 주의",
    label: "시세 예측에서 지역 시세 한 달 +1.03% 확인",
    href: "/analysis/ai/ai-prediction?complexId=c1",
  });
  const yellow = SIGNALS.map((s) => (s.key === "supply" ? { ...s, state: "yellow" as const } : { ...s, state: "green" as const }));
  assert.equal(weakestSignal(yellow)?.key, "supply");
  assert.equal(conclusionNext({ tool: "ai-timing", complexId: "c1", signals: yellow })?.href, "/analysis/ai/ai-risk?complexId=c1");
  const allGreen = SIGNALS.map((s) => ({ ...s, state: "green" as const }));
  assert.equal(conclusionNext({ tool: "ai-timing", complexId: "c1", signals: allGreen })?.label, TOOL_FOLLOW_UP["ai-timing"].label);
  assert.deepEqual(Object.keys(SIGNAL_FOLLOW_UP).sort(), ["price", "supply", "volume"]);
  /* 시세 예측 — scenario.annual.base 를 그대로(signedPct) */
  assert.deepEqual(conclusionNext({ tool: "ai-prediction", complexId: "c1", annualBasePct: 4 }), {
    lead: "기본 연 +4%",
    label: "매수 타이밍에서 신호 3개 확인",
    href: "/analysis/ai/ai-timing?complexId=c1",
  });
  assert.equal(conclusionNext({ tool: "ai-prediction", complexId: null, annualBasePct: null })?.href, "/analysis/ai/ai-timing");
  assert.equal(conclusionNext({ tool: "ai-inspection", complexId: "c1", similarCount: 4 })?.lead, "함께 볼 단지 4곳");
  for (const t of ["ai-risk", "ai-compare", "ai-simulator", "ai-gap", "ai-economy", "contract-risk", "my-checklist", "ai-portfolio"] as const) {
    assert.equal(conclusionNext({ tool: t, complexId: "c1", radar: RADAR, signals: SIGNALS }), null, t);
  }
  /* 근거 사실 토막 — " — " 앞만, 자료 없음 문장은 버린다 */
  assert.equal(basisFact("지역 한 달 거래 448건 — 거래가 몰려 파는 쪽이 유리해요"), "지역 한 달 거래 448건");
  assert.equal(basisFact("지역 시세 자료가 없어요"), null);
  assert.equal(basisFact("공개 임장노트 없음"), null);
  /* 이어서 볼 곳은 전부 실존 도구 라우트 */
  for (const t of FRAME_TOOLS) assert.match(conclusionNext({ tool: t, complexId: "z" })!.href, /^\/analysis\/ai\/ai-(risk|timing|prediction|diagnosis|inspection)\?complexId=z$/);
});

test("[1026] 판정 칩 색 — 좋음 success · 보통 primary · 주의 warning · 자료 부족 회색(1025 표준 토큰)", () => {
  assert.deepEqual(BAND_CHIP_CLASS, {
    strong: "bg-success-soft text-success",
    mixed: "bg-primary-soft text-primary",
    weak: "bg-warning-soft text-warning",
    thin: "bg-bg text-text-3",
  });
});

/* ── 결론 히어로 · 대표 그림 ─────────────────────────────────────────────────────── */
test("[1026] 결론 히어로 — t-title 결론 + 판정 칩 하나(BAND_CHIP_CLASS) + 근거 한 줄 + 다음 행동 한 줄 + 다른 도구 칩 줄, 네 도구가 같은 부품", () => {
  const hero = branchOf(sig, "export function SummaryLine(", "function scoreTone(");
  assert.match(hero, /<h2 className="cxw-sum-h min-w-0 flex-1 t-title font-bold text-ink/);
  assert.match(hero, /BAND_CHIP_CLASS\[verdict\.band\]/);
  assert.match(hero, /<Link href=\{next\.href\}/);
  assert.match(hero, /\{tools\}/);
  /* 판정 칩은 히어로 하나 — 점수 옆·타이밍 오른쪽의 알약(verdict-band)은 없다 */
  assert.doesNotMatch(sig, /verdict-band/);
  assert.equal((sig.match(/<SummaryLine\s/g) ?? []).length, 5);
  for (const c of ["DiagnosisSignature", "PredictionSignature", "TimingSignature", "InspectionSignature"]) {
    assert.match(complexBranch, new RegExp(`<${c}[\\s\\S]*?next=\\{next\\}[\\s\\S]*?tools=\\{tools\\}`), c);
  }
  /* 다음 행동 한 줄 = conclusionNext · 칩 줄 = VerdictChips · 결론 머리의 단지명은 걷는다(문장 그대로) */
  assert.match(complexBranch, /conclusionNext\(\{/);
  assert.match(complexBranch, /<VerdictChips tool=\{tool\}/);
  assert.match(complexBranch, /verdict\.headline\.startsWith\(namePrefix\)/);
  /* 대표 그림은 히어로 카드 안 바로 아래 — 기존 그림(ScoreRadar·ScenarioFanChart·Sparkline) 그대로 */
  assert.match(sig, /<ScoreRadar items=\{radar\} \/>/);
  assert.match(sig, /<ScenarioFanChart/);
  assert.match(sig, /<Sparkline values=\{flow\.values\}/);
  /* 폰에서는 결론 글자 폭 먼저 — 타이밍 점 3개는 sm 미만에서 숨긴다 */
  assert.match(sig, /max-sm:hidden" aria-hidden="true"/);
});

test("[1026] 다른 도구 칩 줄 — 보드와 같은 훅(사람 게이트) · 도구 4 + 임장 동선 · 지금 도구는 표식 · 40px", () => {
  assert.match(board, /function useBoardTiles\(/);
  assert.match(board, /const armed = useHumanGate\(sectionRef\)/);
  const chips = branchOf(board, "export function VerdictChips(", "export function VerdictBoard(");
  assert.match(chips, /BOARD_TOOLS\.map/);
  assert.match(chips, /aria-current="page"/);
  assert.match(chips, /\/analysis\/ai\/ai-inspection\$\{q\}/);
  assert.match(chips, /min-h-\[40px\]/);
  assert.match(chips, /BAND_CHIP_CLASS\[x\.item\.band\]/);
  /* 맨 아래 보드는 걷었다 — [1026b] 나머지 8종도(보드 부품 자체가 없다) */
  assert.doesNotMatch(workbench, /VerdictBoardLazy/);
  assert.doesNotMatch(board, /export function VerdictBoard\(/);
});

/* ── 세부 접힘 ─────────────────────────────────────────────────────────────── */
test("[1026] 세부 — 실거래가 흐름은 진단·예측·타이밍 데스크톱 펼침/폰 닫힘, 임장 동선 닫힘 · 근거·출처는 닫힌 <details>(근거 N개 · 오래된 자료 N개)", () => {
  assert.match(complexBranch, /fold=\{tool === "ai-inspection" \? "closed" : "wide"\}/);
  assert.match(resultView, /window\.matchMedia\?\.\("\(min-width: 1024px\)"\)\.matches === true/);
  assert.match(resultView, /<details className="card group rounded-2xl p-4 max-md:p-3\.5" open=\{open\} onToggle=/);
  /* 요약 줄 안에 누르는 것(ⓘ) 없음 — 읽는 법은 펼친 뒤 */
  const fold = branchOf(resultView, "function FoldCard(", "function PriceFlowCard(");
  assert.doesNotMatch(fold, /Explain/);
  const ev = branchOf(resultView, "function EvidenceCard(", "export function ResultView(");
  assert.match(ev, /<details className="card group rounded-2xl p-4 max-md:p-3\.5" aria-label="근거 · 출처">/);
  assert.doesNotMatch(ev, /<details[^>]*\sopen/);
  assert.match(ev, /근거 \$\{evidenceN\}개 · 오래된 자료 \$\{staleN\}개/);
  /* 순서 — 히어로(그림) → KPI → 폰 내 조건 → 해마다 → AI 해설 → 실거래 흐름 → 근거 → 자세히 */
  const order = ["<DiagnosisSignature", "<VerdictTiles", "{phoneCondition &&", "<ScenarioTables", "{narrative}", "<PriceFlowCard", "<EvidenceCard", "<Details"];
  const at = order.map((k) => complexBranch.indexOf(k));
  for (let i = 0; i < at.length; i++) assert.ok(at[i] > 0, order[i]);
  for (let i = 1; i < at.length; i++) assert.ok(at[i] > at[i - 1], `${order[i - 1]} → ${order[i]}`);
  /* KPI 4칸은 그대로(VerdictTiles · 한 줄 sm:grid-cols-4) */
  assert.match(read("app/analysis/ai/[tool]/VerdictCard.tsx"), /tiles\.length >= 4 \? "sm:grid-cols-4"/);
});

/* ── 절차 · 레일 · 액션 ────────────────────────────────────────────────────────── */
test("[1026] 절차 한 줄 — StepLine 하나(단지 · {단지명} → 내 조건 → 결과 · {판정} → 다음 행동) · 섹션 점 파랑 하나", () => {
  assert.match(workbench, /import \{ StepLine \} from "@\/app\/components\/StepLine"/);
  assert.equal((frameBranch.match(/<StepLine/g) ?? []).length, 1);
  /* [1026b] 단계 재료는 lib/ai/tool-steps(12종 공통) — 4종은 예전과 같은 네 칸 */
  assert.match(frameBranch, /<StepLine current=\{flow\.current\} steps=\{flow\.steps\} \/>/);
  assert.match(frameBranch, /bandLabel: shownVerdict\?\.bandLabel \?\? null/);
  for (const tool of FRAME_TOOLS) {
    const before = toolSteps({ tool, pickedName: null, ready: false });
    assert.deepEqual(before.steps.map((x) => x.label), ["단지", "내 조건", "결과", "다음 행동"], tool);
    assert.equal(before.current, 0);
    const after = toolSteps({ tool, pickedName: "공작아파트", ready: true, bandLabel: "보통" });
    assert.deepEqual(after.steps, [{ label: "단지 · 공작아파트" }, { label: "내 조건" }, { label: "결과", note: "보통" }, { label: "다음 행동" }], tool);
    assert.equal(after.current, 2);
  }
  assert.match(frameBranch, /<div className="nz-dot-blue flex flex-col gap-3">/);
});

test("[1026] 레일 340 · 한 번만 — 내 조건(lg · 다시 계산은 보조 버튼) + 다음 행동 카드(채움 파랑 1 + 텍스트 링크) · 폰은 MobilePrimaryBar 가 같은 요소", () => {
  assert.match(frameBranch, /lg:grid-cols-\[minmax\(0,1fr\)_340px\]/);
  assert.equal((frameBranch.match(/<ResultRailLazy/g) ?? []).length, 1);
  /* 채움 파랑은 레일 파일의 한 리터럴 — 데스크톱 카드(lg)와 폰 하단 바가 같은 요소(primary)를 나눠 그린다 */
  assert.equal((rail.match(/\bbtn-primary\b/g) ?? []).length, 1);
  assert.match(rail, /<div className="max-lg:hidden">\{primary\}<\/div>/);
  /* [1026b] 주 행동 글자는 도구별 표(RAIL_PRIMARY) — 4종은 "임장노트에 담기" 그대로 */
  assert.match(rail, /<MobilePrimaryBar label=\{spec\.label\}>\{primary\}<\/MobilePrimaryBar>/);
  for (const t of FRAME_TOOLS) assert.deepEqual(RAIL_PRIMARY[t], { kind: "note", label: "임장노트에 담기" }, t);
  assert.match(rail, /verdictNextActions\(\{ tool, verdict, complexId: picked\.id, complexName: picked\.name, region: picked\.region, noteHandoff: true \}\)\.primary\.href/);
  /* 텍스트 링크 — 결정 카드(비교함 → /decide 후보) · 관심 단지(같은 훅) · AI 해설(게스트는 로그인) · 결과 링크 */
  assert.match(rail, /href="\/decide"/);
  assert.match(rail, /addToCompareTray\(\{ id: it\.id, name: it\.name, region: it\.region \}\)/);
  assert.match(rail, /onClick=\{\(\) => addDecide\(\[picked\]\)\}/);
  assert.match(rail, /결정 카드에 담기/);
  assert.match(rail, /useWatchAdd\(picked\)/);
  assert.match(rail, /AI 해설 받기 <span className="font-medium text-text-3">\(로그인\)<\/span>/);
  assert.match(rail, /\/login\?callbackUrl=/);
  /* 도구별 초록·주황 채움 없음 — btn-soft·tool-fill·도구별 분기 없음. 알림은 링크 하나 */
  assert.doesNotMatch(rail, /btn-soft|tool-fill|ai-inspection" \?/);
  assert.match(rail, /<RailCard title="내 조건" className="max-lg:hidden">/);
  /* 내 조건의 다시 계산 = 보조(테두리) 버튼 — 4종 분기에 ActionButton(채움 파랑) 없음 */
  assert.doesNotMatch(frameBranch, /<ActionButton/);
  assert.match(frameBranch, /className="btn-secondary btn-md w-full gap-1\.5"/);
  /* AI 해설 링크는 기존 실행을 부른다(계산 도구도 AI 해설을 함께) */
  assert.match(frameBranch, /onAsk: \(\) => void run\(undefined, \{ llm: true \}\)/);
  assert.match(workbench, /const askLlm = opts\?\.llm \? llmAvailable : aiMode;/);
  /* 레일은 폰에서 본문 뒤(한 번만) — 예전 폰 꼬리 사본 없음 */
  assert.doesNotMatch(frameBranch, /flex flex-col gap-3 lg:hidden/);
});

test("[1026→1026b] 도구 색 — .tool-scope·personaVars 를 걷어 전역 파랑([1026b] 나머지 8종도)", () => {
  assert.match(page, /className="mx-auto flex w-full max-w-\[1240px\] flex-col gap-4"/);
  assert.doesNotMatch(page, /tool-scope|personaVars/);
});

test("[1026] 빈 상태 — 카드 하나 + 회색 견본(제자리 · 흐린 바닥 깔기 없음) + 한 문장(서버가 넘김) + 최근 거래 많은 단지 칩", () => {
  assert.match(frameBranch, /<EmptyFrame tool=\{tool\} \/>/);
  assert.doesNotMatch(frameBranch, /cxw-frame pointer-events-none absolute/);
  assert.match(frameBranch, /!picked && emptyLine && <p className="t-body font-bold text-ink">\{emptyLine\}<\/p>/);
  assert.match(frameBranch, /최근 6개월 거래가 많은 단지 \{quickPicks\.length\}곳/);
  /* 문장은 서버 페이지(page.tsx)에만 — 첫 로드 번들에 싣지 않는다 */
  assert.match(page, /emptyLine=\{EMPTY_LINE\[tid\] \?\? null\}/);
  for (const t of FRAME_TOOLS) assert.match(page, new RegExp(`"${t}": "단지를 고르면 [^"]+바로 나와요"`), t);
  assert.doesNotMatch(frames, /<text/);
});

/* ── 번들 — 첫 로드에 더한 것은 StepLine 하나 ─────────────────────────────────────── */
test("[1026→1026b] 번들 — WorkbenchClient 정적 import: StepLine · [1026b] tool-steps(순수 함수)만 늘고 ActionButton·frame-tools 는 빠졌다 · 레일(MobilePrimaryBar·기준금리 알림)·결과는 next/dynamic 청크", () => {
  const imports = [...workbenchRaw.matchAll(/^import [^;]*? from "([^"]+)";/gm)].map((m) => m[1]).sort();
  assert.deepEqual(imports, [
    "./empty-frames",
    "./workbench-types",
    "@/app/analysis/ComplexPicker",
    "@/app/analysis/use-map-pick",
    "@/app/components/StepLine",
    "@/app/components/toast/ToastProvider",
    "@/app/components/ui/Skeleton",
    "@/lib/ai/ai-tools",
    "@/lib/ai/tool-persona",
    "@/lib/ai/tool-steps",
    "@/lib/ai/tool-tuning",
    "@/lib/ai/tuning-autofill",
    "@/lib/client/has-session",
    "@/lib/client/human-gate",
    "@/lib/client/is-bot-ua",
    "@/lib/format/krw",
    "next/dynamic",
    "next/link",
    "react",
  ]);
  assert.doesNotMatch(workbench, /MobilePrimaryBar|conclusion-next|from "\.\/ResultRail"|from "\.\/ResultView"|from "\.\/VerdictBoard"|EconomyWatch|ActionButton/);
  assert.match(workbenchRaw, /const ResultRailLazy = dynamic\(\(\) => import\("\.\/ResultRail"\)/);
  assert.match(workbenchRaw, /const ResultViewLazy = dynamic\(\(\) => import\("\.\/ResultView"\)/);
});

/* ── 말·모양 규칙 ──────────────────────────────────────────────────────────────── */
test("[1026] 말·모양 — 내부 용어·권유 부연·raw hex·굵기 800·임의 반경·px 글자 없음 · 파일 상단 [1026] 표식", () => {
  const JARGON = /규칙 계산|판단 카드|근거 각주|궤적|갈래|갈림|판단 보류|표본 적음|네 가지 눈|비교 트레이|verdict/;
  const conclusion = visible("lib/ai/conclusion-next.ts");
  for (const [name, src] of [
    ["ResultRail", rail],
    ["signature-cards", sig],
    ["VerdictBoard", board],
  ] as const) {
    /* 화면에 보이는 한글 문자열만 — 식별자(verdict 등)는 제외하고 문자열 리터럴·JSX 텍스트의 한글 토막을 본다 */
    const korean = (src.match(/[가-힣][^<>{}"`]*/g) ?? []).join("\n");
    assert.doesNotMatch(korean, JARGON, name);
    assert.doesNotMatch(src, /#[0-9a-fA-F]{3,6}\b/, `${name}: raw hex`);
    assert.doesNotMatch(src, /font-extrabold|font-black|fontWeight=\{?["']?8\d\d/, `${name}: 굵기 800`);
    assert.doesNotMatch(src, /rounded-\[\d+px\]|text-\[\d+px\]/, `${name}: 임의 반경·px`);
  }
  assert.doesNotMatch((conclusion.match(/"[^"]*[가-힣][^"]*"/g) ?? []).join("\n"), JARGON);
  for (const p of [
    "app/analysis/ai/[tool]/WorkbenchClient.tsx",
    "app/analysis/ai/[tool]/ResultView.tsx",
    "app/analysis/ai/[tool]/ResultRail.tsx",
    "app/analysis/ai/[tool]/signature-cards.tsx",
    "app/analysis/ai/[tool]/VerdictBoard.tsx",
    "app/analysis/ai/[tool]/empty-frames.tsx",
    "app/analysis/ai/[tool]/page.tsx",
    "lib/ai/conclusion-next.ts",
  ]) {
    assert.ok(read(p).slice(0, 400).includes("[1026"), `${p} 상단 [1026] 표식`);
  }
  /* 면책은 맨 아래 한 번 그대로 */
  assert.equal((page.match(/data-ai-compliance="notice"/g) ?? []).length, 1);
  assert.match(page, /투자 권유/);
});
