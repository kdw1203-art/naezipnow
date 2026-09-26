import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  HUB_MAX_TABS,
  HUB_MIN_SOLID_MONTHS,
  latestTradeRow,
  baseShortLabel,
  baseSince,
  compareLatest,
  hubHeadline,
  hubRanges,
  hubSeries,
  recentDealTuples,
  toTradeLite,
  type HubDeal,
} from "@/lib/complex/hub-price";
import { dealDateLabel, floorLabel, unitKeyOf } from "@/lib/complex/deal-format";
import { hubFaqPriceAnswer, hubMetaPrice, ymSpanShort } from "@/lib/complex/hub-meta";
import { monthDeltaView, monthDeltasLatestFirst, prevYm, ymRangeShort } from "@/lib/complex/month-delta";
import { ALL_BANDS, toHubTrades, tradeDeltaBases, viewTrades } from "@/lib/complex/hub-trades";
import { complexInfoCells } from "@/lib/complex/info-cells";
import { resolveUnitPrice, unitOf } from "@/lib/ai/result-series";
import { changeSentence } from "@/lib/format/delta";

/* [1009 · C] 단지 허브 대표 실거래가·비교 기준·평형 탭·최근 실거래 목록. 숫자는 이 파일 안의 가짜 값이다. */

const NOW = new Date("2026-09-22T03:00:00Z");

function d(ym: string, day: number | null, man: number, area: number | null, floor: number | null = 5): HubDeal {
  return { ym, day, man, area, floor };
}

/* 84㎡ 12건(1~8월) + 59㎡ 4건 + 110㎡ 1건 */
const DEALS: HubDeal[] = [
  d("202608", 15, 100_000, 84.99, 20),
  d("202608", 7, 102_000, 84.95, 3),
  d("202608", 3, 150_000, 110.66, 27),
  d("202607", 28, 101_000, 84.98),
  d("202607", 20, 99_000, 84.97),
  d("202607", 11, 98_000, 84.99),
  d("202606", 30, 97_000, 84.98),
  d("202605", 10, 60_000, 59.96),
  d("202605", 9, 61_000, 59.96),
  d("202604", 4, 95_000, 84.98),
  d("202603", 3, 94_000, 84.95),
  d("202603", 1, 59_000, 59.96),
  d("202602", 20, 93_000, 84.99),
  d("202601", 9, 90_000, 84.98),
  d("202601", 5, 91_000, 84.98),
  d("202601", 2, 92_000, 84.99),
  d("202601", 1, 58_000, 59.96),
];

test("[1009 · C] 대표가 = AI 분석과 같은 함수(resolveUnitPrice) — 가장 많이 거래된 평형의 최근 6건 평균", () => {
  const h = hubHeadline(DEALS, NOW);
  const rp = resolveUnitPrice(toTradeLite(DEALS));
  assert.ok(h && rp);
  assert.equal(h.kind, "rep");
  assert.equal(h.basis, "unit");
  assert.equal(h.unitM2, 84);
  assert.equal(h.priceManwon, Math.round(rp.priceKrw / 10_000));
  /* 최근 6건: 100,000·102,000·101,000·99,000·98,000·97,000 → 99,500 */
  assert.equal(h.priceManwon, 99_500);
  assert.equal(h.sampleSize, 6);
  assert.equal(h.firstYm, "202606");
  assert.equal(h.latestYm, "202608");
});

