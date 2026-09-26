import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildNewsRows,
  countTodayKst,
  isNewsPost,
  newsCategoryTabs,
  newsSummaryOf,
  NEWS_LIST_FIRST_PAGE,
  pageNewsRows,
} from "../../lib/town/news-list.ts";
import {
  newsArticleJsonLd,
  publisherOrganization,
  withNewsArticleDefaults,
} from "../../lib/town/news-jsonld.ts";
import { TOWN_CATEGORY_LINKS } from "../../lib/town/category-links.ts";
import { NAV } from "../../app/components/nav-data.ts";
import type { Post } from "../../lib/types/post.ts";

/* [1006] 동네이야기(사람의 기록) vs 뉴스룸(자동수집 기사) — 순수 조립기·구조화 데이터·
   내비 순서의 사실을 잠근다. lib/town/feed.ts(postToCard) 는 server-only 모듈을 끌고
   들어와 여기서 import 하지 못한다 — href 규칙은 아래 소스 문자열 검사로 대신 잠근다. */

function post(over: Partial<Post> & { id: string }): Post {
  return {
    authorLabel: "이웃",
    category: "부동산",
    city: "서울",
    district: "",
    title: "제목",
    body: "",
    tags: [],
    createdAt: "2026-09-19T00:00:00.000Z",
    updatedAt: "2026-09-19T00:00:00.000Z",
    likeCount: 0,
    commentCount: 0,
    viewCount: 0,
    comments: [],
    ...over,
  };
}

const NOW = Date.parse("2026-09-20T03:00:00.000Z"); // KST 2026-09-20 12:00

test("isNewsPost — 자동수집만 뉴스다. 사람 글은 분류가 '부동산 뉴스'여도 이야기", () => {
  assert.equal(isNewsPost(post({ id: "a", isAutomated: true })), true);
  assert.equal(isNewsPost(post({ id: "b", category: "부동산 뉴스", title: "뉴스 이야기" })), false);
  assert.equal(isNewsPost(post({ id: "c" })), false);
});

test("newsSummaryOf — meta_description → summary 첫 문장 → 본문. 제목뿐이면 null", () => {
  const withMeta = post({
    id: "a",
    isAutomated: true,
    body: "본문입니다.",
    automationMeta: { seo: { meta_description: "  메타 설명  ", summary: "요약 첫 문장. 둘째 문장." } },
  });
  assert.equal(newsSummaryOf(withMeta), "메타 설명");
  const withSummary = post({
    id: "b",
    isAutomated: true,
    automationMeta: { seo: { summary: "요약 첫 문장. 둘째 문장." } },
  });
  assert.equal(newsSummaryOf(withSummary), "요약 첫 문장.");
  const titleOnly = post({ id: "c", isAutomated: true, title: "같은 문장", body: " 같은 문장 " });
  assert.equal(newsSummaryOf(titleOnly), null);
  const long = post({ id: "d", isAutomated: true, body: "가".repeat(200) });
  const s = newsSummaryOf(long);
  assert.ok(s && s.length <= 110 && s.endsWith("…"), "110자에서 자르고 말줄임");
});

test("buildNewsRows — 뉴스만, 최신순, 같은 사건은 관련 보도로 접힌다. 이미지는 있을 때만", () => {
  const rows = buildNewsRows(
    [
      post({ id: "story", title: "이웃이 쓴 글", body: "사람 글" }),
      post({
        id: "n1",
        isAutomated: true,
        title: "9·7 공급대책 발표, 수도권 13만 가구",
        sourceName: "A일보",
        sourceUrl: "https://a.example.com/1",
        sourcePublishedAt: "2026-09-19T01:00:00.000Z",
        automationMeta: { ogImage: "https://img.example.com/1.jpg" },
      }),
      post({
        id: "n2",
        isAutomated: true,
        title: "9·7 공급대책 발표에 수도권 13만 가구",
        sourceName: "B신문",
        sourceUrl: "https://b.example.com/2",
        sourcePublishedAt: "2026-09-19T02:00:00.000Z",
      }),
      post({
        id: "n3",
        isAutomated: true,
        title: "완전히 다른 주제의 경제 기사입니다",
        category: "경제",
        sourceName: "C경제",
        sourcePublishedAt: "2026-09-18T00:00:00.000Z",
      }),
    ],
    NOW,
  );
  assert.deepEqual(
    rows.map((r) => r.id),
    ["n2", "n3"],
    "사람 글 제외 · 최신(n2)이 대표 · n1 은 n2 안에 접힘",
  );
  assert.equal(rows[0].related.length, 1);
  assert.equal(rows[0].related[0].id, "n1");
  assert.equal(rows[0].image, null, "대표(n2)에는 이미지가 없다 — <img> 를 그리지 않는다");
  assert.equal(rows[0].sourceUrl, "https://b.example.com/2");
  assert.equal(rows[0].host, "b.example.com");
  assert.equal(rows[0].source, "B신문");
  assert.equal(rows[0].publishedAt, "2026-09-19T02:00:00.000Z");
  assert.equal(rows[1].category, "경제");
  assert.equal(rows[1].sourceUrl, null);
});

