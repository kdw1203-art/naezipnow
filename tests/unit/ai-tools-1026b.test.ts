import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { toolSteps } from "../../lib/ai/tool-steps.ts";
import { RAIL_PRIMARY, checklistHandoffItems, conclusionNext } from "../../lib/ai/conclusion-next.ts";
import { verdictNextActions } from "../../lib/ai/next-action-routing.ts";
import { AI_TOOL_IDS } from "../../lib/ai/ai-tools.ts";
import { FRAME_TOOLS } from "../../app/analysis/ai/[tool]/frame-tools.ts";

/* [1026b · AI 분석 8종] /analysis/ai/{ai-risk, ai-compare, ai-simulator, ai-gap, ai-economy, ai-portfolio, my-checklist, contract-risk} 에
   1026 4종과 같은 부품 — 절차 한 줄(StepLine) · 결론 히어로(t-title + 판정 칩 = verdict.band 만) · 대표 그림(결론 카드 안) · 세부 접힘 ·
   레일 340 = 내 조건(lg) + 다음 행동 카드(도구별 채움 파랑 하나 + 텍스트 링크) · 폰 MobilePrimaryBar(같은 요소) · 도구 색(.tool-scope) 걷기 ·
   1026 빈 상태. 순수 함수는 값으로, 화면 구조는 소스 문자열로 잠근다(클라이언트 컴포넌트는 node --test 로 실행할 수 없다). */

const read = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");
const visible = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const DIR = "app/analysis/ai/[tool]";
const workbenchRaw = read(`${DIR}/WorkbenchClient.tsx`);
const workbench = visible(`${DIR}/WorkbenchClient.tsx`);
const resultView = visible(`${DIR}/ResultView.tsx`);
const rail = visible(`${DIR}/ResultRail.tsx`);
const toolSig = visible(`${DIR}/tool-signature.tsx`);
const econ = visible(`${DIR}/EconomyWatch.tsx`);
const page = visible(`${DIR}/page.tsx`);
const frames = visible(`${DIR}/empty-frames.tsx`);
const board = visible(`${DIR}/VerdictBoard.tsx`);
const mix = visible(`${DIR}/PortfolioMix.tsx`);

const EIGHT = ["ai-risk", "ai-compare", "ai-simulator", "ai-gap", "ai-economy", "ai-portfolio", "my-checklist", "contract-risk"] as const;

