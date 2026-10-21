/* [1082] 소유자 2026-10-21 — "추가로 더 검토해줘". 1081 자체 검토 + 운영 재실측(사이트맵 샘플 107 · 정적 216쪽 전수)에서 나온 것:
 *  자체 검토  IndexNow 지역 리포트는 월요일만(ISR 7일) · 단지 사이트맵 조각 6개가 목록을 한 번만 읽음(메모) · 공개 노트 예전 제목
 *            ("○○ 임장 기록")은 보여 줄 때 새 규칙으로 + "임장노트" 접미 중복 금지 · 카카오 카드 그림 = 화면 og:image.
 *  재실측     동네 홈 130쪽 같은 40자 설명문 → 지역의 수 · 지역 월간 리포트 654쪽 수 없는 설명문 → 건수·평균·중앙값 · 월간 리포트 공유 카드 ·
 *            매물 목록 44자 설명문 · 포인트 상점 h1 없음 · 가이드 Article 스키마 + 갱신일 · 허브 7곳 BreadcrumbList ·
 *            robots.txt 가 통짜 단지 사이트맵과 조각 6개를 함께 적던 것(같은 URL 두 번). */
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { noteDisplayTitle, noteMetaTitle } from "@/lib/notes/title-rule";
import { townMetaDescription } from "@/lib/seo/town-description";
import { regionReportDescription, regionReportTitle } from "@/lib/region/report-meta";
import { SITEMAP_PATHS, SITEMAP_PATHS_FOR_ROBOTS, SITEMAP_UNLISTED_SLUGS } from "@/lib/seo/sitemap-slugs";

const read = (p: string) => readFileSync(p, "utf8");
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/[^\n]*/g, "$1");

test("공개 노트 제목 — 예전 규칙은 보여 줄 때 새 규칙으로 · 접미 중복 금지 · 페이지 적용", () => {
  assert.equal(noteDisplayTitle({ title: "헬리오시티 임장 기록", aptName: "헬리오시티", visitDate: "2026-10-03" }, { areaM2: 84.9 }), "헬리오시티 84㎡ 임장노트 · 2026년 10월");
  assert.equal(noteDisplayTitle({ title: "래미안 임장 기록", aptName: null, visitDate: "2026-01-15" }, null), "래미안 임장노트 · 2026년 1월");
  assert.equal(noteDisplayTitle({ title: "내가 직접 쓴 제목", aptName: "A", visitDate: "2026-01-15" }, null), "내가 직접 쓴 제목", "사용자가 바꾼 제목은 그대로");
  assert.equal(noteDisplayTitle({ title: "헬리오시티 84㎡ 임장노트 · 2026년 10월", aptName: "헬리오시티" }, null), "헬리오시티 84㎡ 임장노트 · 2026년 10월");
  assert.equal(noteMetaTitle("헬리오시티 84㎡ 임장노트 · 2026년 10월", "송파구"), "헬리오시티 84㎡ 임장노트 · 2026년 10월 · 송파구 | 내집나우");
  assert.equal(noteMetaTitle("내가 직접 쓴 제목", "송파구"), "내가 직접 쓴 제목 · 송파구 임장노트 | 내집나우");
  const page = strip(read("app/notes/[id]/page.tsx"));
  assert.match(page, /const seoTitle = noteDisplayTitle\(note, unitFromMetadata\(note\.metadata\)\);/);
  assert.match(page, /const title = noteMetaTitle\(seoTitle, note\.region\);/);
  assert.match(page, /title: seoTitle,/, "OG 카드도 같은 제목");
  assert.doesNotMatch(page, /headline: note\.title/, "JSON-LD headline 도 새 규칙");
});

