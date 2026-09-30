/**
 * [1026b · 시나리오·비교] 시장·대출 시나리오(/analysis/scenario) · 후보 단지 비교(/analysis/compare) — "1025 표준" 잠금.
 *
 * ① 계산 그대로: lib/market/scenario-calc 는 ScenarioClient 의 useMemo 본문을 옮긴 것 — 전 캡처(before1026b/d_scenario:
 *    예시 8.4억 · 대출 40% · 연 소득 7,000만 · 4.19%)에 보이던 숫자가 그대로 나와야 한다(164만 · 184만 · 28% 적정 · 32% 주의 ·
 *    5년 갚은 원금 3,117만 · 이자 6,729만 · 잔여 3억 483만 · 곡선 145만~228만).
 * ② 문장 규칙(순수): 절차 한 줄 · 결론 한 줄 · 판정 칩 · 근거 · 다음 행동 — 시나리오는 계산 결과, 비교는 기존 표의 1위 칸만.
 * ③ 소스 구조: 화면마다 StepLine 한 번 · 결론 카드 · 본문 | 레일 340 · 채움 파랑 리터럴 1(레일 + 폰 하단 바가 같은 요소) ·
 *    손잡이는 자리 하나만 마운트 · 비교 빈 상태(카드 하나 + 회색 표 윤곽 + 한 문장 + 검색) · 캐시·조회 그대로.
 * ④ 번들: 무거운 부분은 next/dynamic(ssr:false) — 첫 묶음의 정적 import 그래프에 단지 검색 · 지역 목록 · ⓘ 사전 · 레이더 ·
 *    Segmented · TweenNumber · 등락 표기가 다시 들어오지 않게 그래프를 걸어서 막는다(빌드 없이 도는 회귀 방지).
 */
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";

import { burdenLabel } from "@/lib/finance/calc-summary";
import { EXAMPLE_PRICE_WON, computeScenario } from "@/lib/market/scenario-calc";
import {
  SCENARIO_PRIMARY,
  burdenOf,
  burdenTone,
  priceScenarioText,
  rateOffsetText,
  scenarioActionLinks,
  scenarioConclusion,
  scenarioConditionLine,
  scenarioSteps,
  scenarioWon,
} from "@/lib/market/scenario-conclusion";
import {
  COMPARE_DECIDE_HREF,
  bestOf,
  compareActionLinks,
  compareConclusion,
  compareSteps,
  compareWinners,
  type CompareRow,
} from "@/lib/market/compare-conclusion";
import { fmtEok, fmtPyeong } from "@/app/analysis/compare/compare-format";

/* ── ① 계산 그대로 ───────────────────────────────────────────────────── */

const BEFORE = {
  loanWon: EXAMPLE_PRICE_WON * 0.4,
  priceWon: EXAMPLE_PRICE_WON,
  rateOffset: 0,
  pricePct: 0,
  incomeWon: 7000 * 10_000,
  baseRate: 4.19,
  period: "5년",
};

test("[1026b] 시나리오 계산 — 전 캡처 숫자 그대로(월 164만 · +1%p 184만 · 28%/32% · 5년 원금 3,117만 · 이자 6,729만 · 잔여 3억 483만 · 곡선 145만~228만)", () => {
  const c = computeScenario(BEFORE);
  assert.equal(scenarioWon(c.pay), "164만원");
  assert.equal(scenarioWon(c.payStress), "184만원");
  assert.equal((c.dsr * 100).toFixed(0), "28");
  assert.equal((c.dsrStress * 100).toFixed(0), "32");
  assert.equal(burdenOf(c.dsr), "적정");
  assert.equal(burdenOf(c.dsrStress), "주의");
  assert.equal(c.holdYears, 5);
  assert.equal(scenarioWon(c.holdPrincipal), "3,117만원");
  assert.equal(scenarioWon(c.holdInterest), "6,729만원");
  assert.equal(scenarioWon(c.holdBalance), "3억 483만원");
  assert.equal(Math.round(c.curve[0].pay / 10_000), 145);
  assert.equal(Math.round(c.curve[c.curve.length - 1].pay / 10_000), 228);
  assert.equal(c.curve.length, 17, "−1.0%p ~ +3.0%p · 0.25%p 간격");
  assert.equal(c.breachRate, null, "+3.0%p 까지 40% 이하");
  assert.deepEqual(c.bars.map((b) => [b.label, scenarioWon(b.pay)]), [
    ["기준 4.19%", "164만원"],
    ["+1.0%p", "184만원"],
    ["-0.5%p", "154만원"],
  ]);
  assert.equal(scenarioWon(0), "0원");
});

