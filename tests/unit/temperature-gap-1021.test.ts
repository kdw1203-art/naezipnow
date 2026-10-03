/**
 * [1021 · 지역 시세 temperature·gap] 지역별 시장 온도(/analysis/temperature) · 전세가율·갭 스크리너(/analysis/gap) — 시안(mock8) 구조 잠금.
 *
 * ① 온도 타일 지도의 표시 규칙 — app/analysis/temperature/temp-map-model.ts(색 구간·주 묶기·통계·권역·내 관심 지역)
 * ② 갭 스크리너의 조건·정렬·예산 — app/analysis/gap/screener-model.ts(URL 왕복·필터·정렬·예산)
 * ③ 소스 구조 — 서버는 searchParams 를 읽지 않는다 · 조건은 replaceState 로만 · 타일 격자 열 수 · 레일 클래스 · 히어로(ToolHero) 없음 ·
 *    캐시 정책(revalidate 86_400) 유지 · 온도 공식 설명은 TEMPERATURE_EXPLAIN 만(가중치 숫자를 화면에 새로 적지 않는다).
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  TEMP_BANDS,
  WEEK_CHIPS,
  filterBySido,
  matchWatchRegion,
  pairWeeks,
  sidoOfTemperatureLabel,
  sidoOptions,
  tempBand,
  weekStats,
} from "@/app/analysis/temperature/temp-map-model";
import {
  EMPTY_FILTER,
  applyFilter,
  budgetSummary,
  effectiveGap,
  parseBudget,
  parseFilter,
  parseSort,
  serializeFilter,
  sidoOptions as gapSidoOptions,
  sortRows,
} from "@/app/analysis/gap/screener-model";
import type { TemperatureSnapshot } from "@/lib/market/temperature-archive";
import type { Row } from "@/app/analysis/gap/RankTable";

/* ── ① 온도 ─────────────────────────────────────────────────────────── */
function snap(regionId: string, regionLabel: string, weekStart: string, score: number): TemperatureSnapshot {
  return {
    regionId,
    regionLabel,
    weekStart,
    score,
    headline: "h",
    periodType: "monthly",
    momentumPct: null,
    priorPct: null,
    volumeRecentCount: null,
    volumePriorCount: null,
    volumeDeltaPct: null,
    indexLatest: null,
    formulaVersion: 1,
    observedAt: null,
  };
}

test("색 구간 — 80+ · 65~79 · 55~64 · 45~54 · ~44 다섯 칸, 경계값은 위 칸", () => {
  assert.deepEqual(TEMP_BANDS.map((b) => b.label), ["80+", "65~79", "55~64", "45~54", "~44"]);
  assert.equal(tempBand(95), "hot");
  assert.equal(tempBand(80), "hot");
  assert.equal(tempBand(79), "warm");
  assert.equal(tempBand(65), "warm");
  assert.equal(tempBand(64), "mild");
  assert.equal(tempBand(55), "mild");
  assert.equal(tempBand(54), "neutral");
  assert.equal(tempBand(45), "neutral");
  assert.equal(tempBand(44), "cool");
  assert.equal(tempBand(0), "cool");
});

test("주 묶기 — 그 주 행마다 직전 주를 붙이고(없으면 null) 점수 높은 순 → 이름 가나다", () => {
  const cur = [snap("a", "경기 군포시", "2026-09-14", 82), snap("b", "서울 강남구", "2026-09-14", 37), snap("c", "경기 남양주시", "2026-09-14", 82)];
  const prev = [snap("a", "경기 군포시", "2026-09-07", 79), snap("b", "서울 강남구", "2026-09-07", 40)];
  const rows = pairWeeks(cur, prev);
  assert.deepEqual(rows.map((r) => r.current.regionId), ["a", "c", "b"], "82 둘은 가나다(군포 < 남양주), 37 은 마지막");
  assert.equal(rows[0].previous?.score, 79);
  assert.equal(rows[1].previous, null, "직전 주 기록이 없으면 null — 0으로 채우지 않는다");
  const st = weekStats(rows);
  assert.equal(st.count, 3);
  assert.equal(st.avg, 67, "(82+82+37)/3 = 67.0");
  assert.equal(st.hottest?.current.regionId, "a");
  assert.equal(st.coldest?.current.regionId, "b");
  assert.deepEqual([st.rising, st.falling, st.compared], [1, 1, 2]);
  assert.equal(weekStats([]).avg, null);
  assert.equal(weekStats([]).hottest, null);
});

