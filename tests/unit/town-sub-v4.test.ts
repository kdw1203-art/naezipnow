import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/* [v4] 동네이야기 하위 화면 · 뉴스룸 "한 화면 한 가지" 전체 적용 — 소유자 "응 다 진행해줘"(시안 3개 승인 뒤).
 *
 * 허브(/town — tests/unit/town-v4.test.ts)와 같은 규칙을 하위 화면에 잠근다:
 *  네이비 히어로·워터마크 → 흰 머리(제목 한 줄 + 사실 한 줄) · 하우스 광고 제거 · 가운데 한 줄 760px(정비사업 지도만 1080px —
 *  지도 예외) · 사이드바 없음 · 같은 사실을 세 번 보이던 카드/표 → 1px 선 행 한 목록 · 출처·설명은 맨 끝 "데이터 출처" 접힘 ·
 *  AI 결과가 아닌 곳의 네이비 패널(ai-panel · AIPanel) 금지. 기능(필터·더 보기·링크)은 자리만 옮겼는지 함께 본다. */

const read = (p: string): string => readFileSync(p, "utf8");
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, (m) => m.replace(/[^\n]/g, " "));
}
const code = (p: string) => stripComments(read(p));

const PAGES_760 = [
  "app/town/news/page.tsx",
  "app/town/news/[id]/page.tsx",
  "app/town/news/tag/[tag]/page.tsx",
  "app/town/[region]/page.tsx",
  "app/town/story/[id]/page.tsx",
  "app/apply/page.tsx",
  "app/apply/calendar/page.tsx",
  "app/apply/calendar/[week]/page.tsx",
  "app/auctions/page.tsx",
  "app/supply/page.tsx",
  "app/digest/page.tsx",
  "app/digest/[week]/page.tsx",
  "app/digest/archive/page.tsx",
];

test("[v4] 하위 화면 — 가운데 한 줄 760px · 하우스 광고 · 오른쪽 사이드바 없음", () => {
  for (const p of PAGES_760) {
    const c = code(p);
    assert.match(c, /max-w-\[760px\]/, `${p} 가운데 한 줄`);
    assert.doesNotMatch(c, /AdZone|AdSlot/, `${p} 하우스 광고(규칙 9)`);
    assert.doesNotMatch(c, /lg:grid-cols-\[minmax\(0,1fr\)_340px\]/, `${p} 사이드바 없음(규칙 12)`);
  }
  /* 정비사업 지도만 1080px — 주인공이 지도라 예외(글 섹션은 그 안에서 760px) */
  const redev = code("app/redevelopment/page.tsx");
  assert.match(redev, /max-w-\[1080px\]/);
  assert.match(redev, /max-w-\[760px\]/);
});

test("[v4] 머리 — TownHero 는 흰 머리(네이비·워터마크·아이콘 칩 없음), 하위 화면 다섯 곳이 같은 머리를 쓴다", () => {
  const hero = code("app/town/TownHero.tsx");
  assert.doesNotMatch(hero, /brand-navy-card|BrandWatermark|on-dark|<Icon /);
  assert.match(hero, /export function TownSources/, "맨 끝 데이터 출처 접힘");
  for (const [p, href] of [
    ["app/town/news/page.tsx", "/town/news"],
    ["app/apply/page.tsx", "/apply"],
    ["app/auctions/page.tsx", "/auctions"],
    ["app/supply/page.tsx", "/supply"],
    ["app/redevelopment/page.tsx", "/redevelopment"],
  ] as const) {
    assert.match(code(p), new RegExp(`<TownHero\\s+href="${href.replace(/\//g, "\\/")}"`), p);
    assert.match(code(p), /<TownCategoryNav stick \/>/, `${p} 카테고리 밑줄 탭`);
    assert.match(code(p), /<TownSources>/, `${p} 출처는 맨 끝 한 곳`);
  }
});

test("[v4 → 1013] 뉴스룸 — 기사 행은 72px 썸네일 + 제목 + 메타 한 줄, 요약·배지 없음, 필터·더 보기는 그대로", () => {
  const list = code("app/town/news/NewsListClient.tsx");
  /* [1013] 주인님 "뉴스는 이미지 파일이 있어야" — 썸네일은 모든 행 같은 칸(NewsThumb)으로 돌아왔다. 요약·배지는 여전히 없다. */
  assert.doesNotMatch(list, /line-clamp|news-row__summary|news-tag|RelatedFold/);
  assert.match(list, /<NewsThumb src=\{row\.image\} source=\{row\.source\} priority=\{first\} \/>/, "모든 행 썸네일 칸");
  const thumb = code("app/town/news/NewsThumb.tsx");
  assert.match(thumb, /h-\[72px\] w-\[72px\] shrink-0/, "행 높이가 같게 고정 칸");
  assert.match(thumb, /fallback=\{fallback\}/, "사진이 깨지면 같은 칸에 매체 이름");
  assert.doesNotMatch(thumb, /_next\/image|referrerPolicy/, "매체 사진은 복사·변환하지 않고, 매체의 핫링크 차단도 우회하지 않는다");
  /* [v4.1 · 리퀴드 목록] 묶음 톤(data-tone)은 붙어도 된다 — 행 구조는 그대로 */
  assert.match(list, /<ul (?:data-tone="[a-z]+" )?className="mt-1 divide-y divide-line">/);
  assert.match(list, /rail-x/, "지역 칩은 한 줄 가로 스크롤");
  assert.match(list, /\/api\/town\/news\?offset=/, "더 보기 유지");
  assert.match(list, /pushParamUrl\(\{ region: r\.label \}\)/, "지역 필터 URL 유지");
  assert.match(list, /className="news-ext shrink-0"/, "원문 ↗ 유지");
  const page = code("app/town/news/page.tsx");
  assert.doesNotMatch(page, /ai-panel|btn-primary|newsroom-masthead/);
  assert.match(page, /href="\/digest"/, "주간 다이제스트 행");
  assert.match(page, /<NewsAlertSubscribe \/>/, "키워드 알림 유지");
  assert.match(page, /\/town\/news\/tag\/\$\{t\.slug\}/, "주제 허브 링크 유지");
});

