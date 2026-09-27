import Link from "next/link";
import { PageShell } from "../components/PageShell";
/* [967 · 19] 카드 변환·병합은 lib/town/feed.ts 로 옮겼다 — "더 보기"(/api/town/feed)와
   첫 장이 같은 코드로 카드를 만들어야 하기 때문이다. */
import { loadTownFeed, TOWN_FEED_FIRST_PAGE } from "@/lib/town/feed";
import { TownFeed, TownWriteMenu, type FeedCard } from "./feed-client";
import { TownNewsRow } from "./TownNewsStrip";
import { buildPageMetadata } from "@/lib/seo/page-metadata";
import { groupRegionsByCity } from "@/lib/town/region-groups";
import { TOWN_CATEGORY_LINKS } from "@/lib/town/category-links";
import { readTownPosts } from "@/lib/newui/board-posts";
import { buildNewsRows, countTodayKst, type NewsRow } from "@/lib/town/news-list";
import { logger } from "@/lib/log";
/* [1012] 규칙 8 — 굵기 3단(400/500/700): 이 파일의 font-extrabold(800) 를 전부 font-bold(700) 로 내렸다. */

export const metadata = buildPageMetadata({
  title: "동네이야기",
  /* [1012] 규칙 6 — 설명도 무엇을·어디서: 슬로건("다녀온 사람의 기록") 대신 구성·단위 */
  description:
    "이웃 글과 공개 임장노트를 동네별로 모은 피드 — 작성자·지역·댓글 수와 함께. 오늘의 부동산 기사와 청약·입주·공매·정비사업 입구.",
  path: "/town",
  og: { badge: "동네이야기", sub: "이웃 글 · 공개 임장노트 피드" },
});

/* ============================================================
   동네이야기 허브(/town) — 공개 임장노트 + 이웃 글(사람의 기록) 한 목록.

   [v4] "한 화면 한 가지"(소유자: "너무 복잡하고 뭐가 중요한지 … 분산돼서 어수선하다").
   주인공은 **목록 하나**다. 위에서 아래로:
     ① 머리 — 제목 "동네이야기"(t-title) + 오른쪽 작은 아웃라인 "글쓰기"(메뉴: 동네이야기·임장노트).
        네이비 히어로·워터마크·통계 줄("Lab 데이터 카드 33 · 가장 활발한 동네 …")·채움 파랑 두 개를 뺐다.
     ② 오늘 뉴스 — 한지 스트립(제목 4줄 + "자동 수집" 배지 + 매체 열) → 1px 선 행 하나(0건이면 없음).
     ③ 지역 칩 줄 → ④ 유형 밑줄 탭 + 정렬 토글 → ⑤ 1px 구분선 행 목록(TownFeed).
     ⑥ 동네 홈 전체(시·도별 접기) · 맨 아래 "동네 자료 — 뉴스룸 · 청약 · 공매 · 입주 · 정비사업" 한 줄.
   카테고리 아이콘 타일 줄(v4 규칙 7)과 하우스 광고(AdZone, 규칙 9)는 이 화면에서 뺐다.
   데스크톱도 같은 한 줄(가운데 최대 760px) — 사이드바 없음.
   ============================================================ */

/* [1007] 120초 → 600초 → [1010] 1일. 이 피드의 내용은 전부 쓰기 지점이 즉시 비운다 —
   invalidateTownFeed()(이웃 글·댓글·공감·채택·공개 노트) · invalidateAfterIngest("news")
   (뉴스 적재). 시간 TTL 은 그 비움을 놓쳤을 때의 안전망이다. */
export const revalidate = 86_400;

/* [1006] 오늘 뉴스 — readTownPosts 는 요청당 1회 캐시라 피드(loadTownFeed →
   loadPostCards)가 이미 읽은 같은 배열을 다시 쓴다(추가 DB 왕복 0). 실패하면 행을
   접는다 — 피드 쪽 실패 표시(loadFailed)가 따로 있으니 여기서 또 말하지 않는다.
   **전체 행**을 돌려준다 — "오늘 뉴스 n건"은 전체에서 센다. */
async function loadNewsRows(): Promise<NewsRow[]> {
  try {
    return buildNewsRows(await readTownPosts());
  } catch (e) {
    logger.error("[town] 오늘 뉴스 조회 실패", e);
    return [];
  }
}

/* [970 · C-17] 시·도별 동네 홈 인덱스(서버 조각 — 상태 없음, details 는 브라우저가 연다).
   [v4] 카드 상자 → 1px 선 행, 동네 이름은 칩이 아니라 글자 링크(칩은 필터에만 — v4 규칙 6),
   "· 시·도별" 설명을 뺐다. 전부 접어 둔다 — 목록 아래에서 100여 이름이 한 번에 쏟아지지 않게.
   지역 칩(필터)이 된 옛 "우리 동네 홈" 바로가기의 이동(동네 홈)은 여기서 닿는다. */
