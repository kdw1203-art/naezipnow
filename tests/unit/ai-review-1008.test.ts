import { test } from "node:test";
import assert from "node:assert/strict";
import { summarizeNeighborNotes } from "../../lib/ai/neighbor-notes.ts";
import { isComplexNews, regionNewsTokens, regionParts } from "../../lib/ai/region-parts.ts";
import { contractCheck } from "../../lib/ai/contract-check.ts";
import { loanCalc, monthlyPayment, remainingBalance, scenarioYields } from "../../lib/ai/loan-calc.ts";
import { buildComplexTradeSeries, nowYm, resolveUnitPrice } from "../../lib/ai/result-series.ts";
import { buildVerdict } from "../../lib/ai/verdict.ts";
import { tuningFields } from "../../lib/ai/tool-tuning-fields.ts";
import type { LiveToolContext } from "../../lib/ai/live-context.ts";
import { cleanAiLine, cleanAiMarkdown } from "../../lib/ai/ai-tail.ts";

/* [1008 · 리뷰 A] AI 분석 결과 화면 리뷰 수정 — 숫자는 전부 이 파일 안의 테스트용 값이다(운영 데이터 아님). */

const meta = { source: "t", asOf: "202608", sample: 100, href: null };
function ctxOf(partial: Partial<LiveToolContext>): LiveToolContext {
  return { generatedAt: "2026-09-21T00:00:00Z", complex: null, region: null, rent: null, supply: null, news: null, notes: null, macro: null, poi: null, ...partial } as LiveToolContext;
}

/* ── A-1 이웃 임장노트: 운영진(Lab) 예시 글은 "이웃"이 아니다 ─────────────── */
test("[A-1] Lab 노트만 있으면 이웃 임장노트는 없음(null) — 사람 글만 세고 평균도 사람 글로", () => {
  const lab = (id: number, s: number) => ({ id, title: `예시 ${id}`, author_label: "내집나우 Lab · AI 임장노트 편집부", created_at: "2026-08-10T00:00:00Z", score_location: s, score_school: s });
  assert.equal(summarizeNeighborNotes([lab(1, 4), lab(2, 5)], "complex"), null);
  assert.equal(summarizeNeighborNotes([], "region"), null);
  const mixed = summarizeNeighborNotes(
    [
      lab(1, 5),
      { id: 7, title: "주말 임장", author_label: "동네주민", created_at: "2026-09-01T09:00:00Z", score_location: 4, score_school: 2, score_transport: 0 },
      { id: 8, title: "평일 저녁", author_label: null, created_at: "2026-08-20T09:00:00Z", score_location: 5, score_facility: 5 },
    ],
    "complex",
  );
  assert.equal(mixed?.count, 2);
  /* (4+2)/2 = 3 · (5+5)/2 = 5 → 평균 4 (0 은 미입력) */
  assert.equal(mixed?.avgScore, 4);
  assert.deepEqual(mixed?.latest, { id: "7", title: "주말 임장" });
  assert.equal(mixed?.asOf, "2026-09-01");
  assert.equal(mixed?.source, "이웃 공개 임장노트(이 단지)");
});

