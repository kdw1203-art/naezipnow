import Link from "next/link";
import { AdZone } from "@/app/components/ads/AdZone";
import { PageShell } from "../../components/PageShell";
import { TownCategoryNav } from "@/app/town/TownCategoryNav";
import { readTownPosts } from "@/lib/newui/board-posts";
import { Icon } from "@/app/components/Icon";
import { getWeeklyDigest, type WeeklyDigest } from "@/lib/newui/digest";
import { NEWS_TAGS } from "@/lib/news/tags";
import { NewsListClient } from "./NewsListClient";
import { CoverImage } from "@/app/components/CoverImage";
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

/* ============================================================
   [1006] 뉴스룸 — /town/news
   동네이야기(/town, 사람의 기록)와 **다른 재질**로 선다: 네이비 히어로·카테고리 격자
   대신 한지 면 마스트헤드(날짜·발행 정보) + 분류 탭 + 행 목록. 글쓰기 버튼은 없다 —
   뉴스는 사람이 쓰지 않는다. 주간 다이제스트·키워드 알림·주제 허브는 그대로 두고
   새 레이아웃에 맞췄다. 규칙은 globals.css "[1006]" 블록.
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

/* 주간 다이제스트 요약 라인 — 뉴스·시세·커뮤니티 건수(있는 항목만) */
function digestSummaryLine(d: WeeklyDigest): string {
  const parts: string[] = [];
  if (d.news.length > 0) parts.push(`뉴스 ${d.news.length}건`);
  if (d.market.length > 0) parts.push(`주요 지역 시세 ${d.market.length}곳`);
  if (d.community.count > 0) parts.push(`이웃 글 ${d.community.count}건`);
  return parts.length > 0 ? `이번 주 ${parts.join(" · ")}` : "이번 주 요약을 준비 중이에요";
}

/* 다이제스트 티저 — 최신 뉴스 제목(없으면 시장 요약) */
function digestTeaserOf(d: WeeklyDigest): string | null {
  if (d.news.length > 0) return d.news[0].title;
  if (d.market.length > 0) return `${d.market[0].name} 등 주요 지역 시세 요약`;
  return null;
}

