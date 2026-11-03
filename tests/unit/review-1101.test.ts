/* [1101] 소유자 2026-11-02 "뭐가 나아진 건지 모르겠어 · 다시 검토 · 1100 폐기" → "기능적 디자인적 복합적으로 검토" → 고른 네 방향 "진행해 줘".
 *  ① 첫 화면 재구성 + 같은 사실 한 번 — 홈 폰은 본문(공개 임장노트 · 지역 동향)이 AI 판보다 먼저 · 노트 폰 기본 목록 · 지도 첫 방문 모달 없음 ·
 *     지역 화면 큰 제목 줄(칸과 같은 수) 없음 · 요약 문단은 끝으로 · "시장 흐름 요약" 카드는 시세 흐름 카드 아래 줄로 ·
 *     단지 인용 요약은 표 아래 · 레일 "최근 실거래" 칸 없음 · 노트 상세 오른쪽 점수 카드(링 + 막대) 없음.
 *  ② 빈 동네 칸 접기 — 홈 동네이야기 0건 띠 없음 · 단지 거주민 후기 0건은 제목 옆 "0건" · 동네 허브 빈 피드는 한 줄 띠.
 *  ③ 조작 다이어트 — 노트 FAB · 스토리 줄 없음 · 지도 폰 아래 바 = 공통 탭바 · 동네 허브 바로가기 칩은 글이 있을 때만 ·
 *     뉴스룸 폰 지역 칩 한 줄 · 단지 비교 지역 칩 PC 도 한 줄.
 *  ④ 지역 화면 7벌 → 1벌 — 지역 분석 · 실거래 구간 · 전월세 · 시장 온도 · 동네 홈 · 월간 리포트가 같은 탭 줄(RegionTabs). */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { catalogIdForTxRegionName, regionTabs, REGION_TAB_LABEL } from "../../lib/region/region-tabs";