/* ── A-12 단지 뉴스 오탐 ─────────────────────────────────────────────── */
const hints = (r: string) => {
  const d = regionParts(r)?.district;
  const t = regionNewsTokens(r);
  return d ? [...t, d] : t;
};
test("[A-12] 단지 뉴스 — 회사 이름·다른 지역 같은 브랜드는 걸러내고, 짧은 이름은 아파트 맥락이나 지역 낱말과 함께", () => {
  const n = (title: string, summary: string | null = null) => ({ title, summary });
  /* 회사 꼬리 */
  assert.equal(isComplexNews(n("현대건설, 강남 재건축 수주전 참여"), "현대", hints("서울 강남구")), false);
  assert.equal(isComplexNews(n("신동아건설 법정관리 신청"), "신동아", hints("서울 도봉구")), false);
  /* 브랜드만인 이름 — 제목에 이 지역 낱말이 없으면 다른 동네 단지다 */
  assert.equal(isComplexNews(n("동탄 롯데캐슬 20억 신고가"), "롯데캐슬", hints("서울 중구")), false);
  assert.equal(isComplexNews(n("강남 현대아파트 신고가"), "현대", hints("서울 강남구")), true);
  /* 짧은 이름 — 바로 뒤가 아파트 맥락이면 통과, 기계·일반 낱말이면 탈락 */
  assert.equal(isComplexNews(n("은마 재건축, 상가 세입자 보상 갈등"), "은마", hints("서울 강남구")), true);
  assert.equal(isComplexNews(n("은마 이주 가시화에 전세 2억 하락"), "은마", hints("서울 강남구")), true);
  assert.equal(isComplexNews(n("은마아파트 일부 세입자 이사비 요구"), "은마", hints("서울 강남구")), true);
  assert.equal(isComplexNews(n("공작기계 수출 늘어"), "공작", hints("안양 동안구")), false);
  assert.equal(isComplexNews(n("평촌 공작 재건축 설계 공모"), "공작", hints("안양 동안구")), true);
  /* 5글자 이상 고유한 이름은 이름만으로 충분 */
  assert.equal(isComplexNews(n("헬리오시티 전세 하락"), "헬리오시티", hints("서울 송파구")), true);
});

/* ── A-3 계약 점검: 입력으로 만든 사실 목록 ─────────────────────────────── */
test("[A-3] 계약 점검 — 지역 평균만이면 참고값, 입력 전세가율로 위험도, 확인 전 항목은 할 일, 고액 보증금 주의", () => {
  const region = contractCheck({}, 55.3);
  assert.equal(region.ratioSource, "region");
  assert.equal(region.level, "안전");
  assert.deepEqual(region.issues.map((i) => i.tone), ["todo", "todo"]);
  assert.equal(region.clauses.length, 3);
  const high = contractCheck({ marketRatioPct: 92, jeonseMan: 250_000, hasRegistrationCheck: true, hasInsurance: false }, 55);
  assert.equal(high.ratioSource, "input");
  assert.equal(high.level, "위험");
  assert.deepEqual(high.issues.map((i) => i.tone), ["danger", "todo", "warning"]);
  assert.equal(high.clauses.length, 4);
  assert.equal(high.saleEstimateMan, Math.round(250_000 / 0.92));
  assert.equal(contractCheck({}, null).ratioPct, null);
});

/* ── A-3 수익률 계산: 원리금균등 · 보유 기간 수익률(가정) ─────────────────────── */
test("[A-3] 대출 계산 — 원리금균등 월 상환액·총 이자·잔액, 값이 없으면 계산하지 않는다", () => {
  /* 3억 · 연 4.2% · 30년 → 월 약 146.7만원(P·r / (1 − (1+r)^−n)) */
  const m = monthlyPayment(300_000_000, 4.2, 360);
  assert.ok(Math.abs(m - 1_467_051.5) < 1, String(m));
  assert.equal(Math.round(remainingBalance(300_000_000, 4.2, 360, 360)), 0);
  assert.equal(loanCalc({ priceKrw: 5e8, priceKind: "recent", ltvPct: null, ratePct: 4 }), null);
  assert.equal(loanCalc({ priceKrw: null, priceKind: "recent", ltvPct: 60, ratePct: 4 }), null);
  const l = loanCalc({ priceKrw: 500_000_000, priceKind: "recent", ltvPct: 60, ratePct: 4.2, termYears: "", holdingYears: 5 })!;
  assert.equal(l.loanKrw, 300_000_000);
  assert.equal(l.equityKrw, 200_000_000);
  assert.equal(l.termYears, 30);
  assert.equal(l.termAssumed, true);
  assert.equal(l.monthlyKrw, Math.round(m));
  assert.ok(l.monthlyPlus1ppKrw > l.monthlyKrw);
  assert.ok((l.holdingInterestKrw ?? 0) > 0 && (l.holdingInterestKrw ?? 0) < l.totalInterestKrw);
  /* 가격이 그대로면(0%) 손해는 정확히 보유 기간에 낸 이자만큼 — 원금 상환분은 판 값에서 돌아온다 */
  const flat = scenarioYields(l, { opt: 0, base: 0, pess: 0 })!;
  assert.ok(flat.every((y) => y.annualPct < 0 && Math.abs(y.profitKrw + (l.holdingInterestKrw ?? 0)) < 100));
  const ys = scenarioYields(l, { opt: 7, base: 4, pess: 1 })!;
  assert.deepEqual(ys.map((y) => y.key), ["opt", "base", "pess"]);
  assert.ok(ys[0].annualPct > ys[1].annualPct && ys[1].annualPct > ys[2].annualPct);
  assert.equal(scenarioYields({ ...l, holdingYears: null }, { opt: 7, base: 4, pess: 1 }), null);
});

