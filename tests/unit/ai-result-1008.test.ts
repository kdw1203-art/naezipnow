import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  complexNewsToken,
  isComplexNews,
  isRegionNews,
  regionNewsTokens,
  supplyQueryFor,
} from "../../lib/ai/region-parts.ts";
import { buildRegionTrend, patchSnapshot } from "../../lib/ai/region-trend.ts";
import { buildPriceScenario, clampYears, signedPct } from "../../lib/ai/price-scenarios.ts";
import { buildComplexTradeSeries, resolveUnitPrice, unitOf } from "../../lib/ai/result-series.ts";
import { applyPriceAutofill, EMPTY_AUTOFILL, priceManString } from "../../lib/ai/tuning-autofill.ts";
import { riskChecklist } from "../../lib/ai/insight-blocks.ts";
import { BAND_LABEL, buildVerdict } from "../../lib/ai/verdict.ts";
import { AI_TOOL_IDS } from "../../lib/ai/ai-tools.ts";
import { layoutPriceChart, niceTicks } from "../../app/components/viz/price-chart-geometry.ts";
import type { LiveToolContext } from "../../lib/ai/live-context.ts";

/* [1008 · W] AI 분석 결과 화면 개편 — 데이터 버그(입주물량·뉴스·서울 스냅샷)와 그래프·쉬운 말 규칙.
   숫자는 전부 이 파일 안의 테스트용 값이다(운영 데이터를 박지 않는다). */

/* ── 입주물량: 통째 이름 → 구·시로 쪼개기 ───────────────────────────── */
test("[1008] 입주물량 조회 — 두 낱말은 구 + 시, 세종은 '세종특별자치시' 주소 표기", () => {
  assert.deepEqual(supplyQueryFor("서울 강남구"), { area: "강남구", city: "서울" });
  assert.deepEqual(supplyQueryFor("안양 동안구"), { area: "동안구", city: "안양" });
  assert.deepEqual(supplyQueryFor("부산 해운대구"), { area: "해운대구", city: "부산" });
  assert.deepEqual(supplyQueryFor("세종시"), { area: "세종특별자치시", city: "세종" });
  assert.deepEqual(supplyQueryFor("제주시"), { area: "제주시", city: "제주" });
  assert.deepEqual(supplyQueryFor("남양주시"), { area: "남양주시", city: null });
  assert.equal(supplyQueryFor("  "), null);
});

/* ── 뉴스 적합성 ──────────────────────────────────────────────────── */
test("[1008] 지역 뉴스는 제목에 그 지역 낱말이 있어야 — 요약 깊숙이 스친 기사는 빠진다", () => {
  const anyang = regionNewsTokens("안양 동안구");
  assert.ok(anyang.includes("동안구") && anyang.includes("평촌") && anyang.includes("안양"));
  /* 캡처의 두 기사 — 제목에 안양·동안구·평촌이 없다 */
  assert.equal(isRegionNews({ title: "서울 아파트값 84주 연속 상승…중랑 0.51% 뛰고 강남 -0.36%", summary: null }, anyang), false);
  assert.equal(isRegionNews({ title: "삼성전자 5억 사내대출에 경기남부 들썩…동탄구 올해 17.86%", summary: null }, anyang), false);
  assert.equal(isRegionNews({ title: "평촌 A-17 통합재건축 설계 수주", summary: null }, anyang), true);
  /* 광역시 자치구는 시 이름만으로는 안 붙는다 · 여러 도시에 있는 구는 도시와 함께 */
  const gangnam = regionNewsTokens("서울 강남구");
  assert.ok(gangnam.includes("강남구") && gangnam.includes("강남"));
  assert.ok(!gangnam.includes("서울"));
  assert.deepEqual(regionNewsTokens("대구 중구"), ["대구 중구", "대구중구"]);
});