test("[1026b] 부담 판정 — burdenLabel(대출 계산기)과 한 경계(30 · 40) · 톤은 적정 good · 주의·위험 caution", () => {
  for (const r of [0, 0.1, 0.3, 0.30001, 0.35, 0.4, 0.40001, 0.8]) {
    assert.equal(burdenOf(r), burdenLabel(r * 100) ?? "위험", `비율 ${r}`);
  }
  assert.equal(burdenOf(Number.NaN), "위험", "값을 못 내면 예전 dsrTone 처럼 위험");
  assert.equal(burdenTone("적정"), "good");
  assert.equal(burdenTone("주의"), "caution");
  assert.equal(burdenTone("위험"), "caution");
});

/* ── ② 문장 규칙 ─────────────────────────────────────────────────────── */

test("[1026b] 시나리오 결론 — '월 상환 164만원 · 금리 +1%p 시 184만원' · 칩 '소득 대비 28% 적정'(good) · 근거 = 지금 대비 · 보유 이자 · 잔여 원금 · (시세 시나리오) LTV", () => {
  const c = computeScenario(BEFORE);
  const k = scenarioConclusion(c, 0);
  assert.equal(k.title, "월 상환 164만원 · 금리 +1%p 시 184만원");
  assert.deepEqual(k.chip, { label: "소득 대비 28% 적정", tone: "good" });
  assert.equal(k.sub, "지금 대비 +20만원 · 5년 보유 이자 6,729만원 · 잔여 원금 3억 483만원");
  /* 시세 -10% 를 고르면 그 LTV(결과 셋째 칸과 같은 값)가 근거 끝에 */
  const down = scenarioConclusion(computeScenario({ ...BEFORE, pricePct: -10 }), -10);
  assert.equal(down.sub, "지금 대비 +20만원 · 5년 보유 이자 6,729만원 · 잔여 원금 3억 483만원 · 시세 -10% 시 LTV 44%");
  /* 부담이 크면 주황 칩(빨강 칩은 새로 만들지 않는다) */
  const heavy = scenarioConclusion(computeScenario({ ...BEFORE, loanWon: EXAMPLE_PRICE_WON * 0.7, incomeWon: 5000 * 10_000, rateOffset: 1, period: "10년" }), 0);
  assert.equal(heavy.chip?.tone, "caution");
  assert.match(heavy.chip!.label, /^소득 대비 \d+% 위험$/);
  assert.match(heavy.sub!, /^지금 대비 \+.+ · 10년 보유 이자 .+ · 잔여 원금 .+$/);
});

test("[1026b] 시나리오 절차 — 조건 · {대상} · 대출 N% → 시나리오 · 금리 · 시세 · 보유 → 결과(현재 · 월 상환) → 다음 행동", () => {
  const c = computeScenario(BEFORE);
  const plan = scenarioSteps({ target: "예시 8.4억", ltvPct: 40, rateOffset: 0, pricePct: 0, period: "5년", pay: c.pay });
  assert.equal(plan.current, 2);
  assert.deepEqual(plan.steps.map((s) => s.label), ["조건 · 예시 8.4억 · 대출 40%", "시나리오 · 금리 기준 · 보합 · 5년", "결과", "다음 행동"]);
  assert.equal(plan.steps[2].note, "월 164만원");
  assert.equal(rateOffsetText(1), "금리 +1.0%p");
  assert.equal(rateOffsetText(-0.5), "금리 -0.5%p");
  assert.equal(priceScenarioText(-20), "시세 -20%");
  assert.equal(priceScenarioText(5), "시세 +5%");
  assert.equal(scenarioConditionLine({ ltvPct: 40, incomeManwon: 7000, baseRate: 4.19 }), "대출 40% · 연 소득 7,000만원 · 금리 4.19%");
});