test("[A-3] 수익률 계산 결과 — 입력이 있으면 월 상환액·보유 수익률, 없으면 넣어 달라고만(숫자 없음)", () => {
  const ctx = ctxOf({
    complex: { id: "c", name: "테스트", region: "안양 동안구", price: { priceKrw: 500_000_000, bandLabel: "전용 59㎡", latestYm: "202608", ...meta } },
    region: { id: null, name: "안양 동안구", snapshot: { avgSale: 1, jeonseRatio: 55, saleChangeMonthly: 1.2, tradeCount: 300, period: "202608", ...meta }, demographics: null },
  });
  const none = buildVerdict({ tool: "ai-simulator", ctx, footnotes: [] });
  assert.equal(none.metric, null);
  assert.equal(none.loan, null);
  assert.match(none.headline, /대출 비율·금리를 넣으면/);
  assert.equal(none.tiles?.find((t) => t.key === "loanAmount")?.value, null);
  const v = buildVerdict({ tool: "ai-simulator", ctx, footnotes: [], input: { ltvPct: 60, mortgageRatePct: 4.2, holdingYears: 5 } });
  assert.equal(v.loan?.loanKrw, 300_000_000);
  assert.equal(v.loan?.yields?.length, 3);
  assert.match(v.metric?.label ?? "", /5년 보유 · 기본 시나리오 연 수익률/);
  assert.deepEqual(v.tiles?.map((t) => t.key), ["price", "loanAmount", "loanMonthly", "loanInterest"]);
  assert.equal(v.tiles?.find((t) => t.key === "loanAmount")?.value, "3억");
  /* 기준 가격을 넣으면 그 값이 출발점이고 칸도 "기준 가격(입력)" */
  const mine = buildVerdict({ tool: "ai-simulator", ctx, footnotes: [], input: { basePriceMan: 40_000, ltvPct: 50, mortgageRatePct: 4 } });
  assert.equal(mine.loan?.priceKind, "input");
  assert.equal(mine.tiles?.[0].label, "기준 가격");
});

/* ── A-3 체크리스트 · 비교 · 입력 칸 ──────────────────────────────────── */
test("[A-3] 체크리스트는 실제 항목을 싣고, 비교는 담은 수만큼만 '나란히'라고 말한다", () => {
  const ctx = ctxOf({ complex: { id: "c", name: "테스트", region: "x", price: null } });
  const ck = buildVerdict({ tool: "my-checklist", ctx, footnotes: [] });
  const total = (ck.checklist ?? []).reduce((a, g) => a + g.items.length, 0);
  assert.ok(total >= 30, `항목 ${total}개`);
  assert.equal(ck.metric?.value, String(total));
  assert.match(buildVerdict({ tool: "ai-compare", ctx, footnotes: [] }).headline, /2곳 이상 담아/);
  assert.match(buildVerdict({ tool: "ai-compare", ctx, footnotes: [], input: { compareCount: 3 } }).headline, /3곳을 같은 숫자 칸으로 나란히/);
});

