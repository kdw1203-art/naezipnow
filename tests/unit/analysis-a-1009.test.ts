import { test } from "node:test";
import assert from "node:assert/strict";
import {
  baseSlot,
  idleSlot,
  layoutPriceChart,
  nearestSlot,
  scrubSlots,
  slotText,
  stepSlot,
} from "@/app/components/viz/price-chart-geometry";

/* [1009 · A] AI 분석·분석 도구 — 결과 화면 훑기·수치 표기·설명의 순수 규칙 */

const box = { width: 600, height: 236, padL: 44, padR: 14, padT: 12, padB: 22, barH: 44 };
/* 공작아파트(안양 동안구) 전용 37㎡ 모양 — 가짜 숫자(테스트 전용). 6월은 거래 1건 */
const months = [
  { ym: "202601", avgMan: 36700, n: 3, nAll: 11 },
  { ym: "202602", avgMan: 37077, n: 13, nAll: 21 },
  { ym: "202603", avgMan: null, n: 0, nAll: 8 },
  { ym: "202604", avgMan: 38072, n: 23, nAll: 38 },
  { ym: "202605", avgMan: null, n: 0, nAll: 0 },
  { ym: "202606", avgMan: 33300, n: 1, nAll: 5 },
  { ym: "202607", avgMan: 44671, n: 12, nAll: 18 },
  { ym: "202608", avgMan: 48610, n: 10, nAll: 18 },
];

test("[1009 · A] 훑기 칸 — 달마다 한 칸(빈 달·거래 적은 달 포함), x 는 선·막대와 같은 자리", () => {
  const L = layoutPriceChart({ months, box })!;
  const slots = scrubSlots(L);
  assert.equal(slots.length, 8);
  slots.forEach((s, i) => assert.equal(s.x, L.points[i].x));
  const june = slots[5];
  assert.equal(june.kind, "month");
  assert.equal(june.kind === "month" && june.few, true, "거래 1건인 달은 참고용");
  const may = slots[4];
  assert.equal(may.kind === "month" && may.y, null, "값이 없는 달은 점이 없다");
  assert.ok(L.lineBottom < L.plotBottom && L.lineBottom > L.plotTop);
});

test("[1009 · A] 가장 가까운 칸 · 키보드 ←/→ · Home/End 는 양 끝에서 멈춘다", () => {
  const L = layoutPriceChart({ months, box })!;
  const slots = scrubSlots(L);
  assert.equal(nearestSlot(slots, -50), 0);
  assert.equal(nearestSlot(slots, 10_000), 7);
  assert.equal(nearestSlot(slots, slots[3].x + 2), 3);
  assert.equal(nearestSlot([], 10), null);
  const idle = idleSlot(slots);
  assert.equal(idle, 7, "머리는 거래 3건 이상인 마지막 달");
  assert.equal(stepSlot(slots, null, 1, idle), 7, "→ 첫 진입은 지금 보이던 달");
  assert.equal(stepSlot(slots, null, -1, idle), 6, "← 첫 진입은 그 앞 달");
  assert.equal(stepSlot(slots, 7, 1, idle), 7, "끝에서는 제자리");
  assert.equal(stepSlot(slots, 0, -1, idle), 0);
  assert.equal(stepSlot(slots, 3, -1, idle), 2);
});

test("[1009 · A] 등락 기준은 거래 3건 이상인 첫 달 — 한두 건 값을 기준·머리로 삼지 않는다", () => {
  const few = [
    { ym: "202601", avgMan: 42000, n: 1, nAll: 1 },
    { ym: "202602", avgMan: 36200, n: 3, nAll: 3 },
    { ym: "202603", avgMan: 35250, n: 4, nAll: 4 },
    { ym: "202604", avgMan: 33620, n: 2, nAll: 5 },
  ];
  const slots = scrubSlots(layoutPriceChart({ months: few, box })!);
  assert.equal(baseSlot(slots), 1);
  assert.equal(idleSlot(slots), 2, "마지막 달(2건)이 아니라 3건 이상인 마지막 달");
  const allFew = scrubSlots(layoutPriceChart({ months: [{ ym: "202601", avgMan: 5000, n: 1, nAll: 1 }], box })!);
  assert.equal(baseSlot(allFew), null);
  assert.equal(idleSlot(allFew), 0, "3건 이상인 달이 없으면 값 있는 마지막 달(참고용으로 적는다)");
});

