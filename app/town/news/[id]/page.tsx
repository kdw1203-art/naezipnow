import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { PageShell } from "../../../components/PageShell";
import { AIPanel } from "../../../components/AIPanel";
import { ReportButton } from "../../../components/ReportButton";
import { getTownPost, readRelatedTownPosts } from "@/lib/newui/board-posts";
import { isStoryPost } from "@/lib/town/story";
import { relatedInCluster } from "@/lib/news/cluster";
import { isPostHidden } from "@/lib/moderation/reports-store";
import type { Post } from "@/lib/types/post";
import { logger } from "@/lib/log";
import { hostOf, newsImageUrl } from "../../shared";
import { LocationMap } from "../../LocationMap";
import { regionIdForName } from "@/lib/region/catalog";
import {
  complexHrefKey,
  resolveComplexHref,
  resolveComplexHrefs,
} from "@/lib/newui/complex-link";
import { NEWS_TAGS } from "@/lib/news/tags";
import { townHandoff } from "@/lib/town/handoff";
import { AdZone } from "@/app/components/ads/AdZone";
import { Icon } from "@/app/components/Icon";
import { ReadingProgress } from "./ReadingProgress";
import { PostActions } from "./PostInteractions";
import { NewsHero } from "./NewsHero";
import { formatKstDateTime, formatKstShortDate } from "@/lib/format/kst";
import {
  readNewsMeta,
  extractUuid,
  canonicalNewsUrl,
  splitSummary,
  buildNewsJsonLd,
} from "@/lib/news-seo";
import { newsArticleJsonLd, withNewsArticleDefaults } from "@/lib/town/news-jsonld";
import { jsonLdScript } from "@/lib/seo/jsonld";

/* ============================================================
   뉴스 상세 — board_posts(자동수집 기사) **전용**. 없는 글은 notFound() (목업 기사 금지).

   [1006] 예전엔 이 라우트가 posts(사람 글)도 열었다 — 같은 화면이 기사도 이야기도
   그렸고, 댓글·좋아요는 posts 스토어에만 쓰이므로 기사 페이지의 댓글창·공감 버튼은
   운영에서 한 번도 동작한 적이 없는 컨트롤이었다(board_comments 0행). 이제:
     · posts 에 있는 글이 이 주소로 오면 /town/story/[id] 로 **영구 리다이렉트**(옛 링크 보호)
     · 기사에는 출처 · 원문 링크 · 관련 보도 · 우리 요약 — 댓글·공감 없음
     · NewsArticle JSON-LD 는 우리 요약 유무와 무관하게 항상(lib/town/news-jsonld)
   ============================================================ */

/* 비용 실측(2026-08-10): force-dynamic 이라 익명·크롤러 요청마다 오리진 함수가
   돌았다. 이 화면의 서버 렌더에는 사용자별 상태가 없다(auth·cookies 0건 —
   check-cache-policy 가 회귀를 막는다). ISR 로 전환: 뉴스 적재는 하루 1회. */
/* [1007] 600초 → 6시간. 하루 985회 함수 호출 중 대부분이 크롤러의 재방문이었다 — 기사 본문은
   적재 뒤 바뀌지 않으므로(댓글·공감 없음) 6시간 안 재방문은 CDN/ISR 캐시가 받는다. */
/* [1010] 6시간 → 7일. 실측(2026-09-20~22 Vercel 청구): 이 라우트 하루 985 렌더 · 사람 방문은
   7일 합계 120뷰(동네 전체) · 크롤러 재방문 ≈2.2일 — 6시간 눈금은 크롤 1회당 오리진 1회와
   사실상 같았다. 기사 본문은 적재 뒤 바뀌지 않고 이 화면에는 댓글·공감이 없다(위 구조 주석).
   바뀌는 경우는 둘뿐이고 둘 다 즉시 비운다:
     · 옛 주소로 남은 이웃 글 — app/api/community/posts/** 가 revalidatePath(`/town/news/{id}`)
     · 관련 보도 목록 — 동네 글 병합 목록(related-town-posts-v1)이 town-posts 태그로 비워진다
   ※ 그 데이터 캐시가 15분일 때는 이 라우트의 실제 TTL 도 15분이었다(Next 는 세그먼트
     revalidate 와 데이터 캐시 revalidate 중 작은 값을 쓴다 — lib/town/cache-tags.ts 실측). */
