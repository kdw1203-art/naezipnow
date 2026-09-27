import Link from "next/link";
import { PageShell } from "../../components/PageShell";
import { readTownPosts } from "@/lib/newui/board-posts";
import { getWeeklyDigest, type WeeklyDigest } from "@/lib/newui/digest";
import { NEWS_TAGS } from "@/lib/news/tags";
import { NewsListClient } from "./NewsListClient";
import { NewsAlertSubscribe } from "./NewsAlertSubscribe";
import { ErrorState } from "@/app/components/ui";
import { logger } from "@/lib/log";
import { buildPageMetadata } from "@/lib/seo/page-metadata";
import { buildNewsRegionChips } from "@/lib/town/news-regions";
import {
  buildNewsRows,
  countTodayKst,
  NEWS_LIST_FIRST_PAGE,
  newsCategoryTabs,
  pageNewsRows,
  sortNewsPosts,
  type NewsRow,
} from "@/lib/town/news-list";
import { formatKstLongDate } from "@/lib/format/kst";
import { TownHero, TownSources } from "../TownHero";
import { TownCategoryNav } from "../TownCategoryNav";
/* [1012] 규칙 8 — 굵기 3단(400/500/700): 이 파일의 font-extrabold(800) 를 전부 font-bold(700) 로 내렸다. */

/* ============================================================
   [1006] 뉴스룸 — /town/news
   동네이야기(/town, 사람의 기록)와 다른 것을 싣는다: 수집한 기사. 글쓰기 버튼은 없다 —
   뉴스는 사람이 쓰지 않는다. 주간 다이제스트·키워드 알림·주제 허브는 그대로 둔다.

   [v4] "한 화면 한 가지" — 주인공은 **기사 목록 하나**. 위에서 아래로:
     ① 머리(TownHero) — 제목 "뉴스룸" + 사실 한 줄(오늘 기사 n건 · 최근 n건) + 오른쪽 작은 "뉴스 검색"
     ② 동네이야기 카테고리 밑줄 탭(TownCategoryNav — 다른 하위 화면과 같은 줄)
     ③ 주간 다이제스트 한 행(1px 선 · 0건·조회 실패면 없음)
     ④ 분류 밑줄 탭 → 지역 필터 칩(한 줄 가로 스크롤) → 기사 행(제목 한 줄 + 매체·시각 한 줄) → 더 보기
     ⑤ 키워드 알림 · 주제별 글자 링크 한 줄 · 맨 끝 "데이터 출처" 접힘
   지운 것: 한지 마스트헤드(날짜줄 · 신문 아이콘 · "자동 수집" 배지 · 설명 문장) · 채움 파랑 "주간 다이제스트 보기"와
   "동네이야기 보기"(→ 다이제스트 행 · 카테고리 탭이 같은 이동을 한다) · 네이비 다이제스트 띠(ai-panel — AI 결과가 아니다) ·
   주제 칩(→ 글자 링크 — 칩은 필터에만) · 맨 아래 "정비사업 지도 보기"/"입주 예정 물량 보기" 칩(→ 카테고리 탭) ·
   하우스 광고(AdZone). 데스크톱도 가운데 한 줄(최대 760px).
   ============================================================ */

/* 비용 실측(2026-08-10): 서버가 ?region= 을 읽는 동안 이 라우트는 영구 동적이라
   크롤 1회 = 함수 호출 1회였다. 지역 필터를 NewsListClient(클라이언트)로 옮겨
   서버 렌더를 지역과 무관하게 만들고 ISR 로 전환한다. 뉴스 적재는 하루 1회라
   10분 재검증이면 충분하다. 상대 시각·날짜줄도 그만큼 낡을 수 있다. */
/* [1007] 600초 → 6시간. 뉴스 적재는 하루 1회(08:00 KST)인데 이 첫 장(HTML 308KB)이 10분마다
   다시 구워졌다. 적재 직후 재검증은 /api/cron/news-revalidate(vercel.json) 와 주간 글·지역 소개
   글 크론의 invalidateAfterIngest("news") 가 맡는다 — 날짜줄·상대 시각은 그만큼 낡을 수 있다. */
