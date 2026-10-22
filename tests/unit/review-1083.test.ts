/* [1083] 소유자 2026-10-21 — "대규모 개선". 1단계: 법정동(동) 실거래 페이지 /dong/<지역>/<동>.
 *  원천은 이미 있는 집계(search_complex_mv · search_area_mv · market_transactions) · 얇은 페이지 금지 문턱(색인 3곳·30건 · 사이트맵 50건) ·
 *  지역 상세·실거래 구간·단지 상세에서 잇고 사이트맵 dongs 섹션 + 허브 /dong. */
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import {
  DONG_INDEX_MIN_COMPLEXES,
  DONG_INDEX_MIN_RECENT,
  DONG_SITEMAP_MIN_RECENT,
  aggregateBands,
  aggregateMonths,
  buildDongFaq,
  dongCitation,
  dongDescription,
  dongFromParam,
  dongInSitemap,
  dongIndexable,
  dongPath,
  dongTitle,
  regionFromSlug,
  regionSlugOf,
  ymDot,
  ymKo,
} from "@/lib/dong/format";
import { SITEMAP_SECTION_SLUGS } from "@/lib/seo/sitemap-slugs";

const read = (p: string) => readFileSync(p, "utf8");
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/[^\n]*/g, "$1");

test("주소 — 지역 슬러그(공백↔하이픈 · /tx 와 같은 규칙) · 동 파라미터 꼴 · 임의 문자열 거부", () => {
  assert.equal(regionSlugOf("서울 송파구"), "서울-송파구");
  assert.equal(regionFromSlug("서울-송파구"), "서울 송파구");
  assert.equal(regionFromSlug(encodeURIComponent("고양-덕양구")), "고양 덕양구");
  assert.equal(regionFromSlug("원주시"), "원주시");
  assert.equal(regionFromSlug("../etc"), null);
  assert.equal(regionFromSlug("a"), null);
  assert.equal(dongFromParam("잠실동"), "잠실동");
  assert.equal(dongFromParam(encodeURIComponent("을지로3가")), "을지로3가");
  assert.equal(dongFromParam("정자동"), "정자동");
  assert.equal(dongFromParam("jamsil"), null);
  assert.equal(dongFromParam("잠실"), null, "읍·면·동·가·리로 끝나야");
  assert.equal(dongPath("서울 송파구", "잠실동"), `/dong/${encodeURIComponent("서울-송파구")}/${encodeURIComponent("잠실동")}`);
});

test("문턱 — 색인(3곳·30건) < 사이트맵(50건) · 사이트맵 ⊂ 색인", () => {
  assert.equal(DONG_INDEX_MIN_COMPLEXES, 3);
  assert.equal(DONG_INDEX_MIN_RECENT, 30);
  assert.equal(DONG_SITEMAP_MIN_RECENT, 50);
  assert.equal(dongIndexable(3, 30), true);
  assert.equal(dongIndexable(2, 500), false);
  assert.equal(dongIndexable(10, 29), false);
  assert.equal(dongInSitemap(3, 49), false);
  assert.equal(dongInSitemap(3, 50), true);
  for (const [c, r] of [[3, 50], [5, 100], [2, 100], [3, 40]] as const) {
    if (dongInSitemap(c, r)) assert.ok(dongIndexable(c, r), `${c}/${r}`);
  }
});

const months = aggregateMonths(
  [
    { ym: "202608", priceKrw: 2_000_000_000 },
    { ym: "202608", priceKrw: 3_000_000_000 },
    { ym: "202608", priceKrw: 2_500_000_000 },
    { ym: "202609", priceKrw: 1_000_000_000 },
    { ym: "202609", priceKrw: 0 },
    { ym: "202610", priceKrw: 4_000_000_000 },
  ],
  ["202607", "202608", "202609", "202610"],
  (ym) => ym >= "202610",
);