test("[1009 · A] 말풍선 — 그 달 월평균·거래 n건·같은 평형 m건·참고용, 빈 달은 '거래 없음'", () => {
  const slots = scrubSlots(layoutPriceChart({ months, box })!);
  const o = { label: "전용 37㎡", basis: "unit" as const };
  assert.deepEqual(slotText(slots[7], o).tip, ["26.08 월평균 4억 8,610만", "거래 18건 · 같은 평형 10건"]);
  assert.deepEqual(slotText(slots[5], o).tip, ["26.06 월평균 3억 3,300만", "거래 5건 · 같은 평형 1건 · 참고용"]);
  assert.deepEqual(slotText(slots[2], o).tip, ["26.03 전용 37㎡ 거래 없음", "다른 평형 8건"]);
  assert.deepEqual(slotText(slots[4], o).tip, ["26.05 거래 없음"]);
  assert.match(slotText(slots[5], o).sr, /2026년 6월, 전용 37㎡ 월평균 3억 3,300만원, 거래 5건 중 같은 평형 1건, 거래가 적어 참고용이에요/);
  /* 면적대 기준이면 "같은 면적대" */
  assert.match(slotText(slots[7], { label: "60~85㎡", basis: "band" }).tip[1], /같은 면적대 10건/);
  /* 표준 표기 — 억 미전환("48,610만") 금지 */
  for (const s of slots) for (const line of slotText(s, o).tip) assert.doesNotMatch(line, /\d{2},\d{3}만/);
});

test("[1009 · A] 시나리오 연차도 칸이다 — 말풍선이 '시나리오(가정)'를 먼저 말하고 짧은 억 표기로", () => {
  const L = layoutPriceChart({
    months,
    box: { ...box, padR: 76 },
    scenario: {
      startKrw: 508_000_000,
      path: [0, 1, 2, 3].map((y) => ({ year: y, opt: Math.round(508_000_000 * 1.07 ** y), base: Math.round(508_000_000 * 1.04 ** y), pess: Math.round(508_000_000 * 1.01 ** y) })),
    },
  })!;
  const slots = scrubSlots(L);
  assert.equal(slots.length, 8 + 3, "0년(출발점)은 칸이 아니다 — 마지막 달과 같은 자리");
  assert.equal(L.fan?.points.length, 3, "라벨 솎기(yearTicks)와 별개로 연차 점은 다 있다");
  const y1 = slots[8];
  assert.equal(y1.kind, "year");
  assert.ok(y1.x > slots[7].x);
  const t = slotText(y1, { label: "전용 37㎡" });
  assert.equal(t.tip[0], "1년 뒤 · 시나리오(가정)");
  assert.equal(t.tip[1], "기본 5.3억 · 낙관 5.4억 · 비관 5.1억");
  assert.match(t.sr, /예측이 아니라 가정 계산/);
  assert.equal(stepSlot(slots, 7, 1, idleSlot(slots)), 8, "마지막 달에서 → 는 1년 뒤로");
});

/* ── 결과 요약 표시 규칙(verdict display) ─────────────────────────────── */
import { readFileSync } from "node:fs";
import { buildVerdict, type VerdictTile } from "@/lib/ai/verdict";
import { buildRegionTrend } from "@/lib/ai/region-trend";
import { diagnosisRadar, timingSignals, RISK_THRESHOLDS } from "@/lib/ai/insight-blocks";
import { SCENARIO_RULE } from "@/lib/ai/price-scenarios";
import type { LiveToolContext } from "@/lib/ai/live-context";
import { parseSignedPct, tileCaption, tileDisplay, verdictSources } from "@/app/analysis/ai/[tool]/verdict-display";
import { metricExplain, tileExplain } from "@/app/analysis/ai/[tool]/verdict-explain";
import { TEMPERATURE_EXPLAIN } from "@/app/analysis/temperature-explain";
import { weekSlots } from "@/app/analysis/temperature/week-slots";

