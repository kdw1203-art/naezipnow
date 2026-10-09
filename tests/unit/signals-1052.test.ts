/* [1052] 다요인 분석(규칙 계산) 다듬기 — 1048 위에 잠그는 사실:
 *  S1 최신 자료 시점 — 꼴이 섞인 asOf("2026.09" · "2026-08" · "202608" · "2026.06~2026.08" · "2026-10-05")를 숫자 키로 맞춰 고른다.
 *  S2 빈 값을 점수로 만들지 않는다 — 방향 낱말 없는 뉴스 · 입주 예정 없음(0세대 · 잣대 없음)인 매물·공급은 null,
 *     관심도 일부 실패는 "표본 적음"이 아니라 failed. 공식 v2.
 *  S3 오름 쪽 · 내림 쪽 경계 하나(SIGNAL_LEAN) — 엔진 끌어올림/누름과 판 낱말이 같은 값.
 *  S4 "AI" 를 떼고 "다요인 분석 · 규칙 계산".
 *  S5 실패 · 표본 적음 · 자료 없음을 글과 모양으로 가르고, "반영 n/8"은 점수 있는 요인만.
 *  S6 요인 이름 → /methodology#signal-<key> · 줄마다 출처·기준 · 허브 도구 펼침에 "계산 방법 ›".
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  SIGNAL_FACTOR_ORDER,
  SIGNAL_FORMULA_VERSION,
  SIGNAL_LEAN as ENGINE_LEAN,
  computeSignals,
  interestFactor,
  newsFactor,
  signalPromptLines,
  supplyFactor,
  type SignalFactor,
  type SignalInputs,
} from "@/lib/signals/engine";
import {
  SIGNAL_LEAN,
  asOfKey,
  coverageBreakdown,
  factorStateWord,
  latestAsOf,
  scoreLean,
  scoreWord,
  unscoredReason,
  ymLabel,
} from "@/lib/signals/display";

const read = (p: string) => readFileSync(p, "utf8");
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const NOW = "2026-10-09T03:00:00.000Z";

function months(from: string, counts: number[]): { month: string; count: number }[] {
  const y = Number(from.slice(0, 4));
  const m = Number(from.slice(4, 6)) - 1;
  return counts.map((count, i) => {
    const d = new Date(Date.UTC(y, m + i, 1));
    return { month: `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}`, count };
  });
}

const BASE: SignalInputs = {
  scope: "complex",
  regionLabel: "안양 동안구",
  now: NOW,
  sentiment: {
    buySuperiority: { value: 99.1, asOf: "2026-10-05", area: "경기 전체" },
    housingCsi: { value: 124, prev: 119, asOf: "202609", group: "기타도시" },
  },
  news: {
    items: [
      { title: "평촌 아파트값 상승폭 확대", at: "2026-10-01T00:00:00Z" },
      { title: "안양 동안구 신고가 속출", at: "2026-09-20T00:00:00Z" },
      { title: "평촌 매물 쌓이고 급매 늘어", at: "2026-08-20T00:00:00Z" },
    ],
    windowDays: 60,
  },
  interest: { newsRecent30: 2, newsPrior30: 1, siteViews30: 4, siteViewsPrior30: 0, watchers: 1 },
  volume: { region: months("202508", [291, 618, 658, 156, 416, 401, 413, 465, 674, 635, 182, 516, 354, 123, 10]) },
  trend: { yoyPct: 18.3, fromYm: "202508", asOf: "202608" },
  momentum: {
    weekly: [100, 100.1, 100.15, 100.3, 100.35, 100.5, 100.62, 100.7, 100.85].map((value, i) => ({ period: `2026-08-${String(i + 1).padStart(2, "0")}`, value })),
    momPct: 0.4,
    momAsOf: "202608",
  },
  supply: { upcomingHouseholds: 3200, regionHouseholds: 140000, firstYm: "202611", lastYm: "202806" },
  rate: { baseRatePct: 3, loanRatePct: 4.4, loanAsOf: "202608", rateOutlookCsi: 128 },
  field: null,
};

const byKey = (fs: SignalFactor[], k: SignalFactor["key"]) => fs.find((f) => f.key === k) as SignalFactor;

/* ── S2 · 공식 v2 ───────────────────────────────────────────────────── */

