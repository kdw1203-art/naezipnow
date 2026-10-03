import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  ZONE_NEARBY_COMPLEX_RADIUS_M,
  ZONE_NEARBY_ZONE_RADIUS_M,
  kstDateLabel,
  matchZoneNews,
  pickNearbyComplexes,
  pickNearbyZones,
  zoneDistanceBand,
  zoneDistanceLabel,
  zoneNewsKey,
  type ComplexPriceRow,
} from "../../lib/redevelopment/zone-detail.ts";
import { SEED_PROJECTS } from "../../lib/redevelopment/seed.ts";
import type { RedevelopmentProject } from "../../lib/redevelopment/types.ts";

/* [1027 · 정비사업] 구역 상세(/redevelopment/[id]) — 주변 단지(거래 많은 순 · 거리 표기 없음) ·
   가까운 구역(1km 구간) · 관련 기사 낱말 · 사이트맵 · 캐시 정책 · 캐시 비우기. */

const CENTER = { lat: 37.5, lng: 127.0 };
function row(over: Partial<ComplexPriceRow>): ComplexPriceRow {
  return {
    regionName: "서울 강남구",
    complexName: "가",
    lat: 37.5,
    lng: 127.0,
    txCount: 10,
    avgPerPyeongKrw: 100_000_000,
    avgKrw: 2_000_000_000,
    avgAreaM2: 84,
    firstYm: "202502",
    latestYm: "202609",
    ...over,
  };
}

test("주변 단지 — 반경 안만 · 거래 많은 순 · 같으면 이름순 · 거래 0건과 좌표 없는 행은 뺀다", () => {
  assert.equal(ZONE_NEARBY_COMPLEX_RADIUS_M, 1000);
  const rows = [
    row({ complexName: "멀다", lat: 37.52, txCount: 999 }), // 약 2.2km
    row({ complexName: "나", txCount: 30, lat: 37.505 }), // 약 556m
    row({ complexName: "다", txCount: 30, lat: 37.495 }),
    row({ complexName: "가", txCount: 80 }),
    row({ complexName: "거래없음", txCount: 0 }),
    row({ complexName: "좌표없음", lat: Number.NaN, txCount: 50 }),
  ];
  assert.deepEqual(pickNearbyComplexes(rows, CENTER).map((r) => r.complexName), ["가", "나", "다"]);
  assert.deepEqual(pickNearbyComplexes(rows, CENTER, 1000, 2).map((r) => r.complexName), ["가", "나"]);
  assert.deepEqual(pickNearbyComplexes([], CENTER), []);
  assert.deepEqual(pickNearbyComplexes(rows, CENTER, 3000).map((r) => r.complexName)[0], "멀다");
});

test("가까운 구역 — 자기 자신 제외 · 반경 3km · 1km 구간 순(같은 구간은 이름순) · 거리는 구간으로만", () => {
  assert.equal(ZONE_NEARBY_ZONE_RADIUS_M, 3000);
  const by = (id: string) => SEED_PROJECTS.find((p) => p.id === id) as RedevelopmentProject;
  const near = pickNearbyZones(by("seed-heukseok9"), SEED_PROJECTS);
  assert.ok(near.length > 0);
  assert.ok(!near.some((z) => z.project.id === "seed-heukseok9"));
  assert.equal(near[0].project.id, "seed-heukseok2", "흑석9구역의 1km 안에는 흑석2구역");
  /* 구역 좌표는 근사값이다 — 1m 차이로 순서를 가르지 않는다. 구간이 가까운 순, 같은 구간은 이름순 */
  for (let i = 1; i < near.length; i++) {
    const a = near[i - 1];
    const b = near[i];
    const da = zoneDistanceBand(a.distanceM);
    const db = zoneDistanceBand(b.distanceM);
    assert.ok(da < db || (da === db && a.project.name.localeCompare(b.project.name, "ko-KR") <= 0));
  }
  assert.ok(near.every((z) => z.distanceM <= 3000));
  assert.ok(near.length <= 6);
  assert.equal(zoneDistanceLabel(40), "1km 안");
  assert.equal(zoneDistanceLabel(999), "1km 안");
  assert.equal(zoneDistanceLabel(1000), "1~2km");
  assert.equal(zoneDistanceLabel(2543), "2~3km");
  assert.equal(zoneDistanceLabel(2544), "2~3km", "1m 차이는 같은 글자");
  assert.equal(zoneDistanceLabel(Number.NaN), "");
});