test("pageNewsRows — 오프셋 페이지와 hasMore·total", () => {
  const titles = [
    "서울 아파트 전세가율 두 달 연속 상승",
    "금리 인하 기대에 주담대 신청 급증",
    "재건축 안전진단 기준 완화안 국회 통과",
    "인천 검단 입주 물량 하반기 집중",
    "청약 경쟁률 세 자릿수 단지 속출",
    "공매 낙찰가율 80% 회복",
    "정비사업 조합 설립 인가 12곳 추가",
  ];
  const rows = buildNewsRows(
    titles.map((title, i) =>
      post({
        id: `n${i}`,
        isAutomated: true,
        title,
        sourcePublishedAt: new Date(Date.parse("2026-09-01T00:00:00Z") + i * 86_400_000).toISOString(),
      }),
    ),
    NOW,
  );
  assert.equal(rows.length, 7);
  const p1 = pageNewsRows(rows, 0, 3);
  assert.equal(p1.items.length, 3);
  assert.equal(p1.hasMore, true);
  assert.equal(p1.total, 7);
  const p3 = pageNewsRows(rows, 6, 3);
  assert.equal(p3.items.length, 1);
  assert.equal(p3.hasMore, false);
  assert.equal(pageNewsRows(rows, 99, 3).items.length, 0);
  assert.ok(NEWS_LIST_FIRST_PAGE > 0);
});

test("newsCategoryTabs · countTodayKst — 건수순 탭, 한국 날짜 기준 오늘", () => {
  const rows = buildNewsRows(
    [
      post({ id: "a", isAutomated: true, title: "부동산 기사 하나 첫째", category: "부동산", sourcePublishedAt: "2026-09-19T20:00:00.000Z" }),
      post({ id: "b", isAutomated: true, title: "경제 기사 둘째 다른 것", category: "경제", sourcePublishedAt: "2026-09-19T10:00:00.000Z" }),
      post({ id: "c", isAutomated: true, title: "부동산 기사 셋째 전혀 다른", category: "부동산", sourcePublishedAt: "2026-09-18T10:00:00.000Z" }),
    ],
    NOW,
  );
  assert.deepEqual(newsCategoryTabs(rows), [
    { label: "부동산", count: 2 },
    { label: "경제", count: 1 },
  ]);
  /* 2026-09-19T20:00Z = KST 9/20 05:00 → 오늘. 10:00Z = KST 19:00 9/19 → 어제 */
  assert.equal(countTodayKst(rows, NOW), 1);
});

test("newsArticleJsonLd — headline·발행일·발행자·원문(isBasedOn/citation)·무료 접근", async () => {
  const node = newsArticleJsonLd({
    url: "https://naezipnow.com/town/news/abc",
    headline: " 제목 ",
    description: "설명  두 칸",
    datePublished: "2026-09-19T01:00:00Z",
    dateModified: null,
    sourceName: "A일보",
    sourceUrl: "https://a.example.com/1",
    image: "https://img.example.com/1.jpg",
    section: "부동산",
    keywords: ["공급", " ", "대책"],
  });
  assert.equal(node["@type"], "NewsArticle");
  assert.equal(node.headline, "제목");
  assert.equal(node.description, "설명 두 칸");
  assert.equal(node.datePublished, "2026-09-19T01:00:00.000Z");
  assert.equal(node.dateModified, "2026-09-19T01:00:00.000Z", "수정 시각이 없으면 발행 시각");
  assert.equal(node.isAccessibleForFree, true);
  assert.equal(node.isBasedOn, "https://a.example.com/1");
  assert.deepEqual(node.citation, { "@type": "CreativeWork", name: "A일보", url: "https://a.example.com/1" });
  assert.deepEqual(node.image, ["https://img.example.com/1.jpg"]);
  assert.equal(node.articleSection, "부동산");
  assert.equal(node.keywords, "공급, 대책");
  const pub = node.publisher as Record<string, unknown>;
  assert.equal(pub["@type"], "Organization");
  assert.equal(pub["@id"], "https://naezipnow.com/#organization");
  assert.equal(pub.name, "내집나우");
  /* 발행자 이름은 lib/seo/page-metadata 의 SITE_NAME 과 같아야 한다(그 모듈은 next/headers
     를 끌고 와 여기서 import 못 한다 — 소스 문자열로 잠근다) */
  const { readFileSync: read } = await import("node:fs");
  const meta = read(new URL("../../lib/seo/page-metadata.ts", import.meta.url), "utf8");
  assert.match(meta, /export const SITE_NAME = "내집나우";/);
  /* 없는 값은 키 자체가 없다 — "undefined" 문자열이 굳는 경로를 막는다(check-jsonld POISON) */
  const bare = newsArticleJsonLd({ url: "https://naezipnow.com/town/news/x", headline: "h" });
  for (const k of ["description", "datePublished", "image", "isBasedOn", "citation", "keywords", "articleSection"]) {
    assert.equal(k in bare, false, `${k} 는 값이 없으면 키가 없어야 한다`);
  }
  assert.doesNotMatch(JSON.stringify(bare), /undefined|null/);
});

