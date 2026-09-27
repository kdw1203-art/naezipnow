import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageShell } from "@/app/components/PageShell";
import { readTownPosts } from "@/lib/newui/board-posts";
import { NEWS_TAGS, findNewsTag, postMatchesTag } from "@/lib/news/tags";
import { clusterNews } from "@/lib/news/cluster";
import type { Post } from "@/lib/types/post";
import { seoAlternates } from "@/lib/seo/alternates";
import { breadcrumbJsonLd, jsonLdScript } from "@/lib/seo/jsonld";
import { logger } from "@/lib/log";
import { formatKstShortDate } from "@/lib/format/kst";
/* [1012] 규칙 8 — 굵기 3단(400/500/700): 이 파일의 font-extrabold(800) 를 전부 font-bold(700) 로 내렸다. */

/* [#103] 뉴스 태그 허브 — /town/news/tag/[slug]
   자동 수집 뉴스(우리 요약 보유분 중심)를 주제별로 묶은 색인 표면.
   dynamicParams=false: 큐레이션 태그 20개만 존재(빈 허브·soft404 방지).
   같은 사건 접기(#67)를 그대로 적용해 목록이 중복으로 붓지 않는다. */

/* [1010] 30분 → 1일. 큐레이션 태그 20장뿐인데 30분 눈금은 크롤 1회당 오리진 1회와 같았다
   (크롤러 재방문 ≈2.2일). 원천은 하루 1회 뉴스 적재이고, 적재 직후에는
   invalidateNewsHubs() 가 이 라우트를 통째로(page) 비운다 — /api/cron/news-revalidate 와
   뉴스 성격의 글을 싣는 크론 3곳(weekly-market-post · region-intro-posts · price-record-watch). */
export const revalidate = 86_400;
export const dynamicParams = false;

export function generateStaticParams(): Array<{ tag: string }> {
  return NEWS_TAGS.map((t) => ({ tag: t.slug }));
}

function displayIso(p: Post): string {
  return p.sourcePublishedAt || p.createdAt;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ tag: string }>;
}): Promise<Metadata> {
  const { tag: slug } = await params;
  const tag = findNewsTag(slug);
  if (!tag) return { title: "뉴스 주제를 찾을 수 없습니다 | 내집나우" };
  const title = `${tag.label} 부동산 뉴스 모음 | 내집나우`;
  const description = `${tag.label} 관련 부동산 뉴스를 매일 자동 수집해 같은 사건은 묶고 요약과 함께 정리합니다. 출처·게시 시각 명시.`;
  return { title, description, alternates: seoAlternates(`/town/news/tag/${slug}`) };
}