test("S2 · 공식 v2 — 버전이 보고서 · 프롬프트 첫 줄에 실린다", () => {
  assert.equal(SIGNAL_FORMULA_VERSION, 2);
  const r = computeSignals(BASE);
  assert.equal(r.version, 2);
  assert.match(signalPromptLines(r)[0], /^\[다요인 시장 신호 v2 · /);
});

test("S2a · 방향 낱말 없는 뉴스 — 0점(중립)이 아니라 미반영 · 반영 수와 종합에서 빠진다", () => {
  const f = newsFactor({ items: [{ title: "평촌 재건축 설명회 열려", at: "2026-10-01T00:00:00Z" }, { title: "동안구 학군 지도", at: "2026-09-21T00:00:00Z" }, { title: "평촌 리모델링 조합 총회", at: "2026-09-02T00:00:00Z" }], windowDays: 60 });
  assert.equal(f.score, null, "방향 낱말 0개면 점수 없음");
  assert.equal(f.status, "thin");
  assert.equal(f.weight, 0);
  assert.match(f.note ?? "", /점수 미반영/);
  assert.match(f.value, /^기사 3건 · 오름 0 · 내림 0/, "사실 줄은 그대로");

  const neutralNews = { items: [{ title: "평촌 재건축 설명회 열려", at: "2026-10-01T00:00:00Z" }, { title: "동안구 학군 지도", at: "2026-09-21T00:00:00Z" }, { title: "평촌 리모델링 조합 총회", at: "2026-09-02T00:00:00Z" }], windowDays: 60 };
  const withNews = computeSignals({ ...BASE, news: neutralNews });
  const withoutNews = computeSignals({ ...BASE, news: null });
  assert.equal(byKey(withNews.factors, "news").score, null);
  assert.equal(withNews.coverage.used, withoutNews.coverage.used, "방향 없는 뉴스는 반영 수에 들지 않는다");
  assert.equal(withNews.index, withoutNews.index, "종합에도 0점으로 섞이지 않는다");
  assert.ok(signalPromptLines(withNews).some((l) => l.startsWith("- 뉴스: 미반영(표본 적음)")));
  /* 방향 낱말이 있으면 예전처럼 점수 */
  const ok = newsFactor(BASE.news);
  assert.equal(ok.status, "ok");
  assert.notEqual(ok.score, null);
});

test("S2b · 매물·공급 — 입주 예정 자료가 없거나 0세대 · 잣대 없음이면 null(숫자를 만들지 않는다)", () => {
  const listing = { items: [{ title: "평촌 매물 쌓이고 급매", at: "2026-10-01" }], windowDays: 60 };
  const missing = supplyFactor(null, listing);
  assert.equal(missing.score, null, "입주 예정 자료 없음 + 기사 단서만 → 미반영");
  assert.equal(missing.weight, 0);
  assert.match(missing.note ?? "", /입주 예정 자료 없음 · 점수 미반영/);
  const missing2 = supplyFactor({ upcomingHouseholds: null, regionHouseholds: 140000, firstYm: null, lastYm: null }, listing);
  assert.equal(missing2.score, null);
  const zero = supplyFactor({ upcomingHouseholds: 0, regionHouseholds: 140000, firstYm: null, lastYm: null }, null);
  assert.equal(zero.score, null, "0세대는 '정말 없음'과 '아직 안 실림'을 가를 수 없다 — 예전엔 +1 이었다");
  assert.equal(zero.status, "thin");
  const noYardstick = supplyFactor({ upcomingHouseholds: 3000, regionHouseholds: null, firstYm: "202611", lastYm: "202806", annualTrades: null }, listing);
  assert.equal(noYardstick.score, null, "세대수 · 연 거래 잣대가 없으면 미반영");
  assert.equal(supplyFactor(null, null).status, "none");
  /* 종합: 빠진 공급은 반영 수에서 빠진다 */
  const r = computeSignals({ ...BASE, supply: null });
  assert.equal(byKey(r.factors, "supply").score, null);
  assert.equal(r.coverage.used, 7);
  /* 적재 층 — 입주 예정 축이 비었을 때 0세대로 채우지 않는다 */
  const load = code("lib/signals/load.ts");
  assert.doesNotMatch(load, /ctx\.region \? 0 : null/);
  assert.match(load, /upcomingHouseholds: ctx\.supply \? ctx\.supply\.upcomingHouseholds : null/);
});

test("S2c · 관심도 — 못 읽은 것은 '불러오기 실패'(표본 적음과 다르다) · 지어낸 0건 없음", () => {
  const failedNewsThinSite = interestFactor({
    newsRecent30: null,
    newsPrior30: null,
    newsFailed: true,
    siteViews30: 2,
    siteViewsPrior30: 1,
    watchers: 0,
  });
  assert.equal(failedNewsThinSite.status, "failed");
  assert.equal(failedNewsThinSite.score, null);
  assert.match(failedNewsThinSite.value, /지역 기사 불러오기 실패/);
  assert.doesNotMatch(failedNewsThinSite.value, /지역 기사 30일 0건/, "못 읽은 기사를 0건으로 적지 않는다");
  assert.equal(unscoredReason(failedNewsThinSite), "불러오기 실패");

  const thin = interestFactor({ newsRecent30: 1, newsPrior30: 0, siteViews30: 2, siteViewsPrior30: 1, watchers: 0 });
  assert.equal(thin.status, "thin");
  assert.equal(unscoredReason(thin), "표본 적음");

  const siteFailed = interestFactor({ newsRecent30: 1, newsPrior30: 1, siteViews30: null, siteViewsPrior30: null, watchers: null, siteFailed: true });
  assert.equal(siteFailed.status, "failed");
  assert.match(siteFailed.value, /단지 조회·관심 불러오기 실패/);

  const partial = interestFactor({ newsRecent30: 6, newsPrior30: 2, siteViews30: null, siteViewsPrior30: null, watchers: null, siteFailed: true });
  assert.notEqual(partial.score, null, "읽은 쪽 표본이 차면 점수");
  assert.match(partial.note ?? "", /일부 불러오기 실패/);

  const r = computeSignals({ ...BASE, interest: { newsRecent30: null, newsPrior30: null, newsFailed: true, siteViews30: 2, siteViewsPrior30: 1, watchers: 0 } });
  assert.ok(signalPromptLines(r).some((l) => l.startsWith("- 관심도: 미반영(불러오기 실패)")));

  const load = code("lib/signals/load.ts");
  assert.match(load, /newsItems === "failed" \? null :/, "기사 실패 → null(0 아님)");
  assert.match(load, /newsFailed, siteViews30, siteViewsPrior30, watchers, siteFailed/);
});

/* ── S3 · 쪽 경계 하나 ──────────────────────────────────────────────── */

test("S3 · SIGNAL_LEAN — 엔진 끌어올림/누름과 판 낱말 · 색이 같은 경계", () => {
  assert.equal(ENGINE_LEAN, SIGNAL_LEAN, "엔진은 표시 모듈의 같은 상수를 다시 내보낸다");
  assert.ok(SIGNAL_LEAN.lean > 0 && SIGNAL_LEAN.strong > SIGNAL_LEAN.lean);
  const eps = 0.01;
  assert.equal(scoreWord(SIGNAL_LEAN.lean), "오름 쪽");
  assert.equal(scoreWord(SIGNAL_LEAN.lean - eps), "중립");
  assert.equal(scoreWord(-SIGNAL_LEAN.lean), "내림 쪽");
  assert.equal(scoreWord(SIGNAL_LEAN.strong), "오름 쪽 강함");
  assert.equal(scoreWord(-SIGNAL_LEAN.strong), "내림 쪽 강함");
  assert.equal(scoreLean(SIGNAL_LEAN.lean), 1);
  assert.equal(scoreLean(SIGNAL_LEAN.lean - eps), 0);
  assert.equal(scoreLean(-SIGNAL_LEAN.lean), -1);

  /* 행동: 끌어올림/누름 요인 = 판에서 "쪽" 낱말이 붙은 요인 */
  for (const input of [BASE, { ...BASE, trend: { yoyPct: 2.4, fromYm: "202508", asOf: "202608" } }, { ...BASE, rate: { baseRatePct: 3, loanRatePct: 5.2, loanAsOf: null, rateOutlookCsi: 100 } }]) {
    const r = computeSignals(input);
    const scored = r.factors.filter((f) => f.score !== null);
    assert.deepEqual(
      [...r.drivers.up].sort(),
      scored.filter((f) => scoreWord(f.score).startsWith("오름")).map((f) => f.label).sort(),
    );
    assert.deepEqual(
      [...r.drivers.down].sort(),
      scored.filter((f) => scoreWord(f.score).startsWith("내림")).map((f) => f.label).sort(),
    );
  }

  /* 소스: 매직 넘버가 엔진·표시에 따로 남지 않는다 */
  const engine = code("lib/signals/engine.ts");
  assert.match(engine, />= SIGNAL_LEAN\.lean/);
  assert.match(engine, /<= -SIGNAL_LEAN\.lean/);
  assert.doesNotMatch(engine, /\(f\.score as number\) >= 0\.5|\(f\.score as number\) <= -0\.5/);
  const display = code("lib/signals/display.ts");
  assert.match(display, /export const SIGNAL_LEAN = \{ lean: [\d.]+, strong: [\d.]+ \} as const/);
  assert.doesNotMatch(display, /score >= 0\.3|score > -0\.3|score >= 1\)|score > -1\)/);
  const board = code("app/components/signals/SignalBoard.tsx");
  assert.doesNotMatch(board, /f\.score >= 0\.3|f\.score <= -0\.3/, "판 색도 같은 경계(scoreLean)");
  assert.match(board, /scoreLean\(f\.score\)/);
});