/* ── 절차 한 줄 — 12종 공통 재료(lib/ai/tool-steps) ─────────────────────────────────────── */
test("[1026b] 절차 한 줄 — 단지 도구는 '단지 · {단지명} → 내 조건 → 결과 · {판정} → 다음 행동' · 비교는 담은 수 · 경제지표는 '지역' · 자산 구성은 '관심 단지'", () => {
  for (const tool of ["ai-risk", "ai-simulator", "ai-gap", "my-checklist", "contract-risk"] as const) {
    assert.deepEqual(toolSteps({ tool, pickedName: null, ready: false }), {
      steps: [{ label: "단지" }, { label: "내 조건" }, { label: "결과" }, { label: "다음 행동" }],
      current: 0,
    }, tool);
    assert.deepEqual(toolSteps({ tool, pickedName: "공작아파트", ready: true, bandLabel: "주의" }), {
      steps: [{ label: "단지 · 공작아파트" }, { label: "내 조건" }, { label: "결과", note: "주의" }, { label: "다음 행동" }],
      current: 2,
    }, tool);
  }
  /* 판정은 결과가 섰을 때만 단계 옆에 */
  assert.deepEqual(toolSteps({ tool: "ai-risk", pickedName: "공작아파트", ready: false, bandLabel: "주의" }).steps[2], { label: "결과" });
  /* 비교 — 2곳부터 "단지 · N곳", 1곳이면 그 단지 이름 */
  assert.equal(toolSteps({ tool: "ai-compare", pickedName: "공작아파트", compareCount: 1, ready: true }).steps[0].label, "단지 · 공작아파트");
  assert.equal(toolSteps({ tool: "ai-compare", pickedName: "공작아파트", compareCount: 3, ready: true }).steps[0].label, "단지 · 3곳");
  /* 경제지표 — 단지 없이 지역 */
  assert.deepEqual(toolSteps({ tool: "ai-economy", pickedName: null, regionName: "강남구", ready: true, bandLabel: "보통" }), {
    steps: [{ label: "지역 · 강남구" }, { label: "내 조건" }, { label: "결과", note: "보통" }, { label: "다음 행동" }],
    current: 2,
  });
  assert.deepEqual(toolSteps({ tool: "ai-economy", pickedName: null, ready: false }).steps[0], { label: "지역" });
  assert.equal(toolSteps({ tool: "ai-economy", pickedName: null, ready: false }).current, 0);
  /* 자산 구성 — 관심 단지 불러오기 → 단지 → 결과(넣을 조건이 없는 도구) */
  assert.deepEqual(toolSteps({ tool: "ai-portfolio", pickedName: null, portfolioCount: null, ready: false }), {
    steps: [{ label: "관심 단지" }, { label: "단지" }, { label: "결과" }, { label: "다음 행동" }],
    current: 0,
  });
  assert.equal(toolSteps({ tool: "ai-portfolio", pickedName: null, portfolioCount: 5, ready: false }).current, 1);
  assert.deepEqual(toolSteps({ tool: "ai-portfolio", pickedName: "은마", portfolioCount: 5, ready: true, bandLabel: "좋음" }).steps.map((s) => s.label), [
    "관심 단지 · 5곳",
    "단지 · 은마",
    "결과",
    "다음 행동",
  ]);
  /* 라벨은 줄 안에서 겹치지 않는다(StepLine 의 key) */
  for (const tool of AI_TOOL_IDS) {
    const labels = toolSteps({ tool, pickedName: "단지", compareCount: 2, portfolioCount: 2, regionName: "강남구", ready: true, bandLabel: "보통" }).steps.map((s) => s.label);
    assert.equal(new Set(labels).size, labels.length, tool);
  }
  /* 화면 — StepLine 하나, 재료는 tool-steps */
  assert.equal((workbench.match(/<StepLine/g) ?? []).length, 1);
  assert.match(workbench, /const flow = toolSteps\(\{/);
  assert.match(workbench, /compareCount: compareTray\.length/);
  assert.match(workbench, /portfolioCount: portfolio \? portfolio\.length : null/);
});

/* ── 다음 행동 — 도구별 채움 파랑 하나 ─────────────────────────────────────────────── */
test("[1026b] 채움 파랑(주 행동) — 리스크·갭·수익률 = 임장노트에 담기 · 비교 = 결정 카드에 담기 · 경제지표 = 기준금리 알림 걸기(1027) · 자산 구성·계약·체크리스트 = 기존 첫 행동", () => {
  assert.deepEqual(Object.keys(RAIL_PRIMARY).sort(), [...AI_TOOL_IDS].sort());
  for (const t of ["ai-risk", "ai-gap", "ai-simulator", ...FRAME_TOOLS] as const) assert.deepEqual(RAIL_PRIMARY[t], { kind: "note", label: "임장노트에 담기" }, t);
  assert.deepEqual(RAIL_PRIMARY["ai-compare"], { kind: "decide", label: "결정 카드에 담기" });
  /* [1027] 경제지표에는 지역이 없다 — 실제 알림(기준금리 알림 패널)의 이름으로 */
  assert.deepEqual(RAIL_PRIMARY["ai-economy"], { kind: "alert", label: "기준금리 알림 걸기" });
  /* 기존 다음 행동 첫째 — 예전 NextActions 의 첫 버튼 글자 그대로(새 기능 없음) */
  assert.deepEqual(RAIL_PRIMARY["ai-portfolio"], { kind: "note", label: "이 단지 임장노트 쓰기" });
  assert.deepEqual(RAIL_PRIMARY["contract-risk"], { kind: "note", label: "이 단지 임장노트 쓰기" });
  assert.deepEqual(RAIL_PRIMARY["my-checklist"], { kind: "checklist", label: "체크리스트로 노트 시작" });
  /* 나머지 8종은 결론 아래 "다음 행동 한 줄"을 새로 만들지 않는다(도구가 가진 값만) */
  for (const t of EIGHT) assert.equal(conclusionNext({ tool: t, complexId: "c1" }), null, t);
});

test("[1026b] 노트 링크 — 리스크·갭·수익률도 4종과 같은 규칙(결론·핵심 숫자가 메모 초안으로 · apt·region·complexId)", () => {
  const verdict = {
    headline: "공작아파트: 잰 4가지 위험 신호 중 1가지가 걸렸어요(1가지는 자료 없음): 입주 물량이 많아요.",
    numbers: [{ key: "price", label: "최근 실거래가", value: "5억 800만", asOf: "202608", source: "국토부 실거래", confidence: "ok" as const }],
    metric: { label: "위험 수준", value: "보통", unit: null, note: null, asOf: null },
    computedAt: "2026-09-29T03:00:00Z",
  };
  for (const tool of ["ai-risk", "ai-gap", "ai-simulator", "contract-risk", "ai-portfolio", "my-checklist"] as const) {
    const a = verdictNextActions({ tool, verdict, complexId: "abc", complexName: "공작아파트", region: "안양 동안구", noteHandoff: true });
    const url = new URL(a.primary.href, "https://x.test");
    assert.equal(url.pathname, "/notes/new", tool);
    assert.equal(url.searchParams.get("apt"), "공작아파트");
    assert.equal(url.searchParams.get("region"), "안양 동안구");
    assert.equal(url.searchParams.get("complexId"), "abc");
    assert.match(url.searchParams.get("memo") ?? "", /^AI .+ 2026\.09\.29: 공작아파트: /);
  }
  assert.match(
    verdictNextActions({ tool: "ai-risk", verdict, complexId: "abc", noteHandoff: true }).primary.href.replace(/\+/g, " "),
    /memo=AI(%20| )/,
  );
  /* 레일 — 같은 호출 하나(noteHandoff) */
  assert.match(rail, /verdictNextActions\(\{ tool, verdict, complexId: picked\.id, complexName: picked\.name, region: picked\.region, noteHandoff: true \}\)\.primary\.href/);
});

test("[1026b] 체크리스트 → 노트 고려사항 — 안 한 항목 · 4~60자 · 최대 10개(예전 NextActions 규칙 그대로)", () => {
  const groups = [
    { items: [{ id: "a", label: "등기부등본 확인" }, { id: "b", label: "짧음" }, { id: "c", label: "관리비 내역 확인" }] },
    { items: Array.from({ length: 12 }, (_, i) => ({ id: `g${i}`, label: `현장 확인 항목 ${i + 1}` })) },
  ];
  const items = checklistHandoffItems(groups, new Set(["a"]));
  assert.equal(items.length, 10);
  assert.equal(items[0], "관리비 내역 확인");
  assert.ok(!items.includes("등기부등본 확인"), "체크한 항목은 넘기지 않는다");
  assert.ok(!items.includes("짧음"), "4자 미만은 넘기지 않는다");
  assert.deepEqual(checklistHandoffItems(null, new Set()), []);
  assert.deepEqual(checklistHandoffItems([{ items: [{ id: "x", label: "가".repeat(61) }] }], new Set()), []);
  /* 레일 — 누를 때 이 기기의 체크 상태(ResultView 와 같은 키)를 읽어 NoteForm 이 읽는 자리(nz_ai_checklist)에 */
  assert.match(rail, /window\.localStorage\.getItem\(checklistKey\(picked\?\.id \?\? null\)\)/);
  assert.match(rail, /window\.localStorage\.setItem\("nz_ai_checklist", JSON\.stringify\(\{ at: Date\.now\(\), items \}\)\)/);
  assert.match(rail, /fromChecklist=1/);
  assert.match(resultView, /export function checklistKey\(complexId: string \| null\)/);
});

test("[1026b] 레일 — 채움 파랑 리터럴 1(데스크톱 카드 + 폰 하단 바가 같은 요소) · 비교는 담은 단지 전부 → /decide · 경제지표 알림은 기준금리 알림 패널(1027) · 텍스트 링크", () => {
  assert.equal((rail.match(/\bbtn-primary\b/g) ?? []).length, 1);
  assert.match(rail, /<div className="max-lg:hidden">\{primary\}<\/div>/);
  assert.match(rail, /<MobilePrimaryBar label=\{primaryLabel\}>\{primary\}<\/MobilePrimaryBar>/);
  assert.match(rail, /const spec = RAIL_PRIMARY\[tool\]/);
  assert.match(rail, /\{ href: "\/decide", icon: "clipboard", onClick: \(\) => addDecide\(decideItems\) \}/);
  assert.match(rail, /const decideItems = compareTray && compareTray\.length > 0 \? compareTray : picked \? \[picked\] : \[\]/);
  /* [1027] 경제지표 주 행동 — 기준금리 알림 패널로(#economy-watch). 패널이 없을 때만 알림함 + 글자 "알림함 열기" */
  assert.match(rail, /\? \{ href: "#economy-watch", icon: "bell", onClick: focusEconomyWatch \}\s*: \{ href: "\/notifications", icon: "bell" \}/);
  /* 데스크톱은 패널이 같은 레일 바로 아래 — 주소의 # 만으로는 움직임이 없어 패널을 가운데로 올리고 초점을 준다 */
  assert.match(rail, /panel\?\.scrollIntoView\(\{ block: "center" \}\);\s*panel\?\.querySelector<HTMLElement>\("select"\)\?\.focus\(\{ preventScroll: true \}\);/);
  assert.match(rail, /const primaryLabel = spec\.kind === "alert" && economyRate == null \? "알림함 열기" : spec\.label/);
  /* 결정 카드 텍스트 링크는 주 행동이 결정 카드가 아닐 때만(같은 행동 두 번 없음) */
  assert.match(rail, /picked && spec\.kind !== "decide" && \(/);
  /* 도구 색 채움·옛 버튼 줄 없음 */
  assert.doesNotMatch(rail, /btn-soft|tool-fill|glow/);
  /* 경제지표 기준금리 알림 — 레일 청크의 따로 된 파일, 보조 버튼(채움 없음) · 등록 API 그대로 */
  assert.match(rail, /tool === "ai-economy" && economyRate != null && <EconomyWatch currentRate=\{economyRate\} \/>/);
  assert.doesNotMatch(econ, /btn-primary|ActionButton|tool-fill/);
  assert.match(econ, /className="btn-secondary btn-md gap-1\.5 px-3 t-sub"/);
  assert.match(econ, /fetch\("\/api\/me\/economy-watch"/);
  assert.match(econ, /id="economy-watch"/);
  assert.match(econ, /min-h-\[40px\]/);
  /* 워크벤치 → 레일: 비교 묶음 · 지금 기준금리 */
  assert.match(workbench, /compareTray: isCompare \? compareTray\.map\(\(c\) => \(\{ id: c\.id, name: c\.name, region: c\.region \}\)\) : null/);
  assert.match(workbench, /economyRate: isEconomy \? \(ctx\?\.macro\?\.baseRatePct \?\? null\) : null/);
});

/* ── 워크벤치 — 12종 한 틀 · 옛 3칸 화면·채움 버튼 걷기 ────────────────────────────────────── */
test("[1026b] 워크벤치 — 옛 8종 화면(① 단지 고르기 · ② 내 조건 · ③ 채움 실행 버튼 · 이렇게 써요 · 맨 아래 보드)이 없고 12종이 한 틀", () => {
  assert.doesNotMatch(workbench, /isFrameTool|FirstVisitGuide|EconomyWatchPanel|VerdictBoardLazy|ActionButton|glow|lg:grid-cols-\[380px/);
  assert.doesNotMatch(workbench, /로그인하고 AI 해설 받기|③ |② |① /);
  /* 다시 계산은 보조(테두리) 버튼 · AI 해설은 레일 링크 */
  assert.match(workbench, /className="btn-secondary btn-md w-full gap-1\.5"/);
  assert.match(workbench, /onAsk: \(\) => void run\(undefined, \{ llm: true \}\)/);
  assert.doesNotMatch(workbench, /\bbtn-primary\b/);
  /* 레일 340 · 한 번 · 단지를 고른 뒤(경제지표는 늘) */
  assert.equal((workbench.match(/<ResultRailLazy/g) ?? []).length, 1);
  assert.equal((workbench.match(/<ResultViewLazy/g) ?? []).length, 1);
  assert.match(workbench, /const twoCol = isEconomy \|\| Boolean\(picked\);/);
  assert.match(workbench, /grid grid-cols-1 gap-3 lg:gap-6 \$\{twoCol \? "lg:grid-cols-\[minmax\(0,1fr\)_340px\]" : ""\}/);
  /* 폰 내 조건 — 접이식(입력이 곧 결과인 도구는 처음부터 펼침 · "(선택)" 없음) */
  assert.match(workbench, /<details className="card rounded-2xl" open=\{condOpen\} onToggle=\{\(e\) => setCondOpen\(e\.currentTarget\.open\)\}>/);
  assert.match(workbench, /const condOptional = tool !== "ai-simulator" && !isContract;/);
  /* 비교 — 담은 단지 칩(빼기 · 되돌리기 토스트) · 최대 3곳 · 2곳이 찰 때까지 고르기 카드 */
  assert.match(workbench, /aria-label=\{`\$\{c\.name\} 빼기`\}/);
  assert.match(workbench, /label: "되돌리기"/);
  assert.match(workbench, /disabled=\{isCompare && compareTray\.length >= 3\}/);
  assert.match(workbench, /const showPickCard = !isEconomy && \(!picked \|\| pickerOpen \|\| \(isCompare && compareTray\.length < 2\)\);/);
  /* 자산 구성 — 관심 단지 불러오기(보조 버튼) + 구성 카드(지연 조각) */
  assert.match(workbench, /내 관심 단지 불러오기/);
  assert.match(workbench, /<PortfolioMixLazy items=\{portfolio\}/);
  /* 계약 점검 — 기존 전세 안전 셀프체크 링크는 빈 상태 카드 안 텍스트 링크로 */
  assert.match(workbench, /isContract && \([\s\S]{0,120}href="\/safety"/);
  /* 폰 조작 하한 */
  for (const m of workbench.match(/className="chip [^"]*"/g) ?? []) assert.match(m, /min-h-\[(40|32)px\]/, m);
});

test("[1026b] 빈 상태 — 카드 하나 + 회색 견본(12종 모두 윤곽 · 글자·숫자 없음) + 한 문장(서버) + 단지 검색", () => {
  assert.match(workbench, /<EmptyFrame tool=\{tool\} \/>/);
  assert.match(workbench, /!picked && emptyLine && <p className="t-body font-bold text-ink">\{emptyLine\}<\/p>/);
  assert.match(frames, /export function EmptyFrame\(\{ tool \}: \{ tool: AiAnalysisToolId \}\)/);
  for (const f of ["ListFrame", "TableFrame", "BarsFrame"]) assert.match(frames, new RegExp(`function ${f}\\(`), f);
  assert.doesNotMatch(frames, /<text|#[0-9a-fA-F]{3,6}\b/);
  /* 한 문장은 서버 페이지에만 — 경제지표(단지를 고르지 않는다)를 뺀 11종 · [1028] 11종 공통 한 줄(도구별 문장은 머리 한 줄과 같은 말이었다) */
  for (const t of AI_TOOL_IDS) {
    if (t === "ai-economy") assert.doesNotMatch(page, /"ai-economy": "/);
    else assert.ok(page.includes(`"${t}": "단지를 고르면 결과가 나와요."`), t);
  }
  assert.doesNotMatch(page, /바로 나와요|채워져요/, "도구별 빈 상태 문장이 남았다");
  assert.match(page, /emptyLine=\{EMPTY_LINE\[tid\] \?\? null\}/);
});

/* ── 결과 본문 — 결론 히어로 · 대표 그림 · 세부 접힘 ────────────────────────────────────── */
test("[1026b] 결론 히어로 — 8종은 ToolSignature(SummaryLine: t-title + 판정 칩(verdict.band) + 근거 한 줄) + 대표 수치 + 대표 그림 한 카드", () => {
  assert.match(resultView, /!isFrameTool\(tool\) && heroVerdict && \(\s*<ToolSignature/);
  assert.match(toolSig, /<SummaryLine verdict=\{verdict\} asOf=\{asOf\} fallback="" tools=\{tools\} \/>/);
  /* 판정 칩과 같은 말인 대표 수치는 빼고(칩은 하나), 수치는 t-display */
  assert.match(toolSig, /const echo = m != null && `\$\{m\.value\}`\.trim\(\) === verdict\.bandLabel\.trim\(\);/);
  assert.match(toolSig, /size="t-display"/);
  /* 대표 그림 — 도구가 이미 그리던 것만, 히어로 카드 안(SigFigure) */
  assert.match(resultView, /<SigFigure title="위험 신호 5가지"/);
  for (const c of ["ContractCard", "LoanCard", "ChecklistCard", "CompareTable"]) {
    const i = resultView.indexOf(`function ${c}(`);
    assert.ok(i >= 0, c);
    const body = resultView.slice(i, resultView.indexOf("\n}\n", i));
    assert.match(body, /<SigFigure /, c);
    assert.doesNotMatch(body, /<Card /, c);
  }
  /* 다른 도구 칩 줄 — 비교·자산 구성(대상이 여럿)은 세우지 않는다 */
  assert.match(resultView, /hasComplex && picked && tool !== "ai-compare" && tool !== "ai-portfolio" \? \(/);
  /* 리스크 체크 색 — 1025 판정 색(주의 주황 · 참고 파랑), 흰 카드 안 목록은 plain */
  assert.match(resultView, /warn: \{ icon: "warning", cls: "text-warning", word: "주의" \}/);
  assert.match(resultView, /info: \{ icon: "help", cls: "text-primary", word: "참고" \}/);
  /* 옛 8종 순서·버튼 줄 없음 */
  assert.doesNotMatch(resultView, /\bNextActions\b|tool-fill|tool-rail|<VerdictCard\b|variant === "complex"/);
  assert.equal((resultView.match(/\bbtn-primary\b/g) ?? []).length, 1, "결제 안내(주간권) 한 곳뿐 — 채움 파랑을 더하지 않았다");
});

test("[1026b] 세부 — 실거래 흐름은 데스크톱 펼침·폰 닫힘(체크리스트는 없음) · 근거·출처 닫힘 · 비교의 함께 볼 단지는 손잡이 자리 · 순서", () => {
  assert.match(resultView, /hasComplex && tool !== "my-checklist" && \(\s*<PriceFlowCard/);
  assert.match(resultView, /fold=\{tool === "ai-inspection" \? "closed" : "wide"\}/);
  const body = resultView.slice(resultView.indexOf("export function ResultView("));
  const order = ["<ToolSignature", "<VerdictTiles", "{phoneCondition &&", "<RouteList", "{narrative}", "<PriceFlowCard", "<EvidenceCard", "<Details"];
  const at = order.map((k) => body.indexOf(k));
  for (let i = 0; i < at.length; i++) assert.ok(at[i] > 0, order[i]);
  for (let i = 1; i < at.length; i++) assert.ok(at[i] > at[i - 1], `${order[i - 1]} → ${order[i]}`);
});

/* ── 도구 색 · 머리 · 면책 ───────────────────────────────────────────────────────── */
test("[1026b] 도구 색 걷기 — 12종 모두 .tool-scope·personaVars 없음(전역 파랑) · 8종 머리는 흰 PageHead 그대로 · 면책 그대로", () => {
  assert.doesNotMatch(page, /tool-scope|personaVars|style=\{/);
  assert.doesNotMatch(mix, /tool-rail|tool-accent/);
  assert.doesNotMatch(board, /tool-soft-bg|--tool-accent/);
  assert.match(page, /\{!complexHeader && \(\s*<PageHead/);
  assert.equal((page.match(/data-ai-compliance="notice"/g) ?? []).length, 1);
  assert.match(page, /투자 권유·수익 보장·법률·세무\s+자문이 아니며/);
});

test("[1026b] 계약 점검 — 법률 서비스처럼 읽히는 말을 더하지 않았다 · 일반 정보 표기 그대로 · '② 에' → '내 조건에'", () => {
  assert.match(resultView, /일반 정보\(법률 자문 아님\)/);
  for (const src of [workbench, resultView, rail, toolSig, econ]) {
    assert.doesNotMatch(src, /변호사|법률 상담|법률 검토|법무|계약서 검토해|안전을 보장/);
    assert.doesNotMatch(src, /② 에/);
  }
  assert.doesNotMatch(visible("lib/ai/verdict.ts"), /② 에/);
  assert.doesNotMatch(visible(`${DIR}/verdict-explain.ts`), /② /);
});

/* ── 번들 — 첫 로드 그래프에 무거운 것 없음 ─────────────────────────────────────────── */
test("[1026b] 번들 — 새 조각(ToolSignature·EconomyWatch)은 결과·레일 청크 · 첫 로드에는 순수 함수 tool-steps 하나만", () => {
  assert.doesNotMatch(workbenchRaw, /from "\.\/(tool-signature|EconomyWatch|ResultRail|ResultView|VerdictBoard|PortfolioMix)"/);
  assert.match(workbenchRaw, /const ResultRailLazy = dynamic\(\(\) => import\("\.\/ResultRail"\)/);
  assert.match(workbenchRaw, /const PortfolioMixLazy = dynamic\(\(\) => import\("\.\/PortfolioMix"\)/);
  assert.match(visible(`${DIR}/ResultView.tsx`), /import \{ SigFigure, ToolSignature \} from "\.\/tool-signature";/);
  assert.match(rail, /import \{ EconomyWatch \} from "\.\/EconomyWatch";/);
  /* tool-steps 는 타입 import 만(런타임 의존 0) */
  const steps = visible("lib/ai/tool-steps.ts");
  assert.deepEqual([...steps.matchAll(/^import (type )?[^;]*? from "([^"]+)";/gm)].map((m) => [m[1] ?? "", m[2]]), [["type ", "@/lib/ai/ai-tools"]]);
});

/* ── 말·모양 규칙 ──────────────────────────────────────────────────────────────── */
test("[1026b] 말·모양 — 램프 유틸만 · raw hex·굵기 800·임의 px·그라데이션·이모지 없음 · '시세' 새로 안 씀 · 폰 40px · 파일 상단 [1026b] 표식", () => {
  for (const [name, src] of [
    ["WorkbenchClient", workbench],
    ["ResultView", resultView],
    ["ResultRail", rail],
    ["tool-signature", toolSig],
    ["EconomyWatch", econ],
    ["empty-frames", frames],
  ] as const) {
    assert.doesNotMatch(src, /#[0-9a-fA-F]{3,6}\b/, `${name}: raw hex`);
    assert.doesNotMatch(src, /font-extrabold|font-black|fontWeight=\{?["']?8\d\d/, `${name}: 굵기 800`);
    assert.doesNotMatch(src, /rounded-\[\d+px\]|text-\[\d+px\]|text-(xs|sm|base|lg|xl|2xl)\b/, `${name}: 램프 밖 글자·임의 반경`);
    assert.doesNotMatch(src, /gradient/, `${name}: 그라데이션`);
    assert.doesNotMatch(src, /[\u{1F300}-\u{1FAFF}]/u, `${name}: 이모지`);
  }
  for (const [name, src] of [["ResultRail", rail], ["tool-signature", toolSig], ["EconomyWatch", econ]] as const) {
    const korean = (src.match(/[가-힣][^<>{}"`]*/g) ?? []).join("\n");
    assert.doesNotMatch(korean, /시세/, `${name}: 실거래만 있는 곳의 '시세'`);
  }
  assert.match(rail, /const TEXT_LINK = "inline-flex min-h-\[40px\]/);
  for (const p of [
    `${DIR}/WorkbenchClient.tsx`,
    `${DIR}/ResultView.tsx`,
    `${DIR}/ResultRail.tsx`,
    `${DIR}/VerdictBoard.tsx`,
    `${DIR}/VerdictCard.tsx`,
    `${DIR}/PortfolioMix.tsx`,
    `${DIR}/empty-frames.tsx`,
    `${DIR}/frame-tools.ts`,
    `${DIR}/page.tsx`,
    `${DIR}/tool-signature.tsx`,
    `${DIR}/EconomyWatch.tsx`,
    `${DIR}/verdict-explain.ts`,
    "lib/ai/conclusion-next.ts",
    "lib/ai/tool-steps.ts",
    "lib/ai/verdict.ts",
  ]) {
    assert.ok(read(p).slice(0, 300).includes("[1026b · AI 분석 8종]"), `${p} 상단 [1026b · AI 분석 8종] 표식`);
  }
});

/* ── [1028 · 제안 2] 결과 카드의 결론·근거 문장 — 줄표로 잇지 않고, 명령하지 않는다 ─────────────────── */
test("[1028] 결과 카드 문장 — 자산 구성 결론 · 계약 점검 기준 줄 · 대출 계산 제목·각주 · 거래 적음 안내는 마침표·가운뎃점으로, 시세 예측 ⓘ 는 사실만", () => {
  assert.ok(mix.includes("이 몰려 있어요. 같은 지역 흐름에 함께 흔들려요.`"));
  assert.ok(mix.includes("`한 지역에 절반 넘게 몰리지 않았어요. 가장 많은 곳은 "));
  assert.doesNotMatch(mix, /어요 — /);
  assert.ok(resultView.includes('"전세가율은 지역 평균 · 이 집 값을 넣으면 다시 계산"'));
  assert.ok(resultView.includes("{loan.holdingYears}년 뒤 팔면 넣은 돈 대비 연 수익률(가정)</h4>"));
  assert.ok(resultView.includes("취득세·중개보수·보유세·임대료는 넣지 않았어요. 실제 부담은 더 커요."));
  assert.ok(resultView.includes("거래가 적어 추이를 그리기 어려워요. 거래가 있었던 달만 점으로 찍었어요."));
  const explain = visible(`${DIR}/verdict-explain.ts`);
  assert.ok(explain.includes("예측이 아니라 공개한 규칙으로 낸 가정 계산이에요. 3개월 적중률을 공개한 규칙(예측 적중률 화면)과는 다른 계산이에요."));
  assert.doesNotMatch(explain, /마세요/);
});