export default async function NewsTagPage({
  params,
}: {
  params: Promise<{ tag: string }>;
}) {
  const { tag: slug } = await params;
  const tag = findNewsTag(slug);
  if (!tag) notFound();

  let news: Post[] = [];
  let failed = false;
  try {
    const all = await readTownPosts();
    news = all
      .filter((p) => p.isAutomated && postMatchesTag(tag, p))
      .sort((a, b) => Date.parse(displayIso(b)) - Date.parse(displayIso(a)));
  } catch (e) {
    logger.error(`[news-tag] ${slug} 조회 실패`, e);
    failed = true;
  }

  const byId = new Map(news.map((p) => [p.id, p]));
  const clusters = clusterNews(
    news.map((p) => ({ id: p.id, title: p.title, timeMs: Date.parse(displayIso(p)) || 0 })),
  ).slice(0, 40);

  return (
    <PageShell>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLdScript([
            breadcrumbJsonLd([
              { name: "홈", url: "/" },
              { name: "뉴스룸", url: "/town/news" },
              { name: tag.label, url: `/town/news/tag/${slug}` },
            ]),
          ]),
        }}
      />
      {/* [v4] "한 화면 한 가지" — 가운데 한 줄(760px): 제목 한 줄 + 사실 한 줄(숫자만) → 기사 행(제목 한 줄 +
          매체·날짜 한 줄, 1px 선) → 다른 주제 글자 링크 한 줄 → 출처 캡션 한 줄. 주제 칩(링크)·분류 배지·카드 빈 상자 없음. */}
      <div className="mx-auto flex w-full max-w-[760px] flex-col gap-6">
        <header>
          {/* [v4] 문자열 브레드크럼 → 뉴스룸으로 가는 링크가 있는 한 줄(기사 상세와 같은 모양) */}
          <nav aria-label="브레드크럼" className="mb-2 t-sub text-text-3">
            <Link href="/town/news" className="tap-line text-text-2 no-underline">
              뉴스룸
            </Link>{" "}
            › 주제
          </nav>
          <h1 className="t-title text-ink">{tag.label} 뉴스</h1>
          {/* [1012 → v4] 사실 한 줄은 숫자만 — 수집 시점·표기 방식은 맨 끝 캡션으로 */}
          {news.length > 0 && (
            <p className="mt-0.5 t-sub text-text-3">
              최근 {news.length.toLocaleString("ko-KR")}건 · 같은 사건 접어 {clusters.length}행
            </p>
          )}
        </header>

        {failed ? (
          <p className="t-body text-text-2">{tag.label} 뉴스를 지금 불러오지 못했어요 — 없다는 뜻은 아니에요</p>
        ) : clusters.length === 0 ? (
          /* [1012] 규칙 6 — 언제(최근 수집분)·무엇(태그 보도). [v4] 빈 상태는 한 줄 */
          <p className="t-body text-text-3">최근 수집분에 {tag.label} 보도 없음</p>
        ) : (
          /* [v4] 뉴스룸 목록과 같은 행 — 제목 한 줄 + 매체 · 날짜 · 분류 · 관련 n 한 줄 */
          <ul data-tone="hanji" className="divide-y divide-line">
            {clusters.map((c) => {
              const p = byId.get(c.primary.id)!;
              const tail = [
                /* [970 · C-04] timeZone 없는 toLocaleDateString — 서버(UTC)에서 자정 전후 기사가 전날로 */
                formatKstShortDate(displayIso(p)),
                p.category,
                c.related.length > 0 ? `관련 ${c.related.length}` : null,
              ]
                .filter(Boolean)
                .join(" · ");
              return (
                <li key={p.id}>
                  <Link href={`/town/news/${p.id}`} className="flex min-w-0 flex-col gap-0.5 py-3 no-underline">
                    <span className="truncate t-body font-bold text-ink">{p.title}</span>
                    <span className="flex min-w-0 items-baseline t-sub text-text-3">
                      <span className="min-w-0 truncate font-bold text-text-2">{p.sourceName || "뉴스"}</span>
                      <span className="shrink-0 whitespace-pre"> · {tail}</span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}

        {/* 다른 주제 — [v4] 링크 칩 → 글자 링크 한 줄(칩은 필터에만) + 뉴스룸으로 */}
        <div className="flex flex-col gap-1">
          <nav aria-label="다른 주제" className="t-sub text-text-3">
            다른 주제 —{" "}
            {NEWS_TAGS.filter((t) => t.slug !== slug)
              .slice(0, 12)
              .map((t, i) => (
                <span key={t.slug}>
                  {i > 0 && " · "}
                  <Link href={`/town/news/tag/${t.slug}`} className="tap-line font-bold text-text-2 no-underline">
                    {t.label}
                  </Link>
                </span>
              ))}
          </nav>
          <Link href="/town/news" className="tap-line self-start t-sub font-bold text-primary no-underline">
            {/* [1012] 규칙 5 — 동사 + 대상 */}
            뉴스룸 전체 보기 ›
          </Link>
          <p className="t-caption text-text-3">자동 수집 기사 · 매일 아침 8시 · 매체명·원문 링크 표기</p>
        </div>
      </div>
    </PageShell>
  );
}