test("월별 집계 — 빈 달도 한 줄 · 중앙값/평균 · 집계 중 표시 · 0원 제외", () => {
  assert.deepEqual(
    months.map((m) => [m.ym, m.count, m.medianKrw, m.avgKrw, m.open]),
    [
      ["202607", 0, null, null, false],
      ["202608", 3, 2_500_000_000, 2_500_000_000, false],
      ["202609", 1, 1_000_000_000, 1_000_000_000, false],
      ["202610", 1, 4_000_000_000, 4_000_000_000, true],
    ],
  );
  const bands = aggregateBands(
    [
      { ym: "202601", priceKrw: 1_000_000_000, areaM2: 59.9 },
      { ym: "202601", priceKrw: 1_200_000_000, areaM2: 84.9 },
      { ym: "202601", priceKrw: 1_400_000_000, areaM2: 84.5 },
      { ym: "202501", priceKrw: 9_000_000_000, areaM2: 84.5 }, // 창 밖
      { ym: "202601", priceKrw: 1_000_000_000, areaM2: null }, // 면적 없음
    ],
    "202511",
  );
  assert.deepEqual(bands.map((b) => [b.slug, b.count, b.medianKrw]), [
    ["under-60", 1, 1_000_000_000],
    ["60-85", 2, 1_300_000_000],
  ]);
  assert.equal(ymDot("202609"), "2026.09");
  assert.equal(ymKo("202609"), "2026년 9월");
});

test("제목·설명문·Q&A·인용 — 실데이터로만 · 느낌표·시세 없음 · 값 없는 질문은 빠진다", () => {
  const top = { id: "x", name: "리센츠", region: "서울 송파구", address: null, tradeCount: 900, recentTradeCount: 61, avgPriceManwon: 280_000, avgAreaM2: 84, buildYear: 2008, households: 5563 };
  const label = "서울 송파구 잠실동";
  assert.equal(dongTitle(label, 18, 409), "서울 송파구 잠실동 아파트 실거래가 — 단지 18곳 · 최근 6개월 409건 | 내집나우");
  const desc = dongDescription(label, 18, 409, top, months);
  assert.match(desc, /^서울 송파구 잠실동 아파트 단지 18곳의 매매 실거래\(국토교통부 신고 · 최근 6개월 409건\) · 거래 많은 단지 리센츠 평균 28억 · 2026년 9월 중앙값 10억 · /);
  assert.ok(desc.length <= 200, String(desc.length));
  const bands = [
    { slug: "60-85", label: "60~85㎡", count: 120, medianKrw: 2_600_000_000, avgKrw: 2_650_000_000 },
    { slug: "under-60", label: "~59㎡", count: 30, medianKrw: 1_800_000_000, avgKrw: 1_850_000_000 },
  ];
  const faq = buildDongFaq({ label, complexCount: 18, recentTradeCount: 409, top, bands, months });
  assert.equal(faq.length, 4);
  assert.match(faq[0].a, /단지는 18곳이고, 최근 6개월 매매 신고는 409건/);
  assert.equal(faq[1].a, "최근 6개월 매매 신고가 가장 많은 단지는 리센츠(61건 · 거래 평균 28억 · 2008년 준공)입니다.");
  assert.match(faq[2].a, /전용 60~85㎡ 매매 실거래 120건의 중앙값은 26억, 평균은 26\.5억/);
  assert.match(faq[3].a, /2026년 9월 매매 신고는 1건으로 2026년 8월\(3건\)보다 67% 적습니다/);
  for (const f of faq) assert.doesNotMatch(`${f.q} ${f.a}`, /!|시세|해 보세요/);
  const none = buildDongFaq({ label, complexCount: 0, recentTradeCount: 0, top: null, bands: [], months: [] });
  assert.deepEqual(none, []);
  assert.equal(
    dongCitation(label, 18, 409, months),
    "내집나우(naezipnow.com) 집계에 따르면, 서울 송파구 잠실동 아파트 단지 18곳의 최근 6개월 매매 실거래는 409건이다 (2026년 9월 중앙값 10억) (국토교통부 실거래 신고 기반, 해제분 제외).",
  );
});

