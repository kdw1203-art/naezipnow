/* [1022 · 정렬·글씨·테마] 지시 4 — 머리 한 모양(PageHead) · 램프 글자 · 흰 카드 테마 · 사실 문장. 자세한 사유는 본문의 [1022 · 정렬·글씨·테마] 주석. */
import type { Metadata } from "next";
import Link from "@/app/components/IntentLink";
import { notFound } from "next/navigation";
import { ShellBreadcrumb, ShellNarrow } from "@/app/components/PageShell";
import { PageHead } from "@/app/components/PageHead";
import { readNewsTagHubPosts } from "./tag-posts";
import { NEWS_TAGS, findNewsTag, postMatchesTag } from "@/lib/news/tags";
import { clusterNews } from "@/lib/news/cluster";
import type { Post } from "@/lib/types/post";
import { seoAlternates } from "@/lib/seo/alternates";
import { breadcrumbJsonLd, jsonLdScript } from "@/lib/seo/jsonld";
import { logger } from "@/lib/log";
import { formatKstShortDate } from "@/lib/format/kst";
import { CoverImage } from "@/app/components/CoverImage";
import { Icon } from "@/app/components/Icon";
import { newsImageUrl } from "@/lib/town/shared";
import { newsThumbPath } from "@/lib/news/thumb";

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

/* [1103] 빌드 프리렌더인가 — 조회 실패를 실패 화면으로 그릴지(빌드) 던질지(운영 재검증)를 가른다(본문 catch 주석) */
const IS_BUILD_PHASE = process.env.NEXT_PHASE === "phase-production-build";

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
  if (!tag) return { title: "뉴스 주제 없음 | 내집나우" };
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
    /* [1103] 20장이 한 벌을 나눠 읽는다(tag-posts.ts — 이유·신선도 규칙은 그 파일 머리). 고르는 글은 예전 readTownPosts 와 같다. */
    const all = await readNewsTagHubPosts();
    news = all
      .filter((p) => p.isAutomated && postMatchesTag(tag, p))
      .sort((a, b) => Date.parse(displayIso(b)) - Date.parse(displayIso(a)));
  } catch (e) {
    /* [1103] 운영의 재검증 중이면 던진다 — Next 가 직전에 만든 화면을 그대로 둔다. 예전엔 여기서 "뉴스 불러오기 실패 · 잠시 후
       다시" 화면을 그려 ISR 에 넣었고, 그 화면이 하루(revalidate 86_400) 동안 멀쩡한 목록 대신 나갔다(2026-10-31 허브 ~15장).
       빌드 중이면 예전처럼 실패 화면으로 넘어간다 — DB 한 번의 흔들림으로 배포를 깨지 않는다(app/redevelopment/seoul/[gu] 와 같은 규칙). */
    if (!IS_BUILD_PHASE) {
      logger.error(`[news-tag] ${slug} 조회 실패 — 직전 화면을 유지하려고 렌더를 중단합니다`, e);
      throw e;
    }
    logger.error(`[news-tag] ${slug} 조회 실패(빌드) — 실패 화면으로 넘어간다`, e);
    failed = true;
  }

  const byId = new Map(news.map((p) => [p.id, p]));
  const clusters = clusterNews(
    news.map((p) => ({ id: p.id, title: p.title, timeMs: Date.parse(displayIso(p)) || 0 })),
  ).slice(0, 40);

  return (
    <ShellNarrow>
      <ShellBreadcrumb>{`뉴스룸 › ${tag.label}`}</ShellBreadcrumb>
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
      {/* [1022 · 정렬·글씨·테마] t-title 맨 h1 + 설명 두 문장 → 공용 PageHead + 사실 한 줄 */}
      <PageHead
        icon="newspaper"
        title={`${tag.label} 뉴스`}
        sub={`${tag.label} 관련 보도 · 같은 사건은 한 묶음 · 출처·원문 링크 명시`}
        subOnPhone
      />

      {/* 다른 주제 칩 */}
      <div className="rise-in-1 mt-3 flex flex-wrap gap-1.5">
        {NEWS_TAGS.filter((t) => t.slug !== slug)
          .slice(0, 12)
          .map((t) => (
            <Link
              key={t.slug}
              href={`/town/news/tag/${t.slug}`}
              className="chip border border-line bg-surface px-3 py-1.5 t-sub font-bold text-text-2"
            >
              {t.label}
            </Link>
          ))}
        <Link
          href="/town/news"
          className="chip border border-line bg-surface px-3 py-1.5 t-sub font-bold text-primary"
        >
          전체 뉴스 ›
        </Link>
      </div>

      {failed ? (
        <div className="card mt-4 rounded-2xl px-5 py-6 t-body text-text-2">
뉴스 불러오기 실패 · 잠시 후 다시
        </div>
      ) : clusters.length === 0 ? (
        <div className="card mt-4 rounded-2xl px-5 py-6 t-body leading-[1.7] text-text-2">
최근 수집분에 {tag.label} 보도 없음 · 기사는 매일 수집해요.
        </div>
      ) : (
        /* [1006] 뉴스룸과 같은 행 재질(.news-row) — 분류 태그 · 출처 · 날짜 · 제목 */
        <div className="news-list mt-4">
          {clusters.map((c) => {
            const p = byId.get(c.primary.id)!;
            return (
              <article key={p.id} className="news-row news-row--thumb">
                {/* [1013] 뉴스룸 목록과 같은 썸네일 칸(모든 행 · 사진 없으면 매체 이름) */}
                <Link href={`/town/news/${p.id}`} className="news-row__thumb block bg-divider" tabIndex={-1} aria-hidden="true">
                  <CoverImage
                    src={newsImageUrl(p) ? newsThumbPath(p.id) : null}
                    alt=""
                    imgClassName="absolute inset-0 h-full w-full object-cover"
                    fallback={
                      <span className="absolute inset-0 flex items-center justify-center text-text-3" aria-hidden="true">
                        <Icon name="newspaper" size={18} />
                      </span>
                    }
                  />
                </Link>
                <div className="flex min-w-0 flex-col gap-1">
                  <div className="news-row__meta">
                    {p.category && <span className="news-tag">{p.category}</span>}
                    <span className="news-source">{p.sourceName || "뉴스"}</span>
                    {/* [970 · C-04] timeZone 없는 toLocaleDateString — 서버(UTC)에서 자정 전후 기사가 전날로 */}
                    <time dateTime={displayIso(p)}>{formatKstShortDate(displayIso(p))}</time>
                    {c.related.length > 0 && <span>· 관련 보도 {c.related.length}건</span>}
                  </div>
                  <Link href={`/town/news/${p.id}`} className="news-row__title no-underline">
                    <span className="line-clamp-2">{p.title}</span>
                  </Link>
                </div>
                <span aria-hidden="true" />
              </article>
            );
          })}
        </div>
      )}
    </ShellNarrow>
  );
}