test("IndexNow — 지역 월간 리포트는 월요일만(ISR 7일) · 스냅샷 전량 조회도 월요일만", () => {
  const src = strip(read("app/api/cron/indexnow-submit/route.ts"));
  assert.match(src, /if \(latest && isKstMonday\(\)\) \{/);
  assert.match(src, /isKstMonday\(\)\s*\? withBudget\(\s*Promise\.resolve\(\)\.then\(\(\) => getAllRegionSnapshots\(\)\)/);
  assert.match(src, /: Promise\.resolve\(\{ state: "ok" as const, value: new Map<string, unknown>\(\) \}\)/);
});

test("단지 사이트맵 조각 — 목록 메모(10분 · 빈 결과는 기억 안 함) · robots 는 통짜 제외 · 인덱스 제외 목록과 일치", () => {
  const build = strip(read("lib/seo/build-sitemap.ts"));
  assert.match(build, /const COMPLEX_LIST_MEMO_MS = 10 \* 60_000;/);
  assert.match(build, /if \(list\.length === 0\) complexListMemo = null;/);
  assert.match(build, /const all = await loadComplexEntriesMemo\(\);/);
  assert.deepEqual([...SITEMAP_UNLISTED_SLUGS], ["complexes"]);
  assert.ok(SITEMAP_PATHS.includes("/sitemap-complexes.xml"), "캐시 정책·공개 허용 목록에는 그대로");
  assert.ok(!SITEMAP_PATHS_FOR_ROBOTS.includes("/sitemap-complexes.xml"));
  assert.ok(SITEMAP_PATHS_FOR_ROBOTS.includes("/sitemap.xml") && SITEMAP_PATHS_FOR_ROBOTS.includes("/sitemap-complexes-6.xml"));
  assert.equal(SITEMAP_PATHS_FOR_ROBOTS.length, SITEMAP_PATHS.length - 1);
  assert.match(strip(read("app/robots.ts")), /sitemap: SITEMAP_PATHS_FOR_ROBOTS\.map/);
  /* sitemap-sections 의 indexed:false 슬러그 = SITEMAP_UNLISTED_SLUGS */
  const sections = strip(read("lib/seo/sitemap-sections.ts"));
  const unindexed = [...sections.matchAll(/slug: "([a-z0-9-]+)"[^\n]*indexed: false/g)].map((m) => m[1]);
  assert.deepEqual(unindexed, [...SITEMAP_UNLISTED_SLUGS]);
});

test("동네 홈 설명문 — 지역의 수로 시작 · 없으면 화면에 있는 것만 · 같은 틀 40자 탈출", () => {
  const withFacts = townMetaDescription("강남구", { period: "202609", avgSale: 2_780_000_000, jeonseRatio: 43.6 });
  assert.match(withFacts, /^강남구 동네 홈 — 아파트 평균 매매가 27\.8억\(2026년 9월 · 한국부동산원\) · 전세가율 43\.6%\. /);
  assert.ok(withFacts.length <= 160 && withFacts.length >= 100, String(withFacts.length));
  assert.equal((withFacts.match(/평균 매매가/g) ?? []).length, 2, "머리 사실 + 인근 비교 — 같은 값은 한 번");
  const bare = townMetaDescription("종로구", { period: "", avgSale: null, jeonseRatio: null });
  assert.match(bare, /^종로구 동네 홈 — 이웃이 쓴 동네 글 · 공개 임장노트 · /);
  assert.ok(bare.length >= 80, String(bare.length));
  for (const d of [withFacts, bare]) assert.doesNotMatch(d, /시세|입주|정비사업|청약|!/, "화면에 없는 것·금지 낱말 없음");
  const page = strip(read("app/town/[region]/page.tsx"));
  assert.match(page, /const snap = await getRegionSnapshot\(id\)\.catch\(\(\) => null\);/);
  assert.match(page, /const description = townMetaDescription\(region\.name, snap\);/);
});

test("지역 월간 리포트 — 제목·설명문에 그 달의 수 · 집계 중 표시 · 없으면 종전 틀 · 조회는 요청당 한 번(cache)", () => {
  const f = { tradeCount: 80, prevTradeCount: 153, avgDealKrw: 2_780_000_000, medianDealKrw: 2_590_000_000, rentCount: 1200 };
  assert.equal(regionReportTitle("강남구", "2026년 8월", f, false), "강남구 아파트 2026년 8월 매매 신고 80건 · 평균 27.8억 — 월간 리포트 | 내집나우");
  assert.equal(regionReportTitle("강남구", "2026년 9월", f, true), "강남구 아파트 2026년 9월 매매 신고 80건(집계 중) · 평균 27.8억 — 월간 리포트 | 내집나우");
  assert.equal(
    regionReportDescription("강남구", "2026년 8월", f, false),
    "2026년 8월 강남구 아파트 매매 신고 80건(전월 153건) · 평균 매매가 27.8억 · 중앙값 25.9억 · 전월세 신고 1,200건 · 상위 실거래 — 국토교통부 실거래 신고·한국부동산원 지수로 정리한 월간 스냅샷.",
  );
  assert.match(regionReportDescription("강남구", "2026년 9월", f, true), /80건\(신고 기한 안 · 집계 중\) · 평균/);
  const empty = { tradeCount: null, prevTradeCount: null, avgDealKrw: null, medianDealKrw: null, rentCount: null };
  assert.equal(regionReportTitle("원주시", "2026년 8월", null, false), "원주시 아파트 시장 2026년 8월 리포트 — 거래량·평균가·신고 실거래 | 내집나우");
  assert.match(regionReportDescription("원주시", "2026년 8월", empty, false), /^2026년 8월 원주시 아파트 매매 신고 건수, 평균·중앙값 매매가/);
  const page = strip(read("app/region/[id]/report/[ym]/page.tsx"));
  assert.match(page, /const loadReport = cache\(\(id: string, name: string, ym: string\) => getRegionMonthlyReport\(id, name, ym\)\);/);
  assert.match(page, /const report = await loadReport\(id, region\.name, ym\)\.catch\(\(\) => null\);/);
  assert.match(page, /report = await loadReport\(id, region\.name, ym\);/, "본문도 같은 캐시 경로");
  assert.equal((page.match(/getRegionMonthlyReport\(/g) ?? []).length, 1, "직접 호출은 cache 안 한 곳뿐");
});

test("월간 리포트 공유 카드 · 카카오 카드 그림 · 매물 목록 설명문 · 포인트 상점 h1", () => {
  const rep = strip(read("app/reports/[ym]/page.tsx"));
  assert.match(rep, /const ogImage = `\/api\/og\?\$\{new URLSearchParams\(\{/);
  assert.match(rep, /badge: "월간 리포트",/);
  assert.match(rep, /images: \[\{ url: ogImage, width: 1200, height: 630, alt: `\$\{label\} 아파트 실거래 리포트` \}\]/);
  assert.doesNotMatch(rep, /DEFAULT_OG_IMAGES/);
  const kakao = strip(read("app/components/KakaoShareButton.tsx"));
  assert.match(kakao, /querySelector<HTMLMetaElement>\('meta\[property="og:image"\]'\)\?\.content\?\.trim\(\) \|\| undefined/);
  assert.match(kakao, /buildKakaoFeedShare\(\{ title, description, shareUrl, buttonTitle, imageUrl \}\)/);
  const listings = strip(read("app/listings/page.tsx"));
  const desc = /description:\s*"([^"]+)"/.exec(listings)?.[1] ?? "";
  assert.ok(desc.length >= 70 && desc.length <= 160, `${desc.length}`);
  assert.doesNotMatch(desc, /가격으로 거르고/, "화면에 없는 가격 필터를 적지 않는다");
  const shop = strip(read("app/points/shop/page.tsx"));
  assert.match(shop, /<h1 className="[^"]*t-title[^"]*">포인트 상점<\/h1>/);
  assert.equal((shop.match(/<ShopTitle \/>/g) ?? []).length, 3, "로그인 전·오류·정상 세 분기 전부");
});

test("가이드 Article 스키마 + 갱신일 · 허브 7곳 BreadcrumbList", () => {
  const guide = strip(read("app/guides/[slug]/page.tsx"));
  assert.match(guide, /"@type": "Article",\s*headline: guide\.title,/);
  assert.match(guide, /\.\.\.\(guide\.updatedAt \? \{ dateModified: guide\.updatedAt \} : \{\}\)/, "날짜는 있을 때만");
  assert.doesNotMatch(guide, /datePublished/, "쓴 날은 모른다 — 지어내지 않는다");
  assert.match(guide, /갱신 \{guide\.updatedAt\.replace\(\/-\/g, "\."\)\}/);
  assert.ok(existsSync("app/components/seo/HubBreadcrumbLd.tsx"));
  const hubs: Array<[string, string]> = [
    ["app/guides/page.tsx", "/guides"],
    ["app/supply/page.tsx", "/supply"],
    ["app/redevelopment/(index)/page.tsx", "/redevelopment"],
    ["app/notes/(index)/page.tsx", "/notes"],
    ["app/complex/browse/page.tsx", "/complex/browse"],
    ["app/town/news/(index)/page.tsx", "/town/news"],
    ["app/apply/page.tsx", "/apply"],
  ];
  for (const [f, path] of hubs) {
    const s = strip(read(f));
    assert.match(s, /<HubBreadcrumbLd trail=\{\[/, f);
    assert.ok(s.includes(`path: "${path}" }]} />`), `${f} 마지막 항목 ${path}`);
    assert.match(s, /import \{ HubBreadcrumbLd \} from "@\/app\/components\/seo\/HubBreadcrumbLd";/, f);
  }
  assert.doesNotMatch(strip(read("app/town/news/(index)/page.tsx")), /name: "동네이야기", path: "\/town" \}, \{ name: "부동산 뉴스/, "뉴스는 제 대분류(1044)");
});