test("날짜 — 한국 날짜로 고정(서버와 브라우저가 같은 글자) · 화면 머리와 패널이 같은 함수", () => {
  assert.equal(kstDateLabel("2026-07-22T06:53:15.257809+00:00"), "2026.07.22");
  /* UTC 로는 전날이지만 한국은 다음 날 */
  assert.equal(kstDateLabel("2026-07-22T15:00:00Z"), "2026.07.23");
  assert.equal(kstDateLabel("2026-12-31T16:30:00Z"), "2027.01.01");
  assert.equal(kstDateLabel(null), null);
  assert.equal(kstDateLabel("아님"), null);
  assert.ok(readFileSync("app/redevelopment/[id]/page.tsx", "utf8").includes("const fmtDate = kstDateLabel;"));
  const panelSrc = readFileSync("app/redevelopment/ProjectDetailPanel.tsx", "utf8");
  assert.ok(panelSrc.includes("const formatDate = kstDateLabel;"));
  assert.ok(!/getFullYear\(\)|getMonth\(\)|getDate\(\)/.test(panelSrc), "브라우저 시간대로 날짜를 만들지 않는다");
});

test("관련 기사 낱말 — 도시 이름·괄호 풀이만 떼고, 4글자 미만이면 찾지 않는다", () => {
  assert.equal(zoneNewsKey("은마아파트"), "은마아파트");
  assert.equal(zoneNewsKey("반포주공1단지(1·2·4주구)"), "반포주공1단지");
  assert.equal(zoneNewsKey("목동신시가지(6단지)"), "목동신시가지6단지");
  assert.equal(zoneNewsKey("흑석2구역(공공재개발)"), "흑석2구역");
  assert.equal(zoneNewsKey("성남 수진1구역"), "수진1구역");
  assert.equal(zoneNewsKey("인천 가정1구역(도심공공복합)"), "가정1구역");
  assert.equal(zoneNewsKey("면목동 모아타운"), "면목동모아타운", "동 이름만 남기지 않는다");
  assert.equal(zoneNewsKey("여의도 시범아파트"), "여의도시범아파트");
  assert.equal(zoneNewsKey("안양 냉천"), null, "도시를 떼면 2글자 — 찾지 않는다");
  assert.equal(zoneNewsKey(""), null);
  /* 운영 40곳 전부 낱말이 있고 서로 겹치지 않는다(한 기사가 두 구역에 같은 이유로 걸리지 않게) */
  const keys = SEED_PROJECTS.map((p) => zoneNewsKey(p.name));
  assert.ok(keys.every((k) => k && k.length >= 4));
  assert.equal(new Set(keys).size, keys.length);
});

test("관련 기사 — 제목·본문에 낱말이 있을 때만(공백 무시)", () => {
  const posts = [
    { id: "1", title: "여의도 시범 아파트 재건축 속도", body: "" },
    { id: "2", title: "한남뉴타운 소식", body: "한남 3구역 이주가 진행 중" },
    { id: "3", title: "면목동 주민센터 개관", body: "" },
    { id: "4", title: "한남3구역 관리처분", body: "" },
  ];
  assert.deepEqual(matchZoneNews(posts, "여의도 시범아파트").map((p) => p.id), ["1"]);
  assert.deepEqual(matchZoneNews(posts, "한남3구역").map((p) => p.id), ["2", "4"]);
  assert.deepEqual(matchZoneNews(posts, "면목동 모아타운"), [], "동 이름만 같은 기사는 걸리지 않는다");
  assert.deepEqual(matchZoneNews(posts, "안양 냉천"), []);
});

const page = readFileSync("app/redevelopment/[id]/page.tsx", "utf8");
const panel = readFileSync("app/redevelopment/ProjectDetailPanel.tsx", "utf8");

