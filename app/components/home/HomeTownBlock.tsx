import Link from "next/link";
import type { HomeNewsItem, HomeStoryItem } from "@/lib/newui/home-data";
import { storyHref, newsHref } from "@/lib/town/post-href";
import { relativeTimeLabel } from "@/lib/format/relative-time";
import { HOME_LIST, HomeRow, HomeSectionHead } from "./HomeRows";

/* ============================================================
   [1007 · P2 → v4] 홈 — 동네 소식(이웃 글 + 뉴스룸 기사) 한 섹션. 서버 조각, 상태 없음, 클라이언트 JS 없음.

   예전(1007): 2칸 — 왼쪽 흰 카드 안 이야기 카드(.story-card · 머리글자 원 · "이야기" 한지 알약 · 동네 알약 ·
   아이콘 달린 댓글/사진 수) / 오른쪽 한지 스트립(.news-strip · "뉴스룸 자동 수집 · 최신 3건" 머리 · 매체 열).
   [v4 · 규칙 5·6·7] 카드 안 카드 · 설명 배지 · 아이콘 · 두 재질을 걷고 **1px 구분선 행 하나의 목록**으로 합쳤다.
   이웃 글과 기사는 메타 줄이 가른다 — 이웃 글 "작성자 · 동네 · 3시간 전 · 댓글 2", 기사 "매체 · 09.26".
   이웃 글이 먼저(사람의 기록), 기사는 그 아래. 0건은 0건으로 한 줄(가짜 카드 없음), 조회 실패는 실패로 말한다
   (이야기·뉴스는 같은 조회라 실패도 하나다). 뉴스룸 전체·첫 글 쓰기 링크는 섹션 끝 캡션 한 줄로.
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
  const empty = stories.length === 0 && news.length === 0;
  return (
    <section aria-labelledby="home-town-h" className="flex flex-col gap-2">
      <HomeSectionHead id="home-town-h" title="동네 소식" link={{ href: "/town", label: "동네이야기 보기 ›" }} />
      <ul data-tone="hanji" className={HOME_LIST}>
        {failed ? (
          <HomeRow muted label="이웃 글을 지금 불러오지 못했어요" />
        ) : (
          <>
            {stories.map((p) => (
              <HomeRow
                key={`s-${p.id}`}
                href={storyHref(p.id)}
                label={p.title}
                sub={
                  <>
                    {[p.author, p.region].filter(Boolean).join(" · ")} ·{" "}
                    <time dateTime={p.createdAt}>{relativeTimeLabel(p.createdAt, now)}</time>
                    {/* 댓글 수는 0 이어도 적는다 — 이야기는 대화다(1006 카드와 같은 규칙) */}
                    {` · 댓글 ${p.comments}`}
                    {p.photos > 0 ? ` · 사진 ${p.photos}` : ""}
                  </>
                }
              />
            ))}
            {news.map((n) => (
              <HomeRow
                key={`n-${n.id}`}
                href={newsHref(n.id)}
                label={n.title}
                sub={
                  <>
                    {n.source ?? "뉴스"}
                    {n.when && (
                      <>
                        {" · "}
                        <time dateTime={n.publishedAt ?? undefined}>{n.when.slice(5)}</time>
                      </>
                    )}
                  </>
                }
              />
            ))}
            {empty && <HomeRow muted label="최근 동네 소식 아직 없음" />}
          </>
        )}
      </ul>
      {/* 끝 캡션 한 줄 — 이웃 글 0건이면 첫 글 쓰기(목록이 통째로 비었으면 "없음"은 위 행이 이미 말했다), 그리고 뉴스룸 전체 */}
      <p className="t-caption text-text-3">
        {!failed && stories.length === 0 && (
          <>
            {empty ? "" : "이웃 글 아직 없음 · "}
            <Link href="/town/write" className="tap-line font-bold text-primary no-underline">
              첫 동네 이야기 쓰기 ›
            </Link>
            {" · "}
          </>
        )}
        <Link href="/town/news" className="tap-line font-bold text-primary no-underline">
          뉴스룸 기사 전체 보기 ›
        </Link>
      </p>
    </section>
  );
}
