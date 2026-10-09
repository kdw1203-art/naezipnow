/* [1048] AI 다요인 분석(시장 신호) — 소유자 지시(2026-10-09):
 *   "AI 분석에 심리지수 · 부동산 뉴스 · 관심도 · 거래량 · 추이 · 추세 · 매물수 등 여러 요인을 고려하는 툴 ·
 *    임장노트 결과에도 범용으로 반영"
 *
 * 잠그는 사실:
 *  ① 8요인 · 요인 점수 −2~+2 · 종합 0~100(50 중립) · 점수 있는 요인 3개 미만이면 종합 없음.
 *  ② 없음(none) · 못 읽음(failed) · 표본 적음(thin)을 가른다 — 지어낸 점수 없음.
 *  ③ 거래량은 신고 기한이 남은 이번 달·지난달을 뺀다 · 1년 전 같은 3개월이 있으면 그것과 비교.
 *  ④ 뉴스는 제목 낱말만 센다 · 우리 자동 글은 뺀다 · 매물 단서는 매물·공급 요인으로.
 *  ⑤ 현장(임장 기록 점수)은 시장 점수에 섞지 않는다.
 *  ⑥ 같은 엔진이 단지 화면 · 임장노트 · AI 분석 도구(프롬프트 + 결과 판)에 걸려 있다.
 *  ⑦ 시도 매수우위 적재(REB 시도 행) · 한국은행 주택가격전망 CSI 적재.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  SIGNAL_FACTOR_ORDER,
  annualTradesFrom,
  completeMonths,
  complexPriceChange,
  computeSignals,
  momentumFactor,
  newsFactor,
  rateFactor,
  sentimentFactor,
  signalBand,
  signalPromptLines,
  supplyFactor,
  volumeFactor,
  type SignalInputs,
} from "@/lib/signals/engine";
import { isOwnGeneratedPost, summarizeNewsTone, titleTone } from "@/lib/signals/news-tone";
import { sidoByName, sidoFromClsFullNm } from "@/lib/region/sido";
import { scoreWord, ymLabel } from "@/lib/signals/display";

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

test("8요인 · 고정 순서 · 종합 0~100 · 구간 낱말", () => {
  const r = computeSignals(BASE);
  assert.deepEqual(
    r.factors.map((f) => f.key),
    [...SIGNAL_FACTOR_ORDER],
  );
  assert.equal(r.factors.length, 8);
  assert.ok(r.index !== null && r.index >= 5 && r.index <= 95);
  for (const f of r.factors) if (f.score !== null) assert.ok(f.score >= -2 && f.score <= 2, `${f.key} ${f.score}`);
  assert.equal(signalBand(70), "상승 신호 강함");
  assert.equal(signalBand(50), "혼조");
  assert.equal(signalBand(30), "하락 신호 강함");
  assert.match(r.headline, /끌어올림|누름|두드러진 요인 없음/);
});

test("점수 있는 요인 3개 미만이면 종합 없음 · '자료 부족'", () => {
  const r = computeSignals({
    ...BASE,
    sentiment: null,
    news: null,
    interest: null,
    volume: null,
    trend: null,
    momentum: null,
    supply: { upcomingHouseholds: 3200, regionHouseholds: 140000, firstYm: null, lastYm: null },
    rate: { baseRatePct: 3, loanRatePct: 4.4, loanAsOf: null, rateOutlookCsi: null },
  });
  assert.equal(r.index, null);
  assert.equal(r.band, null);
  assert.match(r.headline, /^자료 부족 · 8개 요인 중 2개만 확인/);
});

test("없음 · 못 읽음 · 표본 적음을 가른다(지어낸 점수 없음)", () => {
  assert.equal(sentimentFactor(null).status, "none");
  assert.equal(sentimentFactor("failed").status, "failed");
  assert.equal(sentimentFactor("failed").score, null);
  const thinInterest = computeSignals({ ...BASE, interest: { newsRecent30: 1, newsPrior30: 0, siteViews30: 2, siteViewsPrior30: 1, watchers: 0 } }).factors.find(
    (f) => f.key === "interest",
  );
  assert.equal(thinInterest?.status, "thin");
  assert.equal(thinInterest?.score, null, "표본이 작으면 점수 미반영");
  assert.equal(thinInterest?.weight, 0);
});

test("심리 — 매수우위(100 균형) · 주택가격전망 CSI(100 균형)", () => {
  const f = sentimentFactor({ buySuperiority: { value: 107.5, asOf: "2026-10-05", area: "서울 전체" }, housingCsi: null });
  assert.equal(f.score, 1);
  const g = sentimentFactor({ buySuperiority: null, housingCsi: { value: 125, prev: 120, asOf: "202609", group: "서울" } });
  assert.equal(g.score, 2);
  assert.match(g.value, /주택가격전망 CSI 125\(서울 · 3개월 전 120\)/);
});

test("거래량 — 이번 달·지난달 제외 · 1년 전 같은 3개월과 비교", () => {
  const rows = months("202508", [291, 618, 658, 156, 416, 401, 413, 465, 674, 635, 182, 516, 354, 123, 10]);
  const done = completeMonths(rows, NOW);
  assert.equal(done[done.length - 1].month, "202608", "2026.10(이번 달) · 2026.09(신고 기한 안) 제외");
  const f = volumeFactor({ region: rows }, NOW);
  /* 2026.06~08 = 182+516+354 = 1052 · 2025.06~08 은 다 있지 않음(2025.08 부터) → 직전 3개월 2026.03~05 = 465+674+635 = 1774 */
  assert.match(f.value, /2026\.06~2026\.08 1,052건 · 직전 3개월 1,774건\(−41%\)/);
  assert.ok((f.score ?? 0) < -1.5);
  const yoy = volumeFactor({ region: months("202506", [100, 100, 100, 1, 1, 1, 1, 1, 1, 1, 1, 1, 150, 150, 150, 9, 9]) }, NOW);
  assert.match(yoy.value, /1년 전 같은 3개월 300건\(\+50%\)/);
  assert.equal(yoy.score, 2);
});

