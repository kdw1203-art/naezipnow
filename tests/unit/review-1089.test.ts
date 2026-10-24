/* [1089] 소유자 2026-10-23 "대규모 최적화를 진행해줘" — 운영은 사용 요금 한도로 일시 정지(503) 중.
 *  ISR 실효 수명 전수 점검(로컬 빌드 · 응답 Cache-Control s-maxage): 단지 화면만 선언(7일)과 달랐다 — s-maxage=3600.
 *  원인: 렌더 중 읽은 캐시의 revalidate 최솟값이 화면 수명이 된다(인증 전문가 1시간 · 관심도 1시간 · 지역 신호 6시간 ·
 *  금리 6시간 · 지역 임대수익 1일) + 그 캐시들의 "market"·"economy" 태그가 화면에 붙어 적재 때마다 2.4만 쪽이 통째로 비워졌다.
 *  그래서: (1) 결과 요약 · 다요인 분석은 사람이 볼 때 /api/complex/insight 로 받는다 (2) 인증 전문가 캐시 7일
 *  (3) 뉴스 상세의 단지 링크 캐시에서 "market" 태그를 뗀다 (4) 빌드 산출물 게이트(scripts/check-isr-ttl)로 다시 생기지 않게. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { INSIGHT_PATH, insightQueryString, parseInsightQuery } from "../../lib/complex/insight-query";
import { complexRegionTag, complexRegionTagsFor } from "../../lib/complex/region-tag";

const read = (p: string) => readFileSync(p, "utf8");
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/(^|[^:"'`])\/\/[^\n]*/g, "$1");

test("조회 주소 — 화면 값(단지 id · 지역 · 월별 건수 · 주력 평형 월 중위)을 싣고 그대로 되읽는다", () => {
  const q = {
    complexId: "7ISc7Jq4IOyGoe2MjOq1rAHtl6zrpqzsmKTsi5zti7A",
    regionName: "서울 송파구",
    series: { yms: ["202607", "202608", "202609"], counts: [3, 0, 4], mainValues: [289000, null, 305500] },
  };
  const qs = insightQueryString(q);
  assert.equal(INSIGHT_PATH, "/api/complex/insight");
  assert.deepEqual(parseInsightQuery(new URLSearchParams(qs)), q);
  /* 계열 없음 · kapt 형태 id */
  assert.deepEqual(parseInsightQuery(new URLSearchParams(insightQueryString({ complexId: "kapt.A10025850", regionName: "안양 동안구", series: null }))), {
    complexId: "kapt.A10025850",
    regionName: "안양 동안구",
    series: null,
  });
  /* 주력 평형 값이 없는 계열 */
  const noV = parseInsightQuery(new URLSearchParams(insightQueryString({ ...q, series: { yms: ["202609"], counts: [2] } })));
  assert.deepEqual(noV?.series, { yms: ["202609"], counts: [2] });
});

test("조회 주소 — 형식이 어긋나면 거절(400) · 계열만 어긋나면 계열 없이(지어내지 않는다)", () => {
  const sp = (o: Record<string, string>) => new URLSearchParams(o);
  assert.equal(parseInsightQuery(sp({ id: "", region: "서울 송파구" })), null);
  assert.equal(parseInsightQuery(sp({ id: "a/b", region: "서울 송파구" })), null);
  assert.equal(parseInsightQuery(sp({ id: "x".repeat(201), region: "서울 송파구" })), null);
  assert.equal(parseInsightQuery(sp({ id: "abc", region: "" })), null);
  assert.equal(parseInsightQuery(sp({ id: "abc", region: "<script>" })), null);
  assert.equal(parseInsightQuery(sp({ id: "abc", region: "서울".repeat(30) })), null);
  /* 계열 길이 불일치 · 월 형식 · 음수 */
  for (const bad of [
    { ym: "202608,202609", c: "1" },
    { ym: "2026-09", c: "1" },
    { ym: "202609", c: "-1" },
    { ym: "202609", c: "1.5" },
  ]) {
    assert.deepEqual(parseInsightQuery(sp({ id: "abc", region: "서울 송파구", ...bad })), { complexId: "abc", regionName: "서울 송파구", series: null }, JSON.stringify(bad));
  }
  /* 값 줄만 어긋나면 값 없이 */
  assert.deepEqual(parseInsightQuery(sp({ id: "abc", region: "서울 송파구", ym: "202609", c: "2", v: "1,2" }))?.series, { yms: ["202609"], counts: [2] });
  /* 화면 쪽: 길이가 어긋난 계열은 싣지 않는다 */
  assert.doesNotMatch(insightQueryString({ complexId: "abc", regionName: "서울 송파구", series: { yms: ["202609"], counts: [1, 2] } }), /ym=/);
});