/* ── S1 · 기준 시점 ─────────────────────────────────────────────────── */

test("S1 · asOf 숫자 키 — 꼴이 섞여도 같은 키 · 최신을 바르게 고른다", () => {
  assert.equal(asOfKey("2026.09"), "202609");
  assert.equal(asOfKey("2026-08"), "202608");
  assert.equal(asOfKey("202608"), "202608");
  assert.equal(asOfKey("2026.06~2026.08"), "202608", "기간은 끝 쪽");
  assert.equal(asOfKey("2026-10-05"), "20261005");
  assert.equal(asOfKey("2026-10-05T03:00:00.000Z"), "20261005");
  assert.equal(asOfKey("20261008"), "20261008");
  assert.equal(asOfKey("2026.9"), "202609");
  assert.equal(asOfKey("2026Q2"), null);
  assert.equal(asOfKey(""), null);
  assert.equal(asOfKey(null), null);
  assert.equal(asOfKey("2026-13"), null);

  /* 문자열 정렬이면 "-" < "." < "0" 이라 "202608" 이 맨 뒤 — 예전 판은 2026.10.05 자료가 있어도 "최신 자료 2026.08" 이라 적었다 */
  const mixed = ["2026.09", "2026-08", "202608", "2026.06~2026.08", "2026-10-05"];
  assert.equal([...mixed].sort().pop(), "202608", "예전 방식(문자열 정렬)은 틀린 답");
  assert.equal(latestAsOf(mixed), "2026.10.05");
  assert.equal(latestAsOf(["2026.09", "2026-08", "202608", "2026.06~2026.08"]), "2026.09");
  assert.equal(latestAsOf(["202610", "2026-10-03"]), "2026.10.03", "같은 달이면 날짜까지 적힌 쪽");
  assert.equal(latestAsOf([null, "2026Q2", undefined]), null);

  /* 표시도 한 꼴 — 점 표기 */
  assert.equal(ymLabel("2026-08"), "2026.08");
  assert.equal(ymLabel("2026.09"), "2026.09");
  assert.equal(ymLabel("20261008"), "2026.10.08");
  assert.equal(ymLabel("202609"), "2026.09");
  assert.equal(ymLabel("2026-10-05"), "2026.10.05");

  const board = code("app/components/signals/SignalBoard.tsx");
  assert.match(board, /latestAsOf\(report\.factors\.map\(\(f\) => f\.asOf\)\)/);
  assert.doesNotMatch(board, /\.filter\(\(v\): v is string => Boolean\(v\)\)\.sort\(\)/, "문자열 정렬 금지");
});