test("단기 추세 — 주간 최근 3주 평균 · 없으면 월간으로 대신(표본 적음)", () => {
  const f = momentumFactor({ weekly: BASE.momentum !== "failed" && BASE.momentum ? BASE.momentum.weekly : [], momPct: null, momAsOf: null });
  assert.equal(f.status, "ok");
  assert.match(f.value, /^최근 3주 평균 \+0\.\d\d% · 직전/);
  const m = momentumFactor({ weekly: [], momPct: -0.5, momAsOf: "202608" });
  assert.equal(m.status, "thin");
  assert.equal(m.score, -1);
});

test("뉴스 — 제목 낱말만 · 우리 자동 글 제외 · 매물 단서는 매물·공급으로", () => {
  assert.deepEqual(titleTone("서울 아파트값 0.12% 올라 87주 연속 상승").up, ["상승", "올라"]);
  assert.deepEqual(titleTone("기준금리 3.0% 인상에 집값 제동").down, []);
  assert.deepEqual(titleTone("금리 인상 여파 거래 절벽").down, ["절벽", "금리 인상"]);
  assert.equal(titleTone("강남은 급매 쌓이고 강북은 매물 품귀").listing, "up");
  assert.equal(titleTone("세제개편 뒤 서울 아파트 매물 1만1978건 늘어").listing, "up");
  assert.equal(isOwnGeneratedPost({ title: "안양시 동안구 시장 브리핑 — 2026.10", sourceName: null }), true);
  assert.equal(isOwnGeneratedPost({ title: "오늘의 신고가 — 평촌더샵 15.5억 등 5건", sourceName: "국토교통부 실거래가" }), true);
  assert.equal(isOwnGeneratedPost({ title: "평촌 집값 상승", sourceName: "연합뉴스" }), false);
  const s = summarizeNewsTone(["평촌 상승 확대", "동안구 신고가", "평촌 하락 전환"]);
  assert.equal(s.upCount, 2);
  assert.equal(s.downCount, 1);
  assert.equal(newsFactor({ items: [], windowDays: 60 }).status, "none");
  const sup = supplyFactor(null, { items: [{ title: "평촌 매물 쌓이고 급매", at: "2026-10-01" }], windowDays: 60 });
  assert.match(sup.value, /매물 기사 늘어남 1 · 줄어듦 0/);
  /* [1052 · v2] 입주 예정 자료가 없으면 기사 단서만으로 점수를 만들지 않는다(같은 제목을 뉴스 요인이 이미 센다) */
  assert.equal(sup.score, null);
  assert.equal(sup.note, "입주 예정 자료 없음 · 점수 미반영");
  const supWith = supplyFactor(
    { upcomingHouseholds: 4200, regionHouseholds: 140000, firstYm: "202611", lastYm: "202806" },
    { items: [{ title: "평촌 매물 쌓이고 급매", at: "2026-10-01" }], windowDays: 60 },
  );
  assert.equal(supWith.score, -0.75, "입주 예정이 있으면 매물 단서를 함께 평균");
  assert.equal(supWith.note, "매물 수 원천 없음 · 기사 제목 단서로 대신");
});