test("[1008] 단지 뉴스 — 제목·요약 앞부분에 단지명, 두 글자 이름은 지역 낱말도 함께", () => {
  assert.equal(complexNewsToken("공작아파트"), "공작");
  assert.equal(complexNewsToken("한가람(삼성)"), "한가람삼성");
  assert.equal(complexNewsToken("헬리오시티"), "헬리오시티");
  const hints = ["강남구", "강남"];
  assert.equal(isComplexNews({ title: "은마 이주 가시화에 전세 2억 하락", summary: "서울 강남구 대치동 은마아파트…" }, "은마", hints), true);
  assert.equal(isComplexNews({ title: "공작기계 수출 늘었다", summary: "산업 뉴스" }, "공작", ["동안구", "평촌", "안양"]), false);
  assert.equal(isComplexNews({ title: "헬리오시티 전세 거래 늘어", summary: null }, "헬리오시티", []), true);
  /* 요약 160자 뒤에만 나오는 단지는 그 단지 기사가 아니다 */
  const deep = "가".repeat(300) + "헬리오시티";
  assert.equal(isComplexNews({ title: "서울 전세 시장 동향", summary: deep }, "헬리오시티", []), false);
});

/* ── 지역 흐름(REB 월간 지수) ─────────────────────────────────────── */
const idx = (pairs: Array<[string, number]>) => pairs.map(([period, value]) => ({ period, value }));

test("[1008] 지역 1년 변화 — 같은 달 1년 전 지수 대비, 기준 변경 흔적(한 달 ±5% 넘게)이 있으면 말하지 않는다", () => {
  const months = ["2025-08", "2025-09", "2025-10", "2025-11", "2025-12", "2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06", "2026-07", "2026-08"];
  const values = [80, 81, 82, 83, 84, 85, 86, 87, 88, 89, 90, 91, 92];
  const t = buildRegionTrend({ saleIndex: idx(months.map((m, i) => [`${m}-01`, values[i]])) });
  assert.equal(t?.yoyPct, 15);
  assert.equal(t?.asOf, "202608");
  assert.equal(t?.momPct, 1.1);
  /* 창 안에 −10% 튐 → 기준 변경 흔적 */
  const jumped = [...values];
  jumped[3] = 72;
  const t2 = buildRegionTrend({ saleIndex: idx(months.map((m, i) => [`${m}-01`, jumped[i]])) });
  assert.equal(t2?.yoyPct, null);
  /* 1년 전 달이 없으면 null */
  const t3 = buildRegionTrend({ saleIndex: idx([["2026-07-01", 100], ["2026-08-01", 101]]) });
  assert.equal(t3?.yoyPct, null);
  assert.equal(t3?.momPct, 1);
});

test("[1008] 스냅샷 빈 칸만 같은 출처 시계열로 채우고 반올림한다 — 값이 있는 칸은 그대로", () => {
  const trend = buildRegionTrend({
    saleIndex: idx([["2026-06-01", 100], ["2026-07-01", 100.5723]]),
    jeonseRatio: idx([["2026-07-01", 42.98181844]]),
    tradeCount: idx([["2026-07-01", 311]]),
  });
  /* 서울 구 — period '' · 값 null · 거래량만 있음 */
  const seoul = patchSnapshot({ avgSale: null, jeonseRatio: null, saleChangeMonthly: null, tradeCount: 311, period: "" }, trend);
  assert.ok(seoul);
  assert.equal(seoul!.saleChangeMonthly, 0.57);
  assert.equal(seoul!.jeonseRatio, 43);
  assert.equal(seoul!.period, "202607");
  /* 값이 있는 스냅샷 — 원값 유지, 전세가율만 반올림 */
  const kept = patchSnapshot({ avgSale: 1, jeonseRatio: 55.251254396857, saleChangeMonthly: 1.03, tradeCount: 448, period: "202608" }, trend);
  assert.equal(kept!.jeonseRatio, 55.3);
  assert.equal(kept!.saleChangeMonthly, 1.03);
  assert.equal(kept!.period, "202608");
  assert.equal(patchSnapshot(null, null), null);
});

