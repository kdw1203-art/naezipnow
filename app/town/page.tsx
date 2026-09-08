import Link from "next/link";
import { CountUp } from "@/app/components/motion/CountUp";
import { BrandWatermark } from "@/app/components/BrandWatermark";
import { PageShell } from "../components/PageShell";
/* [967 · 19] 카드 변환·병합은 lib/town/feed.ts 로 옮겼다 — "더 보기"(/api/town/feed)와
   첫 장이 같은 코드로 카드를 만들어야 하기 때문이다. */
import { loadTownFeed, TOWN_FEED_FIRST_PAGE } from "@/lib/town/feed";
import { TownFeed, type FeedCard } from "./feed-client";
import { AdZone } from "../components/ads/AdZone";
import { TownCategoryNav } from "./TownCategoryNav";
import { TownPromptCard } from "./TownPromptCard";
import { Icon } from "@/app/components/Icon";
import { TownExpertBand } from "./TownExpertBand";
import { buildPageMetadata } from "@/lib/seo/page-metadata";
import { groupRegionsByCity } from "@/lib/town/region-groups";

export const metadata = buildPageMetadata({
  title: "동네이야기",
  description:
    "우리 동네 커뮤니티 글과 공개 임장노트를 한 피드에서. 사진으로 먼저 보고 관심 단지로 이어집니다.",
  path: "/town",
  og: { badge: "동네이야기", sub: "동네 글 · 공개 임장노트 피드" },
});

/* 동네이야기 통합 피드(#5) — 기존 피드 + 발견 피드를 하나로 합친 사진 우선 카드 그리드.
   공개 임장노트(사진 우선) + 커뮤니티 글을 섞어 오늘의집/인스타그램형으로 노출.
   상단엔 동네이야기 하위 영역(뉴스·자료·모임·전문가) + 입주/공매/청약을 카테고리 카드로 통합. */