test("매물·공급 — 입주 예정 ÷ 지역 세대 · 0세대는 표본 적음", () => {
  const f = supplyFactor({ upcomingHouseholds: 4200, regionHouseholds: 140000, firstYm: "202611", lastYm: "202806" }, null);
  assert.match(f.value, /입주 예정 4,200세대\(2026\.11~2028\.06\) · 지역 세대의 3\.0%/);
  assert.equal(f.score, -1);
  const z = supplyFactor({ upcomingHouseholds: 0, regionHouseholds: 140000, firstYm: null, lastYm: null }, null);
  assert.equal(z.status, "thin");
  /* 세대수 자료(KOSIS)가 없으면 연 매매 신고를 잣대로 — 운영 실측(안양 동안구 2026-10-09): 입주 4,169세대(2026.10~2028.08) · 연 매매 5,488건 */
  const t = supplyFactor({ upcomingHouseholds: 4169, regionHouseholds: null, firstYm: "202610", lastYm: "202808", annualTrades: 5488 }, null);
  assert.match(t.value, /연 환산 2,175세대 = 연 매매 5,488건의 40%/);
  assert.equal(t.score, 0.35);
  assert.equal(t.status, "ok");
  const rows = months("202508", [291, 618, 658, 156, 416, 401, 413, 465, 674, 635, 182, 516, 354, 123, 10]);
  assert.equal(annualTradesFrom(rows, NOW), 618 + 658 + 156 + 416 + 401 + 413 + 465 + 674 + 635 + 182 + 516 + 354);
  assert.equal(annualTradesFrom(rows.slice(-8), NOW), null, "12개월이 안 되면 없음");
});

test("금리 — 대출금리 4.5% 기준 · 금리 오를 거라는 응답이 많으면 내림 쪽", () => {
  assert.equal(rateFactor({ baseRatePct: 3, loanRatePct: 3.5, loanAsOf: null, rateOutlookCsi: null }).score, 1);
  assert.equal(rateFactor({ baseRatePct: 3, loanRatePct: 5.5, loanAsOf: null, rateOutlookCsi: 120 }).score, -1.5);
  assert.match(rateFactor({ baseRatePct: 3, loanRatePct: 4.4, loanAsOf: "202608", rateOutlookCsi: 128 }).value, /기준금리 3% · 대출금리 4\.4%\(2026\.08\) · 금리수준전망 CSI 128/);
});

test("현장(임장 기록 점수)은 시장 점수에 섞지 않는다", () => {
  const a = computeSignals(BASE);
  const b = computeSignals({ ...BASE, scope: "note", field: { score100: 92, label: "이 노트 기록 점수", source: "작성자 직접 방문 기록" } });
  assert.equal(a.index, b.index);
  assert.match(b.headline, /현장 92점$/);
  assert.ok(signalPromptLines(b).some((l) => l === "- 현장(이 노트 기록 점수): 92/100"));
});

test("프롬프트 줄 — 버전 · 요인 8줄 · 숫자를 고치지 말라는 규칙 · 권유 아님", () => {
  const lines = signalPromptLines(computeSignals(BASE));
  assert.match(lines[0], /^\[다요인 시장 신호 v2 · 안양 동안구\] 종합 \d+\/100/);
  assert.equal(lines.filter((l) => l.startsWith("- ")).length, 8);
  assert.match(lines[lines.length - 1], /고치거나 새 숫자를 만들지 말 것.*매수·매도 권유가 아니다/);
});