/* ── 시세 예측 시나리오(가정 계산) ─────────────────────────────────── */
test("[1008] 시나리오 — 기본은 지난 1년 속도의 절반(연 ±4% 이내), 낙관·비관은 ±3%p, 기간은 1·3·5년", () => {
  const s = buildPriceScenario({ startKrw: 650_000_000, startYm: "202608", yoyPct: 18.3, horizonMonths: 36 });
  assert.ok(s);
  assert.deepEqual(s!.annual, { opt: 7, base: 4, pess: 1 });
  assert.equal(s!.years, 3);
  assert.equal(s!.path.length, 4);
  assert.equal(s!.path[1].base, 676_000_000);
  const down = buildPriceScenario({ startKrw: 500_000_000, yoyPct: -3 });
  assert.deepEqual(down!.annual, { opt: 1.5, base: -1.5, pess: -4.5 });
  /* 1년 흐름이 없으면 한 달 변화 × 12 */
  const mom = buildPriceScenario({ startKrw: 500_000_000, momPct: 0.2 });
  assert.equal(mom!.anchorKind, "mom12");
  assert.equal(mom!.annual.base, 1.2);
  /* 재료가 없으면 선을 지어내지 않는다 */
  assert.equal(buildPriceScenario({ startKrw: null, yoyPct: 5 }), null);
  assert.equal(buildPriceScenario({ startKrw: 1e9 }), null);
  assert.equal(clampYears(60), 5);
  assert.equal(clampYears(null), 1);
  assert.equal(signedPct(-1.5), "−1.5%");
  assert.equal(signedPct(1.03, 2), "+1.03%");
});

/* ── 최근 실거래가·그래프 재료: 평형(전용 ㎡ 정수) 단위 ───────────────────── */
/* 테스트용 행 — 한 면적대(~59㎡)에 싼 37㎡ 와 비싼 50㎡ 가 섞인 단지 모양(값은 지어낸 것) */
const T = (ym: string, day: number, man: number, area: number) => ({ ym, day, man, area });
const MIXED = [
  T("202601", 5, 36000, 37.85), T("202601", 10, 37000, 37.85), T("202601", 20, 38000, 37.85),
  T("202601", 12, 60000, 49.98), T("202601", 22, 62000, 49.98),
  T("202603", 9, 39000, 37.85), T("202603", 20, 40000, 37.85), T("202603", 14, 75000, 60.0),
  T("202608", 8, 48000, 37.85), T("202608", 10, 49000, 37.85), T("202608", 25, 50000, 37.85), T("202608", 12, 80000, 49.98),
];

test("[1008] 최근 실거래가 — 가장 많이 거래된 평형의 최근 6건 평균(면적대 섞임 없이)", () => {
  assert.equal(unitOf(84.97), 84);
  assert.equal(unitOf(84.99), 84);
  assert.equal(unitOf(60.0), 60);
  const p = resolveUnitPrice([...MIXED].reverse());
  assert.ok(p);
  /* 37㎡ 8건 중 최근 6건 = 50000·49000·48000·40000·39000·38000 → 44000만원 (50㎡ 가 섞이지 않는다) */
  assert.equal(p!.basis, "unit");
  assert.equal(p!.unitM2, 37);
  assert.equal(p!.label, "전용 37㎡");
  assert.equal(p!.bandSlug, "under-60");
  assert.equal(p!.priceKrw, 440_000_000);
  assert.equal(p!.sampleSize, 6);
  assert.equal(p!.firstYm, "202601");
  assert.equal(p!.latestYm, "202608");
  /* 평형마다 2건 이하 → 면적대(60~85㎡ 3건)로 물러선다 */
  const scattered = [T("202608", 1, 330000, 76.79), T("202607", 1, 340000, 76.79), T("202606", 1, 380000, 84.43)];
  const b = resolveUnitPrice(scattered);
  assert.equal(b!.basis, "band");
  assert.equal(b!.unitM2, null);
  assert.equal(b!.label, "60~85㎡");
  assert.equal(b!.priceKrw, Math.round(((330000 + 340000 + 380000) / 3) * 10_000));
  /* 둘 다 3건 미만이면 값을 만들지 않는다 */
  assert.equal(resolveUnitPrice(scattered.slice(0, 2)), null);
  assert.equal(resolveUnitPrice([]), null);
});

