import { test } from "node:test";
import assert from "node:assert/strict";
import { buildVerdict, verdictToSummary, BAND_LABEL } from "../../lib/ai/verdict";
import type { LiveToolContext, Footnote } from "../../lib/ai/live-context";

/* [993] 판단 카드 — 실데이터 컨텍스트에서만 조립하고, 없는 수치를 만들지 않는다 */

const NOW = new Date("2026-09-13T00:00:00Z");

function ctxFixture(over: Partial<LiveToolContext> = {}): LiveToolContext {
  return {
    generatedAt: NOW.toISOString(),
    complex: {
      id: "c1",
      name: "은마아파트",
      region: "서울 강남구",
      price: { priceKrw: 2_400_000_000, bandLabel: "84㎡", latestYm: "202608", source: "국토교통부 실거래(신고)", asOf: "202608", sample: 12 },
    },
    region: {
      id: "seoul-gangnam",
      name: "서울 강남구",
      snapshot: { avgSale: 2_200_000_000, jeonseRatio: 52, saleChangeMonthly: 1.2, tradeCount: 180, period: "202607", source: "지역 시세 스냅샷", asOf: "202607", sample: 180 },
      demographics: { population: 500_000, households: 200_000, unsoldUnits: 20, period: "202606", source: "KOSIS", asOf: "202606" },
    },
    rent: { wolseSharePct: 41, jeonseCount: 300, wolseCount: 210, medianMonthlyKrw: 1_500_000, months: 3, source: "전월세 신고", asOf: "2026-09-13", sample: 510 },
    supply: { upcomingHouseholds: 1200, upcomingComplexes: 2, items: [], source: "청약홈", asOf: "2026-09-12" },
    news: null,
    notes: { count: 4, avgScore: 7.5, latest: null, source: "이웃 임장노트", asOf: "2026-09-01", sample: 4 },
    macro: { baseRatePct: 2.5, source: "ECOS", asOf: "2026-09-10" },
    poi: null,
    ...over,
  };
}

const FOOTNOTES: Footnote[] = [
  { n: 1, label: "실거래가", source: "국토교통부", asOf: "202608", sample: 12, href: null },
  { n: 2, label: "지역 시세·거래량", source: "스냅샷", asOf: "202607", sample: 180, href: "/region/x" },
];

test("[993] 종합 진단 — 대표 수치는 측정된 레이더 축 평균, 핵심 숫자는 최대 3개에 기준일", () => {
  const v = buildVerdict({ tool: "ai-diagnosis", ctx: ctxFixture(), footnotes: FOOTNOTES, now: NOW });
  assert.ok(v.metric, "metric");
  assert.equal(v.metric?.label, "투자 점수");
  assert.match(v.metric?.value ?? "", /^\d+$/);
  assert.ok(v.numbers.length > 0 && v.numbers.length <= 3);
  for (const n of v.numbers) assert.ok(n.label && n.value && n.source, n.key);
  assert.equal(v.numbers[0].key, "price");
  assert.equal(v.numbers[0].asOf, "202608");
  assert.ok(["strong", "mixed", "weak", "thin"].includes(v.band));
  assert.equal(v.bandLabel, BAND_LABEL[v.band]);
  assert.ok(v.headline.includes("은마아파트"));
  assert.equal(v.evidence.length, 2);
  assert.equal(v.evidence[1].href, "/region/x");
});

test("[993] 시세 예측 — 공개 백테스트 규칙(월간 변동 3개월 외삽)과 같은 수식", () => {
  const v = buildVerdict({ tool: "ai-prediction", ctx: ctxFixture(), footnotes: [], now: NOW });
  assert.ok(v.metric);
  /* 24억 × 1.012^3 ≈ 24.87억 → short 표기 "24.9억" */
  assert.equal(v.metric?.value, "24.9억");
  assert.equal(v.metric?.asOf, "202607");
  assert.ok(v.headline.includes("+1.2%"));
});

test("[993] 재료가 없으면 수치를 만들지 않는다 — 구간은 판단 보류", () => {
  const empty = ctxFixture({ complex: null, region: null, rent: null, supply: null, notes: null, macro: null });
  const v = buildVerdict({ tool: "ai-diagnosis", ctx: empty, footnotes: [], now: NOW });
  assert.equal(v.metric, null);
  assert.equal(v.numbers.length, 0);
  assert.equal(v.band, "thin");
  assert.equal(verdictToSummary(v).score, null);
});

test("[993] 갭 — 입력값이 있으면 입력으로, 없으면 지역 전세가율 추정임을 라벨에 적는다", () => {
  const withInput = buildVerdict({ tool: "ai-gap", ctx: ctxFixture(), footnotes: [], input: { maeMan: 100000, jeonMan: 60000 }, now: NOW });
  assert.equal(withInput.metric?.value, "40");
  assert.equal(withInput.metric?.unit, "%");
  assert.ok(withInput.metric?.label.includes("입력값"));
  const proxy = buildVerdict({ tool: "ai-gap", ctx: ctxFixture(), footnotes: [], now: NOW });
  assert.equal(proxy.metric?.value, "48");
  assert.ok(proxy.metric?.label.includes("추정"));
});

test("[993] 계약 위험도 — 전세가율 90 이상 위험 · 80 이상 주의 · 그 외 안전", () => {
  const danger = buildVerdict({ tool: "contract-risk", ctx: ctxFixture(), footnotes: [], input: { marketRatioPct: 92 }, now: NOW });
  assert.equal(danger.metric?.value, "위험");
  const caution = buildVerdict({ tool: "contract-risk", ctx: ctxFixture(), footnotes: [], input: { marketRatioPct: 85 }, now: NOW });
  assert.equal(caution.metric?.value, "주의");
  const safe = buildVerdict({ tool: "contract-risk", ctx: ctxFixture(), footnotes: [], now: NOW });
  assert.equal(safe.metric?.value, "안전");
  assert.ok(safe.metric?.note.includes("지역 신고 통계"));
});

test("[993] 요약 변환 — 대표 수치가 숫자일 때만 score, 핵심 숫자는 bullets 로", () => {
  const v = buildVerdict({ tool: "ai-diagnosis", ctx: ctxFixture(), footnotes: [], now: NOW });
  const s = verdictToSummary(v);
  assert.equal(typeof s.score, "number");
  assert.ok(s.bullets[0].includes("대표 실거래가"));
  const t = buildVerdict({ tool: "ai-timing", ctx: ctxFixture(), footnotes: [], now: NOW });
  assert.equal(verdictToSummary(t).score, null);
});