test("[1026b] 시나리오 다음 행동 — 채움 파랑 '살까, 빌릴까 계산'(/calculator/rent-vs-buy) · 링크 3(결정 카드 · 이 지역 알림 · 지도) · 모르는 지역은 파라미터 없이('알림 받기')", () => {
  assert.deepEqual(SCENARIO_PRIMARY, { href: "/calculator/rent-vs-buy", label: "살까, 빌릴까 계산" });
  assert.deepEqual(scenarioActionLinks("강남구"), [
    { href: "/decide", label: "결정 카드" },
    { href: "/notifications", label: "이 지역 알림" },
    { href: "/map?region=%EA%B0%95%EB%82%A8%EA%B5%AC", label: "지도에서 보기" },
  ]);
  assert.deepEqual(scenarioActionLinks(null).map((l) => [l.href, l.label]), [
    ["/decide", "결정 카드"],
    ["/notifications", "알림 받기"],
    ["/map", "지도에서 보기"],
  ]);
  assert.equal(scenarioActionLinks("  ")[2].href, "/map");
});

const ROW = (name: string, over: Partial<CompareRow> = {}): CompareRow => ({
  name,
  hasData: true,
  avg6mKrw: 900_000_000,
  avgPyeong6mKrw: 35_000_000,
  count12m: 10,
  ...over,
});
const FMT = { avg: fmtEok, pyeong: fmtPyeong };

test("[1026b] 비교 결론 — 표의 1위 칸 그대로: '2곳 중 평당가 최저 {단지} 3,383만' · 칩 '거래 최다 {단지}'(보통) · 근거 = 평균가 최저 · 12개월 건수 · 값 없는 행은 뺀다", () => {
  const rows = [
    ROW("공작아파트", { avg6mKrw: 845_000_000, avgPyeong6mKrw: 33_830_000, count12m: 12 }),
    ROW("한가람", { avg6mKrw: 910_000_000, avgPyeong6mKrw: 35_000_000, count12m: 41 }),
    ROW("목련", { hasData: false, avg6mKrw: null, avgPyeong6mKrw: null, count12m: 0 }),
  ];
  const c = compareConclusion(rows, FMT)!;
  assert.equal(c.title, "2곳 중 평당가 최저 공작아파트 3,383만");
  assert.deepEqual(c.chip, { label: "거래 최다 한가람", tone: "neutral" });
  assert.equal(c.sub, "6개월 평균가 최저 공작아파트 8.45억 · 12개월 거래 41건");
  /* 배지와 같은 함수 — 표의 "최저·최다" 칸 = 결론의 1위 */
  const w = compareWinners(rows);
  assert.deepEqual([...w.pyeong], [0]);
  assert.deepEqual([...w.avg], [0]);
  assert.deepEqual([...w.count], [1]);
});