function ctxOf(partial: Partial<LiveToolContext>): LiveToolContext {
  return { generatedAt: "2026-09-21T00:00:00Z", complex: null, region: null, rent: null, supply: null, news: null, notes: null, macro: null, poi: null, ...partial } as LiveToolContext;
}
const meta = { source: "t", asOf: "202608", sample: 100, href: null };
const idx = (pairs: [string, number][]) => pairs.map(([period, value]) => ({ period, value }));
const baseCtx = () =>
  ctxOf({
    complex: { id: "x", name: "테스트단지", region: "안양 동안구", price: { priceKrw: 508_333_333, bandLabel: "전용 37㎡", bandSlug: "under-60", latestYm: "202608", source: "국토부", asOf: "202608", sample: 6 } },
    region: {
      id: "anyang-dongan",
      name: "안양 동안구",
      snapshot: { avgSale: 1, jeonseRatio: 55.3, saleChangeMonthly: -1.03, tradeCount: 448, period: "202608", ...meta, source: "한국부동산원 지역 시세" },
      trend: buildRegionTrend({ saleIndex: idx([["2025-08-01", 86.7], ["2026-07-01", 101.5], ["2026-08-01", 102.54]]) }),
      demographics: null,
    },
  } as Partial<LiveToolContext>);

test("[1009 · A] 표시용 숫자 — 가격은 만원 그대로(<Won>), 지역 변화는 % + 비교 기준(<Delta>) · 새 계산 없음", () => {
  const v = buildVerdict({ tool: "ai-timing", ctx: baseCtx(), footnotes: [], now: new Date("2026-09-21T00:00:00Z") });
  const by = Object.fromEntries((v.tiles ?? []).map((t) => [t.key, t]));
  assert.deepEqual(by.price.display, { kind: "won", manwon: 50_833.3333 });
  assert.equal(by.price.value, "5.1억", "문자열 값은 그대로(옛 화면·메모 초안이 쓴다)");
  assert.deepEqual(by.regionMom.display, { kind: "delta", pct: -1.03, digits: 2, base: "지난달 대비" });
  const d = buildVerdict({ tool: "ai-diagnosis", ctx: baseCtx(), footnotes: [] });
  const yoy = d.tiles?.find((t) => t.key === "regionYoy");
  assert.equal(yoy?.display?.kind, "delta");
  assert.equal(yoy?.display?.kind === "delta" && yoy.display.base, "1년 전(2025.08) 대비");
  assert.equal(yoy?.display?.kind === "delta" && yoy.display.pct, 18.3);
  /* 값이 없는 칸은 표시용 숫자도 없다 */
  assert.equal(d.tiles?.find((t) => t.key === "trades6m")?.display ?? null, null);
});

test("[1009 · A] 수익률 계산 — 대출 칸은 만원(<Won>), 연 수익률은 등락(이익 ▲ 빨강 · 손실 ▼ 파랑) + '넣은 돈 대비'", () => {
  const v = buildVerdict({ tool: "ai-simulator", ctx: baseCtx(), footnotes: [], input: { ltvPct: 60, mortgageRatePct: 4.2, holdingYears: 5 } });
  const loan = v.tiles?.find((t) => t.key === "loanAmount");
  assert.equal(loan?.display?.kind, "won");
  assert.ok(loan?.display?.kind === "won" && Math.abs(loan.display.manwon - (508_333_333 * 0.6) / 10_000) < 1);
  assert.equal(v.metric?.display?.kind, "delta");
  assert.equal(v.metric?.display?.kind === "delta" && v.metric.display.base, "넣은 돈 대비");
  /* 월 상환액만(보유 기간 없음) → 대표 수치가 만원 */
  const m = buildVerdict({ tool: "ai-simulator", ctx: baseCtx(), footnotes: [], input: { ltvPct: 60, mortgageRatePct: 4.2 } });
  assert.equal(m.metric?.display?.kind, "won");
});

test("[1009 · A] 갭 — 1억 이상도 억으로(억 미전환 '12,345만원' 금지)", () => {
  const v = buildVerdict({ tool: "ai-gap", ctx: baseCtx(), footnotes: [], input: { maeMan: 150_000, jeonMan: 30_000 } });
  assert.match(v.headline, /갭 12억원/);
  assert.match(v.metric?.note ?? "", /매매 15억원 − 전세 3억원/);
  assert.doesNotMatch(`${v.headline} ${v.metric?.note}`, /\d{2,},\d{3}만/);
});

