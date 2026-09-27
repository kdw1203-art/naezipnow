import { strict as assert } from "node:assert";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { isStoryPost, newsHref, postHref, storyHref } from "../../lib/town/post-href.ts";
import { marketFreshnessCaption, REPORT_LAG_DAYS } from "../../lib/newui/freshness-caption.ts";
import {
  buildComplexFacts,
  buildSummaryFragments,
  buildSummaryLine,
  summaryFragmentList,
  summarizeRents,
  summarizeTrades,
  computeJeonseRatio,
  type ComplexFactsRow,
  type RentSample,
  type TradeSample,
} from "../../lib/complex/complex-facts.ts";
import { buildComplexCitableSummary } from "../../lib/seo/citable-summary.ts";
import {
  EVENT_NEWSLETTER_OPT_IN,
  EVENT_NOTE_SAVED,
  trackNewsletterOptIn,
  trackNoteSaved,
} from "../../lib/analytics/events.ts";
import { TOWN_CATEGORY_LINKS } from "../../lib/town/category-links.ts";
import { NAV } from "../../app/components/nav-data.ts";

/* [1007 · P2] 제품 UX 후속 — 순수 규칙(글 주소·신선도 캡션·요약 조각·GA4 이벤트)과
   화면 배선(검색·다이제스트·알림·홈·허브·404)의 사실을 잠근다. server-only 모듈은 소스
   문자열로만 검사한다. */

const ROOT = path.resolve(process.cwd());
const read = (p: string) => readFileSync(path.join(ROOT, p), "utf8");

/* ---------- 2. 글 주소 — 사람 글은 /town/story/, 기사는 /town/news/ ---------- */

test("postHref — isAutomated 가 true 일 때만 뉴스, 나머지(undefined·false·null)는 이야기", () => {
  assert.equal(postHref({ id: "a1", isAutomated: true }), "/town/news/a1");
  assert.equal(postHref({ id: "a1", isAutomated: false }), "/town/story/a1");
  assert.equal(postHref({ id: "a1" }), "/town/story/a1");
  assert.equal(postHref({ id: "a1", isAutomated: null }), "/town/story/a1");
  assert.equal(isStoryPost({ isAutomated: true }), false);
  assert.equal(isStoryPost({}), true);
  /* id 는 URL 조각으로 인코딩된다 — 슬래시·공백이 경로를 깨지 않는다 */
  assert.equal(storyHref("a b/c"), "/town/story/a%20b%2Fc");
  assert.equal(newsHref("x"), "/town/news/x");
});

test("lib/town/story.ts 의 isStoryPost 는 post-href 의 것을 다시 내보낸다(판정 한 곳)", () => {
  const src = read("lib/town/story.ts");
  assert.match(src, /export \{ isStoryPost \} from "@\/lib\/town\/post-href"/);
  assert.doesNotMatch(src, /export function isStoryPost/);
});