test("[1009 · C] 비교 기준 = 같은 평형의 기간 첫 거래(대표가 표본과 겹치지 않는 가장 이른 최대 6건, 3건 이상)", () => {
  const h = hubHeadline(DEALS, NOW);
  assert.ok(h?.base);
  /* 표본 밖 84㎡: 95,000(04)·94,000(03)·93,000(02)·90,000·91,000·92,000(01) → 가장 이른 6건 전부 = 92,500 */
  assert.equal(h.base.count, 6);
  assert.equal(h.base.avgManwon, 92_500);
  assert.equal(h.base.firstYm, "202601");
  assert.equal(h.base.latestYm, "202604");
  assert.equal(baseSince(h.base), "2026.01~04 거래 6건 평균보다");
  assert.equal(
    changeSentence({ curr: h.priceManwon, base: h.base.avgManwon, since: baseSince(h.base), unit: "manwon" }),
    "2026.01~04 거래 6건 평균보다 7,000만원(7.6%) 올랐어요",
  );
  /* 공유 카드 등락 줄의 짧은 기준 — "▼ 0.8% · 26.01~04 대비" */
  assert.equal(baseShortLabel(h.base), "26.01~04");
  assert.equal(baseShortLabel({ ...h.base, latestYm: "202601" }), "26.01");
  assert.equal(baseShortLabel({ ...h.base, firstYm: "202511", latestYm: "202602" }), "25.11~26.02");
  /* 제목·설명·공유 카드 = 같은 대표가·같은 기준(평균은 짧은 표기, "평균"을 적는다) */
  assert.deepEqual(hubMetaPrice(h), {
    price: "9.9억",
    ogPrice: "9.9억",
    deltaPct: "▲ 7.6%",
    ogDelta: "▲ 7.6% · 26.01~04 대비",
    /* [1009 · C 리뷰] 표본 기간을 사실대로(26.06~08 계약 6건) — 마지막 달만 적으면 "8월 평균"처럼 읽혔다 */
    titleNote: "84㎡ 26.6~8월 6건 평균",
    descNote: "전용 84㎡ 2026.06~08 계약 6건 평균, 2026.01~04 거래 6건 평균보다 ▲ 7.6%",
  });
  /* 표본 밖이 3건 미만이면 비교하지 않는다(지어내지 않는다) */
  const few = DEALS.filter((x) => x.area !== 84.99 || x.ym >= "202608");
  const hf = hubHeadline(few.slice(0, 9), NOW);
  assert.equal(hf?.base ?? null, null);
});

test("[1009 · C] 평형·면적대 모두 3건 미만이면 가장 최근 한 건(평균인 척하지 않는다) · 없으면 null", () => {
  const two = [d("202604", 7, 61_000, 127.05, 16), d("202602", 28, 89_000, 156.85, 9)];
  const h = hubHeadline(two, NOW);
  assert.equal(h?.kind, "single");
  assert.equal(h?.priceManwon, 61_000);
  assert.equal(h?.unitM2, 127);
  assert.equal(h?.deal?.floor, 16);
  assert.equal(h?.base, null);
  /* 한 건은 정밀 표기 · 비교 없음 · "한 건"이라고 적는다 */
  assert.ok(h);
  assert.deepEqual(hubMetaPrice(h), {
    price: "6억 1,000만",
    ogPrice: "6.1억",
    deltaPct: "",
    ogDelta: "",
    titleNote: "127㎡ 26.4월 한 건",
    descNote: "전용 127㎡ 2026.04 거래 한 건",
  });
  assert.equal(hubHeadline([], NOW), null);
  assert.equal(hubHeadline(null, NOW), null);
});

test("[1009 · C] 평형 탭 — 대표 평형이 첫 탭, 모든 탭이 같은 달 축, 3건 이상인 달이 없으면 탭을 만들지 않는다", () => {
  const h = hubHeadline(DEALS, NOW);
  const s = hubSeries(DEALS, { now: NOW, headline: h });
  assert.ok(s);
  assert.equal(s.defaultKey, "u84");
  assert.equal(s.tabs[0].key, "u84");
  /* 59㎡ 는 달마다 1~2건뿐(속 빈 점만) — 탭이 되지 않는다. 110㎡ 는 1건 */
  assert.deepEqual(
    s.tabs.map((t) => t.key),
    ["u84"],
  );
  assert.ok(s.tabs.length <= HUB_MAX_TABS);
  /* 달력으로 이은 축: 2026.01~08 (지난달까지) */
  assert.deepEqual(s.yms, ["202601", "202602", "202603", "202604", "202605", "202606", "202607", "202608"]);
  const t = s.tabs[0];
  assert.equal(t.values.length, s.yms.length);
  assert.equal(t.counts.length, s.yms.length);
  /* 2026.05 는 84㎡ 거래가 없다 → null(보간하지 않는다) */
  assert.equal(t.values[4], null);
  assert.equal(t.counts[4], 0);
  assert.equal(t.values[0], 91_000);
  assert.equal(t.counts[0], 3);
  assert.equal(t.total, 12);
  assert.equal(hubSeries([], { now: NOW }), null);
});

test("[1009 · C] 기간 탭은 12개월을 넘을 때만 — 1년·전체(36개월이면 3년)", () => {
  assert.deepEqual(hubRanges(8), []);
  assert.deepEqual(hubRanges(12), []);
  assert.deepEqual(
    hubRanges(13).map((r) => `${r.key}:${r.label}:${r.last}`),
    ["1y:1년:12", "all:전체:0"],
  );
  assert.equal(hubRanges(36)[1].label, "3년");
});