export const revalidate = 604_800;
// 동적 세그먼트는 이게 없으면 "요청마다 서버 렌더"로 분류된다(2026-08 complex/[id] 실측)
export function generateStaticParams() {
  return [];
}

/* ---------- 헬퍼 ---------- */

/* [970 · C-04] 바이라인·관련글 날짜는 한국 시간으로 고정 — lib/format/kst. */
const fullDateTime = formatKstDateTime;
const shortDate = formatKstShortDate;

function paragraphs(body: string): string[] {
  const parts = body
    .replace(/\r/g, "")
    .split(/\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (parts.length > 1) return parts;
  // 개행 없는 본문은 문장 단위로 2~3문단 분할
  const sentences = body.split(/(?<=[.다요!?])\s+/).filter(Boolean);
  const out: string[] = [];
  for (let i = 0; i < sentences.length; i += 3) {
    out.push(sentences.slice(i, i + 3).join(" "));
  }
  return out.length > 0 ? out : [body];
}

/* ---------- SEO ----------
 *
 * 2026-07-27 에 이 페이지를 noindex 로 막았다. 사유는 정당했다: 공개 글 453건이
 * 전부 자동수집이고 118개 매체 기사의 **본문을 그대로** 싣고 있었다.
 *
 * 2026-08-04, 그 전제를 바꿨다. 이제 이 페이지는 원문 본문을 싣지 않는다 —
 * 우리가 새로 쓴 요약·핵심 문장·FAQ·선정 사유를 싣고 원문은 링크로 보낸다.
 * 그래서 색인은 **우리 글이 실제로 있는 글에 한해서만** 연다.
 *   우리 요약 있음 → index / 없음 → noindex (원문 본문에 기대는 옛 글)
 * 판정은 lib/news-seo.ts 의 readNewsMeta().hasOwnContent 한 곳에만 둔다.
 * 사이트맵(lib/seo/build-sitemap.ts loadNewsEntries)도 같은 조건을 쓴다.
 *
 * 조회 실패는 여기서도 던진다 — 못 읽은 것을 "없는 글"로 바꿔 적지 않는다. */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const uuid = extractUuid(id) ?? id;
  /* getTownPost 는 요청당 1회 캐시 — 본문과 같은 조회를 나눠 쓴다.
     사람 글이면 본문이 /town/story 로 보낸다 — 메타데이터는 색인만 막아 둔다 */
  const post = await getTownPost(uuid);
  if (post && isStoryPost(post)) {
    return { robots: { index: false, follow: true } };
  }
  if (!post) {
    return {
      title: "기사를 찾을 수 없습니다 | 내집나우",
      description: "요청하신 기사를 찾을 수 없습니다.",
      robots: { index: false, follow: false },
    };
  }

  const { seo, geo, summary, hasOwnContent } = readNewsMeta(post.automationMeta);
  const indexable = hasOwnContent;

  const where = [post.city, post.district].filter(Boolean).join(" ").trim();
  const source = post.sourceName?.trim();
  const descParts = [where || "전국", post.category, source ? `출처 ${source}` : null].filter(Boolean);
  const body = post.body.replace(/\s+/g, " ").trim();

  const description =
    seo.meta_description ??
    summary?.slice(0, 155) ??
    (body ? body.slice(0, 150) : `${descParts.join(" · ")} 부동산 소식.`);

  const canonical = canonicalNewsUrl(seo.slug, uuid);
  const ogImage = newsImageUrl(post);
  /* 지역 엔티티까지 키워드에 합친다 — 동 단위 질의는 region 컬럼만으로는 안 잡힌다(GEO). */
  const keywords = [...(seo.keywords ?? []), ...(geo.places ?? []), ...(geo.landmarks ?? [])].filter(Boolean);

  return {
    title: `${seo.seo_title ?? post.title} | 내집나우`,
    description,
    ...(keywords.length ? { keywords } : {}),
    alternates: { canonical },
    robots: { index: indexable, follow: true },
    openGraph: {
      type: "article",
      title: seo.seo_title ?? post.title,
      description,
      url: canonical,
      siteName: "내집나우",
      locale: "ko_KR",
      ...(ogImage ? { images: [{ url: ogImage }] } : {}),
      ...(post.sourcePublishedAt ? { publishedTime: post.sourcePublishedAt } : {}),
      ...(post.category ? { section: post.category } : {}),
      ...(keywords.length ? { tags: keywords } : {}),
    },
    twitter: {
      card: "summary_large_image",
      title: seo.seo_title ?? post.title,
      description,
      ...(ogImage ? { images: [ogImage] } : {}),
    },
  };
}