test("이웃 글 링크를 만드는 화면들이 /town/news/${id} 대신 postHref·storyHref 를 쓴다", () => {
  const sites: Array<[file: string, must: RegExp]> = [
    ["lib/notifications/comment-notify.ts", /postHref\(post\)/],
    ["app/admin/community/page.tsx", /storyHref\(p\.id\)/],
    ["app/digest/page.tsx", /storyHref\(t\.id\)/],
    ["app/digest/[week]/page.tsx", /storyHref\(item\.id\)/],
    ["app/town/prompt/[idx]/page.tsx", /postHref\(p\)/],
    ["app/support/page.tsx", /href: postHref\(p\)/],
    ["app/redevelopment/page.tsx", /postHref\(n\)/],
    ["app/api/search/route.ts", /url: postHref\(p\)/],
    ["app/search/search-client.tsx", /storyHref\(id\)/],
  ];
  for (const [file, must] of sites) {
    const src = read(file);
    assert.match(src, must, file);
    assert.doesNotMatch(src, /href=\{`\/town\/news\/\$\{/, `${file}: 옛 뉴스 주소 템플릿이 남아 있다`);
  }
  /* 시드 답글 API 는 이야기 상세 ISR 도 갱신한다 */
  assert.match(read("app/api/admin/community/seed-reply/route.ts"), /revalidatePath\(`\/town\/story\/\$\{postId\}`\)/);
});

/* ---------- 3. 통합 검색 — 이야기·뉴스 분리 ---------- */

test("통합 검색 API — stories 그룹이 따로 있고, 뉴스는 is_automated 로 가른다(중첩 댓글 count 없음)", () => {
  const src = read("app/api/search/unified/route.ts");
  assert.match(src, /stories: UnifiedStory\[\]/);
  assert.match(src, /isStoryPost\(\{ isAutomated: p\.is_automated === true \}\)/);
  assert.match(src, /\.from\("posts"\)/, "이웃 글의 주 소스(posts 표)를 검색한다");
  assert.doesNotMatch(src, /board_comments\(count\)/, "pg_stat 상위(229ms×21k)였던 중첩 count 를 검색이 밟지 않는다");
  assert.match(src, /stories\.failed \? "이야기" : null/);
  assert.match(src, /failed\.length === 5/);
});

test("검색 화면 — 이야기는 .story-card, 뉴스는 .news-row, 필터에 두 그룹이 따로 선다", () => {
  const src = read("app/search/search-client.tsx");
  assert.match(src, /key: "stories",\s*label: "이야기"/);
  assert.match(src, /key: "news",\s*label: "뉴스"/);
  assert.match(src, /className=\{`story-card tile/);
  assert.match(src, /className=\{`news-row min-h-10/);
  assert.match(src, /aria-pressed=\{filter === t\.key\}/);
  assert.match(src, /min-h-10/, "필터 칩은 40px");
});

/* ---------- 1. 홈 — 동네이야기·뉴스룸 블록(1006 재질 규칙) ---------- */

test("홈 — HomeTownBlock 이 .story-card / .news-strip 재질을 쓰고 클라이언트 JS 가 없다", () => {
  const block = read("app/components/home/HomeTownBlock.tsx");
  assert.doesNotMatch(block, /"use client"/);
  assert.match(block, /story-card/);
  assert.match(block, /story-avatar/);
  assert.match(block, /news-strip__item/);
  assert.match(block, /storyHref\(p\.id\)/);
  assert.match(block, /newsHref\(n\.id\)/);
  /* 0건·실패를 다르게 말한다 */
  assert.match(block, /이웃 글을 지금 불러오지 못했어요/);
  assert.match(block, /아직 이웃이 쓴 이야기가 없어요/);
  const page = read("app/page.tsx");
  assert.match(page, /<HomeTownBlock stories=\{data\.stories\} news=\{data\.news\} failed=\{failed\.town\}/);
  const data = read("lib/newui/home-data.ts");
  assert.match(data, /isStoryPost\(p\) && p\.visibility !== "link_only"/);
  assert.match(data, /storyCandidates\.length > 0\s*\? await listHiddenPostIds/);
});

/* ---------- 4. 실거래 신선도 한 줄 ---------- */

test("marketFreshnessCaption — 'YYYY.MM.DD' → ISO 날짜 + 신고 지연 30일. 형식이 아니면 null", () => {
  assert.equal(
    marketFreshnessCaption("2026.09.19"),
    `실거래 마지막 반영 2026-09-19 · 신고 지연 최대 ${REPORT_LAG_DAYS}일`,
  );
  assert.equal(REPORT_LAG_DAYS, 30);
  assert.equal(marketFreshnessCaption("2026.02.31"), null);
  assert.equal(marketFreshnessCaption(null), null);
  assert.equal(marketFreshnessCaption(""), null);
  /* 두 허브가 같은 조각을 쓴다 */
  assert.match(read("app/region/[id]/page.tsx"), /<MarketFreshnessLine label=\{freshness\}/);
  assert.match(read("app/complex/[id]/page.tsx"), /<MarketFreshnessLine label=\{freshness\}/);
  assert.doesNotMatch(read("app/complex/[id]/page.tsx"), /실거래 기준: \{freshness\}/);
});

/* ---------- 5. 요약 조각 — 패널 한 줄과 허브 인용 요약이 같은 숫자 ---------- */

const NOW = "202609";
const EOK = 100_000_000;
const FULL: ComplexFactsRow = {
  build_year: 2018,
  households: 9510,
  building_count: 84,
  parking_count: 13000,
  parking_per_hh: 1.37,
  builder_name: "현대건설",
  heating: "지역난방",
  road_address: "서울 송파구 송파대로 345",
  kapt_code: "A13520001",
};
function trades(spec: Array<[string, number, number?]>): TradeSample[] {
  return spec.map(([ym, eok, area]) => ({ ym, amountKrw: Math.round(eok * EOK), areaM2: area ?? 84 }));
}
function jeonse(spec: Array<[string, number]>): RentSample[] {
  return spec.map(([ym, eok]) => ({ ym, depositKrw: Math.round(eok * EOK), monthlyKrw: 0 }));
}

test("buildSummaryFragments — summaryLine 은 조각을 ' · ' 로 이은 것과 글자 하나까지 같다", () => {
  const t = trades([["202609", 31], ["202608", 30.9], ["202607", 30]]);
  const j = jeonse([["202609", 12.1], ["202608", 12], ["202606", 12.3]]);
  const facts = buildComplexFacts({ complex: FULL, trades: t, rents: j, notes: { count: 2, latest: null }, nowYm: NOW });
  assert.deepEqual(facts.summaryFragments, {
    buildYear: "2018년 준공",
    households: "9,510세대",
    trades: "최근 12개월 매매 3건, 60~85㎡ 중앙 30.9억",
    jeonse: "전세 중앙 12.1억",
    jeonseRatio: "전세가율 39.2%(6개월)",
  });
  assert.equal(summaryFragmentList(facts.summaryFragments).join(" · "), facts.summaryLine);
  /* 옛 계약(buildSummaryLine)도 같은 조각을 잇는다 */
  const ts = summarizeTrades(t, NOW);
  const rs = summarizeRents(j, NOW);
  const { ratio } = computeJeonseRatio(t, j, NOW);
  const input = { complex: FULL, tradeSummary: ts, rentSummary: rs, jeonseRatio: ratio };
  assert.equal(buildSummaryLine(input), summaryFragmentList(buildSummaryFragments(input)).join(" · "));
  /* 아무것도 없으면 빈 조각·null 한 줄 */
  const none = buildComplexFacts({ complex: null, trades: null, rents: null, notes: null, nowYm: NOW });
  assert.deepEqual(none.summaryFragments, {});
  assert.equal(none.summaryLine, null);
});

test("buildComplexCitableSummary — fragments 를 주면 2~4번째 문장이 그 조각으로 만들어진다", () => {
  const t = trades([["202609", 31], ["202608", 30.9], ["202607", 30]]);
  const j = jeonse([["202609", 12.1], ["202608", 12], ["202606", 12.3]]);
  const facts = buildComplexFacts({ complex: FULL, trades: t, rents: j, notes: null, nowYm: NOW });
  const s = buildComplexCitableSummary({
    name: "헬리오시티",
    regionLabel: "서울 송파구",
    emd: "가락동",
    latestYm: "202609",
    latestAvgManwon: 310_000,
    latestDealCount: 1,
    /* 옛 입력은 무시된다 — 조각이 이긴다 */
    deals12m: 999,
    households: 1,
    buildYear: 1900,
    fragments: facts.summaryFragments,
  });
  assert.ok(s);
  assert.equal(s.sentences.length, 4);
  assert.match(s.sentences[0], /^서울 송파구 가락동 헬리오시티의 2026년 9월 아파트 매매 실거래 평균은 31억입니다\(해당 월 신고 1건/);
  assert.match(s.sentences[1], /최근 12개월 매매 3건, 60~85㎡ 중앙 30\.9억/);
  assert.match(s.sentences[2], /전세 중앙 12\.1억 · 전세가율 39\.2%\(6개월\)/);
  assert.match(s.sentences[2], /각 표본 3건 이상일 때만/);
  assert.match(s.sentences[3], /헬리오시티는 9,510세대, 2018년 준공 단지입니다/);
  assert.doesNotMatch(s.text, /999|undefined|null|NaN/);

  /* 조각이 비면(실거래 창·대장 없음) 첫 문장만 — 껍데기 문장 없음 */
  const bare = buildComplexCitableSummary({
    name: "A",
    regionLabel: "서울",
    latestYm: "202601",
    latestAvgManwon: 98_000,
    fragments: {},
  });
  assert.ok(bare);
  assert.equal(bare.sentences.length, 1);

  /* fragments 없이 부르면(옛 호출) 예전 문장 그대로 */
  const legacy = buildComplexCitableSummary({
    name: "잠실엘스",
    regionLabel: "서울 송파구",
    latestYm: "202608",
    latestAvgManwon: 245_000,
    deals12m: 120,
    households: 5678,
    buildYear: 2008,
  });
  assert.ok(legacy);
  assert.match(legacy.sentences[1], /최근 12개월.*120건/);
  assert.match(legacy.sentences[2], /총 5,678세대, 2008년 준공/);
});

test("단지 허브 — buildComplexFacts 재료를 이미 띄운 로더로 채우고, 인용 요약에 같은 조각을 넘긴다", () => {
  const src = read("app/complex/[id]/page.tsx");
  assert.match(src, /fragments: facts\.summaryFragments/);
  assert.match(src, /<ComplexFactsCard facts=\{facts\} noteHref=\{noteHref\} \/>/);
  assert.match(src, /loadRentHistory\(region, args\.name\)/, "전월세 원표본은 ComplexRentSection 과 같은 로더·같은 인자");
  assert.match(src, /loadHubInspectionNotes\(args\.complexId, args\.name\)/, "임장노트도 같은 로더·같은 인자");
  assert.match(src, /getTradeWindowSamples/, "매매 원표본 창은 패널(detail API)과 같은 로더");
  /* section-loaders.ts(V2b 소유)는 건드리지 않는다 — 새 export 를 요구하지 않는다 */
  const loaders = read("app/complex/[id]/section-loaders.ts");
  for (const name of ["loadRentHistory", "loadHubInspectionNotes", "withSectionBudget", "sectionRegionLabel"]) {
    assert.match(loaders, new RegExp(`export (const|function) ${name}`), name);
  }
  const card = read("app/complex/[id]/ComplexFactsCard.tsx");
  assert.match(card, /아직 계산하지 않아요/);
  assert.match(card, /facts\.jeonseRatioReason/);
  assert.doesNotMatch(card, /시세/);
});

/* ---------- 6. JSON-LD 발행 주체 참조 ---------- */

test("노트 Article.publisher · /developers WebAPI.provider 가 전역 Organization 참조를 쓴다", () => {
  const note = read("app/notes/[id]/page.tsx");
  assert.match(note, /publisher: publisherRef\(\)/);
  assert.doesNotMatch(note, /publisher: \{\s*"@type": "Organization"/);
  const dev = read("app/developers/page.tsx");
  assert.match(dev, /provider: publisherRef\(\)/);
  assert.doesNotMatch(dev, /provider: \{ "@type": "Organization"/);
});

/* ---------- 7. GA4 이벤트 — 동의 게이트 뒤에서만 ---------- */

test("trackNoteSaved / trackNewsletterOptIn — gtag 가 없으면 요청 0, 있으면 범주값만 싣는다", () => {
  const calls: unknown[][] = [];
  const win = { gtag: (...args: unknown[]) => calls.push(args) };
  assert.equal(trackNoteSaved({ mode: "create", quick: true, photoCount: 5, visibility: "public" }, win), true);
  assert.deepEqual(calls[0], [
    "event",
    EVENT_NOTE_SAVED,
    { note_mode: "create", quick_mode: "1", photo_bucket: "4+", note_visibility: "public" },
  ]);
  assert.equal(trackNoteSaved({ mode: "edit", photoCount: 2 }, win), true);
  assert.deepEqual(calls[1], ["event", EVENT_NOTE_SAVED, { note_mode: "edit", quick_mode: "0", photo_bucket: "1-3" }]);
  assert.equal(trackNewsletterOptIn("settings", win), true);
  assert.deepEqual(calls[2], ["event", EVENT_NEWSLETTER_OPT_IN, { opt_in_source: "settings" }]);
  /* 동의 전(gtag 없음) — 아무것도 보내지 않고 false */
  assert.equal(trackNoteSaved({ mode: "create" }, {}), false);
  assert.equal(trackNewsletterOptIn("settings", {}), false);
  /* gtag 가 던져도 호출부 흐름을 막지 않는다 */
  assert.equal(trackNoteSaved({ mode: "create" }, { gtag: () => { throw new Error("x"); } }), false);
  assert.equal(calls.length, 3);
  /* 설정 화면은 켤 때만 보낸다 */
  assert.match(read("app/my/settings/SettingsClient.tsx"), /if \(next\) trackNewsletterOptIn\("settings"\)/);
});

/* ---------- 8. 404 — 검색창·인기 경로·정적 ---------- */

test("404 — JS 없는 검색 폼(/search?q=)·인기 경로 5곳·홈 링크, dynamic API 없음, 라벨은 목적지 그대로", () => {
  const src = read("app/not-found.tsx");
  assert.match(src, /<form\s+action="\/search"\s+method="get"/);
  assert.match(src, /name="q"/);
  for (const href of ["/", "/map", "/complex/browse", "/tx", "/town/news", "/town", "/notes"]) {
    assert.ok(src.includes(`"${href}"`), `404 에 ${href} 링크`);
  }
  /* 주석은 코드가 아니다 — 주석을 지운 소스로 dynamic API 사용 여부를 본다 */
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "");
  assert.doesNotMatch(code, /cookies\(|headers\(|searchParams|"use client"/);
  assert.doesNotMatch(code, /실거래 시세|내 임장노트/, "시세 표현·잘못된 라벨이 남아 있다");
  assert.match(src, /뉴스룸/);
  /* 칩·버튼은 40px */
  assert.match(src, /min-h-10 items-center rounded-full/);
});

/* ---------- 9. 뉴스룸 라벨 통일 ---------- */

test("뉴스룸 — 카테고리 카드·GNB·하위 화면 링크의 라벨이 '뉴스룸'이고 목적지는 /town/news 하나", () => {
  const news = TOWN_CATEGORY_LINKS.find((l) => l.href === "/town/news");
  assert.ok(news);
  assert.equal(news.label, "뉴스룸");
  const town = NAV.find((g) => g.label === "동네");
  assert.equal(town?.children?.find((c) => c.href === "/town/news")?.label, "뉴스룸");
  assert.match(read("app/redevelopment/page.tsx"), /뉴스룸 전체 ›/);
  assert.match(read("app/digest/page.tsx"), /뉴스룸 전체 ›/);
  assert.doesNotMatch(read("app/redevelopment/page.tsx"), /전체 뉴스 ›/);
  /* 공지(비자동 글)는 뉴스룸에 없으므로 고객지원의 "전체" 는 동네이야기로 */
  assert.match(read("app/support/page.tsx"), /href="\/town" className="inline-block py-\[5px\] t-sub font-bold text-primary no-underline">\s*동네이야기에서 전체 ›/);
});