test("권역 — label 의 첫 토큰(계산 아님) · 지역 수 많은 순 · 필터", () => {
  assert.equal(sidoOfTemperatureLabel("서울 강남구"), "서울");
  assert.equal(sidoOfTemperatureLabel("경기 화성시 병점구"), "경기");
  const rows = pairWeeks(
    [snap("a", "경기 군포시", "w", 82), snap("b", "서울 강남구", "w", 37), snap("c", "경기 남양주시", "w", 77), snap("d", "인천 연수구", "w", 56)],
    [],
  );
  assert.deepEqual(sidoOptions(rows), ["경기", "서울", "인천"]);
  assert.deepEqual(filterBySido(rows, "경기").map((r) => r.current.regionId), ["a", "c"]);
  assert.equal(filterBySido(rows, null).length, 4);
  assert.deepEqual(filterBySido(rows, "부산"), []);
});

test("내 관심 지역 — city+district 정확 일치 → district 끝 토큰 순으로, 못 찾으면 null", () => {
  const rows = pairWeeks([snap("a", "경기 남양주시", "w", 77), snap("b", "서울 강남구", "w", 37), snap("c", "경기 성남시 분당구", "w", 56)], []);
  assert.equal(matchWatchRegion([{ city: "서울", district: "강남구" }], rows)?.current.regionId, "b");
  assert.equal(matchWatchRegion([{ city: "경기", district: "분당구" }], rows)?.current.regionId, "c", "label 끝 토큰");
  assert.equal(matchWatchRegion([{ city: "부산", district: "해운대구" }, { city: "경기", district: "남양주시" }], rows)?.current.regionId, "a", "첫 번째로 맞는 것");
  assert.equal(matchWatchRegion([{ city: "부산", district: "해운대구" }], rows), null);
  assert.equal(matchWatchRegion([], rows), null);
  assert.deepEqual(WEEK_CHIPS.map((c) => c.offset), [0, -1, -4]);
});

/* ── ② 갭 ───────────────────────────────────────────────────────────── */
function row(p: Partial<Row> & { regionId: string; name: string; ratio: number; group: string }): Row {
  return { period: "202608", source: "reb", ...p };
}
const ROWS: Row[] = [
  row({ regionId: "g-buk", name: "광주 북구", ratio: 81.4, avgSale: 220_000_000, gap: 40_920_000, measuredGap: 19_260_000, rentYield: 3.0, saleChange: 0.15, group: "광주" }),
  row({ regionId: "u-dong", name: "울산 동구", ratio: 79.2, avgSale: 220_000_000, gap: 45_760_000, rentYield: 2.9, saleChange: -0.47, group: "울산" }),
  row({ regionId: "d-buk", name: "대구 북구", ratio: 78.1, avgSale: 240_000_000, gap: 52_560_000, measuredGap: 17_030_000, saleChange: 0, group: "대구" }),
  row({ regionId: "yongsan", name: "용산구", ratio: 42.3, avgSale: 1_600_000_000, gap: 923_200_000, group: "서울" }),
  row({ regionId: "no-sale", name: "매매가 없음", ratio: 70, group: "서울" }),
];

test("갭 — 실측 우선 · 없으면 추정 · 둘 다 없으면 null(0 아님)", () => {
  assert.equal(effectiveGap(ROWS[0]), 19_260_000);
  assert.equal(effectiveGap(ROWS[1]), 45_760_000);
  assert.equal(effectiveGap(ROWS[4]), null);
});

test("URL 왕복 — ?ratio=70&gap=5000&sido=경기&yield=2&sort=gap&budget=5000 · 모르는 값은 무시 · 조건 없음은 빈 문자열", () => {
  const f = parseFilter("?ratio=70&gap=5000&sido=경기&yield=2&sort=gap&budget=5000");
  assert.deepEqual(f, { minRatio: 70, maxGapMan: 5000, sido: "경기", minYield: 2 });
  assert.equal(parseSort("?sort=gap"), "gap");
  assert.equal(parseSort("?sort=zzz"), "ratio");
  assert.equal(parseBudget("?budget=5000"), 5000);
  assert.equal(parseBudget("?budget=-1"), null);
  assert.equal(serializeFilter(f, { sort: "gap", budgetMan: 5000 }), "?ratio=70&gap=5000&sido=%EA%B2%BD%EA%B8%B0&yield=2&sort=gap&budget=5000");
  assert.equal(serializeFilter(EMPTY_FILTER), "");
  assert.equal(serializeFilter(EMPTY_FILTER, { sort: "ratio", budgetMan: null }), "", "기본 정렬·예산 없음은 주소에 남기지 않는다");
  assert.deepEqual(parseFilter("?ratio=abc&gap="), EMPTY_FILTER);
});