test("withNewsArticleDefaults — DB 노드가 이기고, 빠진 필드만 채운다(@graph 포함)", () => {
  const base = newsArticleJsonLd({
    url: "https://naezipnow.com/town/news/abc",
    headline: "기본 제목",
    datePublished: "2026-09-19T01:00:00Z",
    dateModified: "2026-09-19T05:00:00Z",
  });
  assert.equal(withNewsArticleDefaults(null, base), base);
  const merged = withNewsArticleDefaults(
    {
      "@context": "https://schema.org",
      "@graph": [
        { "@type": "NewsArticle", headline: "DB 제목", description: "DB 설명" },
        { "@type": "FAQPage", mainEntity: [] },
      ],
    },
    base,
  ) as { "@graph": Record<string, unknown>[] };
  const art = merged["@graph"][0];
  assert.equal(art.headline, "DB 제목", "DB 값이 이긴다");
  assert.equal(art.description, "DB 설명");
  assert.equal(art.dateModified, "2026-09-19T05:00:00.000Z", "빠진 필드는 기본값으로");
  assert.equal(art.isAccessibleForFree, true);
  assert.deepEqual(art.publisher, publisherOrganization(), "발행자는 전역 Organization 참조로 통일");
  assert.equal(merged["@graph"][1]["@type"], "FAQPage", "다른 노드는 손대지 않는다");
});

test("[1006] 카테고리 '뉴스' 칸은 뉴스룸 입구(entry)이고 라벨·경로가 내비와 같다", () => {
  const news = TOWN_CATEGORY_LINKS.find((l) => l.href === "/town/news");
  assert.ok(news);
  assert.equal(news.entry, "newsroom");
  assert.equal(TOWN_CATEGORY_LINKS.filter((l) => l.entry === "newsroom").length, 1, "뉴스룸 입구는 하나");
  const town = NAV.find((g) => g.label === "동네");
  assert.ok(town);
  const children = town.children ?? [];
  /* 소유자 지시 순서: 동네이야기 · 뉴스 · 청약 · 정비사업 */
  assert.deepEqual(
    children.map((c) => c.href),
    ["/town", "/town/news", "/apply", "/redevelopment"],
  );
  assert.equal(children[0].label, "동네이야기");
  assert.equal(children[1].label, news.label);
});

test("[1006] 이웃 글 카드의 href 는 /town/story — 뉴스 주소(/town/news)를 쓰지 않는다", async () => {
  const { readFileSync } = await import("node:fs");
  const strip = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
  const feed = strip(readFileSync(new URL("../../lib/town/feed.ts", import.meta.url), "utf8"));
  const postToCard = feed.slice(feed.indexOf("export function postToCard"), feed.indexOf("type NoteSlice"));
  assert.match(postToCard, /href: `\/town\/story\/\$\{p\.id\}`/);
  assert.doesNotMatch(postToCard, /\/town\/news\//);
  /* 글쓰기 성공 후 이동도 이야기 상세로 */
  const write = readFileSync(new URL("../../app/town/write/page.tsx", import.meta.url), "utf8");
  assert.match(write, /`\/town\/story\/\$\{encodeURIComponent\(newId\)\}`/);
  assert.doesNotMatch(write, /`\/town\/news\/\$\{encodeURIComponent\(newId\)\}`/);
  /* 뉴스 상세는 사람 글이면 이야기로 308 */
  const news = readFileSync(new URL("../../app/town/news/[id]/page.tsx", import.meta.url), "utf8");
  assert.match(news, /permanentRedirect\(`\/town\/story\/\$\{uuid\}`\)/);
});
