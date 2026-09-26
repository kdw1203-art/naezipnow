/**
 * [1006] 뉴스룸 목록 조립 — 순수 함수(서버 페이지와 /api/town/news 가 같이 쓴다).
 *
 * 왜 따로 두나: /town/news 첫 장과 "더 보기"(API)가 **같은 코드**로 행(row)을
 * 만들어야 이어 붙은 행이 첫 장과 한 글자도 다르지 않다(동네이야기 피드가
 * lib/town/feed.ts 로 같은 일을 한다). DB·server-only 의존이 없어 단위 테스트에서
 * 그대로 import 한다(tests/unit/town-1006.test.ts).
 *
 * 뉴스 행의 재질: 사진 격자 카드가 아니라 **행** — 출처 · 발행시각 · 분류 · 제목 ·
 * 요약 한 줄 · 원문 링크. 이미지는 있을 때만(썸네일). 사람 글의 카드(작성자·동네·
 * 댓글·사진)와 같은 모양을 쓰지 않는다 — 두 재질을 눈으로 가르기 위해서다.
 */
import type { Post } from "@/lib/types/post";
import { clusterNews } from "@/lib/news/cluster";
import { readNewsMeta } from "@/lib/news-seo";
import { hostOf, newsImageUrl, relativeTime } from "@/lib/town/shared";
import type { NewsRow, NewsCategoryTab } from "@/lib/town/news-row";

/* 행 DTO 타입·페이지 상수는 lib/town/news-row.ts — 클라이언트(NewsListClient)는 그것만 import 해
   이 조립기(클러스터·SEO 메타 파서)를 번들에 끌고 가지 않는다. 서버 쪽 편의로 재수출한다. */
export { NEWS_LIST_FIRST_PAGE, NEWS_LIST_PAGE } from "@/lib/town/news-row";
export type { NewsRow, NewsRelated, NewsCategoryTab } from "@/lib/town/news-row";

/** 요약 한 줄 상한(글자) */
const SUMMARY_MAX = 110;

/**
 * 뉴스 = **자동수집 글만**. 예전엔 분류가 "부동산 뉴스"인 사람 글도 뉴스로 쳤는데(옛
 * 호환), 그러면 이웃이 "부동산 뉴스" 게시판에 쓴 이야기가 뉴스룸에 기사처럼 선다.
 * 사람이 쓴 글은 분류가 무엇이든 이야기다(lib/town/story.ts isStoryPost 와 상보).
 */
export function isNewsPost(p: Post): boolean {
  return p.isAutomated === true;
}

export function newsDisplayIso(p: Post): string {
  return p.sourcePublishedAt || p.createdAt;
}

function firstSentence(text: string): string {
  const t = text.replace(/\s+/g, " ").trim();
  const m = t.match(/^(.+?[.!?。])(\s|$)/);
  return (m ? m[1] : t).trim();
}

function clip(text: string, max: number): string {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
}

/**
 * 요약 한 줄. 우선순위: seo.meta_description → seo.summary 첫 문장 → 본문 앞부분.
 * 본문이 제목과 같으면(제목만 있는 수집분) null — 같은 문장을 두 번 적지 않는다.
 */
export function newsSummaryOf(p: Post): string | null {
  const { seo, summary } = readNewsMeta(p.automationMeta);
  const desc = typeof seo.meta_description === "string" ? seo.meta_description.trim() : "";
  if (desc) return clip(desc, SUMMARY_MAX);
  if (summary && summary.trim()) return clip(firstSentence(summary), SUMMARY_MAX);
  const body = (p.body ?? "").replace(/\s+/g, " ").trim();
  if (!body || body === p.title.trim()) return null;
  return clip(firstSentence(body).length >= 20 ? firstSentence(body) : body, SUMMARY_MAX);
}

/** 뉴스 글만 골라 표시 시각 내림차순 */
export function sortNewsPosts(posts: Post[]): Post[] {
  return posts
    .filter(isNewsPost)
    .sort((a, b) => (Date.parse(newsDisplayIso(b)) || 0) - (Date.parse(newsDisplayIso(a)) || 0));
}

/** 같은 사건은 접고(대표 1 + 관련 N) 행 DTO 로 평탄화 — 원본 메타는 싣지 않는다 */
export function buildNewsRows(posts: Post[], now: number = Date.now()): NewsRow[] {
  const news = sortNewsPosts(posts);
  const byId = new Map(news.map((p) => [p.id, p]));
  const clusters = clusterNews(
    news.map((p) => ({ id: p.id, title: p.title, timeMs: Date.parse(newsDisplayIso(p)) || 0 })),
  );
  return clusters.map((c) => {
    const p = byId.get(c.primary.id)!;
    const iso = newsDisplayIso(p);
    return {
      id: p.id,
      title: p.title,
      summary: newsSummaryOf(p),
      category: (p.category ?? "").trim(),
      city: (p.city ?? "").trim(),
      source: p.sourceName || p.authorLabel || "",
      publishedAt: iso,
      timeLabel: relativeTime(iso, now),
      host: hostOf(p.sourceUrl),
      sourceUrl: p.sourceUrl?.trim() || null,
      image: newsImageUrl(p),
      related: c.related.slice(0, 4).map((r) => {
        const rp = byId.get(r.id)!;
        return {
          id: rp.id,
          title: rp.title,
          source: rp.sourceName || rp.authorLabel || "",
          timeLabel: relativeTime(newsDisplayIso(rp), now),
        };
      }),
    };
  });
}

export type NewsPage = { items: NewsRow[]; hasMore: boolean; total: number };

/** offset 부터 limit 개 — 뉴스는 하루 1회 적재라 오프셋 페이지로 충분하다 */
export function pageNewsRows(rows: NewsRow[], offset: number, limit: number): NewsPage {
  const start = Math.max(0, Math.floor(offset));
  const size = Math.max(1, Math.min(100, Math.floor(limit)));
  const items = rows.slice(start, start + size);
  return { items, hasMore: start + items.length < rows.length, total: rows.length };
}

/** 분류 탭 — 건수순, 상위 max 개. 빈 분류는 세지 않는다. */
export function newsCategoryTabs(rows: NewsRow[], max = 8): NewsCategoryTab[] {
  const freq = new Map<string, number>();
  for (const r of rows) {
    const k = r.category;
    if (k) freq.set(k, (freq.get(k) ?? 0) + 1);
  }
  return Array.from(freq.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "ko"))
    .slice(0, max)
    .map(([label, count]) => ({ label, count }));
}

/** 한국 시간 기준 "오늘" 기사 수 — 히어로·카테고리 카드가 같은 값을 쓴다 */
export function countTodayKst(rows: ReadonlyArray<{ publishedAt: string }>, now: number = Date.now()): number {
  const today = new Date(now + 9 * 3_600_000).toISOString().slice(0, 10);
  let n = 0;
  for (const r of rows) {
    const t = Date.parse(r.publishedAt);
    if (!Number.isFinite(t)) continue;
    if (new Date(t + 9 * 3_600_000).toISOString().slice(0, 10) === today) n += 1;
  }
  return n;
}