export default async function TownNewsPage() {
  /* 주간 다이제스트 요약 (#6) — 실패·빈 데이터 시 섹션 생략(fail-soft) */
  let digest: WeeklyDigest | null = null;
  try {
    digest = await getWeeklyDigest();
  } catch {
    digest = null;
  }
  /* 섹션이 하나라도 조회 실패면 요약 카드를 아예 접는다 — 실패한 섹션을 뺀
     숫자를 "이번 주 요약"이라고 내걸면 축소된 사실을 사실처럼 말하는 셈이다. */
  const digestReadOk =
    digest !== null && !digest.failed.news && !digest.failed.market && !digest.failed.community;
  const digestHasContent =
    digestReadOk &&
    digest !== null &&
    (digest.news.length > 0 || digest.market.length > 0 || digest.community.count > 0);
  const digestTeaser = digest && digestHasContent ? digestTeaserOf(digest) : null;

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
  /* [978] 마스트헤드 숫자 — 이미 읽어 둔 목록만 센다(추가 조회 없음). "오늘"은 KST. */
  const todayCount = countTodayKst(rows);
  /* 지역 칩·분류 탭은 **전체 목록**에서 센다 — 첫 장(40행)만 보면 뒤에 오는 분류가 탭에서 빠진다 */
  const regions = buildNewsRegionChips(cities);
  const categories = newsCategoryTabs(rows);
  const firstPage = pageNewsRows(rows, 0, NEWS_LIST_FIRST_PAGE);
  const isEmpty = newsCount === 0 && !newsFailed;
  const dateLabel = formatKstLongDate(Date.now(), { weekday: true });

  /* [1015 · 네이버 뉴스 방식] 오른쪽 레일 "많이 본 뉴스" — 손에 든 목록에서 조회 수 상위 5(0 은 뺀다). 추가 조회 없음 */
  const mostRead = [...rows].filter((r) => r.views > 0).sort((a, b) => b.views - a.views).slice(0, 5);

  return (
    <PageShell breadcrumb="동네이야기 › 뉴스룸" wide>
      {/* [1015 · 규칙 C] 한지 마스트헤드(튀는 색면) → 흰 머리. 부연("매일 아침 자동 수집 · 출처·발행 시각 명시")·설명 문장 삭제.
          숫자는 손에 든 목록만 센다. */}
      <header className="rise-in mb-4 flex flex-wrap items-end justify-between gap-3 border-b border-line pb-4">
        <div className="min-w-0">
          <h1 className="t-display text-ink">부동산 뉴스</h1>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 t-sub text-text-3">
            <span>{dateLabel}</span>
            {todayCount > 0 && (
              <span>
                오늘 <b className="t-num text-ink">{todayCount}</b>건
              </span>
            )}
            {newsCount > 0 && (
              <span>
                최근 <b className="t-num text-ink">{newsCount.toLocaleString("ko-KR")}</b>건
              </span>
            )}
            {rows.length > 0 && rows.length < newsCount && (
              <span>
                같은 사건 접어 <b className="t-num text-ink">{rows.length.toLocaleString("ko-KR")}</b>행
              </span>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/town"
            className="btn-secondary inline-flex min-h-[40px] items-center gap-1 rounded-xl px-4 py-2 t-body font-bold no-underline"
          >
            <Icon name="messages-square" size={14} />
            동네이야기
          </Link>
          <Link
            href="/digest"
            className="btn-primary btn-cta inline-flex min-h-[40px] items-center rounded-xl px-4 py-2 t-body no-underline"
          >
            주간 다이제스트
          </Link>
        </div>
      </header>
      {/* [1018] 소유자: "뉴스룸을 누르면 (카테고리 줄이 사라지는데) 목록은 나오도록 유지" — 다른 동네 카테고리와 같은 카테고리 줄 */}
      <TownCategoryNav stick />

      {/* [1015 · 네이버 뉴스 방식] 데스크톱 2단 — 왼쪽 헤드라인 목록(사진 + 제목 + 요약 + 매체·시각), 오른쪽 레일(많이 본 뉴스 ·
          주간 다이제스트 · 키워드 알림 · 주제 · 광고 1). 폰은 한 열 — 목록 뒤에 레일 순서 그대로. */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-6">
        <div className="min-w-0">
          {isEmpty ? (
            <div className="card rise-in mb-5 flex flex-col items-center gap-2 px-6 py-10 text-center">
              <div className="t-section text-ink">최근 수집된 기사 없음</div>
            </div>
          ) : newsFailed ? (
            <div className="rise-in mb-5">
              <ErrorState
                title="뉴스를 불러오지 못했어요"
                desc="조회가 실패했습니다. 수집된 뉴스가 없다는 뜻은 아닙니다. 잠시 후 다시 열어 주세요."
                action={{ label: "동네이야기 보기", href: "/town" }}
              />
            </div>
          ) : (
            <NewsListClient
              rows={firstPage.items}
              categories={categories}
              regions={regions}
              total={firstPage.total}
              hasMore={firstPage.hasMore}
            />
          )}
        </div>

        <aside className="flex flex-col gap-4 lg:sticky lg:top-[76px] lg:self-start" aria-label="뉴스룸 보조">
          {mostRead.length > 0 && (
            <section className="card rounded-2xl px-4 py-4" aria-label="많이 본 뉴스">
              <h2 className="t-section text-ink">많이 본 뉴스</h2>
              <ol className="m-0 mt-1 flex list-none flex-col divide-y divide-line p-0" data-tone="blue">
                {mostRead.map((r, i) => (
                  <li key={r.id}>
                    <Link href={`/town/news/${r.id}`} className="flex items-center gap-3 py-2.5 no-underline">
                      <span className="w-4 shrink-0 t-sub font-bold text-text-3 tabular-nums">{i + 1}</span>
                      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <span className="line-clamp-2 t-body font-bold leading-snug text-ink">{r.title}</span>
                        <span className="truncate t-caption text-text-3">{r.source}</span>
                      </span>
                      {r.image && (
                        <span className="relative h-[52px] w-[72px] shrink-0 overflow-hidden rounded-lg bg-divider">
                          <CoverImage src={r.image} alt="" sizes="72px" imgClassName="absolute inset-0 h-full w-full object-cover" />
                        </span>
                      )}
                    </Link>
                  </li>
                ))}
              </ol>
            </section>
          )}

          {/* 주간 다이제스트 요약 (#6) — 실패·빈 데이터 시 생략(fail-soft) */}
          {digest && digestHasContent && (
            <Link
              href="/digest"
              className="rise-in ai-panel flex items-center justify-between gap-3 rounded-2xl p-4 no-underline"
            >
              <div className="flex min-w-0 flex-col gap-1">
                <div className="flex items-center gap-1.5 t-sub font-bold text-ai-accent">
                  <Icon name="file-text" size={14} />
                  주간 다이제스트
                  <span className="rounded bg-white/10 px-1.5 py-px t-caption text-ai-text">{digest.weekLabel}</span>
                </div>
                <div className="t-body font-bold text-white">{digestSummaryLine(digest)}</div>
                {digestTeaser && <div className="truncate t-caption text-ai-text">{digestTeaser}</div>}
              </div>
              <span className="shrink-0 t-sub font-bold text-white">›</span>
            </Link>
          )}

          {/* [개선 #13] 키워드 알림 구독 */}
          <NewsAlertSubscribe />

          {/* [#103] 주제 허브 진입 */}
          <section className="card rounded-2xl px-4 py-4" aria-label="주제별 뉴스">
            <h2 className="t-section text-ink">주제별</h2>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {NEWS_TAGS.slice(0, 10).map((t) => (
                <Link
                  key={t.slug}
                  href={`/town/news/tag/${t.slug}`}
                  className="chip border border-line bg-surface px-3 py-1.5 t-sub font-bold text-text-2"
                >
                  {t.label}
                </Link>
              ))}
            </div>
            <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 border-t border-line pt-3 t-sub">
              <Link href="/redevelopment" className="tap-line font-bold text-text-2 no-underline">
                정비사업 지도 ›
              </Link>
              <Link href="/supply" className="tap-line font-bold text-text-2 no-underline">
                입주 예정 물량 ›
              </Link>
            </div>
          </section>

          {/* [1015 · 규칙 G] 광고 — 레일 끝 1곳(폰에서는 목록·레일 뒤) */}
          <AdZone placement="page_bottom" seed={4} plan={null} />
        </aside>
      </div>
    </PageShell>
  );
}