test("[1008] 월별 실거래 — 대표가와 같은 평형의 선 · 달력으로 잇기 · 최근 6개월 · 거래 적음", () => {
  const now = new Date("2026-09-21T00:00:00Z");
  const p = resolveUnitPrice(MIXED)!;
  const s = buildComplexTradeSeries(MIXED, { unitM2: p.unitM2, bandSlug: p.bandSlug, label: p.label, now });
  assert.ok(s);
  assert.equal(s!.basis, "unit");
  assert.equal(s!.unitM2, 37);
  assert.equal(s!.label, "전용 37㎡");
  assert.equal(s!.months.length, 8);
  assert.deepEqual(s!.months[0], { ym: "202601", avgMan: 37000, n: 3, nAll: 5 });
  assert.deepEqual(s!.months[1], { ym: "202602", avgMan: null, n: 0, nAll: 0 });
  assert.deepEqual(s!.months[7], { ym: "202608", avgMan: 49000, n: 3, nAll: 4 });
  assert.equal(s!.pricedMonths, 3);
  assert.equal(s!.sparse, false);
  /* 최근 6개월 = 2026.03~08 전체 거래 → 3 + 4 */
  assert.deepEqual(s!.recent6, { count: 7, fromYm: "202603", toYm: "202608", span: 6 });
  /* 면적대만 주면 면적대 평균(37·50㎡ 섞임) — 예전 방식 */
  const band = buildComplexTradeSeries(MIXED, { bandSlug: "under-60", now });
  assert.equal(band!.basis, "band");
  assert.equal(band!.label, "~59㎡");
  assert.equal(band!.months[0].avgMan, Math.round((36000 + 37000 + 38000 + 60000 + 62000) / 5));
  /* 아무것도 안 주면 가장 많이 거래된 평형 */
  assert.equal(buildComplexTradeSeries(MIXED, { now })!.unitM2, 37);
  /* 값 있는 달이 2개뿐이면 선을 잇지 않는다 · 기준은 "지난달"(마지막 거래 달로 끊지 않는다) */
  const thin = buildComplexTradeSeries(MIXED.filter((r) => r.ym !== "202608"), { unitM2: 37, now });
  assert.equal(thin!.sparse, true);
  assert.equal(thin!.months[thin!.months.length - 1].ym, "202608");
  assert.deepEqual(thin!.recent6, { count: 3, fromYm: "202603", toYm: "202608", span: 6 });
  /* 행 상한까지 읽었으면 가장 이른 달(일부만 읽혔을 수 있다)을 버린다 */
  const capped = buildComplexTradeSeries(MIXED, { unitM2: 37, now, capped: true });
  assert.equal(capped!.truncated, true);
  assert.equal(capped!.months[0].ym, "202603");
  assert.equal(buildComplexTradeSeries([], { now }), null);
});

/* ── 기준 가격 자동 채움 ─────────────────────────────────────────── */
test("[1008] 기준 가격 자동 채움 — 비었거나 우리가 채운 값만 바꾸고, 다른 단지로 바꾸면 새 값", () => {
  assert.equal(priceManString(650_000_000), "65000");
  assert.equal(priceManString(null), null);
  const keys = ["currentPriceMan", "areaPyeong"];
  let r = applyPriceAutofill({ tuning: {}, prev: EMPTY_AUTOFILL, complexId: "A", fieldKeys: keys, suggestion: "65000" });
  assert.equal(r.tuning.currentPriceMan, "65000");
  /* 같은 단지에서 사용자가 고친 값은 덮지 않는다 */
  r = applyPriceAutofill({ tuning: { currentPriceMan: "70000" }, prev: r.state, complexId: "A", fieldKeys: keys, suggestion: "65000" });
  assert.equal(r.tuning.currentPriceMan, "70000");
  assert.equal(r.changed, false);
  /* 다른 단지로 바꾸면 새 단지 값 */
  r = applyPriceAutofill({ tuning: r.tuning, prev: r.state, complexId: "B", fieldKeys: keys, suggestion: "120000" });
  assert.equal(r.tuning.currentPriceMan, "120000");
  /* 새 단지에 값이 없으면 옛 값을 남기지 않는다 */
  r = applyPriceAutofill({ tuning: r.tuning, prev: r.state, complexId: "C", fieldKeys: keys, suggestion: null });
  assert.equal(r.tuning.currentPriceMan, "");
  /* 이 도구에 기준 가격 칸이 없으면 아무것도 안 한다 */
  const none = applyPriceAutofill({ tuning: {}, prev: EMPTY_AUTOFILL, complexId: "A", fieldKeys: ["horizonMonths"], suggestion: "65000" });
  assert.equal(none.changed, false);
});

/* ── 리스크 체크리스트 ───────────────────────────────────────────── */
function ctxOf(partial: Partial<LiveToolContext>): LiveToolContext {
  return { generatedAt: "2026-09-21T00:00:00Z", complex: null, region: null, rent: null, supply: null, news: null, notes: null, macro: null, poi: null, ...partial } as LiveToolContext;
}
const meta = { source: "t", asOf: "202608", sample: 100, href: null };