test("[1009 · A] 옛 스냅샷 — 등락 칸만 signedPct 문자열에서 읽고, 모양이 다르면 지어내지 않는다", () => {
  const legacy = (key: string, value: string | null): VerdictTile => ({ key, label: "x", value, note: null, asOf: null, source: "s", confidence: "ok" });
  assert.deepEqual(tileDisplay(legacy("regionYoy", "+18.3%")), { kind: "delta", pct: 18.3, digits: 1, base: "1년 전 대비" });
  assert.deepEqual(tileDisplay(legacy("regionMom", "−0.12%")), { kind: "delta", pct: -0.12, digits: 2, base: "지난달 대비" });
  assert.equal(tileDisplay(legacy("regionYoy", "자료 없음")), null);
  assert.equal(tileDisplay(legacy("price", "5.1억")), null, "가격은 문자열에서 만원을 되살리지 않는다(반올림된 값)");
  assert.equal(tileDisplay(legacy("regionYoy", null)), null);
  assert.equal(parseSignedPct("0%"), 0);
  assert.equal(parseSignedPct("12건"), null);
  assert.equal(tileCaption(legacy("x", null), null), "자료 없음");
  assert.equal(tileCaption({ ...legacy("x", "1"), note: "전용 37㎡ 최근 6건 평균" }, "2026.08"), "전용 37㎡ 최근 6건 평균 · 2026.08");
});

test("[1009 · A] 출처 한 줄 — 값 있는 칸의 출처를 칸 순서대로 한 번씩", () => {
  const v = buildVerdict({ tool: "ai-diagnosis", ctx: baseCtx(), footnotes: [] });
  assert.equal(verdictSources(v), "국토부 실거래 · 한국부동산원");
});

test("[1009 · A] ⓘ 설명 문장은 계산 코드와 같은 숫자 — 신호등·위험 경계·시나리오 규칙·점수 환산", () => {
  const sig = (saleChangeMonthly: number | null, tradeCount: number | null, hh: number | null) =>
    timingSignals(
      ctxOf({
        region: { id: null, name: "x", snapshot: { avgSale: 1, jeonseRatio: 50, saleChangeMonthly, tradeCount, period: "202608", ...meta }, demographics: null },
        supply: hh == null ? null : { upcomingHouseholds: hh, upcomingComplexes: 1, items: [], ...meta },
      } as Partial<LiveToolContext>),
    ).map((s) => s.state);
  assert.deepEqual(sig(-0.5, 29, 1500), ["green", "green", "green"]);
  assert.deepEqual(sig(0.79, 30, 1), ["yellow", "yellow", "yellow"]);
  assert.deepEqual(sig(0.8, 100, 0), ["red", "red", "red"]);
  const timing = metricExplain({ tool: "ai-timing", metric: { label: "매수 신호", value: "지켜보기", unit: null, note: null, asOf: null } } as never);
  const how = (timing?.how as string[]).join(" ");
  for (const needle of ["−0.5% 이하면 유리", "+0.8% 이상이면 불리", "30건 미만이면 유리", "100건 이상이면 불리", "1,500세대 이상이면 유리"]) assert.ok(how.includes(needle), needle);
  /* 금리 환경 — 1%면 100점, 1%p 오를 때마다 20점, 미분양 500호 넘으면 −10 */
  const macro = (rate: number, unsold: number | null) =>
    diagnosisRadar(ctxOf({ macro: { baseRatePct: rate, ...meta }, region: { id: null, name: "x", snapshot: null, demographics: unsold == null ? null : { unsoldUnits: unsold, period: "202608", ...meta } } } as Partial<LiveToolContext>)).find((a) => a.key === "macro")?.score;
  assert.equal(macro(1, null), 100);
  assert.equal(macro(2, null), 80);
  assert.equal(macro(3, null), 60);
  assert.equal(macro(3, 501), 50);
  const diag = (metricExplain({ tool: "ai-diagnosis", metric: { label: "투자 점수", value: "57", unit: "점", note: null, asOf: null } } as never)?.how as string[]).join(" ");
  assert.match(diag, /1%면 100점, 1%p 오를 때마다 20점/);
  const risk = (metricExplain({ tool: "ai-risk", metric: { label: "위험 수준", value: "낮음", unit: null, note: null, asOf: null } } as never)?.how as string[]).join(" ");
  for (const n of [RISK_THRESHOLDS.tradeDrop, RISK_THRESHOLDS.jeonseRatioHigh, RISK_THRESHOLDS.wolseShareHigh]) assert.ok(risk.includes(String(n)), String(n));
  assert.ok(risk.includes(RISK_THRESHOLDS.supplyHeavy.toLocaleString("ko-KR")));
  const pred = (metricExplain({ tool: "ai-prediction", metric: { label: "1년 뒤 기본 시나리오", value: "5.3억", unit: null, note: null, asOf: null } } as never)?.how as string[]).join(" ");
  assert.ok(pred.includes(`${SCENARIO_RULE.baseShare * 100}% 속도`) && pred.includes(`±${SCENARIO_RULE.baseCapPct}%`) && pred.includes(`${SCENARIO_RULE.spreadPct}%p`));
  /* 칸 설명 — 알려진 칸은 모두 설명이 있고, 입력값 가격은 입력값이라고 말한다 */
  for (const key of ["price", "trades6m", "regionYoy", "regionMom", "regionTrades", "jeonseRatio", "supply", "wolse", "unsold", "notes", "baseRate", "loanAmount", "loanMonthly", "loanInterest"]) {
    assert.ok(tileExplain({ key, label: key, value: "1", note: null, asOf: null, source: "s", confidence: "ok" }), key);
  }
  assert.equal(tileExplain({ key: "price", label: "기준 가격", value: "5억", note: null, asOf: null, source: "입력값", confidence: "ok" })?.title, "기준 가격");
});