/* ── S5 · 점수 없는 줄의 까닭 · 반영 수 ─────────────────────────────── */

test("S5 · 실패 · 표본 적음 · 자료 없음 — 낱말이 갈리고 반영 수는 점수 있는 요인만", () => {
  const r = computeSignals({
    ...BASE,
    sentiment: "failed",
    news: { items: [{ title: "평촌 재건축 설명회 열려", at: "2026-10-01T00:00:00Z" }], windowDays: 60 },
    supply: null,
  });
  const words = Object.fromEntries(r.factors.map((f) => [f.key, factorStateWord(f)]));
  assert.equal(words.sentiment, "불러오기 실패");
  assert.equal(words.news, "표본 적음");
  assert.equal(words.supply, "자료 없음");
  const cov = coverageBreakdown(r.factors);
  assert.equal(cov.used, r.coverage.used, "판의 반영 수 = 엔진의 반영 수");
  assert.equal(cov.used + cov.thin + cov.failed + cov.none, 8);
  assert.deepEqual({ failed: cov.failed, thin: cov.thin, none: cov.none }, { failed: 1, thin: 1, none: 1 });
  for (const f of r.factors) if (f.score === null) assert.equal(f.weight, 0, `${f.key} 점수 없으면 가중치 0`);

  const board = code("app/components/signals/SignalBoard.tsx");
  assert.match(board, /반영 \$\{cov\.used\}\/\$\{cov\.total\}/);
  assert.match(board, /불러오기 실패 \$\{cov\.failed\}/);
  assert.match(board, /border-dashed border-warning-border/, "실패 줄은 점선 경고 테");
  assert.match(board, /text-warning/);
  assert.match(board, /factorStateWord\(f\)/);
});