test("[1008] 리스크 체크리스트 — 5가지가 늘 같은 순서로, 통과·주의·참고·자료 없음", () => {
  const checks = riskChecklist(
    ctxOf({
      region: { id: null, name: "안양 동안구", snapshot: { avgSale: 1, jeonseRatio: 55, saleChangeMonthly: 1, tradeCount: 448, period: "202608", ...meta }, demographics: null },
      supply: { upcomingHouseholds: 4169, upcomingComplexes: 5, items: [], ...meta },
      rent: { wolseSharePct: 60, jeonseCount: 40, wolseCount: 60, medianMonthlyKrw: null, months: 3, ...meta },
    }),
  );
  assert.deepEqual(checks.map((c) => c.key), ["liquidity", "gapRisk", "supply", "unsold", "wolse"]);
  const by = Object.fromEntries(checks.map((c) => [c.key, c.status]));
  assert.deepEqual(by, { liquidity: "pass", gapRisk: "pass", supply: "warn", unsold: "na", wolse: "info" });
  assert.equal(checks.find((c) => c.key === "supply")?.value, "4,169세대");
});

/* ── 결과 요약(verdict) ──────────────────────────────────────────── */
const JARGON = /규칙 계산|판단 카드|근거 각주|궤적|갈래|갈림|판단 보류|표본 적음|네 가지 눈|눈 모두/;

test("[1008] 상태 알약은 좋음·보통·주의·자료 부족 — 내부 말(갈림·판단 보류)을 쓰지 않는다", () => {
  assert.deepEqual(BAND_LABEL, { strong: "좋음", mixed: "보통", weak: "주의", thin: "자료 부족" });
});

test("[1008] 12종 전부 타일 4칸 · 결론에 내부 용어 없음 · 재료가 없으면 값 대신 '자료 없음'", () => {
  const ctx = ctxOf({
    complex: { id: "x", name: "공작아파트", region: "안양 동안구", price: { priceKrw: 650_000_000, bandLabel: "~59㎡", bandSlug: "under-60", latestYm: "202608", source: "국토부", asOf: "202608", sample: 6 } },
    region: {
      id: "anyang-dongan",
      name: "안양 동안구",
      snapshot: { avgSale: 1, jeonseRatio: 55.3, saleChangeMonthly: 1.03, tradeCount: 448, period: "202608", ...meta, source: "한국부동산원 지역 시세" },
      trend: buildRegionTrend({ saleIndex: idx([["2025-08-01", 86.7], ["2026-07-01", 101.5], ["2026-08-01", 102.54]]) }),
      demographics: null,
    },
  });
  for (const tool of AI_TOOL_IDS) {
    const v = buildVerdict({ tool, ctx, footnotes: [], extras: { recent6: { count: 57, fromYm: "202603", toYm: "202608", span: 6 } }, now: new Date("2026-09-21T00:00:00Z") });
    assert.equal(v.tiles?.length, 4, tool);
    assert.doesNotMatch(v.headline, JARGON, `${tool}: ${v.headline}`);
    assert.equal(v.bandLabel, BAND_LABEL[v.band]);
  }
  const d = buildVerdict({ tool: "ai-diagnosis", ctx, footnotes: [], extras: { recent6: { count: 57, fromYm: "202603", toYm: "202608", span: 6 } } });
  assert.deepEqual(d.tiles?.map((t) => t.key), ["price", "regionYoy", "trades6m", "jeonseRatio"]);
  assert.equal(d.tiles?.[0].value, "6.5억");
  /* 대표가는 규칙상 최근 거래 3~6건 평균 — "거래 적음" 을 매번 붙이지 않는다(오래됨만 본다) */
  assert.equal(d.tiles?.[0].confidence, "ok");
  assert.equal(d.tiles?.[1].value, "+18.3%");
  assert.equal(d.tiles?.[2].value, "57건");
  const risk = buildVerdict({ tool: "ai-risk", ctx: ctxOf({}), footnotes: [] });
  assert.equal(risk.band, "thin");
  assert.ok(risk.tiles?.every((t) => t.value === null));
});