test("[1009 · A] 시장 온도 ⓘ — /methodology 의 정의 문장과 한 글자도 다르지 않다", () => {
  const src = readFileSync(new URL("../../app/methodology/page.tsx", import.meta.url), "utf8");
  for (const line of TEMPERATURE_EXPLAIN.how.slice(0, 2)) assert.ok(src.includes(line.replace(/^계산: /, "")), line);
  assert.equal(TEMPERATURE_EXPLAIN.term, "sijang-ondo");
});

test("[1009 · A] 온도 주간 기록 — 빠진 주는 칸을 비워(null) 선이 이어 붙지 않게, 월요일이 어긋나면 행 그대로", () => {
  const rows = [{ weekStart: "2026-08-03" }, { weekStart: "2026-08-10" }, { weekStart: "2026-08-24" }];
  const s = weekSlots(rows);
  assert.deepEqual(s.map((x) => [x.weekStart, x.row ? 1 : 0]), [["2026-08-03", 1], ["2026-08-10", 1], ["2026-08-17", 0], ["2026-08-24", 1]]);
  const odd = weekSlots([{ weekStart: "2026-08-03" }, { weekStart: "2026-08-12" }]);
  assert.equal(odd.length, 2, "7일 간격이 아니면 칸을 만들지 않는다");
  assert.deepEqual(weekSlots([]), []);
});

/* ── 1009 리뷰 수정 잠금 ─────────────────────────────────────────────── */
import { loanCalc, scenarioYields } from "@/lib/ai/loan-calc";
import { YIELD_FORMULA_LINE } from "@/app/analysis/ai/[tool]/verdict-explain";
import { monthSlots } from "@/app/components/viz/price-chart-geometry";
import { monthWord, reportingDeadlineLabel, volumeCompare } from "@/app/analysis/timing/volume-window";

test("[1009 · A · 리뷰] 수익률(가정) ⓘ — 코드와 같은 복리 연환산(단순 평균 아님)", () => {
  /* 리뷰 실측 조건: 5억 · LTV 60% · 4.2% · 30년 · 5년 보유 · 낙관(연 +5%) */
  const loan = loanCalc({ priceKrw: 500_000_000, priceKind: "input", ltvPct: 60, ratePct: 4.2, termYears: 30, holdingYears: 5 })!;
  const opt = scenarioYields(loan, { opt: 5, base: 3, pess: 1 })!.find((y) => y.key === "opt")!;
  assert.equal(Math.round(opt.cashOutKrw / 10_000), 28_802, "넣은 돈 2억 8,802만");
  assert.equal(Math.round(opt.cashInKrw / 10_000), 36_593, "받는 돈 3억 6,593만");
  const ratio = opt.cashInKrw / opt.cashOutKrw;
  assert.equal(opt.annualPct, 4.9, "화면 값");
  assert.equal(Math.round((ratio ** (1 / 5) - 1) * 1000) / 10, 4.9, "설명 문장(복리)대로 계산하면 화면과 같다");
  assert.equal(Math.round(((ratio - 1) / 5) * 1000) / 10, 5.4, "옛 문장(햇수로 나눔)대로면 5.4% — 화면과 달랐다");
  const how = (metricExplain({ tool: "ai-simulator", metric: { label: "연 수익률", value: "+4.9%", unit: null, note: null, asOf: null, display: { kind: "delta", pct: 4.9, digits: 1, base: "넣은 돈 대비" } } } as never)?.how ?? []) as string[];
  assert.ok(how.includes(YIELD_FORMULA_LINE));
  assert.match(YIELD_FORMULA_LINE, /\^\(1 ÷ 보유 햇수\) − 1/);
  assert.match(YIELD_FORMULA_LINE, /복리/);
  assert.ok(how.some((l) => l.includes("−100%")), "받는 돈 0 이하 = −100% (코드의 ratio ≤ 0 분기)");
  assert.ok(!how.some((l) => l.includes("햇수로 나눠")), "옛 문장이 남지 않는다");
});