const read = (p: string) => readFileSync(p, "utf8");
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/(^|[^:"'`])\/\/[^\n]*/g, "$1");

test("지역 탭 — 여섯 화면 · 있는 화면만 · 실거래 구간 이름 → 카탈로그 id 거꾸로 대조", () => {
  const all = regionTabs({ id: "gangnam", txSlug: "서울 강남구", hasRent: true, hasTemperature: true });
  assert.deepEqual(all.map((t) => t.key), ["overview", "tx", "rent", "temperature", "town", "report"]);
  assert.deepEqual(all.map((t) => t.label), ["개요", "실거래 구간", "전월세", "시장 온도", "동네", "월간 리포트"]);
  assert.deepEqual(all.map((t) => t.href), [
    "/region/gangnam",
    `/tx/${encodeURIComponent("서울 강남구")}`,
    "/rent/gangnam",
    "/analysis/temperature/gangnam",
    "/town/gangnam",
    "/region/gangnam/report",
  ]);
  /* 없는 화면은 탭이 없다 — 빈 화면 · 404 로 보내지 않는다 */
  const thin = regionTabs({ id: "busan-haeundae", txSlug: null, hasRent: false, hasTemperature: false });
  assert.deepEqual(thin.map((t) => t.key), ["overview", "town", "report"]);
  assert.deepEqual(regionTabs({ id: " ", txSlug: null, hasRent: false, hasTemperature: false }), []);
  assert.equal(Object.keys(REGION_TAB_LABEL).length, 6);
  /* 실거래 표기("서울 강남구" · "고양 덕양구" · "평택시")에서 카탈로그 id 로 */
  assert.equal(catalogIdForTxRegionName("서울 강남구"), "gangnam");
  assert.equal(catalogIdForTxRegionName("고양 덕양구"), "goyang-deogyang");
  assert.equal(catalogIdForTxRegionName("평택시"), "pyeongtaek");
  assert.equal(catalogIdForTxRegionName("부산 해운대구"), "busan-haeundae");
  assert.equal(catalogIdForTxRegionName("원주시"), null, "카탈로그 밖 지역은 탭 줄 없음");
  assert.equal(catalogIdForTxRegionName(""), null);
});

test("지역 탭 — 여섯 화면이 같은 부품 · 같은 자리(머리 아래) · 지금 화면 표시 · 지역 분석 머리의 칩 셋은 탭으로 갔다", () => {
  const tabs = strip(read("app/components/region/RegionTabs.tsx"));
  assert.match(tabs, /<nav aria-label=\{`\$\{info\.name\} 지역 화면`\} className=\{`region-tabs news-tabs \$\{className\}`\.trim\(\)\}>/);
  assert.match(tabs, /aria-current="page"/);
  assert.match(tabs, /if \(tabs\.length < 2\) return null;/);
  assert.match(tabs, /hasTemperature: Boolean\(findTemperatureRegion\(info\.id\)\),/);
  const pages: [string, RegExp][] = [
    ["app/region/[id]/page.tsx", /<RegionTabs id=\{id\} current="overview" txSlug=\{txBandRegion\?\.slug \?\? null\}/],
    ["app/tx/[region]/page.tsx", /\{catalogId && <RegionTabs id=\{catalogId\} current="tx" txSlug=\{region\.slug\}/],
    ["app/rent/[region]/page.tsx", /<RegionTabs id=\{id\} current="rent"/],
    ["app/analysis/temperature/[region]/page.tsx", /<RegionTabs id=\{region\.id\} current="temperature"/],
    ["app/town/[region]/page.tsx", /<RegionTabs id=\{id\} current="town"/],
    ["app/region/[id]/report/page.tsx", /<RegionTabs id=\{id\} current="report"/],
  ];
  for (const [p, re] of pages) assert.match(strip(read(p)), re, p);
  const hero = strip(read("app/region/[id]/RegionHero.tsx"));
  assert.doesNotMatch(hero, /월간 리포트 ›|동네 홈 ›/, "머리 카드의 칩 셋 → 탭");
  assert.match(hero, /const showHeadline = tiles\.length === 0;/, "칸이 있으면 큰 제목 줄 없음");
  assert.match(hero, /foot=\{overview\.subline \? `\$\{overview\.subline\} · 부동산원` : `\$\{ymLong\(index\.ym\)\} · 부동산원`\}/, "1년 전 대비는 첫 칸 발로");
  const region = strip(read("app/region/[id]/page.tsx"));
  /* 요약 문단(speakable)은 본문 끝 · 시장 흐름 요약 카드는 시세 흐름 카드 아래 줄 */
  assert.ok(region.indexOf('id="ai-summary"') > region.indexOf('id="complexes"'), "요약 문단은 단지별 현황 뒤");
  assert.ok(region.indexOf('id="ai-summary"') < region.indexOf('<aside className="min-w-0">'), "본문 열 안");
  assert.doesNotMatch(region, /\{name\} 시장 흐름 요약/);
  assert.match(region, /<KeywordAlertButton scope="news" query=\{name\} label=\{`\$\{name\} 새 소식`\} \/>/);
});

test("첫 화면 · 같은 사실 한 번 — 홈 순서 · 노트 목록 기본 · 지도 모달 없음 · 단지 요약 위치 · 레일 · 노트 상세 점수 카드", () => {
  const home = strip(read("app/page.tsx"));
  assert.match(home, /<aside\s+data-autotrim=""\s+className="order-2 flex flex-col gap-3 lg:sticky lg:top-\[76px\] lg:self-start"/, "폰은 본문 뒤");
  assert.match(home, /<div data-autotrim="" className="order-1 flex flex-col gap-3 lg:gap-4">(\s|\{\})*<HomeMyRail \/>/, "내 관심은 본문 맨 위");
  assert.equal((home.match(/<HomeMyRail \/>/g) ?? []).length, 1);
  const feed = strip(read("app/notes/notes-feed-client.tsx"));
  assert.match(feed, /const \[view, setView\] = useState<ViewMode>\("table"\);/);
  assert.doesNotMatch(feed, /njn-fab|<StoryRail|function StoryRail/);
  const map = strip(read("app/map/map-client.tsx"));
  assert.doesNotMatch(map, /CoachmarkTour|MAP_TOUR_STEPS/);
  assert.match(map, /\{txType !== "rent" && showPriceOverlay \? MAP_PRICE_BASIS_SHORT : "범례"\} \{mobileLegendOpen \? "▾" : "▸"\}/);
  assert.match(map, /\{!infoComplex && <TabBar \/>\}/, "폰 아래 바 = 공통 탭바(단지 판 열린 동안은 숨김)");
  assert.match(map, /className="glass-strong absolute inset-x-0 z-40 mx-auto hidden w-fit max-w-\[calc\(100vw_-_24px\)\] items-center gap-0\.5 rounded-full p-1\.5 md:flex"/, "알약은 md+");
  assert.doesNotMatch(map, />\s*동네이야기\s*</, "알약 이름 = 헤더 메뉴(동네)");
  const cx = strip(read("app/complex/[id]/page.tsx"));
  assert.ok(cx.indexOf('data-ai-summary=""') > cx.indexOf("<RecentDealsTable"), "인용 요약은 표 아래");
  assert.doesNotMatch(cx, /key: "latest",/, "레일 최근 실거래 칸 없음");
  const note = strip(read("app/notes/[id]/(index)/page.tsx"));
  assert.doesNotMatch(note, /v\.scoreBars\.map|<ScoreRing score=\{v\.totalScore\} size=\{110\}/);
});

test("빈 동네 칸 · 조작 다이어트 — 홈 0건 띠 · 후기 0건 · 동네 빈 피드 한 줄 · 동네 바로가기 칩 · 뉴스룸 폰 칩 한 줄", () => {
  const town = strip(read("app/components/home/HomeTownBlock.tsx"));
  assert.doesNotMatch(town, /이웃이 쓴 이야기 없음/);
  assert.match(town, /이웃 글 불러오기 실패 · 잠시 후 다시/, "실패는 실패로");
  const rv = strip(read("app/complex/ComplexReviews.tsx"));
  assert.match(rv, /\{loadState === "ready" && reviews\.length === 0 && !formOpen && \(\s*<span className="ml-1\.5 t-sub font-medium text-text-3">0건<\/span>/);
  assert.doesNotMatch(rv, /거주민 후기 없음/);
  const lazy = strip(read("app/complex/[id]/ComplexReviewsLazy.tsx"));
  assert.doesNotMatch(lazy, /py-6/);
  const feed = strip(read("app/town/feed-client.tsx"));
  assert.match(feed, /<div className="rise-in-3 card flex flex-wrap items-center justify-between gap-x-3 gap-y-2 rounded-2xl px-4 py-3">/);
  assert.match(feed, /이 피드 · /);
  const hub = strip(read("app/town/page.tsx"));
  assert.match(hub, /\{cards\.length > 0 && \(\s*<div className="mb-4 flex items-center gap-2" data-reveal="">/);
  const news = strip(read("app/town/news/NewsListClient.tsx"));
  assert.equal((news.match(/scroll-x-hidden-bar rise-in mb-2 flex items-center gap-1\.5 max-md:-mx-3\.5 max-md:flex-nowrap max-md:overflow-x-auto max-md:px-3\.5 md:flex-wrap \[&>\*\]:shrink-0/g) ?? []).length, 2);
  /* 1100 은 폐기 — 그 흔적 없음 */
  assert.equal(read("app/globals.css").indexOf("[1100 · 간결]"), -1);
});