test("[A-3] 결과 숫자가 쓰는 입력(calc)만 '내 조건'이다 — AI 해설에만 쓰는 칸은 calc 가 아니다", () => {
  const calcKeys = (id: Parameters<typeof tuningFields>[0]) => tuningFields(id).filter((f) => f.calc).map((f) => f.key);
  assert.deepEqual(calcKeys("ai-prediction"), ["currentPriceMan", "horizonMonths"]);
  assert.deepEqual(calcKeys("ai-gap"), ["maeMan", "jeonMan"]);
  assert.deepEqual(calcKeys("contract-risk"), ["jeonseMan", "marketRatioPct", "hasRegistrationCheck", "hasInsurance"]);
  assert.deepEqual(calcKeys("ai-simulator"), ["currentPriceMan", "ltvPct", "mortgageRatePct", "loanTermYears", "holdingYears"]);
  for (const id of ["ai-diagnosis", "ai-timing", "ai-inspection", "my-checklist", "ai-compare"] as const) {
    assert.deepEqual(calcKeys(id), [], id);
  }
});

/* ── A-6 리스크: 3가지도 못 쟀으면 등급을 매기지 않는다 ─────────────────────── */
test("[A-6] 리스크 점검 — 한 가지만 재고 '좋음·낮음' 이라 하지 않는다, 못 잰 수를 적는다", () => {
  const one = ctxOf({ rent: { wolseSharePct: 40, jeonseCount: 300, wolseCount: 200, medianMonthlyKrw: null, months: 3, ...meta } });
  const v1 = buildVerdict({ tool: "ai-risk", ctx: one, footnotes: [] });
  assert.equal(v1.band, "thin");
  assert.equal(v1.bandReason, "5가지 중 1가지만 잴 수 있었어요");
  assert.equal(v1.metric, null);
  const four = ctxOf({
    region: { id: null, name: "x", snapshot: { avgSale: 1, jeonseRatio: 50, saleChangeMonthly: 1, tradeCount: 300, period: "202608", ...meta }, demographics: null },
    supply: { upcomingHouseholds: 100, upcomingComplexes: 1, items: [], ...meta },
    rent: { wolseSharePct: 40, jeonseCount: 300, wolseCount: 200, medianMonthlyKrw: null, months: 3, ...meta },
  });
  const v4 = buildVerdict({ tool: "ai-risk", ctx: four, footnotes: [] });
  assert.equal(v4.band, "strong");
  assert.equal(v4.bandReason, "잰 4가지 중 걸린 것 없음(1가지 자료 없음)");
  assert.match(v4.metric?.note ?? "", /1가지 자료 없음/);
  /* 걸린 게 있어도 못 잰 수를 함께 적는다 — "4가지 중 1가지"만 쓰면 제목의 "5가지"와 어긋나 보인다 */
  const fourWarn = ctxOf({
    region: { id: null, name: "x", snapshot: { avgSale: 1, jeonseRatio: 50, saleChangeMonthly: 1, tradeCount: 300, period: "202608", ...meta }, demographics: null },
    supply: { upcomingHouseholds: 4000, upcomingComplexes: 5, items: [], ...meta },
    rent: { wolseSharePct: 40, jeonseCount: 300, wolseCount: 200, medianMonthlyKrw: null, months: 3, ...meta },
  });
  const w4 = buildVerdict({ tool: "ai-risk", ctx: fourWarn, footnotes: [] });
  assert.equal(w4.band, "mixed");
  assert.equal(w4.bandReason, "잰 4가지 중 1가지 걸림(1가지 자료 없음)");
  assert.match(w4.headline, /잰 4가지 위험 신호 중 1가지가 걸렸어요\(1가지는 자료 없음\)/);
});