test("필터 — 전세가율 이상 · 갭 이하(만원, 갭 없는 행은 빠진다) · 시/도 · 월세 환산 이상(값 없는 행은 빠진다)", () => {
  assert.equal(applyFilter(ROWS, EMPTY_FILTER).length, 5);
  assert.deepEqual(applyFilter(ROWS, { ...EMPTY_FILTER, minRatio: 78 }).map((r) => r.regionId), ["g-buk", "u-dong", "d-buk"]);
  assert.deepEqual(applyFilter(ROWS, { ...EMPTY_FILTER, maxGapMan: 2000 }).map((r) => r.regionId), ["g-buk", "d-buk"], "실측 갭으로 거른다");
  assert.deepEqual(applyFilter(ROWS, { ...EMPTY_FILTER, sido: "서울" }).map((r) => r.regionId), ["yongsan", "no-sale"]);
  assert.deepEqual(applyFilter(ROWS, { ...EMPTY_FILTER, minYield: 3 }).map((r) => r.regionId), ["g-buk"]);
  assert.deepEqual(gapSidoOptions(ROWS), ["서울", "광주", "대구", "울산"]);
});

test("정렬 — 전세가율 높은 순 · 갭 작은 순(없는 행 뒤) · 지수 오른 순(없는 행 뒤)", () => {
  assert.deepEqual(sortRows(ROWS, "ratio").map((r) => r.regionId), ["g-buk", "u-dong", "d-buk", "no-sale", "yongsan"]);
  assert.deepEqual(sortRows(ROWS, "gap").map((r) => r.regionId), ["d-buk", "g-buk", "u-dong", "yongsan", "no-sale"]);
  assert.deepEqual(sortRows(ROWS, "index").map((r) => r.regionId), ["g-buk", "d-buk", "u-dong", "no-sale", "yongsan"]);
});

test("내 예산으로 — 갭 ≤ 예산인 곳 수 · 그 평균 매매가 · 예산 없으면 null", () => {
  assert.equal(budgetSummary(ROWS, null), null);
  assert.equal(budgetSummary(ROWS, 0), null);
  const s = budgetSummary(ROWS, 5000)!;
  assert.equal(s.count, 3, "1,926만 · 4,576만 · 1,703만");
  assert.equal(s.avgSale, Math.round((220_000_000 + 220_000_000 + 240_000_000) / 3));
  assert.deepEqual(budgetSummary(ROWS, 1000), { count: 0, avgSale: null });
});

/* ── ③ 소스 구조 ─────────────────────────────────────────────────────── */
const read = (p: string) => readFile(new URL(`../../${p}`, import.meta.url), "utf8");

