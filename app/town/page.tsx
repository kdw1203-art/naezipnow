/* [1022 · 정렬·글씨·테마] 지시 4 — 머리 한 모양(PageHead) · 램프 글자 · 흰 카드 테마 · 사실 문장. 자세한 사유는 본문의 [1022 · 정렬·글씨·테마] 주석. */
import Link from "next/link";
import { CountUp } from "@/app/components/motion/CountUp";
import { PageShell } from "../components/PageShell";
import { PageHead } from "../components/PageHead";
/* [967 · 19] 카드 변환·병합은 lib/town/feed.ts 로 옮겼다 — "더 보기"(/api/town/feed)와
   첫 장이 같은 코드로 카드를 만들어야 하기 때문이다. */
import { loadTownFeed, TOWN_FEED_FIRST_PAGE } from "@/lib/town/feed";
import { TownFeed, type FeedCard } from "./feed-client";
import { AdZone } from "../components/ads/AdZone";
import { TownCategoryNav } from "./TownCategoryNav";
import { buildPageMetadata } from "@/lib/seo/page-metadata";
import { groupRegionsByCity } from "@/lib/town/region-groups";

export const metadata = buildPageMetadata({
  title: "동네이야기",
  description:
    "이웃이 쓴 동네 글 피드 · 지역별 동네 홈.",
  path: "/town",
  og: { badge: "동네이야기", sub: "이웃 글 · 동네 단위" },
});

/* 동네이야기 통합 피드(#5) — 기존 피드 + 발견 피드를 하나로 합친 사진 우선 카드 그리드.
   [1043] 지금은 **이웃 글만** 싣는다(공개 임장노트는 /notes). 예전엔 공개 임장노트 + 커뮤니티 글을 섞었다.
   상단엔 동네이야기 하위 영역 + 입주/공매/청약을 카테고리 카드로 통합.
   [1006] 이 화면은 **사람의 기록**(이웃 글)이다. 뉴스(자동수집)는 피드에 섞지 않는다.
   [1044] "오늘의 뉴스" 스트립도 걷었다 — 뉴스는 제 대분류(뉴스 › 뉴스룸 /town/news)에만 선다. */

/* [1007] 120초 → 600초. 사람 트래픽은 7일 120뷰인데 이 피드는 2분마다 다시 구워졌다(HTML 305KB +
   RSC 99KB = ISR Write 한 번에 ~400KB). 내용이 바뀌는 지점(이웃 글·댓글·공감·공개 노트 저장·
   뉴스 적재)은 lib/cache/invalidate.ts 의 invalidateTownFeed/invalidateAfterIngest("news") 가
   즉시 비우므로 시간 TTL 은 안전망이다. (뉴스룸·동네 홈은 6시간, 여기는 노트·글 피드라 10분) */
/* [1010] 600초 → 1일. 10분 눈금은 사람 트래픽(7일 120뷰)과 무관하게 하루 최대 144회
   재렌더(HTML 305KB + RSC 99KB)를 만든다. 이 피드의 내용은 전부 쓰기 지점이 즉시 비운다 —
   invalidateTownFeed()(이웃 글·댓글·공감·채택·공개 노트) · invalidateAfterIngest("news")
   (뉴스 적재). 시간 TTL 은 그 비움을 놓쳤을 때의 안전망이다. */
export const revalidate = 86_400;

/* [#64] 동네 홈 바로가기 — 노트·글이 실제로 있는 지역 위주 8곳 (수동 선정).
   [970 · C-17] 나머지 전체는 아래 "전체 지역" 인덱스(시·도별 접기)에서 닿는다. */
const TOWN_HOME_SHORTCUTS = [
  { id: "gangnam", name: "강남구" },
  { id: "nowon", name: "노원구" },
  { id: "mapo", name: "마포구" },
  { id: "songpa", name: "송파구" },
  { id: "seongnam-bundang", name: "성남 분당구" },
  { id: "suwon-yeongtong", name: "수원 영통구" },
  { id: "goyang-deogyang", name: "고양 덕양구" },
  { id: "incheon-yeonsu", name: "인천 연수구" },
] as const;