/* ── A-4 · A-9 · A-20 · A-23 컨텍스트 칸 ──────────────────────────────── */
test("[A-4·9·20·23] 최근 6개월 거래는 컨텍스트 값으로, 실패한 축은 '불러오지 못했어요', 거래량은 그 칸의 달, 경제 모니터는 지역을 밝힌다", () => {
  const ctx = ctxOf({
    unavailable: ["실거래가", "지역 가격 흐름"],
    complex: { id: "c", name: "테스트", region: "x", price: null, recent6: { count: 42, fromYm: "202603", toYm: "202608", span: 6 } },
    region: {
      id: null,
      name: "강남구",
      snapshot: { avgSale: 1, jeonseRatio: 50, saleChangeMonthly: 0.4, tradeCount: 311, period: "202608", fieldAsOf: { change: "202608", jeonse: "202608", trade: "202607" }, ...meta },
      demographics: null,
    },
  });
  const d = buildVerdict({ tool: "ai-diagnosis", ctx, footnotes: [] });
  assert.equal(d.tiles?.find((t) => t.key === "trades6m")?.value, "42건");
  assert.equal(d.tiles?.find((t) => t.key === "price")?.note, "지금 불러오지 못했어요");
  assert.equal(d.tiles?.find((t) => t.key === "regionYoy")?.note, "지금 불러오지 못했어요");
  const t = buildVerdict({ tool: "ai-timing", ctx, footnotes: [] });
  assert.equal(t.tiles?.find((x) => x.key === "regionTrades")?.asOf, "202607");
  const e = buildVerdict({ tool: "ai-economy", ctx, footnotes: [] });
  assert.match(e.tiles?.find((x) => x.key === "regionMom")?.note ?? "", /서울 강남구 기준/);
});

/* ── A-16 같은 날 거래 정렬 확정 · A-25 한국 시간 달 ─────────────────────── */
test("[A-16·25] 같은 날 거래는 금액·면적 순으로 확정 — 입력 순서가 바뀌어도 최근 6건이 같다, 달은 한국 시간", () => {
  const T = (day: number, man: number) => ({ ym: "202608", day, man, area: 59.9 });
  const rows = [T(10, 50000), T(10, 52000), T(10, 51000), T(9, 49000), T(9, 48000), T(8, 47000), T(8, 46000)];
  const a = resolveUnitPrice(rows);
  const b = resolveUnitPrice([...rows].reverse());
  assert.equal(a?.priceKrw, b?.priceKrw);
  /* 최근 6건 = 52000·51000·50000·49000·48000·47000 → 49500만원 */
  assert.equal(a?.priceKrw, 495_000_000);
  assert.equal(nowYm(new Date("2026-09-30T16:00:00Z")), "202610");
  assert.equal(nowYm(new Date("2026-09-30T14:59:00Z")), "202609");
  assert.equal(buildComplexTradeSeries(rows, { now: new Date("2026-09-21T00:00:00Z") })?.recent6.count, 7);
});

/* ── A-18 예전 AI 해설 꼬리 줄 ─────────────────────────────────────────── */
test("[A-18] 예전 기록의 꼬리 줄 — 밑줄 기울임 문자와 내부 말을 걷고, 나머지 줄은 그대로 둔다", () => {
  const legacy = [
    "## [AI 서술] 외부 모델 해석",
    "  들여쓴 줄은 그대로",
    "---",
    "_위 서술은 외부 LLM(gpt-x)이 작성한 해석이며, 수치의 원천은 함께 표시된 [규칙] 계산·근거 각주입니다._",
  ].join("\n");
  const out = cleanAiMarkdown(legacy);
  const lines = out.split("\n");
  assert.equal(lines[1], "  들여쓴 줄은 그대로");
  assert.equal(lines[3], "위 서술은 외부 LLM(gpt-x)이 작성한 해석이며, 수치의 원천은 함께 표시된 결과 요약·데이터 출처(공공데이터 자동 계산)입니다.");
  assert.doesNotMatch(out, /\[규칙\]|각주|^_|_$/m);
  /* 줄 가운데 밑줄(변수명 같은 것)은 건드리지 않는다 */
  assert.equal(cleanAiLine("snake_case 는 그대로"), "snake_case 는 그대로");
});