/* ---------- 페이지 ---------- */

export default async function TownNewsDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const uuid = extractUuid(id) ?? id;

  /* posts + board_posts 단건(요청당 1회 캐시) — 없음은 null, 실패는 던져 5xx(404 로 위장하지
     않는다: lib/newui/board-posts.ts getBoardPost 주석). */
  const post: Post | null = await getTownPost(uuid);
  if (!post) notFound();
  /* [1006] 사람 글(isStoryPost — 피드·동네 홈과 같은 판정)이면 이야기 상세로 — 308. 예전 링크
     (피드·검색·알림 메일)가 이 주소를 들고 있어도 깨지지 않는다. 지금 운영엔 사람 글 0건이라
     SEO 영향은 없다. */
  if (isStoryPost(post)) permanentRedirect(`/town/story/${uuid}`);
  // 신고 누적/처리로 숨김된 글도 상세 노출 차단(#7)
  if (await isPostHidden(uuid).catch(() => false)) notFound();

  let similarPosts: { id: string | null; title: string; meta: string }[] = [];
  /* [#67] 같은 사건을 다룬 다른 매체 보도 — 제목 유사도 클러스터(lib/news/cluster) */
  let clusterRelated: { id: string; title: string; meta: string }[] = [];
  /* 웹19 — 목록 정렬 기준 이웃 기사. 현재 글이 목록에 없으면(숨김 등) 생략. */
  let newerPost: { id: string | null; title: string } | null = null;
  let olderPost: { id: string | null; title: string } | null = null;

  /* 우리 요약·핵심·FAQ·지역. Post 가 automationMeta 를 그대로 넘겨주므로 추가 조회가 없다. */
  const { seo, geo, summary, context, implication, hasOwnContent } = readNewsMeta(post.automationMeta);
  const renderOwnSummary = hasOwnContent;

  try {
    /* 관련글은 제목·분류·출처·시각만 쓴다 — 본문·automation_meta 는 안 읽는다. */
    const all = (await readRelatedTownPosts()).filter((p) => p.isAutomated);

    const pool = all
      .filter((p) => p.id)
      .map((p) => ({
        id: p.id as string,
        title: p.title,
        timeMs: Date.parse(p.sourcePublishedAt || p.createdAt) || 0,
        sourceName: p.sourceName || p.authorLabel,
        at: p.sourcePublishedAt || p.createdAt,
      }));
    clusterRelated = relatedInCluster(pool, post!.id)
      .slice(0, 4)
      .map((r) => ({ id: r.id, title: r.title, meta: `${r.sourceName} · ${shortDate(r.at)}` }));

    const sameCat = all.filter((p) => p.id !== post!.id && p.category === post!.category);
    const others = all.filter((p) => p.id !== post!.id && p.category !== post!.category);
    similarPosts = [...sameCat, ...others].slice(0, 3).map((p) => ({
      id: p.id,
      title: p.title,
      meta: `${p.sourceName || p.authorLabel} · ${shortDate(p.sourcePublishedAt || p.createdAt)}`,
    }));
    const idx = all.findIndex((p) => p.id === post!.id);
    if (idx >= 0) {
      const newer = idx > 0 ? all[idx - 1] : null;
      const older = idx < all.length - 1 ? all[idx + 1] : null;
      if (newer) newerPost = { id: newer.id, title: newer.title };
      if (older) olderPost = { id: older.id, title: older.title };
    }
  } catch (e) {
    /* 여기서만 실패를 삼킨다. 관련글은 부가 섹션이고, 비면 섹션 자체를 안 그린다 —
       "관련 글이 없다"고 말하지 않고 사라질 뿐이다. 본문 실패는 위에서 던져 5xx. */
    logger.error("[/town/news/[id]] 관련글 조회 실패", e);
    similarPosts = [];
  }

  const title = post.title;
  const category = post.category;
  const region = [post.city, post.district].filter(Boolean).join(" ") || "전국";
  const sourceName = post.sourceName || "뉴스 자동수집";
  const publishedIso = post.sourcePublishedAt || post.createdAt;
  const sourceHost = hostOf(post.sourceUrl);
  /* 우리 요약이 있으면 원문 본문을 싣지 않는다(이 파일 상단 SEO 주석 참고). */
  const bodyParas = renderOwnSummary ? [] : paragraphs(post.body);
  const summaryParas = summary ? splitSummary(summary) : [];
  const keyPoints = seo.key_points ?? [];
  const faq = seo.faq ?? [];
  /* 예전 3줄 요약은 원문 앞 3문단을 55자로 자른 것 — 우리 요약이 있으면 새로 쓴 핵심 문장을 쓴다. */
  const legacySummary = renderOwnSummary
    ? []
    : paragraphs(post.body)
        .slice(0, 3)
        .map((t, i) => `${["①", "②", "③"][i] ?? "·"} ${t.slice(0, 55)}`);
  const saveCount = post.bookmarkCount ?? 0;
  const heroImage = newsImageUrl(post);

  /* [1006] NewsArticle JSON-LD — 항상. DB 가 만든 노드(우리 요약 있을 때)에 빠진 필드
     (발행자 @id · dateModified · isAccessibleForFree)를 채우고, 없으면 우리 노드만. */
  const canonical = canonicalNewsUrl(seo.slug, uuid);
  const jsonLd = withNewsArticleDefaults(
    renderOwnSummary ? buildNewsJsonLd(seo, uuid, geo, post.sourceName, post.sourceUrl) : null,
    newsArticleJsonLd({
      url: canonical,
      headline: seo.seo_title ?? title,
      description: seo.meta_description ?? summary ?? post.body.slice(0, 160),
      datePublished: publishedIso,
      dateModified: post.updatedAt || post.createdAt,
      sourceName: post.sourceName,
      sourceUrl: post.sourceUrl,
      image: heroImage,
      section: category,
      keywords: seo.keywords ?? null,
    }),
  );

  /* 고도화 26 — 연관 단지가 실제 단지로 리졸브되면 시세 페이지로 잇는다(죽은 링크 금지). */
  const relatedSiteHref = post.relatedSite
    ? await resolveComplexHref(post.relatedSite, post.district || post.city).catch(() => null)
    : null;

  /* [B35·B36] 지도·노트로 넘어갈 때 지금 보던 동네를 들고 간다(lib/town/handoff.ts). */
  const { region: regionQuery, mapHref, noteNewHref } = townHandoff({
    city: post.city,
    district: post.district,
  });

  /* [B34] 태그 — 단지로 해석되면 그 단지 시세로, 주제 태그면 태그 허브로. 둘 다 아니면 링크 없는 칩. */
  const postTags = (post.tags ?? [])
    .map((t) => String(t ?? "").trim())
    .filter(Boolean)
    .slice(0, 8);
  const tagComplexHrefs = postTags.length
    ? await resolveComplexHrefs(
        postTags.map((t) => ({ name: t, region: post.district || post.city })),
      ).catch(() => new Map<string, string | null>())
    : new Map<string, string | null>();
  const tagLinks = postTags.map((t) => {
    const complexHref = tagComplexHrefs.get(complexHrefKey(t, post.district || post.city));
    if (complexHref) return { label: t, href: complexHref, kind: "complex" as const };
    const norm = t.replace(/\s+/g, "");
    let topic: (typeof NEWS_TAGS)[number] | null = null;
    let topicKeyLen = 0;
    for (const n of NEWS_TAGS) {
      for (const m of [n.label, ...n.match]) {
        const k = m.replace(/\s+/g, "");
        if (k.length < 2 || !norm.includes(k)) continue;
        if (k.length > topicKeyLen) {
          topic = n;
          topicKeyLen = k.length;
        }
      }
    }
    if (topic) return { label: t, href: `/town/news/tag/${topic.slug}`, kind: "topic" as const };
    return { label: t, href: null, kind: "plain" as const };
  });

  const regionId =
    regionIdForName([post.city, post.district].filter(Boolean).join(" ")) ??
    (post.district ? regionIdForName(post.district) : null);

  return (
    <PageShell breadcrumb={`뉴스룸 › ${category} › ${region}`}>
      {/* [945-G] 읽기 진행 바 — 긴 글에서만 나타난다(컴포넌트가 판정) */}
      <ReadingProgress />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript(jsonLd) }}
      />

      {/* 저장·공유(POST /api/bookmarks · Web Share) — PostInteractions.tsx 주석 참고 */}
      <PostActions postId={post.id} title={title} saveCount={saveCount} />

      {/* [998 · A5] md → lg: 태블릿(768~1023)은 1열, 2열은 lg 부터. */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex flex-col gap-4">
          {/* ---------- 기사 본문 ---------- */}
          <article className="rise-in card flex flex-col gap-4 rounded-[18px] p-5 md:p-7">
            {/* [1006] 뉴스 재질의 머리 — 분류 태그 · 출처 · 발행시각(신문 데이트라인) */}
            <div className="news-row__meta">
              <span className="news-tag">{category}</span>
              <span className="news-source">{sourceName}</span>
              <time dateTime={publishedIso}>{fullDateTime(publishedIso)}</time>
              <span>· {renderOwnSummary ? "내집나우 요약" : "자동 수집"}</span>
              {regionId && (
                <Link
                  href={`/region/${regionId}`}
                  className="inline-flex min-h-[24px] items-center font-bold text-primary no-underline"
                >
                  {region} 시세 보기 ›
                </Link>
              )}
            </div>
            <h1 className="text-2xl font-extrabold leading-[1.4] text-ink">{title}</h1>

            {/* 원문 ↗ — 요약본 사이트의 예의는 원문으로 잘 보내는 것. 머리에도 한 번. */}
            {post.sourceUrl && (
              <a
                href={post.sourceUrl}
                target="_blank"
                rel="noopener nofollow"
                className="inline-flex min-h-[24px] w-fit items-center gap-1 t-sub font-bold text-primary no-underline"
              >
                <Icon name="link" size={13} />
                원문 보기{sourceHost ? ` · ${sourceHost}` : ""}
              </a>
            )}

            {keyPoints.length > 0 ? (
              <AIPanel title="핵심 요약">
                {keyPoints.map((t, i) => (
                  <span key={i}>
                    {i > 0 && <br />}
                    {`· ${t}`}
                  </span>
                ))}
              </AIPanel>
            ) : legacySummary.length > 0 ? (
              <AIPanel title="3줄 요약">
                {legacySummary.map((t, i) => (
                  <span key={i}>
                    {i > 0 && <br />}
                    {t}
                  </span>
                ))}
              </AIPanel>
            ) : null}

            {/* 원문 사진 — og:image 가 있을 때만. 없으면 아무것도 그리지 않는다(빈 상자 금지).
                [970 · C-12] 로드 실패 시 NewsHero 가 상자·캡션까지 통째로 치운다. */}
            {heroImage ? <NewsHero src={heroImage} sourceName={post.sourceName} /> : null}

            <div className="flex flex-col gap-4 text-[13px] leading-[1.85] text-text-1">
              {/* 우리가 쓴 요약 — 원문 문장을 옮기지 않고 핵심 사실만 재구성한 글 */}
              {summaryParas.map((t, i) => (
                <p key={`sum-${i}`}>{t}</p>
              ))}
              {/* 우리 요약이 없는 옛 글은 종전대로 원문 본문을 그린다(noindex 유지). */}
              {bodyParas.map((t, i) => (
                <p key={`body-${i}`}>{t}</p>
              ))}

              {renderOwnSummary && context ? (
                <section className="rounded-[14px] border border-line bg-bg px-4 py-3">
                  <h2 className="mb-1 text-[12px] font-extrabold text-text-3">배경</h2>
                  <p className="text-[13px] leading-[1.75] text-text-1">{context}</p>
                </section>
              ) : null}

              {renderOwnSummary && implication ? (
                <section className="rounded-[14px] border border-primary/25 bg-primary-soft px-4 py-3">
                  <h2 className="mb-1 text-[12px] font-extrabold text-primary">시장에 주는 의미</h2>
                  <p className="text-[13px] leading-[1.75] text-text-1">{implication}</p>
                </section>
              ) : null}

              {/* 웹12 — 원문 링크 카드형 CTA. 출처명·호스트를 함께 보여 어디로 가는지 알게 한다. */}
              {post.sourceUrl && (
                <a
                  href={post.sourceUrl}
                  target="_blank"
                  rel="noopener nofollow"
                  className="tile flex items-center justify-between gap-3 rounded-[14px] border border-line bg-bg px-4 py-3 no-underline"
                >
                  <span className="min-w-0">
                    <span className="block text-[12px] font-semibold text-text-3">
                      원문 출처{post.sourceName ? ` · ${post.sourceName}` : ""}
                    </span>
                    <span className="block text-[13px] font-extrabold text-primary">기사 전문 읽기 ↗</span>
                  </span>
                  {sourceHost && <span className="shrink-0 text-[12px] text-text-3">{sourceHost}</span>}
                </a>
              )}
            </div>

            {/* FAQ — FAQPage 구조화 데이터와 화면 내용이 같아야 유효하므로 함께 낸다. */}
            {faq.length > 0 ? (
              <section aria-label="자주 묻는 질문" className="flex flex-col gap-3 border-t border-divider pt-4">
                <h2 className="text-[15px] font-extrabold text-ink">자주 묻는 질문</h2>
                <dl className="flex flex-col gap-3">
                  {faq.map((f, i) => (
                    <div key={i} className="flex flex-col gap-1">
                      <dt className="text-[13px] font-extrabold text-ink">Q. {f.q}</dt>
                      <dd className="text-[13px] leading-[1.7] text-text-1">{f.a}</dd>
                    </div>
                  ))}
                </dl>
              </section>
            ) : null}

            {/* 관련 지역 — 해석되는 시군구만 링크(죽은 링크 금지) */}
            {geo.places && geo.places.length > 0 ? (
              <nav aria-label="관련 지역" className="flex flex-wrap items-center gap-1.5 border-t border-divider pt-3.5">
                <span className="text-[12px] font-bold text-text-3">관련 지역</span>
                {geo.places.map((place) => {
                  const words = place.split(/\s+/).filter(Boolean);
                  const rid =
                    regionIdForName(place) ??
                    (words.length >= 2 ? regionIdForName(words.slice(0, 2).join(" ")) : null) ??
                    (words.length >= 2 ? regionIdForName(words[1]) : null);
                  return rid ? (
                    <Link
                      key={place}
                      href={`/region/${rid}`}
                      className="chip border border-line bg-bg px-2.5 py-1 text-[12px] font-bold text-primary no-underline"
                    >
                      {place}
                    </Link>
                  ) : (
                    <span key={place} className="chip border border-line bg-bg px-2.5 py-1 text-[12px] text-text-2">
                      {place}
                    </span>
                  );
                })}
              </nav>
            ) : null}

            {tagLinks.length > 0 && (
              <nav aria-label="관련 태그" className="flex flex-wrap gap-1.5">
                {tagLinks.map((t) =>
                  t.href ? (
                    <Link
                      key={t.label}
                      href={t.href}
                      className="chip border border-line bg-bg px-2.5 py-1 text-[12px] font-bold text-primary no-underline"
                    >
                      #{t.label}
                      {t.kind === "complex" && <span className="ml-1 font-medium text-text-3">시세</span>}
                    </Link>
                  ) : (
                    <span key={t.label} className="chip border border-line bg-bg px-2.5 py-1 text-[12px] text-text-2">
                      #{t.label}
                    </span>
                  ),
                )}
              </nav>
            )}

            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-divider pt-3.5">
              <div className="flex flex-wrap items-center gap-1 text-[12px] text-text-3">
                <span>
                  {renderOwnSummary
                    ? `내집나우가 원문을 요약·정리한 글입니다 · 원문 저작권은 ${post.sourceName || "원 매체"}에 있음 ·`
                    : "자동 수집 콘텐츠 · 저작권은 원 매체에 있음 ·"}
                </span>
                {/* 신고 연결(#81) — POST /api/moderation/content-report */}
                <ReportButton postId={post.id} />
              </div>
              {/* [1006] 기사에는 댓글·공감이 없다 — 의견은 동네이야기로 */}
              <Link
                href={`/town/write?topic=${encodeURIComponent(title.slice(0, 60))}${regionQuery ? `&region=${encodeURIComponent(regionQuery)}` : ""}`}
                className="inline-flex min-h-[24px] items-center gap-1 t-sub font-bold text-primary no-underline"
              >
                <Icon name="messages-square" size={13} />
                이 기사로 동네이야기 쓰기 ›
              </Link>
            </div>
          </article>

          {/* 웹19 — 이웃 기사 내비게이션(목록 정렬 기준). 있는 방향만 그린다. */}
          {(newerPost?.id || olderPost?.id) && (
            <nav aria-label="이웃 기사" className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {newerPost?.id ? (
                <Link
                  href={`/town/news/${encodeURIComponent(newerPost.id)}`}
                  className="card tile flex flex-col gap-1 rounded-[14px] px-4 py-3 no-underline"
                >
                  <span className="text-[10px] font-bold text-text-3">‹ 다음 기사(최신)</span>
                  <span className="line-clamp-2 text-[13px] font-bold leading-snug text-ink">{newerPost.title}</span>
                </Link>
              ) : (
                <span className="hidden sm:block" />
              )}
              {olderPost?.id && (
                <Link
                  href={`/town/news/${encodeURIComponent(olderPost.id)}`}
                  className="card tile flex flex-col gap-1 rounded-[14px] px-4 py-3 no-underline sm:items-end sm:text-right"
                >
                  <span className="text-[10px] font-bold text-text-3">이전 기사 ›</span>
                  <span className="line-clamp-2 text-[13px] font-bold leading-snug text-ink">{olderPost.title}</span>
                </Link>
              )}
            </nav>
          )}
        </div>

        {/* ---------- 사이드바 ---------- */}
        <aside className="flex flex-col gap-3.5">
          {/* [#67] 관련 보도 — 같은 사건을 다룬 다른 매체. 뉴스룸에서 제일 먼저 오는 부가 정보다 */}
          {clusterRelated.length > 0 && (
            <div className="rise-in-2 card flex flex-col gap-1 rounded-[18px] p-[18px]">
              <div className="mb-1.5 text-[13px] font-extrabold text-ink">
                관련 보도 {clusterRelated.length}건{" "}
                <span className="text-[12px] font-medium text-text-3">같은 사건 · 다른 매체</span>
              </div>
              {clusterRelated.map((s, i) => (
                <Link
                  key={s.id}
                  href={`/town/news/${s.id}`}
                  className={`flex flex-col gap-0.5 py-[7px] ${i < clusterRelated.length - 1 ? "border-b border-divider" : ""}`}
                >
                  <div className="line-clamp-2 text-xs font-bold leading-[1.4] text-ink">{s.title}</div>
                  <div className="text-[10px] text-text-3">{s.meta}</div>
                </Link>
              ))}
            </div>
          )}

          {/* 기사 속 위치 — [970 · C-32] 지역이 비어 있는 전국 기사에는 지도를 그리지 않는다 */}
          {(post.city || post.district || post.relatedSite) && (
            <div className="rise-in-2 card flex flex-col gap-2.5 rounded-[18px] p-[18px]">
              <div className="text-[13px] font-extrabold text-ink">
                {post.city || post.district ? "기사 속 위치" : "연관 단지"}
              </div>
              {(post.city || post.district) && (
                <div className="relative">
                  <LocationMap
                    region={post.city}
                    city={post.city}
                    district={post.district}
                    label={region}
                    className="h-[150px]"
                  />
                  <Link
                    href={mapHref}
                    className="absolute bottom-2.5 right-2.5 rounded-lg bg-[var(--glass-bg)] px-2.5 py-[5px] text-[12px] font-bold text-primary"
                  >
                    {regionQuery ? `${regionQuery} 지도 열기` : "지도에서 열기"} ›
                  </Link>
                </div>
              )}
              {post.relatedSite && (
                <div className="flex justify-between text-xs">
                  <span className="text-text-2">연관 단지</span>
                  {relatedSiteHref ? (
                    <Link href={relatedSiteHref} className="font-bold text-primary">
                      {post.relatedSite} 시세 ›
                    </Link>
                  ) : (
                    <span className="font-bold text-ink">{post.relatedSite}</span>
                  )}
                </div>
              )}
            </div>
          )}

          {/* 이 지역 임장노트 — 사실 우선: 허위 노트 목록·건수 없이 작성/열람 진입만 */}
          <div className="rise-in-3 card flex flex-col gap-2.5 rounded-[18px] p-[18px]">
            <div className="text-[13px] font-extrabold text-ink">{regionQuery || "이 지역"} 임장노트</div>
            <p className="text-[12px] leading-relaxed text-text-3">
              현장을 다녀오셨다면 임장노트로 기록해 이웃과 공유해 보세요.
              {regionQuery ? ` 지역은 ${regionQuery}로 미리 채워집니다.` : ""}
            </p>
            <div className="flex gap-2">
              <Link href={noteNewHref} className="btn-primary btn-cta flex-1 rounded-[10px] p-2.5 text-center text-[12px]">
                {regionQuery ? `${regionQuery} 노트 쓰기` : "이 지역 노트 쓰기"}
              </Link>
              <Link href="/notes" className="btn-soft flex-1 rounded-[10px] p-2.5 text-center text-[12px]">
                공개 노트 보기
              </Link>
            </div>
          </div>

          {/* 유사 기사 — 실데이터 있을 때만 */}
          {similarPosts.length > 0 && (
            <div className="rise-in-4 card flex flex-col gap-1 rounded-[18px] p-[18px]">
              <div className="mb-1.5 text-[13px] font-extrabold text-ink">유사 기사</div>
              {similarPosts.map((s, i) => (
                <Link
                  key={s.title}
                  href={s.id ? `/town/news/${s.id}` : "/town/news"}
                  className={`flex flex-col gap-0.5 py-[7px] ${i < similarPosts.length - 1 ? "border-b border-divider" : ""}`}
                >
                  <div className="line-clamp-2 text-xs font-bold leading-[1.4] text-ink">{s.title}</div>
                  <div className="text-[10px] text-text-3">{s.meta}</div>
                </Link>
              ))}
            </div>
          )}

          {/* AD 슬롯 — 등록 배너도 하우스 광고도 없으면 AdSlot 이 null 을 반환해 빈 상자를 남기지 않는다 */}
          <div className="rise-in-5">
            <AdZone placement="sidebar" seed={0} plan={null} />
          </div>
        </aside>
      </div>
    </PageShell>
  );
}
