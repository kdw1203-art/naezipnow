/* [1022 · 정렬·글씨·테마] 지시 4 — 머리 한 모양(PageHead) · 램프 글자 · 흰 카드 테마 · 사실 문장. 자세한 사유는 본문의 [1022 · 정렬·글씨·테마] 주석. */
import Link from "@/app/components/IntentLink";
import { RotatingExpertPromo } from "@/app/components/experts/ExpertPromo";
import { TopBanner } from "@/app/components/ads/TopBanner";
import { CountUp } from "@/app/components/motion/CountUp";
import { PageHead } from "../components/PageHead";
/* [967 · 19] 카드 변환·병합은 lib/town/feed.ts 로 옮겼다 — "더 보기"(/api/town/feed)와
   첫 장이 같은 코드로 카드를 만들어야 하기 때문이다. */
import { loadTownFeed, TOWN_FEED_FIRST_PAGE } from "@/lib/town/feed";
import { TownFeed, type FeedCard } from "./feed-client";
import { AdZone } from "../components/ads/AdZone";
import { TownCategoryNav } from "./TownCategoryNav";
import { buildPageMetadata } from "@/lib/seo/page-metadata";
import { groupRegionsByCity } from "@/lib/town/region-groups";
import { REGION_CATALOG } from "@/lib/region/catalog";
import { townMapMarkers } from "@/lib/town/town-map";
import type { RegionMapMarker } from "@/lib/region/region-map";
import { RegionMapPicker } from "@/app/components/region/RegionMapPicker";

/* [1069 · 검색어] 운영 실측 2026-10-15 — 허브 제목이 전부 우리끼리 쓰는 이름이라 검색에 걸릴 말이 없었다
   (홈은 1066 에서 고쳤다). "동네이야기"는 사람이 치는 말이 아니다. 설명도 25자뿐이라 발췌가 비었다.
   브랜드 이름(| 내집나우)은 buildPageMetadata 가 뒤에 붙인다 — 앞자리는 검색어에 쓴다. */