/* [1010] 6시간 → 1일. 뉴스 적재는 하루 1회(08:00 KST)이고, 적재 직후 재검증은
   /api/cron/news-revalidate(08:40·10:40·14:40 KST 세 슬롯)와 주간 글·지역 소개 글 크론이 맡는다.
   ※ 이 라우트는 지금까지 세그먼트 값(21_600)이 아니라 **주간 다이제스트 데이터 캐시(3600)**가
     실제 TTL 을 정하고 있었다 — .next/prerender-manifest.json 의 /town/news = 3600 이 그 증거다.
     그 캐시도 같이 1일 + weekly-digest 태그로 바꿨다(lib/newui/digest.ts). */
export const revalidate = 86_400;

/* N7 — ?region= 으로 목록만 좁히는 값이라 조합마다 색인되면 안 된다. canonical 고정. */
export const metadata = buildPageMetadata({
  title: "부동산 뉴스룸 · 주간 다이제스트",
  description:
    "매일 아침 수집한 부동산 기사를 출처·발행 시각·분류와 함께 행 목록으로. 같은 사건은 한 줄로 접고 원문으로 보냅니다. 이번 주 실거래 다이제스트 포함.",
  path: "/town/news",
  og: { badge: "뉴스룸", sub: "부동산 뉴스 · 주간 다이제스트 · 키워드 알림" },
});

/* 주간 다이제스트 요약 라인 — 뉴스·시세·커뮤니티 건수(있는 항목만). [v4] 행 보조 한 줄이라 "이번 주" 는 뺐다(행 이름이 말한다) */
function digestSummaryLine(d: WeeklyDigest): string {
  const parts: string[] = [];
  if (d.news.length > 0) parts.push(`뉴스 ${d.news.length}건`);
  if (d.market.length > 0) parts.push(`주요 지역 시세 ${d.market.length}곳`);
  if (d.community.count > 0) parts.push(`이웃 글 ${d.community.count}건`);
  return parts.join(" · ");
}