test("단지 화면 — 결과 요약 · 다요인 분석은 렌더에서 빠지고(라이브 컨텍스트 · 신호 캐시를 읽지 않는다) 같은 자리에 ComplexInsightPanels", () => {
  const page = strip(read("app/complex/[id]/page.tsx"));
  assert.doesNotMatch(page, /ComplexAxisSummary|ComplexSignals|prefetchAxisSummary/);
  assert.match(page, /import \{ ComplexInsightPanels \} from "\.\/ComplexInsightPanels";/);
  assert.ok(page.indexOf("<ComplexInsightPanels") > page.indexOf("<MarketFreshnessLine"), "신선도 캡션 바로 아래(예전 자리)");
  assert.ok(page.indexOf("<ComplexInsightPanels") < page.indexOf("<ComplexHubTabs"), "탭 위(예전 자리)");
  assert.equal(existsSync("app/complex/[id]/ComplexAxisSummary.tsx"), false);
  assert.equal(existsSync("app/complex/[id]/ComplexSignals.tsx"), false);
  const loaders = strip(read("app/complex/[id]/section-loaders.ts"));
  assert.doesNotMatch(loaders, /@\/lib\/ai\/live-context|@\/lib\/signals\/load|loadAxisContext/);

  /* 껍데기(첫 로드 JS) — 지연 조각만 부른다 */
  const panels = strip(read("app/complex/[id]/ComplexInsightPanels.tsx"));
  assert.match(panels, /^"use client";/);
  assert.match(panels, /const ComplexInsightLoader = dynamic\(\(\) => import\("\.\/ComplexInsightLoader"\), \{ ssr: false \}\);/);
  assert.doesNotMatch(panels, /useHumanGate|fetch\(|ComplexInsightView/, "판정 · 조회 · 그리기는 지연 조각에");
  /* 지연 조각 — 사람이 볼 때만 · 화면이 가진 값만 */
  const loader = strip(read("app/complex/[id]/ComplexInsightLoader.tsx"));
  assert.match(loader, /^"use client";/);
  assert.match(loader, /const armed = useHumanGate\(ref, \{ rootMargin: "600px 0px" \}\);/, "크롤러는 부르지 않는다");
  assert.match(loader, /`\$\{INSIGHT_PATH\}\?\$\{insightQueryString\(\{ complexId, regionName, series \}\)\}`/);
  assert.match(loader, /if \(alive && d && \(d\.summary \|\| d\.signals\)\) setData\(d\);/, "둘 다 비면 아무것도 그리지 않는다");
  /* server-only 모듈은 타입으로만 */
  assert.match(loader, /import type \{ ComplexInsight \} from "@\/lib\/complex\/insight";/);

  const view = read("app/complex/[id]/ComplexInsightView.tsx");
  assert.match(view, /import type \{ ComplexInsight \} from "@\/lib\/complex\/insight";/);
  assert.match(view, /<section aria-label="이 단지 결과 요약" className="mt-4 rounded-2xl border border-line bg-surface p-4 max-md:mt-3 max-md:p-3\.5">/);
  assert.match(view, /이 단지 AI 종합 진단 받기 ›/);
  assert.match(view, /<p className="mt-1\.5 t-caption text-text-3">참고용 요약 · 투자 권유 아님<\/p>/);
  assert.match(view, /<SignalBoard report=\{signals\} idPrefix="complex" className="mt-3 rise-in-1" \/>/);
});

test("API — /api/complex/insight: 예전 두 섹션의 규칙 · 예산 · 공개 CDN 캐시", () => {
  const route = strip(read("app/api/complex/insight/route.ts"));
  const exported = [...route.matchAll(/^export (?:async )?(?:function|const) (\w+)/gm)].map((m) => m[1]).sort();
  assert.deepEqual(exported, ["GET", "maxDuration", "runtime"]);
  assert.match(route, /status: 400, headers: \{ "Cache-Control": "no-store" \}/);
  assert.match(route, /"public, max-age=600, s-maxage=21600, stale-while-revalidate=86400"/);
  assert.match(route, /"public, max-age=60, s-maxage=1800"/);
  assert.doesNotMatch(route, /safeAuth|cookies\(|headers\(\)/, "공개 응답 — 로그인 무관");

  const lib = strip(read("lib/complex/insight.ts"));
  assert.match(lib, /^import "server-only";/);
  assert.match(lib, /buildLiveToolContextCached\(q\.complexId, q\.regionName, \{ complexDurable: false \}\)/, "[1007] 단지 축은 데이터 캐시에 쓰지 않는다");
  /* 예전 ComplexAxisSummary 의 판단 그대로 */
  assert.match(lib, /if \(!raw\.metric && raw\.numbers\.length === 0\) return null;/);
  assert.match(lib, /const \{ verdict, axes \} = applyAxisRule\(raw, radar\);/);
  assert.match(lib, /toneLine: axes\.thin \? confirmedAxesLine\(axes\) : null,/);
  /* 예전 ComplexSignals 그대로 — 요인 0 이면 판 생략 */
  assert.match(lib, /signals: signals && signals\.coverage\.used > 0 \? signals : null/);
  assert.match(lib, /loadSignalReport\(\{ scope: "complex", regionName: q\.regionName, complexId: q\.complexId, ctx, complexSeries: q\.series \}\)/);
});

test("캐시 수명 — 인증 전문가 7일(승인은 태그로 즉시) · 뉴스 상세 단지 링크 캐시는 market 태그 없음", () => {
  const experts = read("lib/experts/nearby.ts");
  assert.match(experts, /\["verified-experts-lite-v1"\],\s*\{ revalidate: 604_800, tags: \["verified-experts"\] \}/);
  assert.match(read("app/api/admin/experts/route.ts"), /revalidateTag\("verified-experts"\);/);
  const link = strip(read("lib/newui/complex-link.ts"));
  assert.match(link, /\["complex-href-v2"\],\s*\{ revalidate: 604_800 \}/);
});

test("빌드 게이트 — scripts/check-isr-ttl: next build 뒤 · 단지 · 뉴스 상세는 전역 적재 태그 금지", () => {
  const pkg = JSON.parse(read("package.json")) as { scripts: Record<string, string> };
  assert.equal(pkg.scripts["check:isr-ttl"], "node ./scripts/check-isr-ttl.mjs");
  assert.match(pkg.scripts.build, /next build && .*npm run check:cache-policy && npm run check:isr-ttl$/);
  const gate = read("scripts/check-isr-ttl.mjs");
  assert.match(gate, /"complex\/\[id\]",/);
  assert.match(gate, /const NO_GLOBAL_TAGS = new Set\(\["complex\/\[id\]", "town\/news\/\[id\]"\]\);/);
  assert.match(gate, /const GLOBAL_TAGS = \["market", "economy"\];/);
  /* 산출물 모양이 바뀌어 못 읽으면 경고만(빌드를 잘못 세우지 않는다) */
  assert.match(gate, /if \(analyzed === 0\) \{[\s\S]*?process\.exit\(0\);/);
  /* 화면 선언 TTL 그대로 */
  assert.match(read("app/complex/[id]/page.tsx"), /export const revalidate = 604_800;/);
});

test("실거래 지역 태그 — 단지 화면은 이름 id 의 지역으로 태그를 붙이고, 실거래 적재는 건드린 지역만 비운다(상한 500곳 밖도 빠뜨리지 않게)", () => {
  assert.equal(complexRegionTag("서울 송파구"), `cx-r:${encodeURIComponent("서울 송파구")}`);
  assert.equal(complexRegionTag("  서울   송파구 "), complexRegionTag("서울 송파구"), "공백 정규화");
  assert.match(complexRegionTag("서울 송파구") ?? "", /^[\x21-\x7e]+$/, "헤더(x-next-cache-tags)에 실리므로 ASCII");
  assert.equal(complexRegionTag(""), null);
  assert.equal(complexRegionTag(null), null);
  assert.equal(complexRegionTag("가".repeat(41)), null);
  assert.deepEqual(
    complexRegionTagsFor([{ region: "서울 송파구" }, { region: "서울 송파구 " }, { region: "안양 동안구" }, { region: "" }]),
    [complexRegionTag("서울 송파구"), complexRegionTag("안양 동안구")],
  );
  assert.equal(complexRegionTagsFor(Array.from({ length: 400 }, (_, i) => ({ region: `지역${i}` }))).length, 300, "상한");

  /* 화면: 404 판정 뒤 · 이름 id(canonical_id) 의 지역 · revalidate 없음(화면 수명 그대로) */
  const page = strip(read("app/complex/[id]/page.tsx"));
  assert.match(page, /if \(!v\) notFound\(\);\s*await tagComplexPageRegion\(decodeNameIdSafe\(rowForFacts\?\.canonical_id \?\? complexId\)\?\.region\);/);
  const cache = strip(read("lib/complex/region-tag-cache.ts"));
  assert.match(cache, /unstable_cache\(async \(\) => 1, \["cx-region-tag-v1", tag\], \{ tags: \[tag\] \}\)\(\)/);
  assert.doesNotMatch(cache, /revalidate:/, "화면 수명을 건드리지 않는다");
  /* 적재: 바뀐 단지 id 비움(상한) 다음에 지역 태그 — 예외는 감싼 try 안 */
  const ingest = strip(read("app/api/cron/molit-transactions-ingest/route.ts"));
  assert.match(ingest, /const stats = invalidateComplexIds\(ids, \{ budget: 2_000 \}\);\s*for \(const tag of complexRegionTagsFor\(result\.touchedComplexes\)\) revalidateTag\(tag\);/);
  /* 과거 이력 채우기(4시간마다)는 지역 태그를 비우지 않는다 — 새 실거래가 아니라 지난 달 보충이다 */
  assert.doesNotMatch(read("app/api/cron/molit-history-backfill/route.ts"), /complexRegionTag/);
});