test("[1008] 타이밍·리스크의 알약은 결론과 같은 말 — 신호등·위험 항목만으로 정한다", () => {
  const hot = ctxOf({
    region: { id: null, name: "x", snapshot: { avgSale: 1, jeonseRatio: 50, saleChangeMonthly: 1.2, tradeCount: 300, period: "202608", ...meta }, demographics: null },
    supply: { upcomingHouseholds: 100, upcomingComplexes: 1, items: [], ...meta },
  });
  const timing = buildVerdict({ tool: "ai-timing", ctx: hot, footnotes: [] });
  assert.equal(timing.band, "weak");
  assert.equal(timing.metric?.value, "추격 매수 주의");
  const riskOk = buildVerdict({ tool: "ai-risk", ctx: hot, footnotes: [] });
  assert.equal(riskOk.band, "strong");
  assert.match(riskOk.headline, /걸린 게 없어요/);
  /* 전월세 계약 점검 — 타이밍 신호로 "주의" 가 붙지 않는다(전세가율로만). 입력이 없으면 지역 평균 참고값 */
  const contract = buildVerdict({ tool: "contract-risk", ctx: hot, footnotes: [], input: { marketRatioPct: 50 } });
  assert.equal(contract.metric?.value, "안전");
  assert.equal(contract.band, "strong");
  assert.equal(contract.bandReason, "전세가율 50% — 80% 미만");
  assert.equal(buildVerdict({ tool: "contract-risk", ctx: hot, footnotes: [], input: { marketRatioPct: 85 } }).band, "weak");
  const regionOnly = buildVerdict({ tool: "contract-risk", ctx: hot, footnotes: [] });
  assert.equal(regionOnly.band, "mixed");
  assert.match(regionOnly.bandReason ?? "", /지역 평균/);
  /* 판단 도구가 아닌 임장 동선 — 알약은 "이 단지 종합"(종합 진단과 같은 구간)이고 이유 줄이 그렇게 말한다 */
  const route = buildVerdict({ tool: "ai-inspection", ctx: hot, footnotes: [], input: { similarCount: 3 } });
  const diag = buildVerdict({ tool: "ai-diagnosis", ctx: hot, footnotes: [] });
  assert.equal(route.bandBasis, "complex");
  assert.equal(route.band, diag.band);
  assert.match(route.bandReason ?? "", /종합 점수 \d+점\(종합 진단 기준\)/);
  assert.doesNotMatch(route.bandReason ?? "", /파는 쪽/);
  assert.match(diag.bandReason ?? "", /항목 평균 \d+점 — 65점 이상 좋음 · 45점 미만 주의/);
  assert.equal(diag.bandBasis, "tool");
  /* 한 항목만 잰 점수는 "종합"이 아니다 — 입주 물량 하나(0점)로 "주의"를 달지 않는다 */
  const one = ctxOf({ supply: { upcomingHouseholds: 4169, upcomingComplexes: 5, items: [], ...meta } });
  const oneDiag = buildVerdict({ tool: "ai-diagnosis", ctx: one, footnotes: [] });
  assert.equal(oneDiag.band, "thin");
  assert.equal(oneDiag.bandReason, "5개 항목 중 1개만 잴 수 있었어요");
  assert.equal(buildVerdict({ tool: "ai-inspection", ctx: one, footnotes: [] }).band, "thin");
});