test("온도 허브 — ToolHero/게이지 없음 · 주 선택은 클라이언트 · 타일 격자 4/6/9열 · 레일 클래스 · 목록 보기 토글 · 캐시 정책 그대로", async () => {
  const page = await read("app/analysis/temperature/page.tsx");
  const client = await read("app/analysis/temperature/TempMapClient.tsx");
  assert.ok(page.includes("[1021"), "표식");
  assert.ok(!page.includes("<ToolHero") && !page.includes("<Gauge"), "네이비/게이지 히어로 없음");
  assert.ok(page.includes("export const revalidate = 86_400"), "캐시 정책 유지");
  assert.ok(!page.includes("searchParams"), "주 선택은 쿼리가 아니라 클라이언트 상태");
  assert.ok(page.includes("listTemperaturesForWeek") && page.includes("listRegionTemperatureHistory"), "지난주·4주 전·12주 선은 아카이브에서");
  assert.ok(page.includes("weekSlots(history)"), "12주 선은 week-slots 로(빠진 주는 null)");
  /* [1022] 타일 지도는 고정 4/6/9열 격자 → 우리나라 지도 모양(전국 시/도 6열 · 시/도 안 lat/lng 8열/폰 5열, tests/unit/temperature-1022.test.ts) */
  assert.ok(client.includes("tm-grid") && !client.includes("lg:grid-cols-9"), "타일 지도는 지도 모양 격자(고정 열 격자 아님)");
  assert.ok(client.includes("hidden lg:flex lg:flex-col lg:gap-3 lg:sticky lg:top-[76px] lg:self-start"), "레일 클래스");
  /* [1026] 레일 300 → 340(1025 표준 "본문 | 레일 340" — tests/unit/market-1026.test.ts) */
  assert.ok(client.includes("grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_340px]"), "본문 그리드(base grid-cols-1)");
  assert.ok(client.includes("TempRegionCard"), "예전 목록은 목록 보기 토글로 남긴다");
  assert.ok(client.includes('data-tone="plain"'), "흰 카드 안 목록은 plain");
  assert.ok(!/60\s*%|40\s*%|가중/.test(client), "온도 공식 가중치를 화면에 새로 적지 않는다 — 설명은 TEMPERATURE_EXPLAIN ⓘ");
  assert.ok(client.includes("TEMPERATURE_EXPLAIN"));
  assert.ok(!client.includes("btn-primary"), "채움 파랑 없음");
  const css = await read("app/globals.css");
  assert.ok(css.includes("/* [1021 · 지역 시세 temperature·gap]"), "CSS 블록");
  for (const band of ["hot", "warm", "mild", "neutral", "cool"]) assert.ok(css.includes(`.tmp-tile[data-band="${band}"]`), band);
  assert.ok(!/\.tmp-tile[^}]*#[0-9a-fA-F]{3,6}/.test(css.slice(css.indexOf("[1021 · 지역 시세 temperature·gap]"))), "타일 색은 토큰만(hex 없음)");
});

test("갭 스크리너 — 서버는 searchParams 를 안 읽고 전체 목록을 내린다 · 조건은 replaceState · 280px 그리드 · 시/도는 기존 함수 · FAQ·출처 유지", async () => {
  const page = await read("app/analysis/gap/page.tsx");
  const client = await read("app/analysis/gap/GapScreener.tsx");
  const table = await read("app/analysis/gap/RankTable.tsx");
  assert.ok(page.includes("[1021"));
  assert.ok(!/searchParams\s*[:}]|await\s+searchParams|props\.searchParams/.test(page), "ISR 캐시 정책 — 서버는 쿼리를 읽지 않는다");
  assert.ok(page.includes("export const revalidate = 86_400"));
  assert.ok(!page.includes("<ToolHero") && !page.includes("<RankBars"), "히어로·상하위 막대 없음");
  assert.ok(page.includes("sidoOfRegionName"), "시/도는 lib/market/sido-group");
  assert.ok(page.includes("faqJsonLd(faq)") && page.includes("출처 한국부동산원(REB) 공표 지역 통계"), "FAQ JSON-LD · 출처 줄 유지");
  assert.ok(client.includes('"use client"'));
  assert.ok(client.includes("window.history.replaceState"), "조건은 주소에(replaceState)");
  assert.ok(!client.includes("useSearchParams") && !client.includes("router.push"), "라우터 이동 없음(서버 재렌더 없음)");
  /* [1026] 왼쪽 조건 패널 280 → 본문 | 오른쪽 레일 340(조건 · 내 예산 · 다음 행동 — 1025 표준 "레일 = 손잡이 + 액션") */
  assert.ok(client.includes("lg:grid-cols-[minmax(0,1fr)_340px]"), "본문 | 레일 340(조건 패널)");
  assert.ok(client.includes("grid grid-cols-1"), "base grid-cols-1");
  assert.ok(!client.includes("btn-primary"), "채움 파랑 없음(결과는 즉시 반영이라 '보기' 버튼이 필요 없다)");
  assert.ok(client.includes("aria-expanded"), "폰 조건 패널 접이식");
  assert.ok(table.includes("단지 보기") && table.includes("/region/${r.regionId}"), "행마다 단지 보기(기존 링크)");
  assert.ok(table.includes("overflow-x-auto"), "표는 가로 스크롤");
  assert.ok(table.includes('data-tone="plain"'));
});
