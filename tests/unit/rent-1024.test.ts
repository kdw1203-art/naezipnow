import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  areaBandLabel,
  areaBandShort,
  contractDateLabel,
  isSudogwonRegion,
  parseRentDong,
  parseRentParams,
  parseRentType,
  rentFacts,
  rentHref,
  rentNoindex,
  rentSitemapPaths,
  rentTitle,
  rentTotalRows,
} from "@/lib/rent/params";
import { niceMax, scatterLayout, SCATTER_X_RANGE, SCATTER_Y_RANGE } from "@/lib/rent/scatter";
import type { NonAptRentDeal } from "@/lib/market/rent-nonapt-core";
import { REGION_CATALOG } from "@/lib/region/catalog";

/* [1024 · 원룸·오피스텔] /rent/[region] — 쿼리 해석 · 면적대 라벨 · 빈 상태 규칙 · 사이트맵 항목 · 산점 배치 · 소스 잠금 */

const read = (p: string): string => readFileSync(p, "utf8");
function code(p: string): string {
  return read(p)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
}

/* ── 쿼리 해석 ─────────────────────────────────────────────────────────────── */

test("[1024] parseRentParams — type 은 세 값만, 아니면 officetel · area 는 s/m/l 만 · dong 은 동/읍/면/가/리 토큰만", () => {
  assert.deepEqual(parseRentParams({}), { type: "officetel", dong: null, areaBand: null });
  assert.deepEqual(parseRentParams({ type: "rowhouse", dong: "관양동", area: "s" }), { type: "rowhouse", dong: "관양동", areaBand: "s" });
  assert.deepEqual(parseRentParams({ type: "apartment", area: "xl", dong: "1602" }), { type: "officetel", dong: null, areaBand: null });
  /* 배열은 첫 값 · URLSearchParams 도 같은 결과 */
  assert.equal(parseRentParams({ type: ["house", "rowhouse"] }).type, "house");
  assert.deepEqual(parseRentParams(new URLSearchParams("type=house&dong=종로1가&area=l")), { type: "house", dong: "종로1가", areaBand: "l" });
  assert.equal(parseRentType(undefined), "officetel");
  assert.equal(parseRentDong(" 비산 동 "), "비산동");
  assert.equal(parseRentDong("가".repeat(30)), null, "24자 상한");
  assert.equal(parseRentDong("<script>동"), "<script>동", "형식만 본다 — 렌더는 React 가 이스케이프");
});

test("[1024] rentHref — 기본값(오피스텔·전체 동·전체 면적)은 쿼리에 적지 않는다(같은 화면 = 한 주소)", () => {
  assert.equal(rentHref("anyang-dongan", { type: "officetel", dong: null, areaBand: null }), "/rent/anyang-dongan");
  assert.equal(rentHref("anyang-dongan", { type: "house", dong: "관양동", areaBand: "m" }), "/rent/anyang-dongan?type=house&dong=%EA%B4%80%EC%96%91%EB%8F%99&area=m");
});

/* ── 면적대 라벨 ────────────────────────────────────────────────────────────── */

test("[1024] 면적대 라벨 — ~30㎡ 원룸형 · 30~60㎡ 투룸형 · 60㎡~ · null 은 전체", () => {
  assert.equal(areaBandLabel("s"), "~30㎡ 원룸형");
  assert.equal(areaBandLabel("m"), "30~60㎡ 투룸형");
  assert.equal(areaBandLabel("l"), "60㎡~");
  assert.equal(areaBandLabel(null), "전체 면적");
  assert.equal(areaBandShort("s"), "~30㎡");
  assert.equal(areaBandShort("m"), "30~60㎡");
  assert.equal(areaBandShort("l"), "60㎡~");
  assert.equal(areaBandShort(null), "전체 면적");
});

test("[1024] 제목·계약일 — 동이 있으면 동, 없으면 시군구 · 일자 없는 계약은 월까지", () => {
  assert.equal(rentTitle("안양시 동안구", null), "안양시 동안구 원룸·오피스텔 실거래 월세");
  assert.equal(rentTitle("안양시 동안구", "관양동"), "관양동 원룸·오피스텔 실거래 월세");
  assert.equal(contractDateLabel("202609", 4), "2026.09.04");
  assert.equal(contractDateLabel("202609", null), "2026.09");
});

/* ── 빈 상태 규칙 ───────────────────────────────────────────────────────────── */

