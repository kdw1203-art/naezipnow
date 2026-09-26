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
    notes: { count: 4, avgScore: 3.75, latest: null, source: "이웃 임장노트", asOf: "2026-09-01", sample: 4 },
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

test("[1008 · 리뷰 A-8] 시세 예측 — '3개월 뒤 예상' 칸은 없다(적중률을 공개한 규칙과 다른 식이었다)", () => {
  const v = buildVerdict({ tool: "ai-prediction", ctx: ctxFixture(), footnotes: [], now: NOW });
  assert.equal(v.tiles?.find((t) => t.key === "forecast3m"), undefined);
  assert.deepEqual(v.tiles?.map((t) => t.key), ["price", "regionYoy", "trades6m", "supply"]);
});

test("[1008] 시세 예측 — 대표 수치는 낙관·기본·비관 시나리오(가정 계산), 기간 입력을 따른다", () => {
  const v = buildVerdict({ tool: "ai-prediction", ctx: ctxFixture(), footnotes: [], now: NOW });
  /* 지역 1년 흐름이 없으면 한 달 +1.2%×12 = 14.4% → 기본 = 절반(7.2) 을 연 4% 로 자름 → 24억 × 1.04 = 24.96억 */
  assert.equal(v.metric?.label, "1년 뒤 기본 시나리오");
  assert.equal(v.metric?.value, "25억");
  assert.ok(v.scenario);
  assert.deepEqual(v.scenario?.annual, { opt: 7, base: 4, pess: 1 });
  assert.equal(v.scenario?.path.length, 2);
  const three = buildVerdict({ tool: "ai-prediction", ctx: ctxFixture(), footnotes: [], input: { horizonMonths: 36 }, now: NOW });
  assert.equal(three.scenario?.years, 3);
  assert.equal(three.metric?.label, "3년 뒤 기본 시나리오");
  /* 사용자가 넣은 기준 가격이 출발점 */
  const mine = buildVerdict({ tool: "ai-prediction", ctx: ctxFixture(), footnotes: [], input: { basePriceMan: 200000 }, now: NOW });
  assert.equal(mine.scenario?.startKrw, 2_000_000_000);
  assert.equal(mine.scenario?.startKind, "input");
  assert.ok(v.headline.includes("1년 뒤 기본"));
  /* [1008] 알약 = 시나리오 방향(기본 +4% · 비관 +1% → 셋 다 오름 · 좋음) — 타이밍 신호로 정하지 않는다 */
  assert.equal(v.band, "strong");
  assert.equal(v.bandReason, "세 시나리오 모두 오름세(기본 연 +4%)");
  const withMom = (m: number) => {
    const base = ctxFixture();
    return ctxFixture({ region: { ...base.region!, snapshot: { ...base.region!.snapshot!, saleChangeMonthly: m } } });
  };
  /* 한 달 +0.2% → 연 2.4% 의 절반 = 기본 +1.2% · 비관 −1.8% → 방향이 갈림(보통) */
  const flat = buildVerdict({ tool: "ai-prediction", ctx: withMom(0.2), footnotes: [], now: NOW });
  assert.equal(flat.band, "mixed");
  assert.equal(flat.bandReason, "시나리오마다 방향이 달라요(기본 연 +1.2%)");
  /* 한 달 −0.5% → 기본 −3% → 주의 */
  const down = buildVerdict({ tool: "ai-prediction", ctx: withMom(-0.5), footnotes: [], now: NOW });
  assert.equal(down.band, "weak");
  assert.equal(down.bandReason, "기본 시나리오도 내림세(연 −3%)");
});

test("[993] 재료가 없으면 수치를 만들지 않는다 — 구간은 자료 부족(thin)", () => {
  const empty = ctxFixture({ complex: null, region: null, rent: null, supply: null, notes: null, macro: null });
  const v = buildVerdict({ tool: "ai-diagnosis", ctx: empty, footnotes: [], now: NOW });
  assert.equal(v.metric, null);
  assert.equal(v.numbers.length, 0);
  assert.equal(v.band, "thin");
  assert.equal(v.bandLabel, "자료 부족");
  assert.equal(verdictToSummary(v).score, null);
  /* [1008] 타일 4칸은 그대로 서고 값만 비운다("—" · 자료 없음) — 빈칸을 다른 숫자로 메우지 않는다 */
  assert.equal(v.tiles?.length, 4);
  assert.ok(v.tiles?.every((t) => t.value === null));
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
  const safe = buildVerdict({ tool: "contract-risk", ctx: ctxFixture(), footnotes: [], input: { marketRatioPct: 70 }, now: NOW });
  assert.equal(safe.metric?.value, "안전");
  assert.equal(safe.band, "strong");
  /* [1008 · 리뷰 A-7] 입력 없이 지역 평균만이면 "안전·좋음"이 아니라 지역 평균 참고값(보통) — 출처는 지역 시세 출처 그대로 */
  const regional = buildVerdict({ tool: "contract-risk", ctx: ctxFixture(), footnotes: [], now: NOW });
  assert.equal(regional.metric?.label, "지역 평균 전세가율");
  assert.equal(regional.metric?.value, "52");
  assert.equal(regional.band, "mixed");
  assert.ok(regional.metric?.note?.startsWith("지역 시세 스냅샷"));
  assert.doesNotMatch(regional.metric?.note ?? "", /신고 통계/);
  /* [1008 · 리뷰 A-3] 입력으로 만든 사실 목록 — 등기부·보증보험을 확인하지 않았으면 할 일로 */
  assert.equal(regional.contract?.ratioSource, "region");
  assert.equal(regional.contract?.issues.filter((i) => i.tone === "todo").length, 2);
  const checked = buildVerdict({
    tool: "contract-risk",
    ctx: ctxFixture(),
    footnotes: [],
    input: { marketRatioPct: 85, jeonseMan: 50000, hasRegistrationCheck: true, hasInsurance: true },
    now: NOW,
  });
  assert.deepEqual(checked.contract?.issues.map((i) => i.tone), ["warning"]);
  assert.equal(checked.contract?.saleEstimateMan, Math.round(50000 / 0.85));
  assert.equal(checked.contract?.clauses.length, 4);
});

test("[993] 요약 변환 — 대표 수치가 숫자일 때만 score, 핵심 숫자는 bullets 로", () => {
  const v = buildVerdict({ tool: "ai-diagnosis", ctx: ctxFixture(), footnotes: [], now: NOW });
  const s = verdictToSummary(v);
  assert.equal(typeof s.score, "number");
  assert.ok(s.bullets[0].includes("최근 실거래가"));
  const t = buildVerdict({ tool: "ai-timing", ctx: ctxFixture(), footnotes: [], now: NOW });
  assert.equal(verdictToSummary(t).score, null);
});