/* ── 그래프 좌표 ──────────────────────────────────────────────────── */
test("[1008] 그래프 — 거래 적으면 선 없음(점만), 빈 달에서 선을 끊는다, 시나리오 끝 라벨은 14px 이상 떨어진다", () => {
  const box = { width: 600, height: 236, padL: 8, padR: 76, padT: 12, padB: 22, barH: 44 };
  const sparse = layoutPriceChart({ months: [{ ym: "202601", avgMan: 60000, n: 1, nAll: 2 }, { ym: "202602", avgMan: null, n: 0, nAll: 1 }], box });
  assert.equal(sparse?.sparse, true);
  assert.equal(sparse?.segments.length, 0);
  const gap = layoutPriceChart({
    months: [
      { ym: "202601", avgMan: 60000, n: 4, nAll: 5 },
      { ym: "202602", avgMan: 61000, n: 3, nAll: 3 },
      { ym: "202603", avgMan: null, n: 0, nAll: 1 },
      { ym: "202604", avgMan: 62000, n: 5, nAll: 5 },
      { ym: "202605", avgMan: 63000, n: 3, nAll: 3 },
    ],
    box,
    scenario: { startKrw: 630_000_000, path: [{ year: 0, opt: 630_000_000, base: 630_000_000, pess: 630_000_000 }, { year: 1, opt: 632_000_000, base: 631_000_000, pess: 630_500_000 }] },
  });
  /* 빈 달에서 실선을 끊고 양 끝을 점선 하나로 잇는다 */
  assert.equal(gap?.segments.length, 2);
  assert.equal(gap?.connectors.length, 1);
  /* [1008 · 리뷰 A-10] 거래 1~2건인 달은 실선에 넣지 않는다 — 가운데 1건짜리 달이 V 자를 만들지 않게 */
  const dip = layoutPriceChart({
    months: [
      { ym: "202601", avgMan: 40000, n: 5, nAll: 6 },
      { ym: "202602", avgMan: 41000, n: 4, nAll: 4 },
      { ym: "202603", avgMan: 33000, n: 1, nAll: 2 },
      { ym: "202604", avgMan: 44000, n: 6, nAll: 7 },
      { ym: "202605", avgMan: 45000, n: 3, nAll: 3 },
    ],
    box,
  });
  assert.equal(dip?.segments.length, 2);
  assert.ok(!dip?.segments.some((d) => d.includes(` ${dip.points[2].y}`)), "1건 달의 y 가 실선에 들어갔다");
  assert.equal(dip?.connectors.length, 1);
  /* [1008 · 리뷰 A-17] 좁은 화면 5년 시나리오 — 연차 라벨·첫 달 라벨이 40px 안으로 겹치지 않는다 */
  const narrow = layoutPriceChart({
    months: Array.from({ length: 8 }, (_, i) => ({ ym: `20260${i + 1}`, avgMan: 40000 + i * 500, n: 5, nAll: 6 })),
    box: { width: 330, height: 236, padL: 44, padR: 76, padT: 12, padB: 22, barH: 44 },
    scenario: {
      startKrw: 440_000_000,
      path: [0, 1, 2, 3, 4, 5].map((y) => ({ year: y, opt: 440_000_000 * 1.07 ** y, base: 440_000_000 * 1.04 ** y, pess: 440_000_000 * 1.01 ** y })),
    },
  });
  const xs = [narrow!.lastX, ...(narrow?.fan?.yearTicks.map((t) => t.x) ?? [])];
  for (let i = 1; i < xs.length; i++) assert.ok(xs[i] - xs[i - 1] >= 39.9, `라벨 간격 ${xs[i] - xs[i - 1]}`);
  assert.equal(narrow?.fan?.yearTicks.at(-1)?.year, 5);
  assert.equal(narrow?.firstLabel, false);
  const ys = [...(gap?.fan?.ends ?? [])].map((e) => e.labelY).sort((a, b) => a - b);
  for (let i = 1; i < ys.length; i++) assert.ok(ys[i] - ys[i - 1] >= 13.9, `라벨 간격 ${ys[i] - ys[i - 1]}`);
  /* 눈금은 1·2·2.5·5 × 10^k 간격 — 5.8억~6.6억이면 6억·6.5억 */
  assert.deepEqual(niceTicks(58000, 66000, 3), [60000, 65000]);
});

/* ── 화면 문구: 내부 용어가 사용자에게 보이지 않는다(주석 제외) ────────────── */
function visibleSource(path: string): string {
  const src = readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

test("[1008] 결과 화면 문구에 내부 용어가 없다 — 규칙 계산·판단 카드·근거 각주·궤적·갈래·갈림·판단 보류·표본 적음", () => {
  for (const f of [
    "app/analysis/ai/[tool]/WorkbenchClient.tsx",
    "app/analysis/ai/[tool]/ResultView.tsx",
    "app/analysis/ai/[tool]/VerdictCard.tsx",
    "app/analysis/ai/[tool]/VerdictBoard.tsx",
    "app/analysis/ai/[tool]/TuningForm.tsx",
    "app/analysis/ai/[tool]/page.tsx",
    "app/analysis/ai/r/[id]/page.tsx",
    "lib/ai/tool-tuning-fields.ts",
  ]) {
    assert.doesNotMatch(visibleSource(f), JARGON, f);
  }
});
