/* [1024] 단지 상세 v2 — 순수 규칙 잠금: 기간 칩 활성 규칙 · 갭 계산 · 개요 스트립 필드 매핑 · 타입 탭/월 중앙값/신고가 배지 ·
   그래프 표식 좌표 · 페이지 소스 배선(시안 섹션 순서·번들 규칙). */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  OVERVIEW_EMPTY,
  buildTxTrendData,
  calendarYms,
  gapManwon,
  krwToMan,
  medianOf,
  monthlyMedianSeries,
  overviewStripCells,
  periodCaption,
  periodChips,
  periodStart,
  recentDealRows,
  recentMedian,
  typeTabsFromDeals,
  ymAdd,
  ymDash,
} from "../../app/complex/[id]/complex-v2-model.ts";
import { layoutPriceChart } from "../../app/components/viz/price-chart-geometry.ts";
import type { HubDeal } from "../../lib/complex/hub-price.ts";

const ROOT = join(import.meta.dirname ?? ".", "..", "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const code = (p: string) =>
  read(p)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

const d = (ym: string, day: number | null, man: number, area: number | null, floor: number | null = 5): HubDeal => ({
  ym,
  day,
  man,
  area,
  floor,
});

/* ── 기간 칩 ─────────────────────────────────────────────────────────── */

test("[1024] 기간 칩 — 1년은 언제나, 3년은 12개월 넘을 때, 5년은 36개월 넘을 때, 전체는 60개월 넘을 때만 켜진다", () => {
  const on = (n: number) => periodChips(n).filter((c) => c.enabled).map((c) => c.key);
  assert.deepEqual(on(0), ["1y"]);
  assert.deepEqual(on(9), ["1y"], "실측(2026-01~09, 9개월)은 1년만");
  assert.deepEqual(on(12), ["1y"]);
  assert.deepEqual(on(13), ["1y", "3y"]);
  assert.deepEqual(on(36), ["1y", "3y"]);
  assert.deepEqual(on(37), ["1y", "3y", "5y"]);
  assert.deepEqual(on(61), ["1y", "3y", "5y", "all"]);
  assert.deepEqual(
    periodChips(9).map((c) => c.label),
    ["1년", "3년", "5년", "전체"],
  );
  assert.deepEqual(
    periodChips(9).map((c) => c.last),
    [12, 36, 60, 0],
  );
});

test("[1024] 기간 캡션 — 꺼진 칩만 '…는 2026-01 부터', 다 켜져 있으면 null", () => {
  assert.equal(periodCaption(periodChips(9), "202601"), "3년·5년·전체는 2026-01 부터");
  assert.equal(periodCaption(periodChips(40), "202301"), "전체는 2023-01 부터");
  assert.equal(periodCaption(periodChips(61), "202101"), null);
  assert.equal(periodCaption(periodChips(9), null), null, "첫 달을 모르면 캡션도 없다");
  assert.equal(ymDash("202601"), "2026-01");
});

test("[1024] 기간 시작 인덱스 — last 0 은 전체, 데이터가 짧으면 0", () => {
  assert.equal(periodStart(9, 12), 0);
  assert.equal(periodStart(40, 12), 28);
  assert.equal(periodStart(40, 0), 0);
});

/* ── 갭 ─────────────────────────────────────────────────────────────── */

test("[1024] 갭 = 매매 중앙 − 전세 중앙(만원) — 둘 다 있을 때만, 아니면 null(0 으로 위장 금지)", () => {
  assert.equal(gapManwon(74_500, 30_750), 43_750, "시안: 7억 4,500만 − 3억 750만 = 4억 3,750만");
  assert.equal(gapManwon(74_500, null), null);
  assert.equal(gapManwon(null, 30_750), null);
  assert.equal(gapManwon(0, 30_750), null);
  assert.equal(gapManwon(Number.NaN, 30_750), null);
  assert.equal(gapManwon(30_000, 40_000), -10_000, "전세가 매매보다 높으면 음수 그대로(사실)");
  assert.equal(krwToMan(745_000_000), 74_500);
  assert.equal(krwToMan(null), null);
});

/* ── 개요 스트립 ─────────────────────────────────────────────────────── */

test("[1024] 개요 스트립 — 8칸 고정 순서(세대·동·준공·주차/세대·승강기·난방·건설사·관리), 값 없으면 '—'", () => {
  const cells = overviewStripCells({
    households: 1710,
    building_count: 14,
    build_year: 1993,
    parking_per_hh: 0.4,
    elevator_count: 28,
    heating: "지역난방",
    builder_name: "(주)부영",
    manage_type: "위탁관리",
  });
  assert.deepEqual(
    cells.map((c) => c.label),
    ["세대", "동", "준공", "주차/세대", "승강기", "난방", "건설사", "관리"],
  );
  assert.deepEqual(
    cells.map((c) => c.value),
    ["1,710", "14", "1993", "0.40", "28", "지역난방", "(주)부영", "위탁관리"],
  );
  assert.deepEqual(
    cells.map((c) => c.num),
    [true, true, true, true, true, false, false, false],
  );

  const empty = overviewStripCells({
    households: null,
    building_count: 0,
    build_year: null,
    parking_per_hh: 0,
    heating: "  ",
    builder_name: null,
  });
  assert.equal(empty.length, 8, "값이 없어도 칸은 8개(고정 격자)");
  assert.ok(empty.every((c) => c.value === OVERVIEW_EMPTY));
  assert.equal(OVERVIEW_EMPTY, "—");
});

test("[1024] 개요 스트립 — 승강기·관리방식·분양형태가 ComplexRow 선택 필드로 있다(complex-store enrich 가 K-apt metadata 에서 채운다)", () => {
  const store = read("lib/complex/complex-store.ts");
  assert.match(store, /elevator_count\?: number \| null/);
  assert.match(store, /manage_type\?: string \| null/);
  assert.match(store, /sale_type\?: string \| null/);
  assert.match(store, /elevatorCount: fromV4Detail \? posInt\(m\.elevatorCount\) : null/, "승강기는 V4 상세 표식이 있을 때만(세대수와 같은 출처 조건)");
  assert.match(store, /base\.manage_type = apt\.manageType \?\? base\.manage_type \?\? null/);
});

/* ── 타입 탭 · 월 중앙값 · 신고가 ─────────────────────────────────────── */

const DEALS: HubDeal[] = [
  d("202601", 5, 60_000, 50.1, 3),
  d("202601", 20, 40_550, 50.9, 1),
  d("202602", 3, 59_900, 50.5, 7),
  d("202603", 9, 64_700, 50.2, 9),
  d("202608", 19, 80_000, 50.3, 3),
  d("202608", 22, 79_500, 50.0, 15),
  d("202608", 30, 93_000, 60.4, 10),
  d("202607", 1, 90_000, 60.1, 7),
  d("202608", 29, 55_000, 38.2, 6),
  d("202605", 2, 40_000, null, 2), // 면적 없음 — 타입 탭에서 빠지고 전 타입 시계열에는 든다
];

test("[1024] 타입 탭 — 전용면적 정수 ㎡로 묶어 거래 많은 순, 최대 4개, 면적 없는 거래는 빠진다", () => {
  const tabs = typeTabsFromDeals(DEALS);
  assert.deepEqual(
    tabs.map((t) => [t.key, t.areaM2, t.count]),
    [
      ["50", 50, 6],
      ["60", 60, 2],
      ["38", 38, 1],
    ],
  );
  assert.equal(typeTabsFromDeals(DEALS, 2).length, 2);
  assert.deepEqual(typeTabsFromDeals([]), []);
});

test("[1024] 월 중앙값 시계열 — 달력 축 위에 그 타입의 중앙값(짝수면 가운데 둘의 평균)·건수, 없는 달은 null·0", () => {
  const yms = calendarYms("202601", "202609");
  assert.equal(yms.length, 9);
  const s = monthlyMedianSeries(DEALS, yms, "50");
  assert.deepEqual(s.values, [50_275, 59_900, 64_700, null, null, null, null, 79_750, null]);
  assert.deepEqual(s.counts, [2, 1, 1, 0, 0, 0, 0, 2, 0]);
  const all = monthlyMedianSeries(DEALS, yms, null);
  assert.equal(all.counts[4], 1, "면적 없는 5월 거래는 전 타입에 든다");
  assert.equal(medianOf([]), null);
  assert.equal(medianOf([3, 1, 2]), 2);
  assert.equal(ymAdd("202601", -1), "202512");
  assert.equal(ymAdd("202612", 1), "202701");
  assert.deepEqual(calendarYms("202603", "202601"), []);
});

test("[1024] 추이 재료 — 타입별 신고가▲·신저가▼(기간 내 최고·최저 그 자체), 한 건뿐인 타입은 둘 다 null, 전월세는 전 타입", () => {
  const t = buildTxTrendData(
    DEALS,
    [
      { month: "202608", jeonseCount: 3, jeonseMedianDepositKrw: 307_500_000, wolseCount: 1, wolseMedianDepositKrw: 50_000_000, wolseMedianMonthlyKrw: 800_000 },
    ],
    "202609",
  );
  assert.ok(t);
  assert.equal(t.firstYm, "202601");
  assert.deepEqual(t.yms.slice(-1), ["202609"], "이번 달(신고 중)까지 축을 잇는다");
  assert.equal(t.defaultKey, "50");
  const t50 = t.types[0];
  assert.deepEqual(t50.high, { ym: "202608", day: 19, man: 80_000, floor: 3 });
  assert.deepEqual(t50.low, { ym: "202601", day: 20, man: 40_550, floor: 1 });
  assert.deepEqual(t50.latest, { ym: "202608", day: 22, man: 79_500, floor: 15 });
  const t38 = t.types.find((x) => x.key === "38")!;
  assert.equal(t38.high, null, "한 건뿐이면 신고가=신저가 — 표시하지 않는다");
  assert.equal(t38.low, null);
  assert.ok(t.rent);
  assert.equal(t.rent.jeonse.values[t.yms.indexOf("202608")], 30_750);
  assert.equal(t.rent.wolse.values[t.yms.indexOf("202608")], 80);
  assert.equal(t.rent.wolse.deposits[t.yms.indexOf("202608")], 5_000);
  assert.deepEqual(
    t.chips.map((c) => c.enabled),
    [true, false, false, false],
  );
  assert.equal(t.caption, "3년·5년·전체는 2026-01 부터");
  assert.equal(buildTxTrendData([], null, "202609"), null, "매매·전월세 둘 다 없으면 재료 없음(섹션 대신 사실 한 줄)");
  const rentOnly = buildTxTrendData([], [{ month: "202603", jeonseCount: 1, jeonseMedianDepositKrw: 1e8, wolseCount: 0, wolseMedianDepositKrw: null, wolseMedianMonthlyKrw: null }], "202609");
  assert.ok(rentOnly && rentOnly.types.length === 0 && rentOnly.rent, "전월세만 있어도 축·전세 선은 선다");
});

test("[1024] 최근 3개월 중앙값 — 달력 창(toYm 포함)·타입별", () => {
  const r = recentMedian(DEALS, "202609", 3, "50");
  assert.equal(r.fromYm, "202607");
  assert.deepEqual([r.medianMan, r.count], [79_750, 2]);
  assert.equal(recentMedian(DEALS, "202609", 3, "38").medianMan, 55_000);
  assert.equal(recentMedian(DEALS, "202612", 3, "50").medianMan, null, "창 안에 거래가 없으면 null");
});

test("[1024] 최근 실거래 표 — 최신순, 타입별 신고가 배지(한 건뿐인 타입은 없음), 해제 행은 취소선 표식·신고가 제외", () => {
  const rows = recentDealRows(DEALS, 5);
  assert.deepEqual(
    rows.map((r) => [r.ym, r.day, r.man, r.typeM2, r.high]),
    [
      ["202608", 30, 93_000, 60, true],
      ["202608", 29, 55_000, 38, false],
      ["202608", 22, 79_500, 50, false],
      ["202608", 19, 80_000, 50, true],
      ["202607", 1, 90_000, 60, false],
    ],
  );
  assert.ok(rows.every((r) => !r.cancelled), "getComplexDeals 는 해제분을 읽지 않는다 — 기본 false");
  const withCancel = recentDealRows([{ ...d("202609", 1, 99_000, 60.2, 4), cancelled: true }, ...DEALS], 2);
  assert.equal(withCancel[0].cancelled, true);
  assert.equal(withCancel[0].high, false, "해제된 거래는 신고가가 아니다");
  assert.equal(withCancel[1].high, true, "60㎡ 신고가는 해제되지 않은 9억 3,000만 그대로");
});

/* ── 그래프 표식 좌표 ────────────────────────────────────────────────── */

test("[1024] layoutPriceChart marks — 신고가·신저가 값이 y 범위에 들고, 축에 없는 달은 버린다", () => {
  const months = [
    { ym: "202601", avgMan: 60_000, n: 3, nAll: 3 },
    { ym: "202602", avgMan: 62_000, n: 3, nAll: 3 },
    { ym: "202603", avgMan: 64_000, n: 3, nAll: 3 },
  ];
  const box = { width: 400, height: 220, padL: 44, padR: 14, padT: 14, padB: 22, barH: 36 };
  const plain = layoutPriceChart({ months, box })!;
  assert.deepEqual(plain.marks, []);
  const marked = layoutPriceChart({
    months,
    marks: [
      { ym: "202603", kind: "high", valueMan: 80_000 },
      { ym: "202601", kind: "low", valueMan: 40_000 },
      { ym: "202512", kind: "low", valueMan: 10_000 },
    ],
    box,
  })!;
  assert.equal(marked.marks.length, 2, "축에 없는 2025-12 표식은 버린다");
  const hi = marked.marks.find((m) => m.kind === "high")!;
  const lo = marked.marks.find((m) => m.kind === "low")!;
  assert.equal(hi.x, marked.points[2].x);
  assert.equal(lo.x, marked.points[0].x);
  assert.ok(hi.y >= marked.plotTop && hi.y <= marked.lineBottom, "신고가 점이 그림 안");
  assert.ok(lo.y >= marked.plotTop && lo.y <= marked.lineBottom, "신저가 점이 그림 안");
  assert.ok(hi.y < (marked.points[2].y as number), "신고가는 그 달 중앙값보다 위");
  assert.ok(lo.y > (marked.points[0].y as number), "신저가는 그 달 중앙값보다 아래");
});

/* ── 페이지 배선(소스 검사) ──────────────────────────────────────────── */

test("[1024] 단지 상세 — 시안 섹션 순서·흰 머리·번들 규칙(지연 로드)·기존 계약 유지", () => {
  const page = code("app/complex/[id]/page.tsx");
  const order = [
    "<PageHead",
    "<ComplexOverviewStrip",
    'data-ai-summary=""',
    "<TxTrendLazy",
    "<RecentDealsTable",
    "<JeonseGapCards",
    "<MgmtFeeCard",
    "<ComplexNearbyPoi",
    "<ComplexHubTabs",
    "<ComplexNotesNewsAi",
    'id="nearby-complexes"',
    "<ComplexFactsCard",
    "<ComplexRail",
    "<MobileActionBarLazy",
  ];
  let last = -1;
  for (const needle of order) {
    const at = page.indexOf(needle);
    assert.ok(at > last, `${needle} 순서`);
    last = at;
  }
  assert.ok(!page.includes("brand-navy-card") && !page.includes("HubPriceHero") && !page.includes("BrandWatermark"), "네이비 머리를 걷었다");
  assert.ok(!page.includes("<ComplexInfoGrid"), "단지 정보 목록은 개요 스트립으로");
  assert.match(page, /lg:grid-cols-\[minmax\(0,1fr\)_340px\]/, "레일 트랙 minmax(0,1fr)");
  assert.match(page, /grid grid-cols-1 gap-3 lg:grid-cols-\[/, "lg:grid 의 base grid-cols-1");
  assert.match(page, /summaryDeals=\{false\}/, "요약 탭의 실거래 목록은 본문 표가 맡는다(같은 사실 두 곳 금지)");
  assert.match(page, /priceChart=\{null\}/);
  for (const keep of ["getComplexDeals", "getTransactionHistoryWithBands", "getTradeWindowSamples", "loadRentHistory(region, args.name)", "buildComplexCitableSummary(", "webPageJsonLd(", "hubFaqPriceAnswer(", "<MarketFreshnessLine label={freshness}", "AskingCheckToggle", "ComplexAreaBands", "RegionRelative", "ComplexRentSection", "NearbyRedevelopment", "UpcomingSupply", "ComplexReviewsLazy", "export const revalidate = 604_800"]) {
    assert.ok(page.includes(keep), `유지: ${keep}`);
  }
  /* 새 클라이언트 부품은 next/dynamic 으로만 — 라우트 번들 478/480KB */
  const lazy = code("app/complex/[id]/TxTrendLazy.tsx");
  assert.match(lazy, /nextDynamic\(\(\) => import\("\.\/TxTrendSection"\)/);
  assert.doesNotMatch(lazy, /ssr:\s*false/, "그래프는 서버 HTML 에도 있어야 한다");
  assert.ok(!page.includes('from "./TxTrendSection"'), "page 는 본체를 직접 import 하지 않는다");
  /* 채움 파랑: page(폰 하단 CTA, lg:hidden) 1 · ComplexRail(lg) 1 — 파일당 1개 */
  const count = (s: string) => (s.match(/\bbtn-primary\b/g) ?? []).length;
  assert.equal(count(page), 1);
  assert.equal(count(code("app/complex/[id]/ComplexRail.tsx")), 1);
  assert.equal(count(code("app/complex/[id]/TxTrendSection.tsx")), 0);
  assert.equal(count(code("app/complex/[id]/MobileActionBar.tsx")), 0);
});

test("[1024] 단지 상세 부품 — 램프 유틸만(text-[px] 없음) · 흰 카드 안 목록은 data-tone=plain · 관리비 카드는 null 이면 생략 · 그래프 색은 토큰", () => {
  const files = [
    "app/complex/[id]/page.tsx",
    "app/complex/[id]/TxTrendSection.tsx",
    "app/complex/[id]/RecentDealsTable.tsx",
    "app/complex/[id]/JeonseGapCards.tsx",
    "app/complex/[id]/MgmtFeeCard.tsx",
    "app/complex/[id]/ComplexRail.tsx",
    "app/complex/[id]/ComplexOverviewStrip.tsx",
    "app/complex/[id]/ComplexNearbyPoi.tsx",
    "app/components/viz/TxTrendChart.tsx",
  ];
  for (const f of files) {
    const s = code(f);
    assert.doesNotMatch(s, /text-\[\d+(?:\.\d+)?px\]/, `${f}: text-[px]`);
    assert.doesNotMatch(s, /font-extrabold|font-black/, `${f}: 굵기 800`);
    assert.doesNotMatch(s, /rounded(?:-[a-z]{1,2})?-\[\d+px\]/, `${f}: 임의 반경`);
  }
  assert.match(code("app/complex/[id]/ComplexRail.tsx"), /divide-y p-0" data-tone="plain"/);
  assert.match(code("app/complex/[id]/ComplexNearbyPoi.tsx"), /data-tone="plain"/);
  const mgmt = code("app/complex/[id]/MgmtFeeCard.tsx");
  assert.match(mgmt, /getComplexMgmtFeeSummary\(kaptCode\)/);
  assert.match(mgmt, /if \(!s\) return null;/);
  assert.match(mgmt, /if \(!kaptCode\) return null;/);
  const chart = code("app/components/viz/TxTrendChart.tsx");
  assert.doesNotMatch(chart, /#[0-9a-fA-F]{6}\b/, "raw hex 없음");
  assert.match(chart, /layoutPriceChart\(/, "좌표는 price-chart-geometry 를 그대로 쓴다");
  assert.match(chart, /useState\(320\)/, "서버 HTML 에도 그림(첫 폭 320 가정)");
  const section = code("app/complex/[id]/TxTrendSection.tsx");
  assert.match(section, /전 타입\(면적 구분 없음\)/, "전세·월세는 전 타입 값이라고 적는다");
  assert.match(section, /disabled=\{!c\.enabled\}/, "꺼진 기간 칩은 disabled");
  assert.match(section, /sticky top-\[56px\] z-30 .*md:static/, "타입 탭은 폰에서 sticky");
  const css = read("app/globals.css");
  assert.ok(css.includes("/* [1024 · 단지 상세]"), "globals.css append-only 표식");
  assert.ok(css.lastIndexOf("/* [1024 · 단지 상세]") > css.lastIndexOf("/* [1023"), "1023 블록 뒤에 붙었다");
});