test("구역 상세 — ISR · 없는 구역만 404 · 실패와 0건을 다르게 그린다 · 지어낸 값 없음", () => {
  assert.match(page, /export const revalidate = 86_400;/);
  assert.match(page, /export function generateStaticParams\(\): \{ id: string \}\[\] \{\s*return \[\];/);
  assert.ok(page.includes("if (!project) notFound();"));
  assert.ok(!/getProject\([^)]*\)\.catch/.test(page), "조회 실패를 404 로 바꾸지 않는다");
  assert.ok(page.includes("주변 단지 불러오기 실패 · 잠시 후 다시"));
  assert.ok(page.includes("반경 안에 매매 실거래가 있는 아파트 없음"));
  assert.ok(page.includes("<ProjectDetailPanel project={project} hideHeader />"));
  assert.ok(page.includes("buildPageMetadata({"));
  assert.ok(page.includes('breadcrumbJsonLd(['));
  assert.ok(page.includes("complexHrefFromNames(c.regionName, c.complexName)"), "단지 링크는 정규 주소");
  assert.ok(page.includes("구역 좌표는 대표점 근사값"));
  /* 단지별 거리·순위 점수·예상 세대·준공 예정 같은 추정 표기가 없다 */
  for (const banned of ["예상 준공", "예상 세대", "추정", "distanceM)}m"]) {
    assert.ok(!page.includes(banned), banned);
  }
  assert.equal(page.split("btn-primary").length - 1, 1, "채움 파랑 버튼은 하나");
});

test("진행 패널 — 상세 페이지에서는 머리 없이(h2), 목록 화면에서는 구역 상세 링크", () => {
  assert.ok(panel.includes("hideHeader = false,"));
  assert.ok(panel.includes('const H = hideHeader ? "h2" : "h4";'));
  assert.ok(panel.includes("{hideHeader ? null : ("));
  assert.ok(panel.includes("구역 상세 ›"));
  /* 채워진 알약은 폰 탭 40px */
  assert.ok(panel.includes('className="inline-flex min-h-[40px] shrink-0 items-center rounded-full bg-primary-soft px-3 t-sub font-bold text-primary no-underline"'));
});

test("사이트맵·캐시 — 구역 상세 유형 등록(슬러그·로더·라우트) · 실거래/뉴스 적재가 비운다", () => {
  assert.ok(readFileSync("lib/seo/sitemap-slugs.ts", "utf8").includes('"redevelopment",'));
  const sections = readFileSync("lib/seo/sitemap-sections.ts", "utf8");
  assert.match(sections, /slug: "redevelopment", label: "정비사업 구역", required: false, load: loadRedevelopmentEntries, hub: "\/redevelopment"/);
  const build = readFileSync("lib/seo/build-sitemap.ts", "utf8");
  assert.ok(build.includes("export async function loadRedevelopmentEntries()"));
  assert.ok(build.includes(".filter((p) => !p.isSample && p.id)"), "예시 데이터는 싣지 않는다");
  assert.ok(build.includes("listDbProjects({ limit: 3000 })"), "시드 폴백이 아니라 DB 확정분만");
  assert.match(readFileSync("app/sitemap-redevelopment.xml/route.ts", "utf8"), /sitemapSectionRoute\("redevelopment"\)/);
  const inv = readFileSync("lib/cache/invalidate.ts", "utf8");
  assert.ok(inv.includes('pageRoutes: ["/analysis/ai/[tool]", "/reports/season/[slug]", "/redevelopment/[id]"],'));
  assert.ok(inv.includes('pageRoutes: [TOWN_REGION_ROUTE, "/redevelopment/[id]"],'));
  assert.ok(readFileSync("app/redevelopment/page.tsx", "utf8").includes('<section id="stage-guide"'));
  /* 공개 캐시 정책 — 이 줄이 없으면 미들웨어가 문서 응답에 no-store 를 붙여 크롤러 요청마다 오리진이 그린다 */
  const policy = readFileSync("lib/http/cache-policy.ts", "utf8");
  assert.ok(policy.includes('{ route: "/redevelopment/[id]", test: /^\\/redevelopment\\/[^/]+$/, sMaxAge: 86_400, swr: 86400 },'));
});

test("공개 캐시 정책 — 구역 상세 주소는 CDN 캐시 대상(목록·다른 경로와 헷갈리지 않는다)", async () => {
  const { publicDocumentCacheControl } = await import("../../lib/http/cache-policy.ts");
  assert.ok(publicDocumentCacheControl("/redevelopment/seed-eunma"), "구역 상세");
  assert.ok(publicDocumentCacheControl("/redevelopment"), "목록");
  assert.equal(publicDocumentCacheControl("/redevelopment/seed-eunma/x"), null);
});
