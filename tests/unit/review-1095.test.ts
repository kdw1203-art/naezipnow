/* [1095] 소유자 2026-10-26 "기능, 디자인, 구성 등의 업그레이드를 진행해줘".
 *  구성 — 단지 화면 개요 스트립: K-apt 대장에 안 맞는 단지(매매 실거래 단지 34,314곳 중 세대수 없는 15,918곳 · 46%)는 8칸 중 7칸이 "—" 였다.
 *  아는 값이 2개 이하면 아는 것만 한 줄, 0개면 없음, 3개 이상이면 8칸 그대로.
 *  기능 — 비교 조합(/complex/compare · 1,119쌍)은 "비교 담기" 트레이와 사이트맵에서만 닿았다 → 동 화면 "단지 비교"(같은 동 조합 6쌍) ·
 *  단지 화면 "인근 단지" 아래 "○○ 비교" 칩(폰 블록 · 데스크톱 레일 · 최대 4). 조합 목록은 7일 데이터 캐시 한 벌(화면 수명과 같은 눈금).
 *  문구 — 홈 "실시간 집계를 불러오지 못해 마지막 월 집계를 표시해요." → 사실 낱말. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { OVERVIEW_EMPTY, overviewStripCells } from "../../app/complex/[id]/complex-v2-model";

const read = (p: string) => readFileSync(p, "utf8");
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/(^|[^:"'`])\/\/[^\n]*/g, "$1");

test("개요 스트립 — 아는 값 2개 이하면 한 줄(— 없음) · 0개면 없음 · 3개 이상이면 8칸 격자 그대로", () => {
  const src = strip(read("app/complex/[id]/ComplexOverviewStrip.tsx"));
  assert.match(src, /export const OVERVIEW_COMPACT_MAX = 2;/);
  assert.match(src, /const known = cells\.filter\(\(c\) => c\.value !== OVERVIEW_EMPTY\);\s*if \(known\.length === 0\) return null;\s*if \(known\.length <= OVERVIEW_COMPACT_MAX\) \{/);
  /* 한 줄 판 — 아는 칸만 · 연차 곁말 그대로 · 사실 낱말 */
  assert.match(src, /\{known\.map\(\(c\) => \(/);
  assert.match(src, /<dl className="card rise-in-1 mt-3 flex flex-wrap items-baseline gap-x-5 gap-y-1 rounded-2xl px-4 py-2\.5" aria-label="단지 개요">/);
  /* 격자 판은 그대로(cx-strip · 8칸) */
  assert.match(src, /<dl className="cx-strip card rise-in-1 mt-3 grid grid-cols-4 rounded-2xl md:grid-cols-8" aria-label="단지 개요">/);
  assert.doesNotMatch(src, /text-\[\d+(?:\.\d+)?px\]|font-extrabold|font-black/);
  /* 셀 계산은 그대로 — 준공만 아는 단지는 8칸 중 1칸 */
  const cells = overviewStripCells({ households: null, building_count: null, build_year: 2021, parking_per_hh: null, heating: null, builder_name: null }, { nowYear: 2026 });
  assert.equal(cells.length, 8);
  assert.equal(cells.filter((c) => c.value !== OVERVIEW_EMPTY).length, 1);
  assert.equal(cells.find((c) => c.key === "buildYear")?.note, "6년차");
});

test("비교 조합 — 7일 데이터 캐시 한 벌(날짜 필드 없이) · 동 화면은 같은 동 조합 · 단지 화면은 이 단지가 낀 조합 · 실패는 빈 배열", () => {
  const src = strip(read("lib/dong/landing.ts"));
  assert.match(src, /const loadAllPairsCached = unstable_cache\(\s*async \(\): Promise<PairSlim\[\]> =>\s*\(await listComplexPairs\(\)\)\.map\(\(p\) => \(\{ region: p\.regionName, dong: p\.dong, a: p\.complexA, b: p\.complexB, href: complexPairPath\(p\), pairTradeCount: p\.pairTradeCount \}\)\),\s*\["complex-pairs-all-v1"\],\s*\{ revalidate: 604_800 \},\s*\);/);
  assert.match(src, /export async function loadDongPairs\(region: string, dong: string, max = 6\)/);
  assert.match(src, /\.filter\(\(p\) => p\.region === region && p\.dong === dong\)/);
  assert.match(src, /export async function loadComplexPairLinks\(region: string, name: string, max = 4\)/);
  assert.match(src, /\.filter\(\(p\) => p\.region === region && \(p\.a === name \|\| p\.b === name\)\)/);
  assert.match(src, /other: p\.a === name \? p\.b : p\.a/);
  assert.equal((src.match(/loadAllPairsCached\(\)\.catch\(/g) ?? []).length, 2, "실패는 둘 다 빈 배열(캐시에 남기지 않는다)");
  assert.doesNotMatch(src, /tags:/, "일정 비움 태그 없음(check-isr-ttl)");
});

test("동 화면 '단지 비교' · 단지 화면 '○○ 비교' 칩(폰 블록 + 데스크톱 레일 같은 조각)", () => {
  const dong = strip(read("app/dong/[region]/[dong]/page.tsx"));
  assert.match(dong, /loadDongPairs\(region, dong\),/);
  assert.match(dong, /\{pairs\.length > 0 && \(\s*<section className="rise-in-2 card mb-4 p-\[var\(--pad-card\)\] max-md:mb-3">\s*<h2 className="t-section text-ink">단지 비교<\/h2>/);
  assert.match(dong, /같은 동 두 단지 나란히 · 최근 12개월 매매 신고 합 순 · \{n\(pairs\.length\)\}쌍/);
  assert.match(dong, /className="tile inline-flex min-h-10 items-center gap-1\.5 rounded-full border border-border px-3 py-1\.5 t-sub font-bold text-ink no-underline md:min-h-8"/);
  const page = strip(read("app/complex/[id]/page.tsx"));
  assert.match(page, /return dec \? loadComplexPairLinks\(dec\.region, dec\.name\) : Promise\.resolve\(\[\]\);/);
  assert.match(page, /\{pairLinks\.length > 0 && \(\s*<section className="cv-auto rise-in-5 mt-4 max-md:mt-3 lg:hidden" aria-label="단지 비교">\s*<ComplexPairChips pairs=\{pairLinks\} \/>/, "인근 단지와 독립(인근 단지가 비어도 선다)");
  assert.match(page, /pairs=\{pairLinks\}/);
  const chips = strip(read("app/complex/[id]/ComplexPairChips.tsx"));
  assert.doesNotMatch(chips, /"use client"/, "서버 조각");
  assert.match(chips, /<span>\{p\.other\} 비교<\/span>/);
  assert.match(chips, /min-h-10 [^"]*md:min-h-8/);
  const rail = strip(read("app/complex/[id]/ComplexRail.tsx"));
  assert.match(rail, /\{pairs\.length > 0 && \(\s*<section className="card rise-in-2 rounded-2xl px-4 py-3\.5" aria-label="단지 비교">\s*<ComplexPairChips pairs=\{pairs\} \/>/);
});

test("홈 — 지역 동향 상태 줄은 사실 낱말", () => {
  const home = strip(read("app/page.tsx"));
  assert.match(home, /실시간 집계 불러오기 실패 · 마지막 월 집계 표시/);
  assert.doesNotMatch(home, /불러오지 못해 마지막 월 집계를 표시해요/);
});
