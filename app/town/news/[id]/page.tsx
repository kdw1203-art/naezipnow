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
import { SummaryRow } from "@/app/complex/[id]/SummaryRow";
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
/* [1012] 규칙 8 — 굵기 3단(400/500/700): 이 파일의 font-extrabold(800) 를 전부 font-bold(700) 로 내렸다. */

/* ============================================================
   뉴스 상세 — board_posts(자동수집 기사) **전용**. 없는 글은 notFound() (목업 기사 금지).

   [1006] 예전엔 이 라우트가 posts(사람 글)도 열었다 — 같은 화면이 기사도 이야기도
   그렸고, 댓글·좋아요는 posts 스토어에만 쓰이므로 기사 페이지의 댓글창·공감 버튼은
   운영에서 한 번도 동작한 적이 없는 컨트롤이었다(board_comments 0행). 이제:
     · posts 에 있는 글이 이 주소로 오면 /town/story/[id] 로 **영구 리다이렉트**(옛 링크 보호)
     · 기사에는 출처 · 원문 링크 · 관련 보도 · 우리 요약 — 댓글·공감 없음
     · NewsArticle JSON-LD 는 우리 요약 유무와 무관하게 항상(lib/town/news-jsonld)

   [v4] "한 화면 한 가지" — 가운데 한 줄(760px). 위에서 아래로:
     머리(브레드크럼 · 제목 · 메타 한 줄 + 저장·공유) → 핵심 요약(AI 패널 — 요약 파이프라인 결과) → 사진 → 요약/본문
     → 배경 · 시장에 주는 의미(제목 + 문단) → 원문 한 행 → FAQ → 관련 지역·태그 글자 링크 → 저작권 줄
     → 관련 보도(1px 선 행) → 기사 속 위치(지도 + 행) → 다른 기사(이웃 기사 + 유사 기사 행).
   지운 것: 본문 카드 · 340px 사이드바 · 메타 줄 배지(분류 · "자동 수집"/"내집나우 요약") · 머리의 원문 링크(끝 행과 중복) ·
   옛 글 "3줄 요약" 네이비 패널(AI 결과 아님 · 본문과 같은 문단) · 칩(지역·태그 → 글자 링크) · "이 지역 임장노트"
   설명 문장 · 하우스 광고(AdZone).
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
      title: "기사를 찾을 수 없어요 | 내집나우",
      description: "요청하신 기사를 찾을 수 없어요.",
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
  /* [v4] 옛 글의 "3줄 요약"(원문 앞 3문단을 55자로 자른 것)은 걷었다 — 바로 아래 본문(bodyParas)이 같은 문단을
     그대로 싣는다(규칙 8). 우리 요약이 있는 글은 keyPoints(핵심 요약)가 그 자리다. */
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

  /* [v4] "다른 기사" 한 목록 — 이웃 기사(목록 정렬 기준 다음·이전) + 유사 기사. 예전엔 카드 두 장 + 사이드 카드 따로 */
  const otherRows: { key: string; label: string; sub: string; href: string }[] = [
    ...(newerPost?.id
      ? [{ key: `n-${newerPost.id}`, label: newerPost.title, sub: "다음 기사 · 최신", href: `/town/news/${encodeURIComponent(newerPost.id)}` }]
      : []),
    ...(olderPost?.id
      ? [{ key: `o-${olderPost.id}`, label: olderPost.title, sub: "이전 기사", href: `/town/news/${encodeURIComponent(olderPost.id)}` }]
      : []),
    ...similarPosts
      .filter((s) => s.id && s.id !== newerPost?.id && s.id !== olderPost?.id)
      .map((s) => ({ key: `s-${s.id}`, label: s.title, sub: s.meta, href: `/town/news/${s.id}` })),
  ];

  return (
    <PageShell>
      {/* [945-G] 읽기 진행 바 — 긴 글에서만 나타난다(컴포넌트가 판정) */}
      <ReadingProgress />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript(jsonLd) }}
      />

      {/* [v4] 가운데 한 줄(최대 760px) — 예전 본문 카드 + 오른쪽 사이드바(관련 보도·위치·노트·유사 기사·광고) 2열 없음 */}
      <div className="mx-auto flex w-full max-w-[760px] flex-col gap-8">
        {/* ---------- 기사 ---------- */}
        <article className="flex flex-col gap-5">
          {/* [v4 · 규칙 1] 머리 — 브레드크럼(뉴스룸 링크 › 분류) · 제목 · 메타 한 줄 + 저장·공유.
              예전 메타 줄의 분류 배지(.news-tag)·"자동 수집"/"내집나우 요약" 배지는 뺐다(규칙 6) — 같은 사실은 기사 끝
              저작권 줄이 말한다. "{지역} 시세 보기"는 아래 "이 지역" 목록으로 옮겼다. */}
          <header className="flex flex-col gap-2">
            <nav aria-label="브레드크럼" className="t-sub text-text-3">
              <Link href="/town/news" className="tap-line text-text-2 no-underline">
                뉴스룸
              </Link>{" "}
              › {category}
            </nav>
            {/* [1012] 규칙 8 — 24px → t-title(20px): 본문 13~14px 의 2배 안 */}
            <h1 className="t-title leading-[1.4] text-ink">{title}</h1>
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
              {/* [v4] 메타 한 줄 — 매체 · 발행 시각 · 지역(분류는 브레드크럼이 말한다 — 같은 사실은 한 번) */}
              <p className="min-w-0 truncate t-sub text-text-3">
                {sourceName} · <time dateTime={publishedIso}>{fullDateTime(publishedIso)}</time> · {region}
              </p>
              {/* 저장·공유(POST /api/bookmarks · Web Share) — PostInteractions.tsx 주석 참고 */}
              <PostActions postId={post.id} title={title} saveCount={saveCount} className="shrink-0" />
            </div>
          </header>

          {/* 우리 요약의 핵심 문장 — 요약 파이프라인이 새로 쓴 글이라 AI 결과 패널(네이비)에 둔다(v4 규칙 4 의 예외).
              [v4] 우리 요약이 없는 옛 글의 "3줄 요약"(원문 앞 3문단을 55자로 자른 것)은 뺐다 — AI 결과가 아닌데 네이비
              패널이었고, 바로 아래 본문이 같은 문단을 그대로 싣는다(규칙 8 — 같은 사실은 한 번). */}
          {keyPoints.length > 0 ? (
            <AIPanel title="핵심 요약">
              {keyPoints.map((t, i) => (
                <span key={i}>
                  {i > 0 && <br />}
                  {`· ${t}`}
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
          </div>

          {/* [v4 · 규칙 5] 배경·시장에 주는 의미 — 테두리 상자 두 개 → 섹션 제목 + 문단(카드 없음) */}
          {renderOwnSummary && context ? (
            <section className="flex flex-col gap-1">
              <h2 className="t-section text-ink">배경</h2>
              <p className="text-[13px] leading-[1.75] text-text-1">{context}</p>
            </section>
          ) : null}
          {renderOwnSummary && implication ? (
            <section className="flex flex-col gap-1">
              <h2 className="t-section text-ink">시장에 주는 의미</h2>
              <p className="text-[13px] leading-[1.75] text-text-1">{implication}</p>
            </section>
          ) : null}

          {/* 웹12 — 원문 링크. 요약본 사이트의 예의는 원문으로 잘 보내는 것.
              [v4] 머리의 "원문 보기 · 호스트" 와 본문 끝 타일이 같은 곳으로 가는 두 버튼이었다 — 1px 선 행 하나로 */}
          {post.sourceUrl && (
            <a
              href={post.sourceUrl}
              target="_blank"
              rel="noopener nofollow"
              className="flex min-h-14 items-center justify-between gap-3 border-y border-line py-3 no-underline"
            >
              <span className="min-w-0 flex-1">
                {/* [1012] 규칙 5 — 동사 + 구체 대상(매체명) */}
                <span className="block t-body font-bold text-primary">
                  {post.sourceName ? `${post.sourceName}에서 전문 읽기 ↗` : "원문에서 전문 읽기 ↗"}
                </span>
                {sourceHost && <span className="mt-0.5 block truncate t-sub text-text-3">{sourceHost}</span>}
              </span>
            </a>
          )}

          {/* FAQ — FAQPage 구조화 데이터와 화면 내용이 같아야 유효하므로 함께 낸다. */}
          {faq.length > 0 ? (
            <section aria-label="자주 묻는 질문" className="flex flex-col gap-2">
              <h2 className="t-section text-ink">자주 묻는 질문</h2>
              <dl className="flex flex-col gap-3">
                {faq.map((f, i) => (
                  <div key={i} className="flex flex-col gap-1">
                    <dt className="text-[13px] font-bold text-ink">Q. {f.q}</dt>
                    <dd className="text-[13px] leading-[1.7] text-text-1">{f.a}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ) : null}

          {/* 관련 지역 · 태그 — [v4] 칩 두 줄 → 글자 링크 한 줄씩(칩은 필터에만 — 규칙 6).
              해석되는 시군구·단지·주제만 링크(죽은 링크 금지), 나머지는 글자 그대로 */}
          {geo.places && geo.places.length > 0 ? (
            <nav aria-label="관련 지역" className="t-sub text-text-3">
              관련 지역 —{" "}
              {geo.places.map((place, i) => {
                const words = place.split(/\s+/).filter(Boolean);
                const rid =
                  regionIdForName(place) ??
                  (words.length >= 2 ? regionIdForName(words.slice(0, 2).join(" ")) : null) ??
                  (words.length >= 2 ? regionIdForName(words[1]) : null);
                return (
                  <span key={place}>
                    {i > 0 && " · "}
                    {rid ? (
                      <Link href={`/region/${rid}`} className="tap-line font-bold text-text-2 no-underline">
                        {place}
                      </Link>
                    ) : (
                      place
                    )}
                  </span>
                );
              })}
            </nav>
          ) : null}
          {tagLinks.length > 0 && (
            <nav aria-label="관련 태그" className="t-sub text-text-3">
              {tagLinks.map((t, i) => (
                <span key={t.label}>
                  {i > 0 && " · "}
                  {t.href ? (
                    <Link href={t.href} className="tap-line font-bold text-text-2 no-underline">
                      #{t.label}
                      {t.kind === "complex" && <span className="ml-1 font-normal text-text-3">시세</span>}
                    </Link>
                  ) : (
                    `#${t.label}`
                  )}
                </span>
              ))}
            </nav>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
            <div className="flex flex-wrap items-center gap-1 t-caption text-text-3">
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
              className="tap-line t-sub font-bold text-primary no-underline"
            >
              이 기사로 동네이야기 쓰기 ›
            </Link>
          </div>
        </article>

        {/* [#67] 관련 보도 — 같은 사건을 다룬 다른 매체. [v4] 사이드 카드 → 1px 선 행 목록(제목 + 매체 · 날짜) */}
        {clusterRelated.length > 0 && (
          <section aria-labelledby="news-related-title" className="flex flex-col gap-1">
            <h2 id="news-related-title" className="t-section text-ink">
              관련 보도 <span className="t-sub font-medium text-text-3">{clusterRelated.length}건</span>
            </h2>
            <ul data-tone="hanji" className="divide-y divide-line">
              {clusterRelated.map((s) => (
                <SummaryRow key={s.id} label={<span className="block truncate">{s.title}</span>} sub={s.meta} href={`/town/news/${s.id}`} />
              ))}
            </ul>
          </section>
        )}

        {/* 이 지역 — 기사 속 위치(지도) + 시세·연관 단지·임장노트로 가는 행.
            [970 · C-32] 지역이 비어 있는 전국 기사에는 지도를 그리지 않는다.
            [v4] 사이드 카드 두 장(위치 · "이 지역 임장노트" 설명 문장 + 버튼 둘) → 섹션 하나 + 1px 선 행 */}
        <section aria-labelledby="news-place-title" className="flex flex-col gap-2">
          <h2 id="news-place-title" className="t-section text-ink">
            {post.city || post.district ? "기사 속 위치" : "이 지역"}
          </h2>
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
                className="absolute bottom-2.5 right-2.5 rounded-lg border border-line bg-surface px-2.5 py-[5px] text-[12px] font-bold text-primary"
              >
                {/* [1012] 유리 토큰(--glass-bg) 대신 불투명 면 + 1px 선 */}
                {regionQuery ? `${regionQuery} 지도 열기` : "지도에서 열기"} ›
              </Link>
            </div>
          )}
          <ul data-tone="blue" className="divide-y divide-line">
            {regionId && <SummaryRow label={`${region} 시세 보기`} href={`/region/${regionId}`} />}
            {post.relatedSite &&
              (relatedSiteHref ? (
                <SummaryRow label={`${post.relatedSite} 시세`} sub="연관 단지" href={relatedSiteHref} />
              ) : (
                <SummaryRow label={post.relatedSite} sub="연관 단지" />
              ))}
            {/* 사실 우선: 허위 노트 목록·건수 없이 작성/열람 진입만. 새 노트의 지역 칸은 미리 채워진다(townHandoff) */}
            <SummaryRow label={regionQuery ? `${regionQuery} 임장노트 쓰기` : "이 지역 임장노트 쓰기"} href={noteNewHref} />
            <SummaryRow label="공개 임장노트 보기" href="/notes" />
          </ul>
        </section>

        {/* 다른 기사 — 웹19 이웃 기사(목록 정렬 기준) + 유사 기사. 실데이터 있을 때만 */}
        {otherRows.length > 0 && (
          <section aria-labelledby="news-other-title" className="flex flex-col gap-1">
            <h2 id="news-other-title" className="t-section text-ink">
              다른 기사
            </h2>
            <ul data-tone="hanji" className="divide-y divide-line">
              {otherRows.map((r) => (
                <SummaryRow key={r.key} label={<span className="block truncate">{r.label}</span>} sub={r.sub} href={r.href} />
              ))}
            </ul>
          </section>
        )}
      </div>
    </PageShell>
  );
}