/* [B25] 동네별 활동량 — 8개 칩이 전부 같은 모양이라 "어디에 사람이 있는지"가
   안 보였다. 눌러 봐야 빈 동네인 걸 알게 되는 순서가 반복된다.
   여기서 세는 모수는 **이 피드에 실린 글**(커뮤니티 글)이지
   그 동네의 전체 글이 아니다 — 그래서 화면에도 "최근 글 기준"이라고 적는다.
   숫자를 정확히 부르지 못할 바엔 무엇을 센 건지 밝히는 편이 낫다. */
function shortcutActivity(cards: FeedCard[], name: string): number {
  /* "성남 분당구" 처럼 두 토막인 이름은 두 토막이 **모두** 들어가야 그 동네다
     ("분당구"만 보면 다른 시의 동명 구가 섞이고, "성남"만 보면 수정구도 걸린다). */
  const parts = name.split(/\s+/).filter(Boolean);
  return cards.filter((c) => {
    const r = (c.region ?? "").replace(/\s+/g, "");
    return r.length > 0 && parts.every((p) => r.includes(p));
  }).length;
}

/* [970 · C-17] 시·도별 동네 홈 인덱스(서버 조각 — 상태 없음, details 는 브라우저가 연다) */
function TownIndex() {
  const groups = groupRegionsByCity();
  return (
    <section id="town-index" className="mt-8 scroll-mt-24" aria-labelledby="town-index-title">
      <div className="mb-2 flex items-baseline justify-between px-1">
        <h2 id="town-index-title" className="t-section text-ink">
          동네 홈 전체
        </h2>
        <span className="t-caption text-text-3">
          {groups.reduce((n, g) => n + g.items.length, 0)}곳 · 시·도별
        </span>
      </div>
      <div className="card flex flex-col divide-y divide-line rounded-2xl px-4">
        {groups.map((g) => (
          <details key={g.key} className="group py-2.5" open={g.city === "서울"}>
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 py-1 t-body font-bold text-ink">
              <span>
                {g.city}
                <span className="ml-1.5 t-caption font-semibold text-text-3">{g.items.length}곳</span>
              </span>
              <span className="shrink-0 text-text-3 transition-transform group-open:rotate-45" aria-hidden="true">
                +
              </span>
            </summary>
            <div className="flex flex-wrap gap-1.5 pb-1.5 pt-1">
              {g.items.map((r) => (
                <Link
                  key={r.id}
                  href={`/town/${r.id}`}
                  className="chip border border-line bg-surface px-3 py-1.5 t-sub font-bold text-text-2 no-underline"
                >
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

export default async function TownPage() {
  /* 실데이터: 커뮤니티 글(비자동 posts). 뉴스(자동수집)는 뉴스 메뉴(/town/news), 공개 임장노트는 /notes 로 분리.
     이 페이지는 revalidate 가 있어 `next build` 가 프리렌더한다 — 여기서 던지면
     DB 가 잠깐 흔들린 것만으로 배포가 깨진다. 그래서 잡되, **삼키지는 않는다**:
     실패는 loadFailed 로 화면까지 들고 가서 "글 없음"와 다르게 말한다. */
  /* [1043] 소유자 지시(2026-10-06): "동네이야기와 임장노트가 1개의 동네이야기 카테고리에서 나오고 있어 … 동네이야기만 나오도록".
     피드는 **이웃 글만** 읽는다 — 공개 임장노트는 /notes(공개 노트)가 맡는다. */
  /* [1044] 소유자 지시(2026-10-06): "뉴스랑 동네글을 분리해줘". 이 화면은 뉴스를 읽지 않는다 —
     "오늘의 뉴스" 스트립(기사 6줄)을 걷었고, 뉴스는 뉴스 메뉴(뉴스룸 /town/news)에만 선다. */
  const { cards, loadFailed } = await loadTownFeed();
  /* [967 · 19] 첫 장은 40장까지만 HTML 에 싣고 나머지는 "더 보기"가 /api/town/feed 로
     이어받는다. 예전엔 커뮤니티 글은 전량(최대 300)이 한 번에 내려갔다.
     hasMore 는 "지금 손에 든 것 너머가 있는가" — 글이 첫 장(40)보다 많을 때만 참이다. */
  const firstPage: FeedCard[] = cards.slice(0, TOWN_FEED_FIRST_PAGE);
  const hasMore = cards.length > TOWN_FEED_FIRST_PAGE;

  /* [B25] 활동이 있는 동네를 앞으로. 같은 수면 원래 순서를 지킨다(임의 재배열 금지). */
  const shortcuts = TOWN_HOME_SHORTCUTS.map((r, i) => ({
    ...r,
    count: shortcutActivity(cards, r.name),
    order: i,
  })).sort((a, b) => b.count - a.count || a.order - b.order);

  /* 공작 등 가짜 예시 카드는 쓰지 않는다 — 0건이면 정직한 empty+CTA.
     (예시 배너 분기(exampleOnly)는 상수 false 로 영구 죽은 코드였다 — 제거) */
  /* [945-G] 히어로 실측 스탯 — 이 피드에 실린 카드 기준(전수 아님 — 라벨에 명시).
     지어내는 수치 없이 "지금 살아 있는 곳"이라는 감각만 만든다. */
  const now = Date.now();
  const todayCount = cards.filter((c) => now - c.createdAt < 24 * 3600_000).length;
  const weekCount = cards.filter((c) => now - c.createdAt < 7 * 24 * 3600_000).length;
  const hottest = shortcuts[0]?.count > 0 ? shortcuts[0] : null;
  /* [1043] 피드가 이웃 글만이라 "이웃 글 n · 임장노트 n · Lab 노트 n" 가름은 없어졌다 — 이 피드 n건이 곧 이웃 글 수다 */

  return (
    <PageShell wide>
      {/* [1017] 소유자(폰 캡처의 네이비 띠에 ×): "임장·지도를 제외하고 나머지 카테고리에서는 전부 삭제".
          네이비 히어로(슬로건 · 워터마크 · 통계 띠) → 흰 머리 한 줄. 버튼 둘은 그대로, 숫자는 캡션 한 줄. */}
      {/* [1022 · 정렬·글씨·테마] 공용 PageHead — 허브·임장노트와 같은 한 줄(아이콘 칩 40 · h1 · 사실 한 줄 | 버튼 둘). 숫자 줄은 그대로 캡션. */}
      <PageHead
        icon="messages-square"
        title="동네이야기"
        sub="이웃 글 · 동네 단위"
        className="mb-3 md:mb-4"
        actions={
          <>
            <Link href="/town/write" className="btn-primary btn-md rounded-xl no-underline">
              이야기 쓰기
            </Link>
            {/* [1043] "임장노트 쓰기"는 뺐다 — 임장노트는 제 메뉴(임장노트 · 노트 쓰기)에서 */}
          </>
        }
        facts={
          /* [1043] 글이 한 건도 없으면 숫자 줄을 그리지 않는다("이번 주 0 · 이 피드 0건"은 사실이지만 머리에 둘 말이 아니다 — 빈 상태가 말한다) */
          cards.length > 0 ? (
            <>
              {/* [970 · C-30] "오늘 새 글 0" 은 살아 있다는 신호가 아니라 비었다는 고백이다 — 0이면 숨긴다 */}
              {todayCount > 0 && (
                <span>
                  오늘 새 글 <b className="t-num text-ink"><CountUp value={todayCount} /></b>
                </span>
              )}
              {weekCount > 0 && (
                <span>
                  이번 주 <b className="t-num text-ink"><CountUp value={weekCount} /></b>
                </span>
              )}
              <span>
                이웃 글 <b className="t-num text-ink"><CountUp value={cards.length} /></b>건
              </span>
              {hottest && (
                <Link href={`/town/${hottest.id}`} className="no-underline">
                  가장 활발한 동네 <b className="text-brand-red">{hottest.name} ›</b>
                </Link>
              )}
            </>
          ) : undefined
        }
      />

      {/* 동네이야기 카테고리 — 동네이야기 · 청약 · 공매 · 입주 · 정비사업 다섯 칸([1044] 뉴스룸 칸 없음 — 뉴스는 제 대분류).
          목록은 lib/town/category-links.ts 단일 소스. 하위 페이지도 같은 것을 쓴다. */}
      <TownCategoryNav />

      {/* [#64] 동네 홈 진입 — ?region= 필터 대신 지역별 정식 페이지로 */}
      {/* 지역 칩 — 줄바꿈으로 두 줄이 되면 카테고리 격자와 붙어 경계가 흐려진다.
          한 줄 가로 레일(스냅)로 고정한다. */}
      <div className="mb-4 flex items-center gap-2" data-reveal="">
        <span className="shrink-0">
          <span className="t-sub font-bold text-text-3">우리 동네 홈</span>
          {/* [970 · C-11] 칩 숫자는 이 피드의 글을 센 값 — 무엇을 센 건지 그대로 적는다. [1043] 글이 없으면 기준 줄도 없다(셀 것이 없다) */}
          {cards.length > 0 && <span className="ml-1 t-caption text-text-3">최근 글 기준</span>}
        </span>
        <div className="rail-x -mx-1 px-1 py-0.5">
          {shortcuts.map((r, i) => (
            <Link
              key={r.id}
              href={`/town/${r.id}`}
              className={`chip tile border border-line bg-surface px-3 py-1.5 t-sub font-bold text-text-2 no-underline ${
                i === 0 && r.count > 0 ? "chip-heat" : ""
              }`}
            >
              {r.name}
              {r.count > 0 && (
                <span className="t-num ml-1 font-bold text-primary">{r.count}</span>
              )}
            </Link>
          ))}
          {/* [970 · C-17] "전체 지역" 은 실거래(/tx)가 아니라 아래 동네 홈 인덱스로 — 같은 화면 안 앵커 */}
          <a
            href="#town-index"
            className="chip tile border border-line bg-surface px-3 py-1.5 t-sub font-bold text-primary no-underline"
          >
            전체 지역 ›
          </a>
        </div>
      </div>

      {/* [992 · A1] 오늘의 글감(TownPromptCard)·전문가 띠(TownExpertBand) 제거 — 글감 스레드와
          전문가는 보관(비노출) 영역이다(사람 글 0건·전문가 0명, lib/seo/archived-routes.ts).
          동네 화면의 "쓰기" 입구는 히어로 버튼 하나만 남긴다 — 예전엔 히어로 글쓰기 · FAB ·
          탭바 ＋ 세 개가 한 화면에 동시에 떠 있었다. */}

      {/* H3 광고 슬롯 — 서버에서 렌더해 피드 중간(8번째 카드 뒤)에 꽂는다.
          이 페이지도 revalidate=600 공유 캐시라 보는 사람의 플랜을 알 수 없어 plan={null}.
          유료 플랜의 광고 제거는 AdSlot 안의 AdFreeGate 가 클라이언트에서 처리한다(캐시 유지).
          등록 배너도 하우스 광고도 없으면 AdSlot 이 null 을 반환해 자리를 안 만든다. */}
      <TownFeed
        cards={firstPage}
        hasMore={hasMore}
        loadFailed={loadFailed}
        now={now}
        ad={<AdZone placement="community_feed" seed={0} plan={null} />}
      />

      {/* [970 · C-17] 동네 홈 전체 인덱스 — 카탈로그 전량을 시·도별 <details> 로 접어 둔다.
          예전엔 위 바로가기 8곳 + 각 동네 홈의 "다른 동네" 16곳만 UI 로 닿았고 나머지는
          고아 페이지였다. 피드 아래에 두어 첫 화면(LCP)에는 끼어들지 않는다. 서울만 기본
          펼침 — 노트·글이 가장 많은 곳이고, 전부 펼치면 100여 칩이 한 번에 쏟아진다. */}
      <TownIndex />

    </PageShell>
  );
}