export const metadata = buildPageMetadata({
  title: "동네 아파트 시세·이웃 이야기",
  description:
    /* [1044] 이 화면은 기사를 싣지 않는다 — 설명에도 "뉴스"를 적지 않는다(news-1044 시험이 잠근다).
       나열한 다섯은 실제로 이 화면의 카테고리 칸이다(TownCategoryNav: 동네이야기·청약·공매·입주·정비사업). */
    "지역별 동네 홈 — 이웃이 쓴 동네 글 · 아파트 실거래 요약 · 입주 물량 · 정비사업 · 공매 물건 · 청약 일정",
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

/* [#64 · B25] 수동 선정 바로가기 8곳 + 활동량 세기(shortcutActivity)는 [1111] 지도 고르기(107곳 전부 · lib/town/town-map 이 같은 규칙으로 센다)로 합쳤다. */

/* [970 · C-17] 시·도별 동네 홈 인덱스 → [1111 · 지도 중심 개편] **지도에서 고르기**.
   소유자 2026-11-08(이 화면 캡처): "지도를 통해 호갱노노 · 재개발닷컴처럼 디자인을 변경해줘 너무 나열식이야" · "항목이 5개를 넘으면 필터식".
   시/도별로 펼치던 107개 칩 벽 대신 실지도(RegionMapPicker) 위 말풍선 — 값은 이 피드의 이웃 글 수(0건이면 이름만) · 시/도 칩이 화면 범위 ·
   검색칸이 필터. 107개 링크는 크롤 경로(970 · C-17 "고아 페이지" 방지)로 닫힌 <details> 하나에 그대로 남긴다 — 눈에는 한 줄, HTML 에는 전부. */
function TownIndex({ first = false, markers }: { first?: boolean; markers: RegionMapMarker[] }) {
  const groups = groupRegionsByCity();
  const total = groups.reduce((n, g) => n + g.items.length, 0);
  const withPosts = markers.filter((m) => m.value).length;
  return (
    /* [1101] 맨 앞에 설 때(이웃 글 0건)는 위 카테고리 줄과 같은 간격 — 바로가기 칩 줄이 빠진 자리가 32px 빈 띠로 남지 않게 */
    <section id="town-index" className={`${first ? "mt-0" : "mt-8"} scroll-mt-24`} aria-labelledby="town-index-title">
      <div className="mb-2 flex items-baseline justify-between px-1">
        <h2 id="town-index-title" className="t-section text-ink">
          동네 홈 고르기
        </h2>
        <span className="t-caption text-text-3">
          {total}곳{withPosts > 0 ? ` · 최근 글 있는 동네 ${withPosts}곳` : ""}
        </span>
      </div>
      <RegionMapPicker
        markers={markers}
        label="동네 홈 고르기 지도"
        valueLabel={withPosts > 0 ? "말풍선 = 이 피드의 최근 이웃 글 수" : null}
        defaultSido="서울"
        searchPlaceholder="동네 이름(시 · 구)"
      />
      {/* 크롤 경로 — 107곳 링크 전부(닫힘). 시/도 묶음 순서 · 글자는 예전 인덱스 그대로 */}
      <details className="group mt-2 px-1">
        <summary className="flex cursor-pointer list-none items-center gap-2 py-1.5 t-caption font-bold text-text-3">
          시·도별 전체 목록 {total}곳
          <span className="transition-transform group-open:rotate-45" aria-hidden="true">+</span>
        </summary>
        <div className="flex flex-col gap-2 pb-1 pt-1">
          {groups.map((g) => (
            <div key={g.key} className="flex flex-wrap items-center gap-1.5">
              <span className="mr-1 t-caption font-bold text-text-3">{g.city}</span>
              {g.items.map((r) => (
                <Link key={r.id} href={`/town/${r.id}`} className="tap-line t-caption text-text-2 no-underline hover:underline">
                  {r.name}
                </Link>
              ))}
            </div>
          ))}
        </div>
      </details>
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

  /* [1111] 지도 말풍선 값(이 피드의 이웃 글 수) — 가장 많은 동네 하나는 머리 아래 캡션 한 줄로 */
  const markers = townMapMarkers(REGION_CATALOG, cards);
  const hottestMarker = markers
    .map((m) => ({ id: m.id, name: m.name, count: Number((m.value ?? "글 0").replace(/[^\d]/g, "")) || 0 }))
    .sort((a, b) => b.count - a.count)[0];

  /* 공작 등 가짜 예시 카드는 쓰지 않는다 — 0건이면 정직한 empty+CTA.
     (예시 배너 분기(exampleOnly)는 상수 false 로 영구 죽은 코드였다 — 제거) */
  /* [945-G] 히어로 실측 스탯 — 이 피드에 실린 카드 기준(전수 아님 — 라벨에 명시).
     지어내는 수치 없이 "지금 살아 있는 곳"이라는 감각만 만든다. */
  const now = Date.now();
  const todayCount = cards.filter((c) => now - c.createdAt < 24 * 3600_000).length;
  const weekCount = cards.filter((c) => now - c.createdAt < 7 * 24 * 3600_000).length;
  const hottest = hottestMarker && hottestMarker.count > 0 ? hottestMarker : null;
  /* [1043] 피드가 이웃 글만이라 "이웃 글 n · 임장노트 n · Lab 노트 n" 가름은 없어졌다 — 이 피드 n건이 곧 이웃 글 수다 */

  return (
    <>
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

      {/* [1098 · 배너] 상단 띠 배너 자리(동네) */}
      <TopBanner placement="community_feed" plan={null} className="mb-4 max-md:mb-3" />

      {/* 동네이야기 카테고리 — 동네이야기 · 청약 · 공매 · 입주 · 정비사업 다섯 칸([1044] 뉴스룸 칸 없음 — 뉴스는 제 대분류).
          목록은 lib/town/category-links.ts 단일 소스. 하위 페이지도 같은 것을 쓴다. */}
      <TownCategoryNav />

      {/* [#64 · B25] "우리 동네 홈" 바로가기 칩 8개(최근 글 기준) → [1111] 지도 고르기(TownIndex · 말풍선에 같은 글 수)로 합쳤다 —
          같은 동네 이름이 두 벌 서지 않게 · 8개는 "5개를 넘으면 필터식" 규칙 밖. 활동이 가장 많은 동네는 아래 캡션 한 줄로 */}
      {hottest && (
        <p className="mb-3 px-1 t-caption text-text-3">
          최근 글이 가장 많은 동네 <Link href={`/town/${hottest.id}`} className="tap-line font-bold text-text-2 no-underline hover:underline">{hottest.name} {hottest.count}건 ›</Link>
          {" "}· <a href="#town-index" className="tap-line font-bold text-text-2 no-underline hover:underline">지도에서 고르기 ›</a>
        </p>
      )}

      {/* [992 · A1] 오늘의 글감(TownPromptCard)·전문가 띠(TownExpertBand) 제거 — 글감 스레드와
          전문가는 보관(비노출) 영역이다(사람 글 0건·전문가 0명, lib/seo/archived-routes.ts).
          동네 화면의 "쓰기" 입구는 히어로 버튼 하나만 남긴다 — 예전엔 히어로 글쓰기 · FAB ·
          탭바 ＋ 세 개가 한 화면에 동시에 떠 있었다. */}

      {/* H3 광고 슬롯 — 서버에서 렌더해 피드 중간(8번째 카드 뒤)에 꽂는다.
          이 페이지도 revalidate=600 공유 캐시라 보는 사람의 플랜을 알 수 없어 plan={null}.
          유료 플랜의 광고 제거는 AdSlot 안의 AdFreeGate 가 클라이언트에서 처리한다(캐시 유지).
          등록 배너도 하우스 광고도 없으면 AdSlot 이 null 을 반환해 자리를 안 만든다. */}
      {/* [1078] 이웃 글이 0건이면 빈 피드 카드가 화면을 먼저 차지하고 동네 홈 인덱스(107곳 · 내용 있음)가 그 아래 있었다(운영 실측)
          → 0건일 때는 인덱스가 먼저, 빈 피드는 그 아래(order). 글이 생기면 예전 순서 그대로. */}
      {/* [1143] 오래된 글 찾기 — 쪽 번호로 넘기고 제목 · 내용 · 키워드로 찾는 게시판 */}
      <p className="m-0 mb-2 px-1 text-right">
        <Link href="/board" className="tap-line t-sub font-bold text-primary">
          게시판 · 글 검색 ›
        </Link>
      </p>
      <div className="flex flex-col">
      <div className={!loadFailed && firstPage.length === 0 ? "order-2" : ""}>
      <TownFeed
        cards={firstPage}
        hasMore={hasMore}
        loadFailed={loadFailed}
        now={now}
        /* [1145] 목록 사이 자리(광고 칸과 같은 순번) — 전문가 홍보 한 칸 + 광고 */
        ad={
          <>
            <RotatingExpertPromo slot={2} compact className="mb-3" />
            <AdZone placement="community_feed" seed={0} plan={null} />
          </>
        }
      />
      </div>

      {/* [970 · C-17] 동네 홈 전체 인덱스 → [1111] 지도에서 고르기(RegionMapPicker) + 닫힌 전체 목록(크롤 경로).
          피드 아래에 두어 첫 화면(LCP)에는 끼어들지 않는다(글이 0건이면 앞 — 1078). */}
      <div className={!loadFailed && firstPage.length === 0 ? "order-1" : ""}>
      <TownIndex first={!loadFailed && firstPage.length === 0} markers={markers} />
      </div>
      </div>

    </>
  );
}