test("[v4] 뉴스 상세 · 이야기 상세 — 한 줄 레이아웃, AI 요약만 AI 패널, 원문 링크는 한 곳", () => {
  const news = code("app/town/news/[id]/page.tsx");
  assert.equal((news.match(/<AIPanel /g) ?? []).length, 1, "AI 패널은 요약 파이프라인 결과(핵심 요약) 하나");
  assert.doesNotMatch(news, /legacySummary|3줄 요약/, "AI 가 아닌 3줄 요약 패널 없음");
  assert.equal((news.match(/href=\{post\.sourceUrl\}/g) ?? []).length, 1, "원문 링크 한 곳");
  assert.match(news, /permanentRedirect\(`\/town\/story\/\$\{uuid\}`\)/);
  assert.match(news, /<ReportButton postId=\{post\.id\} \/>/);
  const story = code("app/town/story/[id]/page.tsx");
  assert.doesNotMatch(story, /story-card|story-avatar|story-kind|btn-primary/);
  assert.match(story, /<CommentThread/);
  assert.match(story, /<CommentForm postId=\{post\.id\} \/>/);
  assert.match(story, /<LikeButton/);
  assert.match(story, /id="comments"/, "댓글 알림 착지점 유지");
});

test("[v4] 동네 홈 — 뉴스는 한 행, 채움 파랑 없음, 목록은 1px 선 행", () => {
  const c = code("app/town/[region]/page.tsx");
  assert.match(c, /<TownNewsStrip rows=\{newsRows\}/);
  assert.doesNotMatch(c, /btn-primary|story-card|story-kind|news-tag|Lab 데이터|직접방문/);
  assert.match(c, /<KeywordAlertButton scope="news"/, "새 소식 알림 유지");
  assert.match(c, /href=\{`\/region\/\$\{id\}`\}/, "시장 데이터 링크 유지");
  assert.match(c, /\/map\?region=/, "지도 링크 유지");
});

test("[v4] 청약·공매·입주 — 같은 사실을 세 번 보이던 카드/표 → 한 목록, 네이비 패널·요약 타일 없음", () => {
  const apply = code("app/apply/ApplySearchClient.tsx");
  assert.doesNotMatch(apply, /function Tile|bg-brand-navy/);
  assert.equal((apply.match(/btn-primary/g) ?? []).length, 1, "채움 파랑은 [공고 검색] 하나");
  assert.match(apply, /\/api\/applyhome\/search\?/, "검색·탭·더 보기 유지");
  const auctions = code("app/auctions/AuctionsClient.tsx");
  assert.doesNotMatch(auctions, /AIPanel|imminent|ongoing|adSlot/);
  assert.match(auctions, /set\(\{ gu: f\.gu === g\.name \? null : g\.name \}\)/, "지역 필터는 칩으로 옮겼다");
  assert.match(auctions, /setRowCap\(\(n\) => n \+ 48\)/, "더 보기 유지");
  const supply = code("app/supply/SupplyClient.tsx");
  assert.doesNotMatch(supply, /AIPanel|kpi-row|regionsOpen|adSlot/);
  assert.match(supply, /selectRegion\(on \? null : r\.region\)/, "지역 필터는 칩으로 옮겼다");
  assert.match(supply, /<Bars/, "월별 막대 유지");
});

test("[v4] 정비사업 — 지도 유지 · 보기 탭은 밑줄(채움 파랑 없음) · 목록은 행", () => {
  const map = code("app/redevelopment/RedevelopmentMap.tsx");
  assert.match(map, /<NaverMap/, "지도 그대로");
  assert.match(map, /onMarkerClick=\{handleMarkerClick\}/);
  assert.doesNotMatch(map, /bg-primary text-white|DataSourceCard|grid-cols-1 gap-2 sm:grid-cols-2/);
  assert.match(map, /border-b-2 pb-2\.5 pt-2 t-body font-bold/, "보기 방식 = 밑줄 탭");
  assert.match(code("app/redevelopment/page.tsx"), /<DataSourceCard sources=\{SEED_SOURCES\} \/>/, "데이터 출처는 맨 끝 접힘 안");
});

test("[v4] 다이제스트 — 푸시 미리보기 카드·섹션 카드 없음, 행 목록, FAQ·첫 문단은 접힘 안에 남는다", () => {
  const d = code("app/digest/page.tsx");
  assert.doesNotMatch(d, /HouseMark|rounded-2xl/);
  assert.match(d, /divide-y divide-line/);
  const w = code("app/digest/[week]/page.tsx");
  assert.match(w, /\{leadSentence\}/, "G12 첫 문단 유지");
  assert.match(w, /faqJsonLd\(faq\)/, "FAQPage JSON-LD 는 보이는 FAQ 와 같은 배열");
  assert.doesNotMatch(w, /<QaBlock|className="card/);
});