function TownIndex() {
  const groups = groupRegionsByCity();
  return (
    <section id="town-index" className="mt-8 scroll-mt-24" aria-labelledby="town-index-title">
      <div className="mb-1 flex items-baseline justify-between">
        <h2 id="town-index-title" className="t-section text-ink">
          동네 홈 전체
        </h2>
        <span className="t-caption text-text-3">
          {groups.reduce((n, g) => n + g.items.length, 0)}곳
        </span>
      </div>
      <div data-tone="blue" className="flex flex-col divide-y divide-line border-y border-line">
        {groups.map((g) => (
          <details key={g.key} className="group">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 py-3 t-body font-bold text-ink [&::-webkit-details-marker]:hidden">
              <span>
                {g.city}
                <span className="ml-1.5 t-caption font-normal text-text-3">{g.items.length}곳</span>
              </span>
              <span className="shrink-0 text-text-3 transition-transform group-open:rotate-45" aria-hidden="true">
                +
              </span>
            </summary>
            <div className="flex flex-wrap gap-x-4 gap-y-1 pb-3">
              {g.items.map((r) => (
                <Link key={r.id} href={`/town/${r.id}`} className="px-1 py-1 t-sub text-text-2 no-underline">
                  {r.name}
                </Link>
              ))}
            </div>
          </details>
        ))}
      </div>
    </section>
  );
}

/* [v4] 카테고리 타일 여섯 장(동네이야기·뉴스룸·청약·공매·입주·정비) → 페이지 맨 아래 글자 링크 한 줄.
   허브 자신(/town)은 빼고, 이름은 카탈로그의 short. 숫자는 붙이지 않는다 — 뉴스 수는 위 "오늘 뉴스"
   행이 이미 말하고(같은 사실은 한 번), 나머지 넷의 집계(lib/town/category-counts)를 이 한 줄을 위해
   더 읽지 않는다. 하위 화면(/apply 등)의 카테고리 줄은 TownCategoryNav 가 그대로 맡는다. */
function TownDataLinks() {
  const links = TOWN_CATEGORY_LINKS.filter((l) => l.href !== "/town");
  return (
    <nav aria-label="동네 자료" className="mt-8 t-sub text-text-3">
      동네 자료 —{" "}
      {links.map((l, i) => (
        <span key={l.href}>
          {i > 0 && " · "}
          <Link href={l.href} className="tap-line font-bold text-text-2 no-underline">
            {l.short ?? l.label}
          </Link>
        </span>
      ))}
    </nav>
  );
}

export default async function TownPage() {
  /* 실데이터: 공개 임장노트 + 커뮤니티 글(비자동 posts). 뉴스(자동수집)는 /town/news로 분리.
     이 페이지는 revalidate 가 있어 `next build` 가 프리렌더한다 — 여기서 던지면
     DB 가 잠깐 흔들린 것만으로 배포가 깨진다. 그래서 잡되, **삼키지는 않는다**:
     실패는 loadFailed 로 화면까지 들고 가서 "글이 없어요"와 다르게 말한다. */
  const [{ cards, loadFailed, notesMaybeMore }, newsRows] = await Promise.all([
    loadTownFeed(TOWN_FEED_FIRST_PAGE),
    loadNewsRows(),
  ]);
  /* [967 · 19] 첫 장은 40장까지만 HTML 에 싣고 나머지는 "더 보기"가 /api/town/feed 로
     이어받는다. hasMore 는 "지금 손에 든 것 너머가 있는가" — 노트 창(40)이 가득 찼으면 글이
     40장 안 되더라도 더 오래된 노트가 남아 있을 수 있어 참으로 둔다. */
  const firstPage: FeedCard[] = cards.slice(0, TOWN_FEED_FIRST_PAGE);
  const hasMore = cards.length > TOWN_FEED_FIRST_PAGE || notesMaybeMore;

  /* [1006] 오늘(KST) 기사 수 — 손에 든 뉴스 목록 **전체**에서 센다(추가 조회 없음). 0 이면 뉴스 행이 없다. */
  const todayNews = countTodayKst(newsRows, Date.now());

  return (
    <PageShell>
      <div className="mx-auto w-full max-w-[760px]">
        {/* [v4] 머리 — 제목 한 줄 + 작은 아웃라인 글쓰기(채움 파랑 없음: 모바일은 탭바 ＋ 가 있다) */}
        <div className="flex items-center justify-between gap-3 pb-3">
          <h1 className="t-title text-ink">동네이야기</h1>
          <TownWriteMenu />
        </div>

        {/* [1006] 뉴스는 피드에 섞지 않는다 — [v4] 뉴스룸으로 가는 1px 선 행 하나 */}
        <TownNewsRow today={todayNews} headline={newsRows[0]?.title ?? null} />

        <TownFeed cards={firstPage} hasMore={hasMore} loadFailed={loadFailed} />

        {/* [970 · C-17] 동네 홈 전체 인덱스 — 피드 아래에 두어 첫 화면(LCP)에는 끼어들지 않는다. */}
        <TownIndex />

        <TownDataLinks />
      </div>
    </PageShell>
  );
}
