import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageShell } from "@/app/components/PageShell";
import { ReportButton } from "@/app/components/ReportButton";
import { CoverImage } from "@/app/components/CoverImage";
import { AdZone } from "@/app/components/ads/AdZone";
import { Icon } from "@/app/components/Icon";
import { getStoryPost, listStoryPosts } from "@/lib/town/story";
import { isPostHidden } from "@/lib/moderation/reports-store";
import { postAttachments } from "@/lib/community/attachments";
import { townHandoff } from "@/lib/town/handoff";
import { regionIdForName } from "@/lib/region/catalog";
import { seoAlternates } from "@/lib/seo/alternates";
import { breadcrumbJsonLd, jsonLdScript } from "@/lib/seo/jsonld";
import { formatKstDateTime } from "@/lib/format/kst";
import { relativeTime } from "../../shared";
import { LocationMap } from "../../LocationMap";
import { PostActions, CommentForm, LikeButton } from "../../news/[id]/PostInteractions";
import { CommentThread } from "../../news/[id]/CommentThread";
import { getServiceSupabase } from "@/lib/supabase/service";
import { logger } from "@/lib/log";
import type { Post } from "@/lib/types/post";

/* ============================================================
   [1006] 이야기 상세 — /town/story/[id] · posts 테이블(사람 글) **전용**.

   뉴스 상세(/town/news/[id])에서 갈라져 나왔다. 그 화면은 기사의 것(출처·원문·관련
   보도)이고, 여기는 사람의 것이다: 작성자 · 동네 · 본문 · 사진 · 댓글. 규칙은
   globals.css "[1006]" 블록(.story-*). 자동수집 글은 여기서 열리지 않는다(404).
   댓글·공감·저장 API 는 posts 스토어에 쓰므로 이 화면의 컨트롤은 전부 실제로 동작한다.
   ============================================================ */

/* ISR — 댓글·공감 API 가 revalidatePath("/town/story/[id]") 로 즉시 재생성한다.
   서버 렌더에는 사용자별 상태가 없다(세션은 클라이언트 조각이 API 로 확인). */
/* [1007] 600초 → 6시간. 댓글·공감·채택 API 가 revalidatePath 로 즉시 재생성하므로 시간 TTL 은
   안전망이다(이웃 글은 지금 0건 — 크롤러 재방문만 줄인다). */
/* [1010] 6시간 → 7일. 이 화면은 사람이 쓴 글이라 시간이 아니라 **쓰기 지점**이 신선도를 맡는다 —
   글 작성/수정/삭제(app/api/community/posts/route.ts · [id]/route.ts), 댓글 작성/삭제
   ([id]/comments/route.ts), 공감([id]/like/route.ts), 채택([id]/comments/adopt/route.ts)이
   전부 revalidatePath(`/town/story/{id}`) 를 이미 부른다(그 네 곳은 tests/unit/cache-1007 이 잠근다).
   실측 근거는 /town/news/[id] 와 같다(크롤러 재방문 ≈2.2일 > 6시간 TTL → 방문마다 재렌더). */
export const revalidate = 604_800;
export function generateStaticParams() {
  return [];
}

/** 포인트 상점 '닉네임 오로라' — 작성자 프로필의 settings.nickname_effect 를 읽어
    **만료 전일 때만** 종류를 돌려준다. rowToPost 는 author_email 을 지우므로(피드에
    이메일이 새지 않게) 서비스 키로 id→author_email→profiles.settings 를 직접 잇는다.
    조회 실패는 효과 없음으로 조용히 처리한다 — 장식이 본문 렌더를 막으면 안 된다. */
