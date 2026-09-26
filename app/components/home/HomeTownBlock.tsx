import Link from "next/link";
import { Icon } from "@/app/components/Icon";
import type { HomeNewsItem, HomeStoryItem } from "@/lib/newui/home-data";
import { storyHref, newsHref } from "@/lib/town/post-href";
import { relativeTimeLabel } from "@/lib/format/relative-time";

/* ============================================================
   [1007 · P2] 홈 — 동네이야기(사람의 기록) · 뉴스룸(자동수집 기사) 블록. 서버 조각, 상태 없음.

   왜: 1006 이 /town(이야기)과 /town/news(뉴스룸)를 재질로 갈랐는데(globals.css [1006]
   .story-* / .news-*), 홈에는 그 둘이 아예 없거나(991 에서 뺐다) 같은 회색 줄로 섞여
   있었다. 홈에서도 "사람이 쓴 글"과 "기사"가 다른 재질로 보여야 두 화면의 규칙이
   첫 화면부터 이어진다. 클라이언트 JS 없음 — 홈 예산(495KB) 에 얹히는 것은 0 이다.

   규칙(1006 과 같다):
     · 이야기 = 흰 카드(.story-card) · 머리글자(.story-avatar) · "이야기" 한지 알약 ·
       동네 배지 · 댓글 수. 사진이 없으면 커버를 지어내지 않는다(여기서는 커버 자체를
       그리지 않는다 — 홈은 목록이 아니라 입구다).
     · 뉴스 = 한지 면 스트립(.news-strip) · 출처 · 제목 · 날짜 한 줄씩. 카드가 아니다.
     · 0건은 0건이라고 말한다(가짜 카드 없음). 조회 실패는 "못 불러왔다"고 따로 말한다.
   ============================================================ */

export function HomeTownBlock({
  stories,
  news,
  failed,
  now = Date.now(),
}: {
  stories: HomeStoryItem[];
  news: HomeNewsItem[];
  /** 이야기·뉴스는 같은 조회라 실패도 하나다 */
  failed: boolean;
  /** 요청당 한 번 잡은 시각 — 상대 시각 라벨용(hydration 안전) */
  now?: number;
}) {
  return (
    <section
      className="grid grid-cols-1 gap-3 md:grid-cols-2"
      aria-label="동네이야기와 뉴스룸"
    >
      {/* ── 동네이야기 — 사람의 기록 ───────────────────────────────── */}
      <div className="card flex flex-col gap-2 rounded-2xl px-4 py-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="t-section text-ink">
            동네이야기{" "}
            <span className="t-caption font-bold text-text-3">사람의 기록</span>
          </h2>
          <Link
            href="/town"
            className="inline-block py-[5px] text-[12px] text-text-3 transition-colors hover:text-primary"
          >
            더보기
          </Link>
        </div>
        {failed ? (
          <p className="m-0 t-sub text-text-3">이웃 글을 지금 불러오지 못했어요.</p>
        ) : stories.length === 0 ? (
          /* 0건 — 빈 방을 뉴스로 채우지 않는다(뉴스는 옆 칸의 다른 재질). 첫 글로 안내한다. */
          <div className="flex flex-col gap-2">
            <p className="m-0 t-sub text-text-3">
              아직 이웃이 쓴 이야기가 없어요. 다녀온 동네의 첫 기록을 남겨 보세요.
            </p>
            <Link
              href="/town/write"
              className="btn-secondary inline-flex min-h-10 w-fit items-center gap-1.5 rounded-xl px-3.5 t-sub font-extrabold no-underline"
            >
              <Icon name="notebook-pen" size={13} />
              이야기 쓰기
            </Link>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {stories.map((p) => {
              const initial = p.author.slice(0, 1);
              return (
                <Link
                  key={p.id}
                  href={storyHref(p.id)}
                  className="story-card tile flex min-h-10 flex-col gap-1.5 px-3 py-2.5 no-underline"
                >
                  <span className="flex items-center gap-2">
                    <span className="story-avatar" aria-hidden="true">
                      {initial}
                    </span>
                    <span className="min-w-0 flex-1 truncate t-sub font-extrabold text-ink">{p.author}</span>
                    <span className="story-kind t-caption">이야기</span>
                  </span>
                  <span className="line-clamp-2 t-body font-extrabold leading-snug text-ink">{p.title}</span>
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-1 t-sub text-text-3">
                    {p.region && (
                      <span className="rounded-md bg-primary-soft px-1.5 py-px t-caption font-extrabold text-primary">
                        {p.region}
                      </span>
                    )}
                    <time dateTime={p.createdAt}>{relativeTimeLabel(p.createdAt, now)}</time>
                    {/* 댓글 수는 0 이어도 적는다 — 이야기는 대화다(1006 카드와 같은 규칙) */}
                    <span className="inline-flex items-center gap-1">
                      <Icon name="messages-square" size={12} />
                      댓글 {p.comments}
                    </span>
                    {p.photos > 0 && (
                      <span className="inline-flex items-center gap-1">
                        <Icon name="camera" size={12} />
                        사진 {p.photos}
                      </span>
                    )}
                  </span>
                </Link>
              );
            })}
          </div>
        )}
      </div>

      {/* ── 뉴스룸 — 자동수집 기사(다른 재질: 한지 면 + 왼쪽 네이비 선) ───── */}
      <div className="news-strip flex flex-col px-4 py-3" aria-label="뉴스룸">
        <div className="flex items-center justify-between gap-2">
          <h2 className="news-strip__label m-0">
            <Icon name="newspaper" size={12} />
            뉴스룸
            <span className="font-semibold tracking-normal text-text-3">자동 수집 · 최신</span>
          </h2>
          <Link
            href="/town/news"
            className="inline-flex min-h-[24px] items-center gap-0.5 t-sub font-bold text-primary no-underline"
          >
            뉴스룸 전체
            <span aria-hidden="true">›</span>
          </Link>
        </div>
        {failed ? (
          <p className="m-0 mt-2 t-sub text-text-3">뉴스를 지금 불러오지 못했어요.</p>
        ) : news.length === 0 ? (
          <p className="m-0 mt-2 t-sub text-text-3">최근 수집된 기사가 아직 없어요.</p>
        ) : (
          <div className="mt-1 flex flex-col">
            {news.map((n) => (
              <Link key={n.id} href={newsHref(n.id)} className="news-strip__item">
                {n.source && <span className="news-source">{n.source}</span>}
                <span className="news-title">{n.title}</span>
                {n.when && (
                  <time
                    dateTime={n.publishedAt ?? undefined}
                    className="shrink-0 t-caption text-text-3 tabular-nums"
                  >
                    {n.when.slice(5)}
                  </time>
                )}
              </Link>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
