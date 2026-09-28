/* [1022 · 정렬·글씨·테마] 지시 4 — 임의 px(text-[NNpx]·text-xs) → 램프 유틸(t-caption/t-sub/t-body/t-section/t-title) · 이모지 아이콘 식별자 → 선 아이콘 이름. 구조·데이터 변경 없음. */
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageShell } from "@/app/components/PageShell";
import { EmptyState } from "@/app/components/ui/EmptyState";
import { TownCategoryNav } from "@/app/town/TownCategoryNav";
import { Icon } from "@/app/components/Icon";
import { listPostsByTag } from "@/lib/posts-store";
import { postHref } from "@/lib/town/post-href";
import {
  TOWN_PROMPTS,
  parsePromptIndex,
  promptTag,
  todayPromptIndex,
} from "@/lib/town/prompts";
import { seoAlternates } from "@/lib/seo/alternates";
import { relativeTimeLabel } from "@/lib/format/relative-time";
/* [1012] 규칙 8 — 굵기 3단(400/500/700): 이 파일의 font-bold(800) 를 전부 font-bold(700) 로 내렸다. */

/* [#63] 글감 스레드 — 질문 하나 = 고정 URL 하나(/town/prompt/0~13).
 * 같은 질문이 14일 주기로 돌아오며 답변이 이 페이지에 계속 쌓인다 —
 * 질문 자체가 검색 표면이 되는 에버그린 Q&A 페이지. */

/* [1010] 300초 → 1일. 14장짜리 에버그린 스레드인데 5분 눈금이라 크롤 1회 = 재렌더 1회였다.
   이 화면이 바뀌는 지점은 "그 글감 태그가 붙은 이웃 글"뿐이고, 글 작성·수정·삭제·댓글이
   invalidatePromptThreads(글.tags) 로 **그 한 장만** 비운다(14장을 통째로 비우지 않는다). */
export const revalidate = 86_400;
/* 유효 인덱스는 0~13뿐 — 그 밖은 라우팅 계층에서 바로 404 (soft-404 방지) */
export const dynamicParams = false;

export function generateStaticParams() {
  return TOWN_PROMPTS.map((_, i) => ({ idx: String(i) }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ idx: string }>;
}): Promise<Metadata> {
  const { idx } = await params;
  const i = parsePromptIndex(idx);
  if (i === null) return { title: "오늘의 동네 질문 | 내집나우" };
  return {
    title: `${TOWN_PROMPTS[i]} — 동네 이웃들의 답변 | 내집나우`,
    description: `"${TOWN_PROMPTS[i]}" 질문에 대한 동네 이웃들의 실제 답변 모음. 내집나우 오늘의 동네 글감.`,
    alternates: seoAlternates(`/town/prompt/${i}`),
    robots: { index: true, follow: true },
  };
}

/** [967 · 32] 일 단위 — "오늘 / 어제 / N일 전(30일) / 8월 19일". 본체는 lib/format/relative-time.ts */
function relativeDay(iso: string): string {
  return relativeTimeLabel(iso, Date.now(), { unit: "day", yesterday: true, maxDays: 30, fallback: "md-long" });
}

export default async function PromptThreadPage({
  params,
}: {
  params: Promise<{ idx: string }>;
}) {
  const { idx } = await params;
  const i = parsePromptIndex(idx);
  if (i === null) notFound();

  const question = TOWN_PROMPTS[i];
  const posts = await listPostsByTag(promptTag(i), 50);
  const isToday = todayPromptIndex() === i;

  return (
    <PageShell breadcrumb="동네이야기 › 오늘의 질문">
      <TownCategoryNav />
      <div className="mx-auto w-full max-w-[720px]">
        <section className="rise-in card mb-4 p-5 max-md:mb-3 max-md:p-3.5">
          <div className="flex items-center gap-1.5 t-sub font-bold text-primary">
            <Icon name="notebook-pen" size={13} />
            동네 질문 {i + 1} / {TOWN_PROMPTS.length}
            {isToday && (
              <span className="rounded-md bg-primary-soft px-1.5 py-0.5 t-caption">오늘의 질문</span>
            )}
          </div>
          <h1 className="mt-1.5 t-title font-bold leading-[1.45] text-ink">{question}</h1>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Link
              href={`/town/write?topic=${encodeURIComponent(question)}&pi=${i}`}
              className="btn-cta rounded-full px-4 py-2 t-body font-bold no-underline tap-ripple"
            >
              내 동네 이야기로 답하기 +50P
            </Link>
            <span className="t-sub text-text-3">
              답변 {posts.length}
              {posts.length >= 50 ? "+" : ""}개
            </span>
          </div>
        </section>

        {posts.length === 0 ? (
          <EmptyState
            icon="messages-square"
            title="아직 이 질문에 달린 답변이 없어요"
            desc="첫 답변이 이 페이지의 시작이 됩니다."
            action={{
              href: `/town/write?topic=${encodeURIComponent(question)}&pi=${i}`,
              label: "첫 답변 쓰기 +50P",
            }}
          />
        ) : (
          <div className="flex flex-col gap-2.5">
            {posts.map((p, pi) => (
              <Link
                key={p.id}
                /* [1007 · P2] 글감 답변은 사람 글 — 이야기 상세로 바로(뉴스 상세 리다이렉트 제거) */
                href={postHref(p)}
                className={`rise-in-${Math.min(pi + 1, 6)} card block rounded-2xl p-4 no-underline tap-ripple`}
              >
                <div className="flex items-center gap-2 t-sub text-text-3">
                  <span className="font-bold text-text-2">{p.authorLabel}</span>
                  <span>{[p.city, p.district].filter(Boolean).join(" ") || "전국"}</span>
                  <span>· {relativeDay(p.createdAt)}</span>
                  {p.commentCount > 0 && <span>· 댓글 {p.commentCount}</span>}
                </div>
                <h2 className="mt-1 t-section font-bold leading-[1.5] text-ink">{p.title}</h2>
                <p className="mt-1 line-clamp-2 t-body leading-[1.65] text-text-2">{p.body}</p>
              </Link>
            ))}
          </div>
        )}

        {/* 다른 질문 둘러보기 */}
        <div className="mt-6">
          <h2 className="mb-2 t-body font-bold text-ink">다른 동네 질문</h2>
          <div className="flex flex-wrap gap-1.5">
            {TOWN_PROMPTS.map((q, qi) =>
              qi === i ? null : (
                <Link
                  key={qi}
                  href={`/town/prompt/${qi}`}
                  className="chip border border-line bg-surface px-3 py-1.5 t-sub font-semibold text-text-2 no-underline"
                >
                  {q.length > 24 ? `${q.slice(0, 24)}…` : q}
                </Link>
              ),
            )}
          </div>
        </div>
      </div>
    </PageShell>
  );
}