/* ── S4 · 이름 ──────────────────────────────────────────────────────── */

test("S4 · 'AI' 를 떼고 다요인 분석 · 규칙 계산", () => {
  const board = read("app/components/signals/SignalBoard.tsx");
  assert.match(board, /title = "다요인 분석"/);
  assert.match(board, /규칙 계산 · \{cov\.total\}개 요인 · 공식 v\{report\.version\}/);
  assert.match(read("app/notes/[id]/NoteSignals.tsx"), /title="다요인 분석 · 이 노트 지역"/);
  for (const p of ["app/components/signals/SignalBoard.tsx", "app/notes/[id]/NoteSignals.tsx"]) {
    assert.doesNotMatch(code(p), /AI 다요인/, p);
  }
  const m = read("app/methodology/page.tsx");
  const sec = m.slice(m.indexOf('id: "signals"'), m.indexOf('id: "missing"'));
  assert.doesNotMatch(sec, /AI 다요인/);
  assert.match(sec, /q: "\\"다요인 분석\(시장 신호\)\\"은 어떻게 계산하나요\?"/);
  assert.match(sec, /AI가 만든 판단이 아니라 정해진 규칙으로 계산/);
  assert.match(sec, /현재 공식 v\$\{SIGNAL_FORMULA_VERSION\}/, "공식 번호는 엔진 상수 — 문서가 어긋나지 않는다");
  assert.match(sec, /±\$\{SIGNAL_LEAN\.lean\} 이상/, "쪽 경계도 엔진 상수");
  assert.doesNotMatch(sec, /공식 v1|SIGNAL_FORMULA_VERSION 1/);
});

/* ── S6 · 출처 · 요인별 계산 방법 링크 ─────────────────────────────── */

test("S6 · 요인 이름 → /methodology#signal-<key> · 줄마다 출처·기준 · 허브 '계산 방법 ›'", () => {
  const board = read("app/components/signals/SignalBoard.tsx");
  assert.match(board, /`\/methodology#signal-\$\{key\}`/);
  assert.match(board, /aria-label=\{`\$\{f\.label\} 계산 방법`\}/);
  assert.match(board, /min-h-\[40px\][^"]*md:min-h-6/, "탭 범위 폰 40px · 데스크톱 24px");
  assert.match(board, /출처 \{f\.source\}/);
  assert.match(board, /` · 기준 \$\{asOf\}`/);
  /* 판은 클라이언트에도 놓인다 — 엔진 값이 아니라 표시 모듈만 */
  assert.doesNotMatch(board, /^import \{[^}]*\} from "@\/lib\/signals\/engine"/m);

  const m = read("app/methodology/page.tsx");
  assert.match(m, /id: `signal-\$\{key\}`/);
  assert.match(m, /items: SIGNAL_FACTOR_ORDER\.map\(/);
  assert.match(m, /<div key=\{it\.id\} id=\{it\.id\}/);
  for (const key of SIGNAL_FACTOR_ORDER) assert.match(m, new RegExp(`\\n  ${key}:\\s*\\n?\\s*"`), `요인 설명 ${key}`);
  assert.match(m, /\.\.\.\(s\.items \?\? \[\]\)\.map/, "FAQ JSON-LD 도 같은 배열(본문과 내용 일치)");

  const hub = read("app/analysis/hub-tool-detail.tsx");
  assert.match(hub, /href="\/methodology#signals"/);
  assert.match(hub, /계산 방법 ›/);
  assert.match(hub, /min-h-\[40px\][^"]*md:min-h-6/);
  assert.ok(!/^"use client"/m.test(hub), "서버 조각 그대로");
});