test("[1009 · A · 리뷰] ⓘ 문장 = 코드 — 거래 창은 이번 달 거래가 있으면 이번 달까지, 이웃 노트는 단지 먼저", () => {
  const t6 = (tileExplain({ key: "trades6m", label: "최근 6개월 거래", value: "1건", note: null, asOf: null, source: "국토부 실거래", confidence: "ok" })?.how ?? []) as string[];
  assert.ok(!t6.some((l) => l.includes("이번 달은 신고 중이라 빼요")), "코드(result-series lastYm = max(마지막 거래 달, 지난달))와 다른 옛 문장");
  assert.ok(t6.some((l) => l.includes("이번 달까지 세요")));
  const notes = (tileExplain({ key: "notes", label: "이웃 임장노트", value: "2건", note: null, asOf: null, source: "내집나우 이웃", confidence: "ok" })?.how ?? []) as string[];
  assert.ok(notes[0].startsWith("이 단지 이름으로 공개된"), "단지 노트가 먼저(live-context loadNotes)");
  assert.ok(notes[0].includes("없으면 같은 구·시"));
});

test("[1009 · A · 리뷰] 첫 프레임 머리 — 폭을 재기 전에도 달 칸으로 같은 idle·base", () => {
  const L = layoutPriceChart({ months, box })!;
  const withWidth = scrubSlots(L);
  const before = monthSlots(months);
  assert.equal(idleSlot(before), idleSlot(withWidth));
  assert.equal(baseSlot(before), baseSlot(withWidth));
  assert.notEqual(idleSlot(before), null, "거래가 있는 기간이면 첫 프레임부터 값이 있다(예전: '이 기간 거래 없음')");
});

test("[1009 · A · 리뷰] 월 거래량 등락 — 신고 기한(말일 + 30일)이 지난 달끼리만", () => {
  /* 리뷰 실측 모양(강남): 8월은 9/30 까지 신고 중(80건), 7월 189건 — 가짜 숫자(테스트 전용) */
  const rows = [
    { month: "202606", count: 150 },
    { month: "202607", count: 189 },
    { month: "202608", count: 80 },
  ];
  const now = new Date("2026-09-22T03:00:00Z");
  const vc = volumeCompare(rows, now);
  assert.deepEqual(vc.open.map((r) => r.month), ["202608"], "8월분은 아직 신고 기한 전");
  assert.equal(vc.closedLast?.month, "202607");
  assert.equal(vc.closedPrev?.month, "202606");
  assert.equal(vc.closedDeltaPct, 26, "7월 vs 6월(+26%) — 8월(신고 중) vs 7월(−57.7%)이 아니다");
  assert.equal(reportingDeadlineLabel("202608"), "9/30");
  assert.equal(reportingDeadlineLabel("202607"), "8/30");
  assert.equal(monthWord("202607"), "7월");
  /* 10/1 이 되면 8월도 마감 — 8월 vs 7월 */
  const later = volumeCompare(rows, new Date("2026-10-01T03:00:00Z"));
  assert.equal(later.open.length, 0);
  assert.equal(later.closedLast?.month, "202608");
  assert.equal(later.closedDeltaPct, -57.7);
  /* 마감된 달이 하나뿐이면 등락 없음 */
  assert.equal(volumeCompare([{ month: "202608", count: 80 }], now).closedDeltaPct, null);
});