export const revalidate = 120;

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
   여기서 세는 모수는 **이 피드에 실린 글**(공개 노트 40건 + 커뮤니티 글)이지
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
  /* 실데이터: 공개 임장노트(사진 우선) + 커뮤니티 글(비자동 posts). 뉴스(자동수집)는 /town/news로 분리.
     이 페이지는 revalidate 가 있어 `next build` 가 프리렌더한다 — 여기서 던지면
     DB 가 잠깐 흔들린 것만으로 배포가 깨진다. 그래서 잡되, **삼키지는 않는다**:
     실패는 loadFailed 로 화면까지 들고 가서 "글이 없어요"와 다르게 말한다. */
  const { cards, loadFailed, notesMaybeMore } = await loadTownFeed(TOWN_FEED_FIRST_PAGE);
  /* [967 · 19] 첫 장은 40장까지만 HTML 에 싣고 나머지는 "더 보기"가 /api/town/feed 로
     이어받는다. 예전엔 커뮤니티 글은 전량(최대 300)이 한 번에 내려갔다.
     hasMore 는 "지금 손에 든 것 너머가 있는가" — 노트 창(40)이 가득 찼으면 글이
     40장 안 되더라도 더 오래된 노트가 남아 있을 수 있어 참으로 둔다. */
  const firstPage: FeedCard[] = cards.slice(0, TOWN_FEED_FIRST_PAGE);
  const hasMore = cards.length > TOWN_FEED_FIRST_PAGE || notesMaybeMore;

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

  return (
    <PageShell wide>
      {/* [959] 동네이야기 히어로 — 브랜드 네이비 면(전문가·AI 분석 허브와 같은 규칙).
          정적 제목 한 줄이 아니라 오늘의 활기(실측 카드 기준)와 글쓰기 출발점이 먼저 읽힌다. */}
      <section className="brand-navy-card rise-in mb-4 rounded-[18px] px-5 py-5 md:px-6">
        <BrandWatermark />
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="max-w-[560px]">
            <span className="t-caption font-extrabold tracking-wider text-on-dark-muted">동네이야기</span>
            <h1 className="mt-1 t-display text-on-dark">
              다녀온 사람의 기록이 <span className="text-brand-red-dark">지금</span> 동네를 말합니다
            </h1>
            <p className="mt-1.5 t-body text-on-dark-muted">
              공개 임장노트와 이웃 글, 뉴스 요약·청약·공매·입주 물량까지 — 동네 단위로 모아 봅니다.
            </p>
          </div>
          <div className="flex gap-2">
            <Link href="/town/write" className="btn-primary btn-cta rounded-xl px-4 py-2.5 t-body no-underline">
              글쓰기
            </Link>
            <Link href="/notes/new" className="brand-photo-chip rounded-xl px-4 py-2.5 t-body font-bold no-underline">
              임장노트 쓰기
            </Link>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-on-dark-faint pt-3">
          {/* [970 · C-30] "오늘 새 글 0" 은 살아 있다는 신호가 아니라 비었다는 고백이다 — 0이면 숨긴다 */}
          {todayCount > 0 && (
            <span className="t-sub text-on-dark-muted">
              오늘 새 글 <b className="t-num text-on-dark"><CountUp value={todayCount} /></b>
            </span>
          )}
          <span className="t-sub text-on-dark-muted">
            이번 주 <b className="t-num text-on-dark"><CountUp value={weekCount} /></b>
          </span>
          <span className="t-sub text-on-dark-muted">
            이 피드 <b className="t-num text-on-dark"><CountUp value={cards.length} /></b>건
          </span>
          {hottest && (
            <Link href={`/town/${hottest.id}`} className="t-sub text-on-dark-muted no-underline">
              가장 활발한 동네 <b className="text-brand-red-dark">{hottest.name} ›</b>
            </Link>
          )}
          {/* [975] on-dark-faint(45%)는 선·구분자용이다 — 글자에 쓰면 네이비 위 3.86:1 */}
          <span className="t-caption text-on-dark-muted">지금 이 피드에 실린 글 기준</span>
        </div>
      </section>

      {/* 동네이야기 카테고리 — 청약·입주·공매 + 뉴스·자료·모임·전문가 (인터랙티브).
          목록은 lib/town/category-links.ts 단일 소스. 하위 7개 페이지도 같은 것을 쓴다. */}
      <TownCategoryNav />

      {/* [#64] 동네 홈 진입 — ?region= 필터 대신 지역별 정식 페이지로 */}
      {/* 지역 칩 — 줄바꿈으로 두 줄이 되면 카테고리 격자와 붙어 경계가 흐려진다.
          한 줄 가로 레일(스냅)로 고정한다. */}
      <div className="mb-4 flex items-center gap-2" data-reveal="">
        <span className="shrink-0">
          <span className="t-sub font-bold text-text-3">우리 동네 홈</span>
          {/* [970 · C-11] 칩 숫자는 이 피드의 노트+글을 센 값 — 무엇을 센 건지 그대로 적는다 */}
          <span className="ml-1 t-caption text-text-3">최근 노트·글 기준</span>
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
                <span className="t-num ml-1 font-extrabold text-primary">{r.count}</span>
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

      {/* [3차] 오늘의 동네 글감 — 유저 글 0의 원인(쓸 이유 없음)에 대한 직접 처방 */}
      <TownPromptCard />

      {/* [959] 전문가 모집·상담 띠 — 사람이 채우는 칸을 정직하게 "모집 중"으로 알린다 */}
      <TownExpertBand />

      {/* H3 광고 슬롯 — 서버에서 렌더해 피드 중간(8번째 카드 뒤)에 꽂는다.
          이 페이지도 revalidate=120 공유 캐시라 보는 사람의 플랜을 알 수 없어 plan={null}.
          유료 플랜의 광고 제거는 AdSlot 안의 AdFreeGate 가 클라이언트에서 처리한다(캐시 유지).
          등록 배너도 하우스 광고도 없으면 AdSlot 이 null 을 반환해 자리를 안 만든다. */}
      <TownFeed
        cards={firstPage}
        hasMore={hasMore}
        loadFailed={loadFailed}
        ad={<AdZone placement="community_feed" seed={0} plan={null} />}
      />

      {/* [970 · C-17] 동네 홈 전체 인덱스 — 카탈로그 전량을 시·도별 <details> 로 접어 둔다.
          예전엔 위 바로가기 8곳 + 각 동네 홈의 "다른 동네" 16곳만 UI 로 닿았고 나머지는
          고아 페이지였다. 피드 아래에 두어 첫 화면(LCP)에는 끼어들지 않는다. 서울만 기본
          펼침 — 노트·글이 가장 많은 곳이고, 전부 펼치면 100여 칩이 한 번에 쏟아진다. */}
      <TownIndex />

      {/* 모바일 글쓰기 FAB — [961] 네이비 원 + 주홍 파문(2.6초마다 조용히 "지금 쓸 수 있다") */}
      <Link
        href="/town/write"
        aria-label="글쓰기"
        className="njn-fab fixed right-[18px] z-40 flex h-[52px] w-[52px] items-center justify-center rounded-full no-underline md:hidden"
        style={{ bottom: "calc(var(--nz-tabbar-offset) + 12px)" }}
      >
        <Icon name="notebook-pen" size={22} />
      </Link>
    </PageShell>
  );
}