async function readAuthorNicknameEffect(
  postId: string,
): Promise<{ nick: "aurora" | "sunset" | null; badge: boolean }> {
  const none = { nick: null, badge: false } as const;
  try {
    const sb = getServiceSupabase();
    if (!sb) return none;
    const { data: row } = await sb.from("posts").select("author_email").eq("id", postId).maybeSingle();
    const email = typeof row?.author_email === "string" ? row.author_email : "";
    if (!email) return none;
    const { data: prof } = await sb.from("profiles").select("settings").eq("email", email).maybeSingle();
    const settings = prof?.settings as {
      nickname_effect?: { kind?: string; until?: string };
      season_badge?: { kind?: string; until?: string };
    } | null;
    const eff = settings?.nickname_effect;
    const alive = (u: unknown) => typeof u === "string" && Date.parse(u) > Date.now();
    const nick =
      (eff?.kind === "aurora" || eff?.kind === "sunset") && alive(eff.until)
        ? (eff.kind as "aurora" | "sunset")
        : null;
    const badge = settings?.season_badge?.kind === "autumn2026" && alive(settings.season_badge.until);
    return { nick, badge };
  } catch {
    return none;
  }
}

function paragraphs(body: string): string[] {
  const parts = body
    .replace(/\r/g, "")
    .split(/\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
  return parts.length > 0 ? parts : [body];
}

function regionLabel(p: Post): string {
  return [p.city, p.district].filter(Boolean).join(" ") || "전국";
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const post = await getStoryPost(id);
  if (!post) {
    return {
      title: "이야기를 찾을 수 없습니다 | 내집나우",
      description: "요청하신 이웃 글을 찾을 수 없습니다.",
      robots: { index: false, follow: false },
    };
  }
  const region = regionLabel(post);
  const body = post.body.replace(/\s+/g, " ").trim();
  const description = body ? body.slice(0, 150) : `${region} 이웃이 남긴 동네 이야기.`;
  const photos = postAttachments(post);
  const title = `${post.title} — ${region} 동네이야기 | 내집나우`;
  return {
    title,
    description,
    alternates: seoAlternates(`/town/story/${post.id}`),
    /* 링크로만 공개한 글은 색인하지 않는다 — 작성자가 고른 공개 범위 */
    robots: { index: post.visibility !== "link_only", follow: true },
    openGraph: {
      type: "article",
      title: post.title,
      description,
      siteName: "내집나우",
      locale: "ko_KR",
      publishedTime: post.createdAt,
      ...(post.updatedAt ? { modifiedTime: post.updatedAt } : {}),
      ...(photos.length ? { images: photos.slice(0, 1).map((url) => ({ url })) } : {}),
    },
    twitter: {
      card: photos.length ? "summary_large_image" : "summary",
      title: post.title,
      description,
      ...(photos.length ? { images: [photos[0]] } : {}),
    },
  };
}

export default async function TownStoryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  /* 없음은 404, 실패는 던져 5xx — 못 읽은 것을 "없는 글"로 위장하지 않는다(posts-store 규칙) */
  const post = await getStoryPost(id);
  if (!post) notFound();
  if (await isPostHidden(id).catch(() => false)) notFound();

  const region = regionLabel(post);
  const author = post.authorLabel?.trim() || "이웃";
  const initial = author.slice(0, 1);
  const photos = postAttachments(post);
  const bodyParas = paragraphs(post.body);
  const activeComments = post.comments.filter((c) => !c.deletedAt);
  const nickEffect = await readAuthorNicknameEffect(post.id);
  const { region: regionQuery, mapHref, noteNewHref } = townHandoff({
    city: post.city,
    district: post.district,
  });
  const regionId =
    regionIdForName([post.city, post.district].filter(Boolean).join(" ")) ??
    (post.district ? regionIdForName(post.district) : null);

  /* 다른 이웃 글 — 같은 스토어에서 최신 5건(자기 글 제외). 실패는 섹션만 접는다. */
  let others: Post[] = [];
  try {
    others = (await listStoryPosts(12)).filter((p) => p.id !== post.id).slice(0, 5);
  } catch (e) {
    logger.error("[/town/story/[id]] 다른 이웃 글 조회 실패", e);
    others = [];
  }

  return (
    <PageShell breadcrumb={`동네이야기 › 이야기 › ${region}`}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLdScript(
            breadcrumbJsonLd([
              { name: "홈", url: "/" },
              { name: "동네이야기", url: "/town" },
              { name: post.title, url: `/town/story/${post.id}` },
            ]),
          ),
        }}
      />

      {/* 저장·공유 — POST /api/bookmarks(type: post) · Web Share */}
      <PostActions postId={post.id} title={post.title} saveCount={post.bookmarkCount ?? 0} />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex flex-col gap-4">
          {/* ---------- 이야기 본문 — 사람이 먼저 ---------- */}
          <article className="rise-in story-card flex flex-col gap-4 p-5 md:p-7">
            <header className="flex items-center gap-3">
              <span className="story-avatar story-avatar--lg" aria-hidden="true">
                {initial}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span
                    className={`t-body font-extrabold text-ink ${
                      nickEffect.nick === "aurora" ? "nick-aurora" : nickEffect.nick === "sunset" ? "nick-sunset" : ""
                    }`}
                  >
                    {author}
                  </span>
                  {nickEffect.badge && (
                    <span title="가을 산책 배지 — 포인트 상점" aria-label="가을 산책 배지">
                      🍂
                    </span>
                  )}
                  <span className="story-kind t-caption">이야기</span>
                  <span className="rounded-md bg-primary-soft px-1.5 py-px t-caption font-extrabold text-primary">
                    {region}
                  </span>
                </div>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-2 t-caption text-text-3">
                  <span>{post.category}</span>
                  {/* updatedAt 은 댓글·공감이 붙어도 바뀌는 값이라 "수정됨" 표식으로 쓰지 않는다 */}
                  <time dateTime={post.createdAt}>{formatKstDateTime(post.createdAt)}</time>
                </div>
              </div>
            </header>

            <h1 className="t-title text-ink">{post.title}</h1>

            {/* [B31] 이웃이 올린 사진 — 한 장이면 넓게, 여러 장이면 격자로. 비율로 높이를
                먼저 잡아 로드 전후 시프트가 0이다. 없으면 아무것도 그리지 않는다. */}
            {photos.length > 0 && (
              <div className={photos.length === 1 ? "grid grid-cols-1 gap-2" : "grid grid-cols-2 gap-2 sm:grid-cols-3"}>
                {photos.map((url, i) => (
                  <div
                    key={url}
                    className={`relative w-full overflow-hidden rounded-[10px] bg-bg ${
                      photos.length === 1 ? "aspect-[16/10] max-h-[420px]" : "aspect-square"
                    }`}
                  >
                    <CoverImage
                      src={url}
                      alt={`${post.title} 사진 ${i + 1}`}
                      imgClassName="absolute inset-0 h-full w-full object-cover"
                      sizes={photos.length === 1 ? "(max-width: 768px) 100vw, 640px" : "(max-width: 768px) 50vw, 220px"}
                      priority={i === 0}
                    />
                  </div>
                ))}
              </div>
            )}

            <div className="story-body flex flex-col gap-3">
              {bodyParas.map((t, i) => (
                <p key={i}>{t}</p>
              ))}
            </div>

            {post.tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5" aria-label="태그">
                {post.tags.slice(0, 8).map((t) => (
                  <span key={t} className="rounded-full bg-bg chip-pad t-sub font-semibold text-text-2">
                    #{t}
                  </span>
                ))}
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-divider pt-3.5">
              <div className="flex flex-wrap items-center gap-1 t-caption text-text-3">
                <span>{region} 이웃이 남긴 글 ·</span>
                {/* 신고 연결(#81) — POST /api/moderation/content-report */}
                <ReportButton postId={post.id} />
              </div>
              {/* POST /api/community/posts/[id]/like — posts 스토어에 쓰므로 여기선 실제로 동작한다 */}
              <div className="flex gap-3.5 text-xs text-text-2">
                <LikeButton postId={post.id} initialCount={post.likeCount} />
              </div>
            </div>
          </article>

          {/* ---------- 댓글 ---------- */}
          {/* id="comments" — 댓글 알림(메일·인앱)의 착지점. lib/notifications/comment-notify.ts 가
              이 앵커로 링크를 만든다. */}
          <section id="comments" className="rise-in-1 card flex scroll-mt-24 flex-col gap-3 rounded-[18px] px-5 py-5 md:px-[26px]">
            <div className="flex items-center gap-2 t-section text-ink">
              <Icon name="messages-square" size={16} />
              댓글 {post.commentCount}
            </div>
            {activeComments.length === 0 && (
              <p className="t-sub text-text-3">아직 댓글이 없어요 — 첫 답을 남겨 보세요.</p>
            )}
            {/* [#65·#66] 채택·대댓글 스레드 — 상대시각은 서버에서 계산해 넘긴다(하이드레이션 불일치 방지) */}
            <CommentThread
              postId={post.id}
              comments={activeComments.map((c) => ({
                id: c.id,
                authorLabel: c.authorLabel,
                body: c.body,
                createdAt: c.createdAt,
                parentId: c.parentId ?? null,
                adopted: c.adopted === true,
              }))}
              relativeLabels={Object.fromEntries(activeComments.map((c) => [c.id, relativeTime(c.createdAt)]))}
            />
            <CommentForm postId={post.id} />
          </section>
        </div>

        {/* ---------- 사이드바 ---------- */}
        <aside className="flex flex-col gap-3.5">
          {/* 이 동네 — 지도 + 동네 홈 + 노트 쓰기. 글의 지역이 곧 이야기의 축이다 */}
          <div className="rise-in-2 card flex flex-col gap-2.5 rounded-[18px] p-[18px]">
            <div className="t-body font-extrabold text-ink">{region}</div>
            {(post.city || post.district) && (
              <div className="relative">
                <LocationMap region={post.city} city={post.city} district={post.district} label={region} className="h-[150px]" />
                <Link
                  href={mapHref}
                  className="absolute bottom-2.5 right-2.5 rounded-lg bg-[var(--glass-bg)] px-2.5 py-[5px] t-sub font-bold text-primary"
                >
                  {regionQuery ? `${regionQuery} 지도 열기` : "지도에서 열기"} ›
                </Link>
              </div>
            )}
            <div className="flex flex-col gap-2">
              {regionId && (
                <Link href={`/town/${regionId}`} className="btn-soft rounded-[10px] px-3.5 py-2.5 text-center t-sub font-bold no-underline">
                  {region} 동네 홈 ›
                </Link>
              )}
              <Link href={noteNewHref} className="btn-primary btn-cta rounded-[10px] px-3.5 py-2.5 text-center t-sub no-underline">
                {regionQuery ? `${regionQuery} 임장노트 쓰기` : "이 지역 임장노트 쓰기"}
              </Link>
            </div>
          </div>

          {/* 다른 이웃 글 — 있으면 목록, 없으면 정직하게 */}
          <div className="rise-in-3 card flex flex-col gap-1 rounded-[18px] p-[18px]">
            <div className="mb-1.5 t-body font-extrabold text-ink">다른 이웃 글</div>
            {others.length === 0 ? (
              <p className="t-sub text-text-3">아직 다른 이웃 글이 없어요.</p>
            ) : (
              others.map((p, i) => (
                <Link
                  key={p.id}
                  href={`/town/story/${p.id}`}
                  className={`flex items-center gap-2.5 py-[7px] no-underline ${i < others.length - 1 ? "border-b border-divider" : ""}`}
                >
                  <span className="story-avatar" aria-hidden="true">
                    {(p.authorLabel?.trim() || "이").slice(0, 1)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="line-clamp-2 t-sub font-bold leading-[1.4] text-ink">{p.title}</span>
                    <span className="block t-caption text-text-3">
                      {p.authorLabel || "이웃"} · {regionLabel(p)} · 댓글 {p.commentCount}
                    </span>
                  </span>
                </Link>
              ))
            )}
            <Link href="/town?kind=post" className="mt-1 inline-flex min-h-[24px] items-center t-sub font-bold text-primary no-underline">
              이야기 피드 전체 ›
            </Link>
          </div>

          <div className="rise-in-4">
            <AdZone placement="sidebar" seed={0} plan={null} />
          </div>
        </aside>
      </div>
    </PageShell>
  );
}