test("라우트·조회 — ISR · 404/5xx 구분 · React cache · noindex 규칙 · 서비스 키 없으면 추이만 뺀다", () => {
  const page = strip(read("app/dong/[region]/[dong]/page.tsx"));
  assert.match(page, /export const revalidate = 604_800;/);
  assert.match(page, /export function generateStaticParams\(\)/);
  assert.match(page, /const loadComplexesCached = cache\(/);
  assert.match(page, /if \(complexes\.length === 0\) notFound\(\);/);
  assert.match(page, /dongIndexable\(complexes\.length, recent\) \? \{\} : \{ robots: \{ index: false, follow: true \} \}/);
  assert.match(page, /월별 추이 불러오기 실패 · 잠시 후 다시/);
  assert.doesNotMatch(page, /시세/);
  const landing = strip(read("lib/dong/landing.ts"));
  assert.match(landing, /sb\.rpc\("search_complexes_filtered"/);
  assert.match(landing, /sb\.rpc\("search_area_children"/);
  assert.match(landing, /throw new Error\(`search_complexes_filtered/, "조회 실패는 던진다(5xx)");
  assert.match(landing, /\.like\("address", `% \$\{dong\}%`\)/);
  assert.match(landing, /parseDong\(r\.address\) === dong/, "넓게 걸러 온 뒤 정확히 맞춘다");
  assert.match(landing, /const LIST_MEMO_MS = 10 \* 60_000;/);
  assert.match(landing, /if \(!sb\) return null;/, "서비스 키 없음 → 추이 조각 생략");
  assert.ok(existsSync("app/dong/page.tsx"));
});

test("배선 — 사이트맵 dongs · 허브 /dong · 캐시 정책 · 지역 상세·실거래 구간·단지 상세에서 잇는다", () => {
  assert.ok((SITEMAP_SECTION_SLUGS as readonly string[]).includes("dongs"));
  assert.match(strip(read("lib/seo/sitemap-sections.ts")), /slug: "dongs", label: "동별 실거래", required: true, load: loadDongEntries, hub: "\/dong"/);
  assert.match(read("app/sitemap-dongs.xml/route.ts"), /sitemapSectionRoute\("dongs"\)/);
  assert.match(strip(read("lib/seo/build-sitemap.ts")), /export async function loadDongEntries\(\)/);
  assert.match(strip(read("lib/seo/build-sitemap.ts")), /path: "\/dong", priority: 0\.7/);
  const policy = strip(read("lib/http/cache-policy.ts"));
  assert.match(policy, /\{ path: "\/dong", sMaxAge: 86400, swr: 86400 \}/);
  assert.match(policy, /route: "\/dong\/\[region\]\/\[dong\]", test: \/\^\\\/dong\\\/\[\^\/\]\+\\\/\[\^\/\]\+\$\/, sMaxAge: 604800/);
  const region = strip(read("app/region/[id]/page.tsx"));
  assert.match(region, /loadDongSiblings\(txBandRegion\.name\)\)\.filter\(\(d\) => dongIndexable\(d\.complexCount, d\.recentTradeCount\)\)/);
  assert.match(region, /href=\{dongPath\(txBandRegion\.name, d\.dong\)\}/);
  const tx = strip(read("app/tx/[region]/page.tsx"));
  assert.match(tx, /loadDongSiblings\(region\.name\)\)\.filter\(\(d\) => dongIndexable/);
  assert.match(tx, /href=\{dongPath\(region\.name, d\.dong\)\}/);
  const complex = strip(read("app/complex/[id]/page.tsx"));
  assert.match(complex, /return dec && v\.emd \? dongPath\(dec\.region, v\.emd\) : null;/);
  assert.match(complex, /href=\{dongHref\}/);
  const hub = strip(read("app/dong/page.tsx"));
  assert.match(hub, /listSitemapDongs\(\)/);
  assert.match(hub, /export const revalidate = 86_400;/);
});