test("[1026b] 비교 결론 — 동점은 둘 다 · 평당가 없으면 평균가 · 그것도 없으면 거래 최다 · 값 있는 곳 2 미만이면 결론 없음", () => {
  const tie = compareConclusion([ROW("가"), ROW("나"), ROW("다", { avgPyeong6mKrw: 40_000_000, count12m: 3 })], FMT)!;
  assert.equal(tie.title, "3곳 중 평당가 최저 가·나 3,500만");
  assert.deepEqual(tie.chip, { label: "거래 최다 가·나", tone: "neutral" });
  const noPyeong = compareConclusion([ROW("가", { avgPyeong6mKrw: null }), ROW("나", { avgPyeong6mKrw: null, avg6mKrw: 700_000_000 })], FMT)!;
  assert.equal(noPyeong.title, "2곳 중 6개월 평균가 최저 나 7억");
  const countOnly = compareConclusion(
    [ROW("가", { avgPyeong6mKrw: null, avg6mKrw: null, count12m: 7 }), ROW("나", { avgPyeong6mKrw: null, avg6mKrw: null, count12m: 2 })],
    FMT,
  )!;
  assert.equal(countOnly.title, "2곳 중 거래 최다 가 7건");
  assert.equal(countOnly.chip, null);
  assert.equal(countOnly.sub, null);
  assert.equal(compareConclusion([ROW("가"), ROW("나", { hasData: false })], FMT), null, "한 곳짜리 비교는 결론이 아니다");
  assert.equal(compareConclusion([], FMT), null);
  assert.equal(bestOf([1], (x) => x, "min").size, 0, "값이 하나면 1위 없음");
});

test("[1026b] 비교 절차 — 단지 담기(현재 · N곳) → 비교 → 결론 → 다음 행동 · 두 곳 미만은 담기 단계", () => {
  assert.deepEqual(compareSteps(0, "pick"), {
    steps: [{ label: "단지 담기", note: undefined }, { label: "비교" }, { label: "결론" }, { label: "다음 행동" }],
    current: 0,
  });
  assert.equal(compareSteps(1, "pick").steps[0].note, "1곳");
  const cmp = compareSteps(3, "compare");
  assert.equal(cmp.current, 1);
  assert.equal(cmp.steps[0].label, "단지 담기 · 3곳");
  assert.equal(compareSteps(3, "result").current, 2);
});

test("[1026b] 비교 다음 행동 — 채움 파랑은 /decide · AI 비교 해석(2곳 이상 · 앞 3곳, 예전 채움 버튼과 같은 주소) · 알림 · 지도", () => {
  assert.equal(COMPARE_DECIDE_HREF, "/decide");
  assert.deepEqual(compareActionLinks(["a", "b", "c", "d"]), [
    { href: `/analysis/ai/ai-compare?ids=${encodeURIComponent("a,b,c")}`, label: "AI 비교 해석" },
    { href: "/notifications", label: "알림 받기" },
    { href: "/map", label: "지도에서 보기" },
  ]);
  assert.deepEqual(compareActionLinks(["a"]).map((l) => l.href), ["/notifications", "/map"]);
});

/* ── ③ 소스 구조 ─────────────────────────────────────────────────────── */