test("[1009 · C] 최근 실거래 목록 — 최신순(계약월→일→금액→면적) · 층 0 은 모름 · 지하층은 남긴다", () => {
  const rows = recentDealTuples(
    [d("202607", 3, 90_000, 84.9, 0), d("202608", null, 80_000, 59.9, -1), d("202608", 12, 70_000, null, 7), d("202607", 3, 95_000, 84.9, 4)],
    10,
  );
  assert.deepEqual(rows, [
    ["202608", 12, 70_000, null, 7],
    ["202608", null, 80_000, 59.9, -1],
    ["202607", 3, 95_000, 84.9, 4],
    ["202607", 3, 90_000, 84.9, null],
  ]);
  assert.equal(recentDealTuples(DEALS, 3).length, 3);
  /* 대표가 정렬과 목록 정렬이 같은 비교를 쓴다 */
  const sorted = [...DEALS].sort(compareLatest);
  assert.equal(sorted[0].man, 100_000);
});

test("[1009 · C] 표기 — 평형 키는 result-series unitOf 와 같다 · 계약일 · 층", () => {
  for (const a of [59.96, 84.99, 84.0, 110.66, 127.051, 39.1]) assert.equal(unitKeyOf(a), unitOf(a));
  assert.equal(dealDateLabel("202608", 5), "2026.08.05");
  assert.equal(dealDateLabel("202608", null), "2026.08");
  assert.equal(floorLabel(15), "15층");
  assert.equal(floorLabel(-1), "지하 1층");
  assert.equal(floorLabel(null), "—");
});

test("[1009 · C] 단지 정보 격자 — 값이 있는 항목만 칸이 된다(상수 '유형'은 칸이 아니다)", () => {
  const cells = complexInfoCells(
    {
      households: 9510,
      buildingCount: 84,
      parkingCount: 12096,
      parkingPerHh: 1.27,
      heating: "지역난방",
      builder: "현대건설,삼성물산,현대산업개발",
      buildYear: 2018,
      roadAddress: "서울 어딘가 1",
      address: null,
      kaptCode: null,
    },
    2026,
  );
  assert.deepEqual(
    cells.map((c) => `${c.label}=${c.value}${c.sub ? `(${c.sub})` : ""}`),
    ["세대수=9,510세대", "동 수=84개 동", "준공=2018년(8년차)", "주차=12,096대(세대당 1.27대)", "난방=지역난방", "시공사=현대건설, 삼성물산, 현대산업개발"],
  );
  assert.equal(cells.find((c) => c.label === "시공사")?.wide, true);
  assert.deepEqual(
    complexInfoCells(
      { households: null, buildingCount: 0, parkingCount: null, parkingPerHh: null, heating: " ", builder: null, buildYear: null, roadAddress: null, address: null, kaptCode: null },
      2026,
    ),
    [],
  );
});