test("[1024] 빈 상태 — 행 0 이면 사실 문장 3개(신고된 실거래 · 매물 아님 / 수집 전 / 아파트 전월세는 단지 화면) · noindex", () => {
  const zero = { officetel: 0, rowhouse: 0, house: 0 };
  assert.deepEqual(rentFacts("안양시 동안구", rentTotalRows(zero), 0), [
    "신고된 실거래 · 매물 아님",
    "안양시 동안구 오피스텔·연립·단독 전월세 수집 전",
    "아파트 전월세는 단지 화면",
  ]);
  assert.equal(rentNoindex(zero), true);
  assert.equal(rentNoindex(null), true, "건수 조회 실패도 색인하지 않는다");
  const some = { officetel: 12, rowhouse: 0, house: 0 };
  assert.equal(rentNoindex(some), false);
  assert.equal(rentTotalRows(some), 12);
  assert.deepEqual(rentFacts("안양시 동안구", 12, 7, "오피스텔"), [
    "신고된 실거래 · 매물 아님",
    "오피스텔 최근 3개월 7건",
    "아파트 전월세는 단지 화면",
  ]);
});

/* ── 사이트맵 ───────────────────────────────────────────────────────────────── */

test("[1024] 사이트맵 — 행 있는 지역만 /rent/[id], 하나라도 있으면 /rent 도 · 전부 0 이면 항목 없음", () => {
  assert.deepEqual(rentSitemapPaths([]), []);
  assert.deepEqual(
    rentSitemapPaths([
      { id: "gangnam", total: 0 },
      { id: "anyang-dongan", total: 0 },
    ]),
    [],
  );
  assert.deepEqual(
    rentSitemapPaths([
      { id: "gangnam", total: 3 },
      { id: "anyang-dongan", total: 0 },
      { id: "incheon-yeonsu", total: 1 },
    ]),
    ["/rent", "/rent/gangnam", "/rent/incheon-yeonsu"],
  );
  const src = code("lib/seo/build-sitemap.ts");
  assert.ok(src.includes("rentSitemapPaths("), "지역 사이트맵 로더가 /rent 항목을 붙인다");
  assert.ok(src.includes("getSudogwonRentCounts"), "건수는 lib/rent/region-counts 한 곳");
});

test("[1024] 수도권 판정 — 서울(city 비움)·경기·인천만, 폐지 지역 제외 · 카탈로그에 실제로 셋 다 있다", () => {
  assert.equal(isSudogwonRegion({}), true);
  assert.equal(isSudogwonRegion({ city: "경기" }), true);
  assert.equal(isSudogwonRegion({ city: "인천" }), true);
  assert.equal(isSudogwonRegion({ city: "부산" }), false);
  assert.equal(isSudogwonRegion({ city: "경기", retired: "2026-07-01" }), false);
  const cities = new Set(REGION_CATALOG.filter(isSudogwonRegion).map((r) => (r.city ?? "").trim() || "서울"));
  assert.deepEqual([...cities].sort(), ["경기", "서울", "인천"]);
});

/* ── 산점 배치(순수) ────────────────────────────────────────────────────────── */

function deal(depositKrw: number, monthlyKrw: number): NonAptRentDeal {
  return { ym: "202609", day: 1, type: "officetel", dong: "관양동", areaM2: 25, floor: 3, depositKrw, monthlyKrw, buildingName: null, buildYear: null };
}

test("[1024] scatterLayout — 퍼센트 좌표가 구간 안 · 전세(월세 0)는 점에서 뺀다 · 축 상한은 고운 눈금", () => {
  assert.equal(niceMax(45_000_000), 50_000_000);
  assert.equal(niceMax(120_000_000), 200_000_000);
  assert.equal(niceMax(0), 1);
  const L = scatterLayout([deal(10_000_000, 500_000), deal(50_000_000, 1_000_000), deal(300_000_000, 0)]);
  assert.equal(L.points.length, 2, "전세 1건 제외");
  assert.equal(L.xMax, 50_000_000);
  assert.equal(L.yMax, 1_000_000);
  for (const p of L.points) {
    assert.ok(p.xPct >= SCATTER_X_RANGE[0] && p.xPct <= SCATTER_X_RANGE[1]);
    assert.ok(p.yPct >= SCATTER_Y_RANGE[0] && p.yPct <= SCATTER_Y_RANGE[1]);
  }
  /* 최댓값 점은 오른쪽 위 모서리 */
  assert.equal(L.points[1].xPct, SCATTER_X_RANGE[1]);
  assert.equal(L.points[1].yPct, SCATTER_Y_RANGE[0]);
  assert.equal(L.yTicks.length, 3);
  assert.equal(L.xTicks.length, 2);
  assert.deepEqual(scatterLayout([]).points, []);
  assert.equal(scatterLayout(Array.from({ length: 900 }, () => deal(1, 1))).points.length, 400, "점 상한 400");
});