const raw = (p: string) => readFileSync(p, "utf8");
/** 주석은 걷고 본다 — 규칙 기록 문장까지 잡지 않게 */
const code = (p: string) => raw(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const count = (s: string, needle: string) => s.split(needle).length - 1;

const SCN = "app/analysis/scenario";
const CMP = "app/analysis/compare";
const SCENARIO_FILES = [
  `${SCN}/page.tsx`,
  `${SCN}/ScenarioClient.tsx`,
  `${SCN}/ScenarioControls.tsx`,
  `${SCN}/ScenarioDetails.tsx`,
  `${SCN}/ScenarioLazy.tsx`,
  `${SCN}/scenario-regions.ts`,
  `${SCN}/use-desktop.ts`,
];
const COMPARE_FILES = [
  `${CMP}/page.tsx`,
  `${CMP}/CompareTable.tsx`,
  `${CMP}/CompareLazy.tsx`,
  `${CMP}/ComparePicker.tsx`,
  `${CMP}/RegionMarketSummary.tsx`,
  `${CMP}/compare-format.ts`,
  `${CMP}/MyCriteriaRank.tsx`,
];
const NEW_FILES = [
  `${SCN}/ScenarioClient.tsx`,
  `${SCN}/ScenarioControls.tsx`,
  `${SCN}/ScenarioDetails.tsx`,
  `${SCN}/ScenarioLazy.tsx`,
  `${SCN}/scenario-regions.ts`,
  `${SCN}/use-desktop.ts`,
  `${CMP}/page.tsx`,
  `${CMP}/CompareTable.tsx`,
  `${CMP}/CompareLazy.tsx`,
  `${CMP}/ComparePicker.tsx`,
  `${CMP}/RegionMarketSummary.tsx`,
  `${CMP}/compare-format.ts`,
  `${CMP}/MyCriteriaRank.tsx`,
  "lib/market/scenario-calc.ts",
  "lib/market/scenario-conclusion.ts",
  "lib/market/compare-conclusion.ts",
];

test("[1026b] 두 화면 — StepLine 한 번 · 결론 카드 하나 · 폰 하단 바 한 번 · 채움 파랑 리터럴 1 · 본문 | 레일 340 · 이어서 칩의 채움 파랑 없음 · 섹션 점 파랑", () => {
  for (const [name, files, main] of [
    ["scenario", SCENARIO_FILES, `${SCN}/ScenarioClient.tsx`],
    ["compare", COMPARE_FILES, `${CMP}/page.tsx`],
  ] as const) {
    const all = files.map(code).join("\n");
    assert.equal(count(all, "<StepLine"), 1, `${name} 절차 한 줄은 화면당 한 번`);
    assert.equal(count(all, "<VerdictCard"), 1, `${name} 결론 카드 하나`);
    assert.equal(count(all, "<MobilePrimaryBar"), 1, `${name} 폰 하단 바 한 번`);
    assert.equal(count(all, "btn-primary"), 1, `${name} 채움 파랑 리터럴 하나(레일 + 폰 바가 같은 요소)`);
    assert.ok(!all.includes("ActionButton"), `${name} 채움 실행 버튼(ActionButton · 실패 시 주홍 채움) 없음`);
    const m = code(main);
    assert.ok(m.includes("grid grid-cols-1") && m.includes("lg:grid-cols-[minmax(0,1fr)_340px]"), `${name} 본문 | 레일 340`);
    assert.ok(m.includes('<div className="hidden lg:block">{primary}</div>'), `${name} 카드 안 채움 파랑은 lg+ 레일에서만(폰은 하단 바)`);
    assert.ok(/<MobilePrimaryBar label=[^>]*>\{primary\}<\/MobilePrimaryBar>/.test(m), `${name} 폰 바 = 같은 요소`);
    assert.ok(!/note=\{\{/.test(all), `${name} 이어서 칩의 채움 파랑 없음`);
    assert.ok(m.includes('className="nz-dot-blue'), `${name} 섹션 점 파랑 하나`);
    assert.ok(m.includes("<PageHead"), `${name} 머리 한 모양`);
    assert.ok(m.indexOf("<PageHead") < m.indexOf("<StepLine") && m.indexOf("<StepLine") < m.indexOf("<VerdictCard"), `${name} 머리 → 절차 → 결론`);
  }
});

test("[1026b] 시나리오 — 결론 → 그림(스트레스 곡선) → 손잡이(폰 접이식) → 세부 · 손잡이는 자리 하나만(레일 / 접이식) · 채움 파랑 = 살까, 빌릴까", () => {
  const c = code(`${SCN}/ScenarioClient.tsx`);
  const order = ["<VerdictCard", "<ScrubLineLazy", 'aria-controls="scenario-panel"', "<ScenarioDetailsLazy"].map((s) => c.indexOf(s));
  assert.ok(order.every((v, i) => v > 0 && (i === 0 || v > order[i - 1])), `폰 순서 ${order}`);
  assert.ok(c.includes("{desktop === false && controls}"), "폰 접이식 안 — 폰일 때만");
  assert.ok(c.includes("desktop === true ? controls : desktop === null ? <ControlsShell /> : null"), "레일 — 데스크톱일 때만(모르면 같은 높이 자리 틀)");
  assert.equal(count(c, "<ScenarioControlsLazy"), 1, "손잡이 요소 하나");
  assert.ok(c.includes("href={SCENARIO_PRIMARY.href}"), "채움 파랑 = 살까, 빌릴까 계산");
  assert.ok(c.includes("scenarioConclusion(calc, pricePct)") && c.includes("computeScenario({ loanWon, priceWon, rateOffset, pricePct, incomeWon, baseRate, period })"), "결론은 화면 계산 결과 그대로");
  assert.ok(c.includes("/api/ai/market-baseline?regionId="), "기준가 조회 그대로");
  assert.ok(c.includes('sp.set("offset", String(rateOffset))') && c.includes('num("ltv")'), "공유 링크 · 딥링크 그대로");
  assert.ok(!c.includes("세로축 월 상환액"), "곡선 사용법 설명 문장은 걷었다");
  const page = code(`${SCN}/page.tsx`);
  assert.ok(page.includes("export const revalidate = 86_400;"), "캐시 정책 그대로");
  assert.ok(raw(`${SCN}/layout.tsx`).includes("noIndex: true"), "색인 정책 그대로");
  const d = code(`${SCN}/ScenarioDetails.tsx`);
  assert.match(d, /본 분석은 참고용이며 투자 판단의 책임은 이용자에게 있습니다\./, "AI 면책 그대로");
  assert.equal(count(d, "max-md:hidden"), 2, "폰은 결론과 겹치는 결과 두 칸을 숨긴다");
  const ctl = code(`${SCN}/ScenarioControls.tsx`);
  assert.ok(ctl.includes('aria-label="기준 금리 (연 %)"') && ctl.includes('aria-label="기준 금리 (연 %) 슬라이더"') && ctl.includes('aria-label="대출 비율 (%)"'), "입력 이름 그대로");
  assert.ok(!/min-h-\[(?:[0-3]\d)px\]/.test(ctl), "폰 누르는 자리 40px 미만 없음");
});

test("[1026b] 비교 — 빈 상태(0곳) = 카드 하나 + 회색 표 윤곽 + 한 문장 + 단지 검색 · 결정 카드에 담기 = 비교함 → /decide · 조회 그대로 · 딥링크는 한 벌만", () => {
  const p = code(`${CMP}/page.tsx`);
  const empty = p.slice(p.indexOf("{count === 0 ? ("), p.indexOf(") : (", p.indexOf("{count === 0 ? (")));
  assert.equal(count(empty, "<section"), 1, "카드 하나");
  assert.ok(empty.includes("border-dashed border-line-strong"), "회색 표 윤곽");
  assert.equal(count(empty, "<p "), 1, "한 문장");
  assert.ok(empty.includes("{picker}"), "단지 검색");
  assert.ok(p.includes("const picker = <ComparePickerLazy onAdd={add} readDeepLink={!deepLinkRead} onMounted={markDeepLinkRead} />"), "딥링크는 처음 마운트된 검색 한 벌만");
  assert.ok(/const toDecide = \(\) => \{[\s\S]*?addToCompareTray\(/.test(p) && p.includes("href={COMPARE_DECIDE_HREF} onClick={toDecide}"), "결정 카드에 담기 = 비교함 담기 → /decide");
  assert.ok(p.includes('fetch("/api/analysis/complex-compare"') && p.includes("body: JSON.stringify({ ids: idsKey.split(\"|\") })"), "비교 조회(POST) 그대로 — 결론과 표가 같은 값");
  assert.ok(p.includes("compareConclusion(items, { avg: fmtEok, pyeong: fmtPyeong })"), "결론 = 표 표기 그대로");
  assert.ok(p.includes("{desktop === false && handle}") && p.includes("desktop === true ? handle :"), "손잡이 자리 하나만");
  assert.ok(p.includes("{count > 0 && <MobilePrimaryBar"), "담은 단지가 없으면 하단 바 없음");
  assert.ok(p.includes("mergeServerCompareTray()") && p.includes("restoreToServer(item)"), "서버 병합 · 되돌리기 그대로");
  const pk = code(`${CMP}/ComparePicker.tsx`);
  assert.ok(pk.includes("{ initialComplexId: null, initialApt: null }"), "두 번째 검색부터 딥링크를 읽지 않는다");
  const t = code(`${CMP}/CompareTable.tsx`);
  assert.ok(t.includes("compareWinners(items ?? [])"), "배지 = 결론과 같은 함수");
  assert.ok(t.includes('className="relative overflow-x-auto max-md:hidden"') && t.includes("md:hidden"), "데스크톱 표 · 폰 카드 목록");
  assert.ok(t.includes("min-h-10"), "폰 카드의 단지 링크 40px");
  const s = code(`${CMP}/RegionMarketSummary.tsx`);
  assert.ok(s.includes('fetch("/api/ai/compare-summary"') && s.includes("{state.disclaimer}."), "스냅샷 조회 · 면책 그대로");
  assert.ok(s.includes("btn-secondary") && s.includes('if (state.kind === "loading" || regions.length === 0) return;'), "보조 버튼 · 두 번 누름 막기");
  const lib = raw("lib/market/compare-conclusion.ts");
  assert.ok(!/server-only|supabase|fetch\(/.test(lib), "순수 — 새 조회 없음");
  assert.ok(!code("lib/market/compare-conclusion.ts").includes("시세"), "실거래만 있는 곳에 '시세'를 쓰지 않는다");
  assert.ok(!code(`${CMP}/page.tsx`).includes("시세"), "비교 머리·결론에 '시세' 없음");
});

test("[1026b] 새·바꾼 파일 — 표식 · 토큰 색만(hex 없음) · 그라데이션·이모지 없음 · 임의 px 글자 없음 · 굵기 800 없음", () => {
  for (const p of NEW_FILES) {
    assert.ok(raw(p).includes("[1026b"), `${p} 표식`);
    const s = code(p);
    assert.ok(!/#[0-9a-fA-F]{3,6}\b/.test(s), `${p} hex 없음`);
    assert.ok(!/gradient/.test(s), `${p} 그라데이션 없음`);
    assert.ok(!/text-\[\d+(?:\.\d+)?px\]/.test(s), `${p} 램프 글자만`);
    assert.ok(!/font-extrabold|font-black|font-\[800\]/.test(s), `${p} 굵기 800 없음`);
    assert.ok(!/\p{Extended_Pictographic}/u.test(s.replace(/[✕✓▲▼]/g, "")), `${p} 이모지 없음`);
  }
});

/* ── ④ 번들 — 첫 묶음의 정적 import 그래프 ───────────────────────────── */

const ROOT = process.cwd();
function resolveSpec(from: string, spec: string): string | null {
  let base: string;
  if (spec.startsWith("@/")) base = join(ROOT, spec.slice(2));
  else if (spec.startsWith(".")) base = join(dirname(from), spec);
  else return null;
  for (const c of [base, `${base}.ts`, `${base}.tsx`, join(base, "index.ts"), join(base, "index.tsx")]) {
    if (existsSync(c) && statSync(c).isFile()) return c;
  }
  return null;
}
/** 정적 import(값) 만 — `import type`·`import { type A }` 만 있는 줄 · import() 는 첫 묶음이 아니다 */
function staticImports(src: string): string[] {
  const s = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const out: string[] = [];
  const re = /(?:^|\n)\s*(import|export)\s+([\s\S]*?)\s*from\s*["']([^"']+)["']|(?:^|\n)\s*import\s+["']([^"']+)["']/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    if (m[4]) {
      out.push(m[4]);
      continue;
    }
    const clause = m[2].trim();
    if (/^type\s/.test(clause)) continue;
    if (m[1] === "export" && !/^\*|^\{/.test(clause)) continue;
    const br = /^\{([\s\S]*)\}$/.exec(clause);
    if (br && br[1].split(",").map((x) => x.trim()).filter(Boolean).every((x) => x.startsWith("type "))) continue;
    out.push(m[3]);
  }
  return out;
}
function reachable(entry: string): Set<string> {
  const seen = new Set<string>();
  const stack = [join(ROOT, entry)];
  while (stack.length) {
    const f = stack.pop()!;
    if (seen.has(f)) continue;
    seen.add(f);
    for (const spec of staticImports(readFileSync(f, "utf8"))) {
      const r = resolveSpec(f, spec);
      if (r && !seen.has(r)) stack.push(r);
    }
  }
  return new Set([...seen].map((f) => relative(ROOT, f)));
}

test("[1026b] 번들 — 시나리오 첫 묶음에서 단지 검색 · 지역 목록 · ⓘ 사전 · Segmented · TweenNumber · 등락 표기가 빠졌다(next/dynamic ssr:false)", () => {
  const g = reachable(`${SCN}/ScenarioClient.tsx`);
  for (const heavy of [
    "app/analysis/ComplexPicker.tsx",
    "app/analysis/use-map-pick.tsx",
    "lib/map/seoul-districts.ts",
    "app/components/explain/Explain.tsx",
    "app/components/ui/Segmented.tsx",
    "app/components/motion/TweenNumber.tsx",
    "app/components/num/Delta.tsx",
    "lib/format/delta.ts",
    `${SCN}/ScenarioControls.tsx`,
    `${SCN}/ScenarioDetails.tsx`,
    `${SCN}/scenario-regions.ts`,
  ]) {
    assert.ok(!g.has(heavy), `${heavy} 는 첫 묶음 밖(지연 조각)`);
  }
  assert.ok(g.has(`${SCN}/ScenarioLazy.tsx`) && g.has("lib/market/scenario-conclusion.ts"), "지연 래퍼 · 결론 규칙은 첫 묶음");
  const lazy = code(`${SCN}/ScenarioLazy.tsx`);
  assert.equal(count(lazy, "ssr: false"), 2, "손잡이 · 세부 두 조각");
  assert.ok(lazy.includes('import("./ScenarioControls")') && lazy.includes('import("./ScenarioDetails")'));
  assert.ok(lazy.includes("loading: () => <ControlsShell />") && lazy.includes("loading: () => <DetailsShell />"), "같은 높이 자리 틀");
  const client = code(`${SCN}/ScenarioClient.tsx`);
  assert.ok(client.includes('import("./scenario-regions")'), "지역 목록은 import() 로만");
});

test("[1026b] 번들 — 비교 첫 묶음에서 단지 검색 · 레이더 · ⓘ 사전 · 내 기준 순위 · Segmented · TweenNumber · 채움 실행 버튼이 빠졌다", () => {
  const g = reachable(`${CMP}/page.tsx`);
  for (const heavy of [
    "app/analysis/ComplexPicker.tsx",
    "app/analysis/use-map-pick.tsx",
    "app/components/viz/Radar.tsx",
    "app/components/explain/Explain.tsx",
    `${CMP}/MyCriteriaRank.tsx`,
    "lib/compare/my-criteria.ts",
    "app/components/ui/Segmented.tsx",
    "app/components/motion/TweenNumber.tsx",
    "app/components/ui/ActionButton.tsx",
    "lib/format/delta.ts",
    `${CMP}/CompareTable.tsx`,
    `${CMP}/RegionMarketSummary.tsx`,
    `${CMP}/ComparePicker.tsx`,
  ]) {
    assert.ok(!g.has(heavy), `${heavy} 는 첫 묶음 밖(지연 조각)`);
  }
  const lazy = code(`${CMP}/CompareLazy.tsx`);
  assert.equal(count(lazy, "ssr: false"), 4, "비교표 · 내 기준 · 스냅샷 · 단지 검색 네 조각");
  assert.equal(count(lazy, "loading: () =>"), 4, "자리 틀");
});

test("[1026b] 손잡이 자리 고르기 — lg(1024px) matchMedia · 서버 값 null(모름) · useSyncExternalStore", () => {
  const u = code(`${SCN}/use-desktop.ts`);
  assert.ok(u.includes('"(min-width: 1024px)"') && u.includes("useSyncExternalStore(subscribe, read, readServer)"));
  assert.ok(u.includes("const readServer = (): boolean | null => null;"));
});