export default async function TownNewsPage() {
  /* 주간 다이제스트 요약 (#6) — 실패·빈 데이터 시 행 생략(fail-soft) */
  let digest: WeeklyDigest | null = null;
  try {
    digest = await getWeeklyDigest();
  } catch {
    digest = null;
  }
  /* 섹션이 하나라도 조회 실패면 요약 행을 아예 접는다 — 실패한 섹션을 뺀
     숫자를 "이번 주 요약"이라고 내걸면 축소된 사실을 사실처럼 말하는 셈이다. */
  const digestReadOk =
    digest !== null && !digest.failed.news && !digest.failed.market && !digest.failed.community;
  const digestLine = digest && digestReadOk ? digestSummaryLine(digest) : "";

  /* 이 페이지는 revalidate 가 있어 프리렌더 대상이다 — 던지면 배포가 깨지므로
     잡는다. 다만 실패를 빈 목록으로 뭉개지 않는다: newsFailed 로 들고 가서
     "아직 수집된 기사가 없어요"와 다르게 말한다. */
  let rows: NewsRow[] = [];
  let newsCount = 0;
  let newsFailed = false;
  let cities: string[] = [];
  try {
    const all = await readTownPosts();
    const news = sortNewsPosts(all);
    newsCount = news.length;
    cities = news.map((p) => p.city);
    rows = buildNewsRows(all);
  } catch (e) {
    logger.error("[TownNewsPage] 뉴스 조회 실패", e);
    rows = [];
    newsFailed = true;
  }
  /* [978] 머리 숫자 — 이미 읽어 둔 목록만 센다(추가 조회 없음). "오늘"은 KST. */
  const todayCount = countTodayKst(rows);
  /* 지역 칩·분류 탭은 **전체 목록**에서 센다 — 첫 장(40행)만 보면 뒤에 오는 분류가 탭에서 빠진다 */
  const regions = buildNewsRegionChips(cities);
  const categories = newsCategoryTabs(rows);
  const firstPage = pageNewsRows(rows, 0, NEWS_LIST_FIRST_PAGE);
  const isEmpty = newsCount === 0 && !newsFailed;
  const dateLabel = formatKstLongDate(Date.now(), { weekday: true });

  return (
    <PageShell>
      <div className="mx-auto flex w-full max-w-[760px] flex-col">
        {/* [v4 · 규칙 1] 머리 — 제목 + 사실 한 줄(오늘·최근 기사 수, 0 인 칸은 빠진다) + 작은 "뉴스 검색".
            예전 한지 마스트헤드 제목("오늘 기사 n건 · 최근 n건 · 지역 n곳")의 숫자를 사실 줄로 내렸다 —
            지역 수는 바로 아래 지역 칩이 센다(같은 사실은 한 번). */}
        <TownHero
          href="/town/news"
          stats={[
            { label: "오늘 기사", value: todayCount, unit: "건" },
            { label: "최근", value: newsCount, unit: "건" },
          ]}
          action={
            <Link href="/search" className="btn-outline btn-sm no-underline">
              뉴스 검색
            </Link>
          }
        />
        {/* [v4] 다른 하위 화면과 같은 카테고리 밑줄 탭 — 예전 "동네이야기 보기" 버튼·맨 아래 정비사업·입주 칩의 이동을 맡는다 */}
        <TownCategoryNav stick />

        {/* 주간 다이제스트 — [v4] 네이비 ai-panel 띠(AI 결과가 아니다) → 1px 선 행 하나: 이름 + 주차 / 건수 한 줄 / `›` */}
        {digest && digestLine && (
          <Link href="/digest" className="mb-3 flex items-center gap-3 border-y border-line py-3 no-underline">
            <span className="min-w-0 flex-1">
              <span className="block t-body font-bold text-ink">
                주간 다이제스트 <span className="font-normal text-text-3">{digest.weekLabel}</span>
              </span>
              <span className="mt-0.5 block truncate t-sub text-text-3">{digestLine}</span>
            </span>
            <span className="shrink-0 t-section text-text-3" aria-hidden="true">
              ›
            </span>
          </Link>
        )}

        {/* 목록 — SSR 은 항상 첫 장 40행을 HTML 에 그리고, 필터는 마운트 후 적용된다 */}
        {isEmpty ? (
          /* [1006] 예시 카드를 깔지 않는다 — 0건이면 0건이라고 말한다. [v4] 빈 화면은 한 줄 */
          <p className="py-12 text-center t-body text-text-2">{dateLabel} 뉴스룸에 수집된 기사 없음 · 매일 아침 8시 수집</p>
        ) : newsFailed ? (
          <ErrorState
            title="뉴스를 불러오지 못했어요"
            desc="데이터 조회가 실패했어요. 수집된 뉴스가 없다는 뜻은 아니에요. 잠시 후 다시 열어 주세요."
            action={{ label: "동네이야기 보기", href: "/town" }}
          />
        ) : (
          <NewsListClient
            rows={firstPage.items}
            categories={categories}
            regions={regions}
            total={firstPage.total}
            hasMore={firstPage.hasMore}
          />
        )}

        {/* [개선 #13] 키워드 알림 구독 — 뉴스가 매일 쌓이는 이 화면이 구독 전환의 최적 지점.
            [v4] 목록 위 카드 → 목록 끝 섹션(아이콘·카드 없음) */}
        <NewsAlertSubscribe />

        {/* [#103] 주제 허브 진입 — [v4] 링크 칩 10개 → 글자 링크 한 줄(칩은 필터에만 — 규칙 6) */}
        <nav aria-label="주제별 뉴스" className="mt-6 t-sub text-text-3">
          주제별 —{" "}
          {NEWS_TAGS.slice(0, 10).map((t, i) => (
            <span key={t.slug}>
              {i > 0 && " · "}
              <Link href={`/town/news/tag/${t.slug}`} className="tap-line font-bold text-text-2 no-underline">
                {t.label}
              </Link>
            </span>
          ))}
        </nav>

        {/* [v4 · 규칙 3] 출처·수집 기준 — 예전 마스트헤드 날짜줄("자동 수집 · 매일 아침 8시")과 아래 줄
            ("같은 사건 접어 n행 · 이 화면에 실린 기사 기준 · 하루 1회 수집")을 맨 끝 접힘 하나로 */}
        <div className="mt-6">
          <TownSources>
            <p>
              자동 수집 기사 · 매일 아침 8시 · 매체명·발행 시각·원문 링크 표기 · 저작권은 원 매체에 있음
            </p>
            {rows.length > 0 && rows.length < newsCount && (
              <p>
                최근 기사 {newsCount.toLocaleString("ko-KR")}건 · 같은 사건을 한 행으로 접어{" "}
                {rows.length.toLocaleString("ko-KR")}행
              </p>
            )}
          </TownSources>
        </div>
      </div>
    </PageShell>
  );
}