/** 주석을 뺀 소스 — 주석에는 "예전엔 #e11900 이었다" 같은 설명이 남아 있다 */
function code(path: string): string {
  return readFileSync(path, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

test("[1009 · C] 등락색 뒤집힘·raw hex 회귀 잠금(소스 검사)", () => {
  const rr = code("app/complex/[id]/RegionRelative.tsx");
  assert.ok(!/text-primary" : "text-danger/.test(rr), "RegionRelative 가 상승=파랑으로 돌아갔다");
  assert.ok(rr.includes("<Delta"), "RegionRelative 는 <Delta> 로 등락을 그린다");
  const panel = code("app/map/ComplexInfoPanel.tsx");
  assert.ok(!/const tone = up \?/.test(panel), "지도 패널 추이 선 색이 뒤집혔다");
  assert.ok(!/(deltaPct|saleChangePct) >= 0 \? "text-primary"/.test(panel), "지도 패널 '이 동네 대비' 등락이 뒤집혔다");
  assert.ok(!/import \{ TrendChart \}/.test(panel), "지도 패널 추이는 ScrubLine 이다");
  assert.ok(panel.includes("<ScrubLineLazy"), "지도 패널 추이는 ScrubLineLazy(따로 받는 청크)");
  const chart = code("app/complex/[id]/PriceTrendChart.tsx") + code("app/complex/[id]/PriceTrendPanel.tsx");
  assert.ok(!/#[0-9a-fA-F]{6}\b/.test(chart), "허브 가격 추이에 raw hex");
  const naver = code("components/map/NaverMap.tsx");
  assert.ok(!/#e11900|#1565d8/.test(naver), "마커 등락색 raw hex");
  assert.ok(!naver.includes("/experts?"), "보관 영역(전문가) 링크");
  /* 제목·설명·공유 카드 숫자 = 첫 화면 대표가(같은 hubHeadline) — 월평균·전월비로 되돌아가면 공유 카드와 첫 화면이 다른 말을 한다 */
  const page = code("app/complex/[id]/page.tsx");
  const meta = page.slice(page.indexOf("export async function generateMetadata"), page.indexOf("export default async function"));
  assert.ok(/hubHeadline\(metaDeals\b/.test(meta), "메타데이터가 대표가(hubHeadline)를 쓰지 않는다");
  assert.ok(!meta.includes('"시세 준비 중"'), "메타데이터 가격 기본값에 '시세' 낱말");
  const hover = code("app/map/map-client.tsx");
  assert.ok(!/momPct >= 0 \? "text-danger" : "text-primary"/.test(hover), "지도 호버 말풍선 등락색");
});

/* ── [1009 · C 리뷰] 수정 요청 잠금 ─────────────────────────────────────── */

test("[1009 · C 리뷰] 평형 탭은 거래 3건 이상인 달이 둘 이상일 때만 — 한 달뿐이면 1~2건 달과 견주게 된다", () => {
  assert.equal(HUB_MIN_SOLID_MONTHS, 2);
  /* 리뷰 실측 모양: 84㎡ 달별 [3,0,1,1,2,0,1] (7개월) — 3건 이상인 달이 하나뿐 */
  const shape = [3, 0, 1, 1, 2, 0, 1];
  const deals: HubDeal[] = [];
  shape.forEach((n, i) => {
    for (let k = 0; k < n; k++) deals.push(d(`20260${i + 1}`, 10 + k, 90_000 + i * 1_000 + k, 84.9));
  });
  const h = hubHeadline(deals, NOW);
  assert.equal(hubSeries(deals, { now: NOW, headline: h }), null, "3건 이상인 달이 하나뿐이면 탭을 만들지 않는다");
  /* 같은 모양에 3건짜리 달을 하나 더하면 탭이 선다 */
  for (let k = 0; k < 3; k++) deals.push(d("202608", 20 + k, 95_000, 84.9));
  assert.deepEqual(hubSeries(deals, { now: NOW, headline: hubHeadline(deals, NOW) })?.tabs.map((t) => t.key), ["u84"]);
});

test("[1009 · C 리뷰] 첫 화면이 비교하지 않은 평형은 그래프도 비교하지 않는다(rep.compare=false) · 대표 탭 표시", () => {
  /* 84㎡ 6건([3,0,3]) — 대표가 표본이 6건 전부라 비교 기준이 없다 */
  const deals = [
    d("202608", 20, 100_000, 84.9), d("202608", 12, 101_000, 84.9), d("202608", 3, 99_000, 84.9),
    d("202606", 20, 95_000, 84.9), d("202606", 12, 96_000, 84.9), d("202606", 3, 94_000, 84.9),
  ];
  const h = hubHeadline(deals, NOW);
  assert.equal(h?.kind, "rep");
  assert.equal(h?.base, null);
  const s = hubSeries(deals, { now: NOW, headline: h });
  assert.ok(s);
  assert.deepEqual(s.rep, { key: "u84", basis: "unit", sampleSize: 6, compare: false });
  /* 기준이 있으면 compare=true */
  const s2 = hubSeries(DEALS, { now: NOW, headline: hubHeadline(DEALS, NOW) });
  assert.equal(s2?.rep?.compare, true);
  assert.equal(s2?.rep?.key, "u84");
});

test("[1009 · C 리뷰] 읽기 상한에 걸리면 가장 이른 달을 비교 기준에서도 뺀다(그래프와 같은 기간)", () => {
  const open = hubHeadline(DEALS, NOW);
  const capped = hubHeadline(DEALS, NOW, { capped: true });
  assert.equal(open?.base?.firstYm, "202601");
  /* 1월(가장 이른 달)이 빠지면 표본 밖 84㎡ 는 4·3·2월 3건 → 94,000 */
  assert.equal(capped?.base?.firstYm, "202602");
  assert.equal(capped?.base?.count, 3);
  assert.equal(capped?.base?.avgManwon, 94_000);
  /* 대표가 자체는 그대로 */
  assert.equal(capped?.priceManwon, open?.priceManwon);
});

test("[1009 · C 리뷰] 면적대 '최근 실거래' = 가장 최근 계약(계약월→계약일→금액) — DB 반환 순서가 아니다", () => {
  const rows = [
    { contract_ym: "202608", contract_day: 1, deal_amount_krw: 2_890_000_000, area_m2: 84.9 },
    { contract_ym: "202608", contract_day: 15, deal_amount_krw: 2_900_000_000, area_m2: 84.9 },
    { contract_ym: "202607", contract_day: 30, deal_amount_krw: 3_100_000_000, area_m2: 84.9 },
    { contract_ym: "202608", contract_day: null, deal_amount_krw: 3_000_000_000, area_m2: 84.9 },
  ];
  assert.equal(latestTradeRow(rows)?.contract_day, 15);
  assert.equal(latestTradeRow([]), null);
});

test("[1009 · C 리뷰] 월별 줄 등락 — 앞 줄이 전달일 때만 '전월 대비', 빈 달 다음은 기준 달 · 0 은 보합 · 모르면 —", () => {
  assert.equal(prevYm("202603"), "202602");
  assert.equal(prevYm("202601"), "202512");
  assert.deepEqual(monthDeltaView("202603", { pct: 2.5, baseYm: "202602" }), {
    text: "▲ 2.5%",
    dir: "up",
    basis: "전월 대비",
    adjacent: true,
  });
  assert.deepEqual(monthDeltaView("202605", { pct: -1.2, baseYm: "202602" }), {
    text: "▼ 1.2%",
    dir: "down",
    basis: "26.02 대비",
    adjacent: false,
  });
  assert.equal(monthDeltaView("202603", { pct: 0, baseYm: "202602" }).text, "보합");
  assert.deepEqual(monthDeltaView("202601", { pct: null, baseYm: null }), { text: "—", dir: null, basis: null, adjacent: false });
  assert.equal(ymRangeShort("202601", "202608"), "26.01~26.08");
  assert.equal(ymRangeShort("202608", "202608"), "26.08");

  /* 표(toHubTrades·viewTrades)와 같은 짝 — 전체는 바로 앞 줄, 면적대는 그 면적대가 있던 앞 줄 */
  const band = (slug: string, avg: number) => [{ slug, avg_manwon: avg, min_manwon: avg, max_manwon: avg, deal_count: 1 }];
  const tx = [
    { yyyymm: "202601", avg_manwon: 100_000, min_manwon: 100_000, max_manwon: 100_000, deal_count: 1, bands: band("60-85", 100_000) },
    { yyyymm: "202602", avg_manwon: 50_000, min_manwon: 50_000, max_manwon: 50_000, deal_count: 1, bands: band("-60", 50_000) },
    { yyyymm: "202605", avg_manwon: 110_000, min_manwon: 110_000, max_manwon: 110_000, deal_count: 1, bands: band("60-85", 110_000) },
  ];
  const trades = toHubTrades(tx);
  const all = tradeDeltaBases(trades, ALL_BANDS);
  assert.deepEqual(all.get("202605"), { pct: 120, baseYm: "202602" });
  assert.deepEqual(all.get("202602"), { pct: -50, baseYm: "202601" });
  assert.deepEqual(all.get("202601"), { pct: null, baseYm: null });
  /* 기존 표 출력과 같은 숫자다(기존 출력은 그대로) */
  assert.equal(trades.find((t) => t.ym === "202605")?.delta, "▲ 120.0%");
  const slug = trades[0].bands[0]?.slug ?? "";
  if (slug) {
    const bandBases = tradeDeltaBases(trades, slug);
    assert.equal(bandBases.get("202605")?.baseYm, "202601");
    assert.equal(viewTrades(trades, slug, "latest").find((t) => t.ym === "202605")?.delta, "▲ 10.0%");
    assert.equal(bandBases.get("202605")?.pct, 10);
  }
  /* 지도 패널(최신순 줄) */
  const m = monthDeltasLatestFirst([
    { ym: "202608", avg: 110 },
    { ym: "202606", avg: 100 },
  ]);
  assert.deepEqual(m.get("202608"), { pct: 10, baseYm: "202606" });
  assert.equal(monthDeltaView("202608", m.get("202608")).basis, "26.06 대비");
});

test("[1009 · C 리뷰] 제목 표본 기간 · FAQ 답 = 첫 화면 대표가(혼합 전월비 없음)", () => {
  assert.equal(ymSpanShort("202608", "202608"), "26.8월");
  assert.equal(ymSpanShort("202607", "202608"), "26.7~8월");
  assert.equal(ymSpanShort("202512", "202602"), "25.12~26.2월");
  const h = hubHeadline(DEALS, NOW);
  assert.ok(h);
  const a = hubFaqPriceAnswer("테스트단지", h);
  assert.ok(a.includes("전용 84㎡ 2026.06~08 계약 6건 평균 9억 9,500만원"), a);
  assert.ok(!/전월비|▲|▼/.test(a), "FAQ 답에 등락을 싣지 않는다");
  const single = hubHeadline([d("202604", 7, 61_000, 127.05, -1)], NOW);
  assert.ok(single);
  assert.ok(hubFaqPriceAnswer("테스트단지", single).includes("2026.04.07 계약 전용 127㎡ 6억 1,000만원 한 건"));
});