test("표시 낱말 · 날짜 · 단지 주력 평형 중위 변화", () => {
  assert.equal(scoreWord(null), "미반영");
  assert.equal(scoreWord(1.2), "오름 쪽 강함");
  assert.equal(scoreWord(-0.5), "내림 쪽");
  assert.equal(ymLabel("202609"), "2026.09");
  assert.equal(ymLabel("2026-10-05"), "2026.10.05");
  const yms = ["202603", "202604", "202605", "202606", "202607", "202608", "202609", "202610"];
  assert.deepEqual(complexPriceChange(yms, [50000, null, 52000, 53000, 54000, null, 99999, 99999], NOW), { recent: 53500, prior: 51000 });
});

test("시도 — R-ONE 시도 행 · 정확 표기만", () => {
  assert.equal(sidoFromClsFullNm("전국>수도권>경기")?.id, "sido-gyeonggi");
  assert.equal(sidoFromClsFullNm("지방권>강원")?.id, "sido-gangwon");
  assert.equal(sidoFromClsFullNm("서울>강북지역>동북권"), null, "서울 아래 권역은 시도 행이 아니다");
  assert.equal(sidoFromClsFullNm("수도권"), null);
  assert.equal(sidoByName("광주시"), null, "경기 광주시를 광주광역시로 붙이지 않는다");
  assert.equal(sidoByName("광주광역시")?.csiGroup, "6대광역시");
  assert.equal(sidoByName("경기도")?.csiGroup, "기타도시");
});

test("배선 — 단지 화면 · 임장노트 · AI 분석(프롬프트 + 결과 판) · 브리핑 · 적재", () => {
  const page = code("app/complex/[id]/page.tsx");
  assert.ok(page.indexOf("<ComplexSignals") > page.indexOf("<ComplexAxisSummary"), "결과 요약 바로 아래");
  assert.match(code("app/complex/[id]/ComplexSignals.tsx"), /withSectionBudget\(/);
  assert.match(code("app/complex/[id]/section-loaders.ts"), /prefetchSignalParts\(axisRegionName/);
  const note = code("app/notes/[id]/page.tsx");
  assert.match(note, /<Suspense fallback=\{null\}>\s*<NoteSignals/);
  assert.match(code("app/api/inspection/ai/route.ts"), /marketSignals: signals \? signalPromptLines\(signals\) : undefined/);
  const ana = code("app/api/ai/analysis/route.ts");
  assert.equal((ana.match(/signalsForInput\(input\)/g) ?? []).length, 2, "자체 계산 · 외부 AI 두 길 모두");
  assert.match(ana, /marketSignals: signalPromptLines\(signals\)/);
  assert.match(code("app/analysis/ai/[tool]/ResultView.tsx"), /<SignalBoard report=\{result\.signals\}/);
  assert.match(code("lib/ai/note-draft.ts"), /signalPromptLines\(signals\)/);
  /* 판은 클라이언트에도 놓인다 — 엔진 전체가 아니라 표시 낱말만 싣는다 */
  assert.doesNotMatch(read("app/components/signals/SignalBoard.tsx"), /^import \{[^}]*\} from "@\/lib\/signals\/engine"/m);
  assert.match(read("app/components/signals/SignalBoard.tsx"), /import type \{ SignalReport, SignalFactor \} from "@\/lib\/signals\/engine"/);
  const ingest = code("lib/reb/ingest.ts");
  assert.match(ingest, /stat\.metric === "buy_superiority" \|\| stat\.metric === "jeonse_supply"/);
  assert.match(ingest, /level: "sido"/);
  assert.match(code("lib/reb/client.ts"), /matchSidoRow\(r\.CLS_FULLNM \?\? r\.CLS_NM\)/);
  assert.match(code("lib/ecos/sync.ts"), /cache_key: "ecos:housing-csi"/);
  assert.match(code("lib/ecos/client.ts"), /\{ key: "housing:기타도시", item: "FMFB", group: "F0003" \}/);
  assert.match(read("app/methodology/page.tsx"), /id: "signals"/);
});
