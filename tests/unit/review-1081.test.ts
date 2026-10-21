/* [1081] 소유자 2026-10-20 — "검색을 통한 유입을 늘릴 수 있는 방법과 홈페이지 최적화 방안 30가지 … 전부 다 개선 작업". 코드로 끝나는 것:
 *  색인·사이트맵  단지 사이트맵 6조각(5,000개 · 인덱스는 조각만) · 월간 리포트 lastmod(표 확정 시점) · 가이드 lastmod(updatedAt) ·
 *               뉴스 hreflang · 지역 상세 스켈레톤 제거(완전한 HTML · 진짜 404) · IndexNow 지역 리포트 + 주 1회 묶음(#6·#18).
 *  제목·설명     지역 제목에 기준 월(#20) · 재개발·입주 제목 꼬리(#10) · 용어 설명문 155자(#12) · 시·구 중복 이름(#9).
 *  본문          지역 서술·인용 문장(#14·#25) · 계산기 본문(#13·#21) · 새 가이드 둘(#11) · 임장노트 제목 규칙(#17).
 *  내부 링크     지역 관련 묶음(#15·#16) · 임장 가이드 → 지역(#15) · 가이드 끝 관련(#16) · 용어 쓰임(#12) · 리포트 지역 링크(#16) ·
 *               홈 칩 8 + 지역·단지 바로가기(#26·#27) · 온도 → 리포트·동네.
 *  공유·운영     카카오톡 공유(#23 · 키 이름 둘 다) · 사이트 내 검색어 집계(#29) · 주간 SEO 리포트(#30). */
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { noteTitleFor } from "@/lib/notes/title-rule";
import { regionTitle, ymLabelKo } from "@/lib/seo/title-experiment";
import { glossaryMetaDescription, glossaryUsageLinks } from "@/lib/seo/glossary-related";
import { GLOSSARY_TERMS, findGlossaryTerm, type GlossaryCategory } from "@/lib/seo/glossary-terms";
import { COMPLEX_CHUNK_SLUGS, COMPLEX_SITEMAP_CHUNKS, COMPLEX_SITEMAP_CHUNK_SIZE, SITEMAP_SECTION_SLUGS, sitemapSectionPath } from "@/lib/seo/sitemap-slugs";
import { GUIDES, GUIDE_BY_SLUG, LEGACY_GUIDES } from "@/lib/guides/catalog";
import { RELATED_REGION_HUBS, guideRelatedLinks } from "@/lib/guides/related-links";
import { CALCULATOR_EXPLAINERS, calculatorExplainer } from "@/lib/calculator/explainers";
import { buildRegionCiteLine, buildRegionNarrative, narrativeComplement } from "@/app/region/[id]/region-overview";
import { normalizeQueryForStats, recordSearchQuery, searchStatsMonthKey, topSearchQueries } from "@/lib/search/query-stats";
import { findCatalogRegionById } from "@/lib/region/catalog";

const read = (p: string) => readFileSync(p, "utf8");
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/[^\n]*/g, "$1");
/** 계산기 도구 id — tools.tsx 는 .tsx 라 불러오지 않고 소스에서 읽는다 */
const CALCULATOR_TOOL_IDS = [...read("app/calculator/tools.tsx").matchAll(/^\s+id: "([a-z-]+)",/gm)].map((m) => m[1]);

/** 내부 주소가 실제로 있는가 — 용어·가이드·계산기는 목록으로, 나머지는 app 경로(라우트 그룹 포함)로 */
function routeExists(href: string): boolean {
  const path = href.split("?")[0];
  let m = /^\/glossary\/([^/]+)$/.exec(path);
  if (m) return findGlossaryTerm(m[1]) !== null;
  m = /^\/guides\/([^/]+)$/.exec(path);
  if (m) return GUIDE_BY_SLUG.has(m[1]) || LEGACY_GUIDES.some((g) => g.slug === m[1]);
  m = /^\/calculator\/([^/]+)$/.exec(path);
  if (m) return m[1] === "rent-vs-buy" || CALCULATOR_TOOL_IDS.includes(m[1]);
  m = /^\/region\/([^/]+)$/.exec(path);
  if (m) return Boolean(findCatalogRegionById(m[1]));
  const dir = `app${path}`;
  return existsSync(`${dir}/page.tsx`) || existsSync(`${dir}/(index)/page.tsx`);
}