/* ── 소스 잠금 ─────────────────────────────────────────────────────────────── */

test("[1024] /rent/[region] — revalidate 21600 · searchParams 는 서버 첫 렌더 · 필터는 replaceState + refresh · noindex 는 0행일 때만", () => {
  const page = code("app/rent/[region]/page.tsx");
  assert.match(read("app/rent/[region]/page.tsx"), /^\/\* \[1024/m, "[1024] 표식");
  assert.match(page, /export const revalidate = 21_600;/);
  assert.match(code("lib/rent/region-counts.ts"), /RENT_CACHE_SECONDS = 21_600/);
  assert.ok(page.includes("parseRentParams(sp)"), "서버가 쿼리를 읽어 첫 렌더");
  assert.ok(page.includes("rentNoindex(counts) ? { robots: { index: false, follow: true } } : {}"), "noindex 는 0행일 때만");
  assert.ok(page.includes('seoAlternates(`/rent/${id}`)'), "canonical 은 쿼리 없는 지역 주소");
  assert.ok(page.includes("notFound()"), "모르는 id 는 404");
  assert.equal((page.match(/btn-primary/g) ?? []).length, 0, "채움 파랑 0 (시안과 같다)");
  assert.ok(page.includes('data-tone="plain"'), "흰 카드 안 목록은 plain");
  assert.ok(page.includes("lg:grid-cols-[minmax(0,1fr)_340px]"), "레일 그리드는 minmax(0,1fr) + base grid-cols-1");
  assert.ok(page.includes("grid grid-cols-1"), "base grid-cols-1");
  assert.ok(!/text-\[\d+px\]/.test(page), "임의 px 글자 없음(램프 유틸만)");
  assert.ok(!/<Icon name="(?!building|map)/.test(page), "아이콘은 ICON_PATHS 의 building·map 만");

  const filters = code("app/rent/[region]/RentFilters.tsx");
  assert.ok(/^\s*"use client";/.test(read("app/rent/[region]/RentFilters.tsx")));
  assert.ok(filters.includes("window.history.replaceState("), "주소는 replaceState");
  assert.ok(filters.includes("router.refresh()"), "서버 렌더만 다시");
  assert.ok(!filters.includes("router.push(") && !filters.includes("router.replace("), "히스토리를 쌓지 않는다");
  assert.ok(filters.includes("min-h-10"), "탭·칩 40px");

  const scatter = code("app/rent/[region]/RentScatter.tsx");
  assert.ok(!/"use client"/.test(read("app/rent/[region]/RentScatter.tsx")), "산점은 서버 SVG");
  assert.ok(scatter.includes("<svg") && scatter.includes("<circle"), "인라인 SVG");
});

test("[1024] 동네 홈 머리 — 원룸·오피스텔 실거래 월세 링크 1줄(수도권만) · 추가 조회 없음", () => {
  const c = code("app/town/[region]/page.tsx");
  assert.ok(c.includes("원룸·오피스텔 실거래 월세 ›"), "링크 문구");
  assert.match(c, /isSudogwonRegion\(region\) &&/, "수도권만");
  assert.match(c, /href=\{`\/rent\/\$\{id\}`\}/);
  assert.ok(!c.includes("getNonAptRentSnapshot") && !c.includes("countNonAptRent"), "동네 홈은 조회를 늘리지 않는다");
});

test("[1024] /rent 목록 — 수도권만 · ISR · 카탈로그 재사용 · 건수는 있을 때만", () => {
  const c = code("app/rent/page.tsx");
  assert.match(c, /export const revalidate = 21_600;/);
  assert.ok(!c.includes("searchParams"), "목록은 쿼리를 읽지 않는다(ISR)");
  assert.ok(c.includes("REGION_CATALOG.filter(isSudogwonRegion)"));
  assert.ok(c.includes("groupRegionsByCity("), "기존 시·도 묶음 재사용");
  assert.ok(c.includes("n > 0 &&"), "0 은 적지 않는다");
});