test("사이트맵 — 단지 6조각 · 인덱스는 조각만 · 조각 라우트 · 리포트·가이드 lastmod", () => {
  assert.equal(COMPLEX_CHUNK_SLUGS.length, COMPLEX_SITEMAP_CHUNKS);
  assert.equal(COMPLEX_SITEMAP_CHUNK_SIZE * COMPLEX_SITEMAP_CHUNKS, 30_000, "23,809개 + 여유");
  for (const slug of COMPLEX_CHUNK_SLUGS) {
    assert.ok((SITEMAP_SECTION_SLUGS as readonly string[]).includes(slug), slug);
    assert.equal(sitemapSectionPath(slug), `/sitemap-${slug}.xml`);
    const route = `app/sitemap-${slug}.xml/route.ts`;
    assert.ok(existsSync(route), route);
    assert.match(read(route), new RegExp(`sitemapSectionRoute\\("${slug}"\\)`));
  }
  const sections = strip(read("lib/seo/sitemap-sections.ts"));
  assert.match(sections, /slug: "complexes",[\s\S]*?indexed: false/, "통짜는 인덱스에서 뺀다");
  assert.match(sections, /s\.indexed !== false/, "인덱스 필터");
  assert.match(sections, /loadComplexChunkEntries\(/);
  const build = strip(read("lib/seo/build-sitemap.ts"));
  assert.match(build, /export async function loadComplexChunkEntries\(chunkIndex: number\)/);
  assert.match(build, /chunkIndex \* COMPLEX_SITEMAP_CHUNK_SIZE/);
  assert.match(build, /export function reportClosedAt\(slug: string\)/);
  assert.match(build, /Date\.UTC\(Number\(m\[1\]\), Number\(m\[2\]\) - 1 \+ 2, 1\)/, "두 달 뒤 1일");
  assert.match(build, /g\.updatedAt/, "가이드 lastmod 는 updatedAt 이 있을 때만");
  const weekly = strip(read("app/api/cron/seo-weekly-report/route.ts"));
  assert.match(weekly, /filter\(\(s\) => s !== "complexes"\)/, "주간 리포트도 조각만 센다");
});

test("색인 — 뉴스 hreflang · 지역 스켈레톤 제거 · IndexNow 지역 리포트 + 주 1회 묶음", () => {
  const news = strip(read("app/town/news/[id]/page.tsx"));
  assert.match(news, /seoAlternates\(canonicalNewsPath\(/);
  assert.match(news, /\balternates,/);
  assert.equal(existsSync("app/region/[id]/loading.tsx"), false, "ISR 7일 지역 상세는 완전한 HTML 로");
  assert.ok(existsSync("app/complex/[id]/loading.tsx"), "단지는 그대로(게이트·UX)");
  assert.doesNotMatch(strip(read("scripts/check-final-release.mjs")), /"app\/region\/\[id\]\/loading\.tsx"/);
  const idx = strip(read("app/api/cron/indexnow-submit/route.ts"));
  assert.match(idx, /function isKstMonday\(/);
  assert.match(idx, /getAllRegionSnapshots\(\)/);
  assert.match(idx, /\/region\/\$\{[^}]+\}\/report\//);
  for (const hub of ["/guides", "/glossary", "/analysis/temperature", "/imjang"]) assert.ok(idx.includes(`"${hub}"`), hub);
});

test("제목 — 지역 기준 월(#20) · 월 라벨 · 재개발·입주 꼬리(#10) · 시·구 중복(#9)", () => {
  assert.equal(ymLabelKo("202609"), "2026년 9월");
  assert.equal(ymLabelKo("202613"), null);
  assert.equal(ymLabelKo(""), null);
  assert.equal(ymLabelKo(undefined), null);
  const withYm = regionTitle("gangnam", "강남구", "2026년 9월").title;
  assert.match(withYm, / — 2026년 9월 \| 내집나우$/);
  assert.ok(withYm.startsWith("강남구 아파트"));
  const plain = regionTitle("gangnam", "강남구").title;
  assert.doesNotMatch(plain, / — \d{4}년/);
  assert.equal(regionTitle("gangnam", "강남구", null).title, plain);
  const regionPage = strip(read("app/region/[id]/page.tsx"));
  assert.match(regionPage, /let ymLabel = ymLabelKo\(toYm\(snapshot\.period\)\);/);
  assert.match(regionPage, /getRegionSeries\(id, "sale_index", "monthly", 1\)\.catch\(\(\) => \[\]\)/, "서울 구(period '')는 지수 최신 달로");
  assert.match(regionPage, /regionTitle\(id, name, ymLabel\)/);
  assert.match(read("app/redevelopment/(index)/page.tsx"), /서울 재개발·재건축 지도/);
  const supply = strip(read("app/supply/page.tsx"));
  assert.match(supply, /SUPPLY_TITLE_YEARS/);
  assert.match(supply, /title: `[^`]*\$\{SUPPLY_TITLE_YEARS\}/);
  const complex = strip(read("app/complex/[id]/page.tsx"));
  assert.match(complex, /axisRegionName\(row\.city, row\.district\) \|\| "지역"/, "원주시 원주시 명륜동 → 원주시 명륜동");
  assert.match(complex, /집계 내집나우\(naezipnow\.com\)/);
});

test("지역 서술·인용(#14·#25) — 있는 값만 · 출처·기준월 · 없으면 빈 배열·null", () => {
  const facts = {
    index: { value: 98.5, ym: "202609", momPct: -1.6, yoyPct: 2.1 },
    jeonse: { value: 48.2, ym: "202609", ppChange: 0.3 },
    volume: { ym: "202609", count: 80, momPct: 12.5 },
    volumeOpen: [{ ym: "202610", count: 12 }],
    avgPrice: { krw: 2_780_000_000, ym: "202609", basis: "reb" as const, trades: null },
    hasReb: true,
  };
  const n = buildRegionNarrative("강남구", facts);
  assert.deepEqual(n, [
    "강남구 아파트 매매가격지수는 2026년 9월 기준 98.5(전월 대비 ▼1.6%)로, 한국부동산원 월간 지수입니다.",
    "매매가격지수는 1년 전 대비 ▲2.1%입니다.",
    "2026년 9월 평균 매매가는 27.8억(한국부동산원 집계)입니다.",
    "2026년 9월 매매 신고는 80건입니다.",
    "2026년 9월 매매 신고는 전월 대비 ▲12.5%입니다.",
    "2026년 10월 12건은 아직 신고가 들어오는 중입니다.",
    "전세가율은 48.2%입니다.",
    "전세가율은 전월 대비 ▲0.3%p입니다.",
  ]);
  for (const s of n) assert.doesNotMatch(s, /!|해 보세요|학군|교통/, "데이터 밖 서술·느낌표 없음");
  /* 머리 문단이 이미 말한 수(27.8억 · 80건 · 48.2% · 지수 값)는 빠지고 새 사실만 남는다 */
  const lead = "강남구의 2026.09 아파트 시세는 평균 매매가 27.8억 · 전세가율 48.2%입니다(출처 한국부동산원(R-ONE)). 매매가격지수 · 전월 대비 ▼1.65% · 국토교통부 신고 아파트 매매 2026.09 80건(2026.10분 신고 기한 내 · 집계 중)";
  assert.deepEqual(narrativeComplement(n, lead), [
    "매매가격지수는 1년 전 대비 ▲2.1%입니다.",
    "2026년 9월 매매 신고는 전월 대비 ▲12.5%입니다.",
    "2026년 10월 12건은 아직 신고가 들어오는 중입니다.",
    "전세가율은 전월 대비 ▲0.3%p입니다.",
  ]);
  assert.deepEqual(narrativeComplement(n, ""), n, "머리 문단이 비면 전부");
  const cite = buildRegionCiteLine("강남구", facts);
  assert.match(cite ?? "", /^강남구 아파트 2026년 9월 기준 매매가격지수 98\.5\(전월 대비 ▼1\.6%\) · 평균 매매가 .* · 매매 신고 80건 — 출처 한국부동산원·국토교통부 실거래, 집계 내집나우\(naezipnow\.com\)$/);
  const txOnly = { index: null, jeonse: null, volume: { ym: "202608", count: 31, momPct: null }, volumeOpen: [], avgPrice: { krw: 500_000_000, ym: "202608", basis: "tx" as const, trades: 31 }, hasReb: false };
  const n2 = buildRegionNarrative("원주시", txOnly);
  assert.equal(n2.length, 3);
  assert.match(n2[0], /국토교통부 신고 31건 평균/);
  assert.equal(n2[1], "2026년 8월 매매 신고는 31건입니다.");
  assert.match(n2[2], /한국부동산원 지수·평균가 기록이 없는 지역/);
  assert.match(buildRegionCiteLine("원주시", txOnly) ?? "", /— 출처 국토교통부 실거래, 집계/);
  const empty = { index: null, jeonse: null, volume: null, volumeOpen: [], avgPrice: null, hasReb: false };
  assert.deepEqual(buildRegionNarrative("x", empty), []);
  assert.equal(buildRegionCiteLine("x", empty), null);
  const page = strip(read("app/region/[id]/page.tsx"));
  assert.match(page, /narrativeComplement\(overview\.narrative, lead\)/);
  assert.match(page, /data-cite=""/);
  assert.match(page, /aria-labelledby="region-related"/);
  for (const href of ["/glossary/maemae-gagyeok-jisu", "/glossary/jeonse-garyul", "/guides/index-reading", "/guides/real-price-reading", "/calculator/gap"]) {
    assert.ok(page.includes(`"${href}"`), href);
    assert.ok(routeExists(href), href);
  }
});

test("계산기 본문(#13·#21) — 6개 · 공식·예시·확인·관련 · 링크 실재 · 3쪽에 꽂힘", () => {
  const ids = ["brokerage", "jeonse-monthly", "gap", "rental-yield", "rent-vs-buy", "loan"];
  assert.deepEqual(Object.keys(CALCULATOR_EXPLAINERS).sort(), [...ids].sort());
  for (const id of ids) {
    const e = calculatorExplainer(id);
    assert.ok(e, id);
    assert.ok(e.formula.length >= 1 && e.example.length >= 2 && e.caveats.length >= 1 && e.related.length >= 3, id);
    for (const s of [...e.formula, ...e.example, ...e.caveats]) assert.doesNotMatch(s, /!|해 보세요/, `${id}: ${s}`);
    for (const l of e.related) assert.ok(routeExists(l.href), `${id} → ${l.href}`);
  }
  assert.equal(calculatorExplainer("nope"), null);
  assert.match(strip(read("app/calculator/[tool]/page.tsx")), /<CalculatorExplainer id=\{/);
  assert.match(strip(read("app/calculator/rent-vs-buy/page.tsx")), /<CalculatorExplainer id="rent-vs-buy" \/>/);
  assert.match(strip(read("app/calculator/page.tsx")), /after=\{/);
  assert.match(strip(read("app/calculator/calculator-client.tsx")), /after\?: ReactNode/);
  assert.match(read("app/calculator/CalculatorExplainer.tsx"), /BreadcrumbList|breadcrumbJsonLd/);
});

test("가이드 — 새 글 둘(#11) · 글 끝 관련(#16) · 용어·도구·지역 링크 실재", () => {
  for (const slug of ["deunggibu-reading", "cheongyak-gajeom"]) {
    const g = GUIDE_BY_SLUG.get(slug);
    assert.ok(g, slug);
    assert.match(g.updatedAt ?? "", /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(g.sections.length >= 3 && g.faq.length >= 2, slug);
    for (const r of g.related) assert.ok(GUIDE_BY_SLUG.has(r), `${slug} related ${r}`);
    for (const t of g.tools) assert.ok(routeExists(t.href), `${slug} tool ${t.href}`);
    const text = [g.intro, ...g.sections.flatMap((s) => s.body), ...g.faq.map((f) => f.a)].join("\n");
    assert.doesNotMatch(text, /!|해 보세요|시세/, slug);
  }
  assert.equal(new Set(GUIDES.map((g) => g.slug)).size, GUIDES.length, "슬러그 중복 없음");
  const cats = new Set(GUIDES.map((g) => g.category));
  for (const c of cats) {
    const r = guideRelatedLinks(c);
    assert.ok(r.terms.length >= 4, `${c} terms`);
    assert.ok(r.tools.length >= 3, `${c} tools`);
    for (const l of [...r.terms, ...r.tools, ...r.regions]) assert.ok(routeExists(l.href), `${c} → ${l.href}`);
  }
  assert.equal(RELATED_REGION_HUBS.length, 6);
  assert.match(strip(read("app/guides/[slug]/page.tsx")), /<GuideRelatedLinks category=\{/);
  assert.match(read("app/guides/RelatedLinks.tsx"), /guideRelatedLinks\(/);
});

test("용어(#12) — 설명문 155자 · 분류별 쓰임 링크 실재 · 페이지에 꽂힘", () => {
  assert.equal(glossaryMetaDescription("짧게.", "짧게."), "짧게.");
  assert.equal(glossaryMetaDescription("실제 거래된 가격", "국토교통부에 신고된 계약 가격입니다."), "실제 거래된 가격. 국토교통부에 신고된 계약 가격입니다.");
  const long = glossaryMetaDescription("짧은 설명", "가".repeat(200));
  assert.ok(long.length <= 155, String(long.length));
  const sentence = glossaryMetaDescription("짧은 설명", `${"가".repeat(100)}. ${"나".repeat(100)}.`);
  assert.ok(sentence.length <= 155 && sentence.endsWith("."), sentence.slice(-10));
  for (const t of GLOSSARY_TERMS) {
    const d = glossaryMetaDescription(t.short, t.def);
    assert.ok(d.length >= t.short.trim().length && d.length <= 155, `${t.slug} ${d.length}`);
  }
  const cats = new Set<GlossaryCategory>(GLOSSARY_TERMS.map((t) => t.category));
  for (const c of cats) {
    const links = glossaryUsageLinks(c);
    assert.ok(links.length >= 3, c);
    for (const l of links) assert.ok(routeExists(l.href), `${c} → ${l.href}`);
  }
  const page = strip(read("app/glossary/[term]/page.tsx"));
  assert.match(page, /glossaryMetaDescription\(/);
  assert.match(page, /glossaryUsageLinks\(/);
  assert.match(page, /이 용어가 쓰이는 화면/);
});

test("임장노트 제목 규칙(#17) — 면적·방문월은 있을 때만", () => {
  assert.equal(noteTitleFor({ aptName: "헬리오시티", areaM2: 84.98, visitDate: "2026-10-03" }), "헬리오시티 84㎡ 임장노트 · 2026년 10월");
  assert.equal(noteTitleFor({ aptName: " 래미안 ", areaLabel: "59㎡", visitDate: "2026-01-15" }), "래미안 59㎡ 임장노트 · 2026년 1월");
  assert.equal(noteTitleFor({ aptName: "A단지" }), "A단지 임장노트");
  assert.equal(noteTitleFor({ aptName: "A단지", areaM2: 0, visitDate: "2026-13" }), "A단지 임장노트");
  const form = strip(read("app/notes/new/NoteForm.tsx"));
  assert.match(form, /noteTitleFor\(\{ aptName, areaM2: unit\.areaM2, areaLabel: unit\.areaLabel, visitDate: visitDateIso \}\)/);
  assert.doesNotMatch(form, /\$\{aptName\} 임장 기록/);
});

test("내부 링크 — 임장 가이드 → 지역(#15) · 리포트 지역 링크·공유(#16·#23) · 온도 → 리포트·동네 · 홈 칩 8 + 바로가기(#26·#27)", () => {
  const imjang = strip(read("app/imjang/[slug]/page.tsx"));
  assert.match(imjang, /findCatalogRegionStrict\(region\.name\)/);
  assert.match(imjang, /\/analysis\/temperature\/\$\{/);
  assert.match(imjang, /\/region\/\$\{[^}]+\}\/report/);
  const reports = strip(read("app/reports/[ym]/page.tsx"));
  assert.match(reports, /\/region\/\$\{encodeURIComponent\(hub\.id\)\}\/report\/\$\{ym\.slice\(0, 4\)\}-\$\{ym\.slice\(4, 6\)\}/);
  assert.match(reports, /<KakaoShareButton/);
  assert.match(reports, /<ShareLinkButton/);
  const temp = strip(read("app/analysis/temperature/[region]/page.tsx"));
  assert.match(temp, /\/region\/\$\{[^}]+\}\/report`/);
  assert.match(temp, /\/town\/\$\{/);
  const home = strip(read("app/page.tsx"));
  assert.match(home, /regions\.slice\(0, 8\)/);
  assert.match(home, /getActiveComplexes\(12\)/);
  assert.match(home, /<HomeHubLinks regions=\{regions\} complexes=\{activeComplexes\} \/>/);
  const hub = read("app/components/home/HomeHubLinks.tsx");
  assert.doesNotMatch(hub, /"use client"/, "서버 조각(클라이언트 JS 0)");
  assert.match(hub, /complexCanonicalPathFromNames\(/);
  assert.match(hub, /\/region\/\$\{/);
});

test("카카오톡 공유(#23) — 키 이름 둘 다 · 키 없으면 안 그림 · 단지·리포트에 꽂힘 · CSP", () => {
  const sdk = strip(read("lib/kakao/sdk.ts"));
  assert.match(sdk, /process\.env\.NEXT_PUBLIC_KAKAO_JS_KEY \|\| process\.env\.NEXT_PUBLIC_KAKAO_JAVASCRIPT_KEY \|\| ""/);
  assert.match(strip(read("app/notes/[id]/card/kakao-sdk.ts")), /from "@\/lib\/kakao\/sdk"/, "예전 경로는 다시 내보낸다");
  for (const f of ["lib/security/content-security-policy.ts", "app/admin/promo/page.tsx", "app/my/points/ShareRow.tsx"]) {
    const s = strip(read(f));
    assert.ok(s.includes("NEXT_PUBLIC_KAKAO_JS_KEY") && s.includes("NEXT_PUBLIC_KAKAO_JAVASCRIPT_KEY"), f);
  }
  const btn = strip(read("app/components/KakaoShareButton.tsx"));
  assert.match(btn, /if \(!KAKAO_JS_KEY\) return null;/);
  assert.match(btn, /navigator\.share/);
  assert.match(btn, /clipboard/);
  assert.doesNotMatch(btn, /!(?=[^=])[^<]*[가-힣]!/, "느낌표 없음");
  assert.match(strip(read("app/complex/[id]/page.tsx")), /<KakaoShareButton[\s\S]*?utm_source=kakao/);
  assert.match(strip(read("lib/admin/integrations.ts")), /NEXT_PUBLIC_KAKAO_JAVASCRIPT_KEY/);
});

test("검색어 집계(#29) — 정규화 · 월 키 · KV 없으면 조용히 · 라우트·관리자에 꽂힘", async () => {
  assert.equal(normalizeQueryForStats("  헬리오시티   84 "), "헬리오시티 84");
  assert.equal(normalizeQueryForStats("Gangnam"), "gangnam");
  assert.equal(normalizeQueryForStats("a"), null, "2자 미만");
  assert.equal(normalizeQueryForStats("x".repeat(41)), null, "40자 초과");
  assert.equal(normalizeQueryForStats("a:b"), null, "키 구분자");
  assert.equal(normalizeQueryForStats("a*"), null, "글롭 기호");
  assert.equal(searchStatsMonthKey(Date.UTC(2026, 9, 31, 15, 1)), "202611", "KST 11월 1일 00:01");
  assert.equal(searchStatsMonthKey(Date.UTC(2026, 9, 31, 14, 59)), "202610");
  const saved = { ...process.env };
  try {
    for (const k of ["UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN", "KV_REST_API_URL", "KV_REST_API_TOKEN"]) delete process.env[k];
    await recordSearchQuery("강남구");
    assert.deepEqual(await topSearchQueries(10), []);
  } finally {
    process.env = saved;
  }
  assert.match(strip(read("app/api/search/unified/route.ts")), /void recordSearchQuery\(q\);/);
  const admin = strip(read("app/admin/seo/page.tsx"));
  assert.match(admin, /topSearchQueries\(/);
  assert.match(admin, /async function TopQueriesPanel\(\)/);
});

test("주간 SEO 리포트(#30) — 라우트 · 크론 등록 · 내보내기 규칙 · dryRun · 메일은 설정이 있을 때만", () => {
  const route = "app/api/cron/seo-weekly-report/route.ts";
  const src = strip(read(route));
  const exported = [...src.matchAll(/^export (?:const|async function|function) (\w+)/gm)].map((m) => m[1]).sort();
  assert.deepEqual(exported, ["GET", "dynamic", "maxDuration", "runtime"]);
  assert.match(src, /authorizeCron\(req\)/);
  assert.match(src, /searchParams\.get\("dryRun"\) !== "1"/);
  assert.match(src, /isEmailConfigured\(\)/);
  assert.match(src, /loadIndexCoverage\(2\)/);
  assert.match(src, /search_zero_results/);
  const crons = (JSON.parse(read("vercel.json")) as { crons: Array<{ path: string; schedule: string }> }).crons;
  const c = crons.find((x) => x.path === "/api/cron/seo-weekly-report");
  assert.ok(c, "크론 등록");
  assert.equal(c.schedule, "40 0 * * 1");
  assert.equal(new Set(crons.map((x) => x.path)).size, crons.length, "경로 중복 없음");
});
