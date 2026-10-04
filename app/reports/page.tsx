import { cache } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { PageShell } from "../components/PageShell";
import { AdZone } from "@/app/components/ads/AdZone";
import { formatYmKo, listReportMonths, type ReportMonthSummary } from "@/lib/reports/monthly";
/* [1009 · 리뷰 H] 목록 로더(listReportMonths)가 1,000행에서 잘리던 것은 lib 에서 고쳤다 — 끝까지 나눠 읽는다 */
import { listSeasonAvailability, type SeasonAvailability } from "@/lib/reports/seasonal";
import { buildPageMetadata } from "@/lib/seo/page-metadata";
import { logger } from "@/lib/log";
import { reportingClosed } from "@/lib/newui/reporting-window";

/* [1010] 1h → 1일. 목록(데이터가 있는 달 + 관측된 계절)은 월 경계에서만 늘어난다.
   적재 직후 SOURCE_MAP.molit 이 "/reports" 를 이미 비우므로 TTL 은 안전망이다. */
export const revalidate = 86_400;

/* ============================================================
   S11/G7 — 월간 리포트 목록. 데이터가 있는 달만 나열한다(빈 달 페이지 양산 금지).

   ── "못 읽었다" 와 "없다" 를 섞지 않는다 ─────────────────────────
   이 페이지는 빌드 때 프리렌더되는데(revalidate 1시간), 로더가 서비스 롤
   키를 요구하는 바람에 CI 러너에서 항상 빈 배열을 받아 "아직 집계된 월이
   없어요" 가 HTML 에 굳어 있었다. 같은 데이터를 읽는 런타임 라우트
   /sitemap-reports.xml 은 세 달을 정상으로 돌려주고 있었다.
   지금은 lib/reports/monthly.ts 가 anon 으로도 읽고, 실패하면 던진다.
   여기서는 그 예외를 잡아 세 상태를 각각 다르게 렌더한다 —
   프리렌더 라우트라 던지면 빌드가 깨지기 때문이다:
     1) 정상 — 월 목록
     2) 조회 실패 — 그렇게 말하고 noindex (깨진 껍데기를 색인시키지 않는다)
     3) 정말로 빈 결과 — "아직 집계된 월이 없다" 는 별개의 문장

   [1015] 목록은 리퀴드 행 목록(lq-panel · 월간 = blue · 이사철 = sand). 데스크톱은 본문 + 340px 레일
   (연도 목차 · 관련 화면 · 데이터 출처 · 광고 1). 광고는 레일 1(데스크톱) + 페이지 끝 1 — 첫 화면 안에는 없다.
   ============================================================ */

type ReportsIndexData = {
  months: ReportMonthSummary[];
  /**
   * N12 — 계절 리포트 중 "관측된" 것만. 월 요약만으로 판정되는 순수 계산이라
   * 조회가 추가로 늘지 않는다.
   */
  seasons: SeasonAvailability[];
  /** 조회 자체가 실패한 사유. null 이면 "읽었고 결과가 이만큼" 이라는 뜻이다. */
  loadError: string | null;
};

/**
 * generateMetadata 와 페이지 본문이 같은 렌더에서 각각 부르므로 react cache 로
 * 한 번만 질의한다.
 */
const loadReportsIndex = cache(async (): Promise<ReportsIndexData> => {
  try {
    const months = await listReportMonths();
    return { months, seasons: listSeasonAvailability(months), loadError: null };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    logger.error(
      "[/reports] 월간 집계를 읽지 못했습니다 (조회 실패):",
      message,
    );
    return { months: [], seasons: [], loadError: message };
  }
});

export async function generateMetadata(): Promise<Metadata> {
  const { loadError } = await loadReportsIndex();
  const base = buildPageMetadata({
    title: "월간 아파트 실거래 리포트",
    description:
      "국토교통부 실거래 집계로 매월 자동 생성되는 지역별 아파트 거래량·평균가 리포트 목록.",
    path: "/reports",
  });
  // 조회가 실패한 상태의 껍데기를 색인시키지 않는다. 다음 재검증에서 성공하면 사라진다.
  return loadError ? { ...base, robots: { index: false, follow: true } } : base;
}

const railLinkCls =
  "flex min-h-[40px] items-center justify-between gap-2 py-2 t-sub font-bold text-ink no-underline";

export default async function ReportsIndexPage() {
  const { months, seasons, loadError } = await loadReportsIndex();
  /* [970 · B-32 → 1009 · H] "아직 신고가 들어오는 달" 표시 — 예전엔 이번 달에만 "집계 중"을 달아, 신고 기한(말일 + 30일)이
     남은 지난달(2026-09-22 기준 8월분, 9/30 까지 신고)은 완결된 달처럼 보였다. 날짜로 가른다(lib/newui/reporting-window).
     ISR 1시간이라 기한이 지난 뒤 최대 1시간은 "신고 중"이 남을 수 있다(보수적인 쪽). */
  const now = new Date();

  /* 항목 46d — 실재하는 월간 리포트 목록을 ItemList 로 기술. 값은 페이지가
     이미 렌더하는 실데이터에서만 오고, 조회 실패면 노드를 내보내지 않는다. */
  const itemListJsonLd =
    months.length > 0
      ? {
          "@context": "https://schema.org",
          "@type": "ItemList",
          name: "월간 아파트 실거래 리포트",
          numberOfItems: months.length,
          itemListElement: months.slice(0, 60).map((m, i) => ({
            "@type": "ListItem",
            position: i + 1,
            name: `${formatYmKo(m.ym)} 실거래 리포트`,
            url: `https://naezipnow.com/reports/${m.ym}`,
          })),
        }
      : null;

  /* 고도화 38 — 연도별 구분·앵커. 연도 칩은 실재하는 연도가 2개 이상일 때만 그린다(칩 1개는 장식이다). */
  const byYear = new Map<string, ReportMonthSummary[]>();
  for (const m of months) {
    const y = m.ym.slice(0, 4);
    const bucket = byYear.get(y);
    if (bucket) bucket.push(m);
    else byYear.set(y, [m]);
  }
  const years = [...byYear.keys()].sort((a, b) => b.localeCompare(a));
  const latest = months[0] ?? null;

  return (
    <PageShell breadcrumb="월간 실거래 리포트">
      {itemListJsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListJsonLd) }}
        />
      )}
      <div className="mx-auto max-w-[1100px]">
        <h1 className="rise-in t-title text-ink">월간 아파트 실거래 리포트</h1>
        {/* [1011] "매월 자동으로 만들어지는" 파이프라인 설명을 걷었다(소유자 지시).
            [1015 · 규칙 B] 사실 한 줄: 최신 달 · 지역 수 · 건수(실데이터)
            [1028 · 제안 12] 해요체 두 문장 — 무엇을 집계했는지 + 계산 방식은 데이터 방법론 링크.
            대비 구문("사람이 쓰는 시황 글이 아니며")은 걷었다. */}
        <p className="rise-in-1 mt-1.5 t-sub text-text-2">
          {/* [1030 · G1] 해요체 → 낱말 */}
          국토교통부 실거래 신고 · 월별 집계 요약 · 계산 방식{" "}
          <Link href="/methodology" className="inline-flex min-h-[24px] items-center font-bold text-primary underline">
            데이터 방법론
          </Link>
          {latest && (
            <>
              {" "}
              최신 {formatYmKo(latest.ym)} · {latest.regionCount}개 지역 · {latest.txCount.toLocaleString("ko-KR")}건.
            </>
          )}
        </p>

        <div className="mt-4 grid grid-cols-1 gap-4 max-md:mt-3 max-md:gap-3 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-5">
          <div className="flex min-w-0 flex-col gap-5 max-md:gap-3">
            {loadError ? (
              <div className="card rounded-2xl px-5 py-8 text-center t-body text-text-3 max-md:py-5">
                월간 집계를 <strong className="text-ink">불러오기 실패</strong>.
                <br />
                잠시 후 다시 시도해 주세요.
              </div>
            ) : months.length > 0 ? (
              years.map((y) => (
                <section key={y} id={`y${y}`} className="scroll-mt-24">
                  <h2 className="mb-2 t-section text-ink">
                    {y}년 <span className="t-sub font-medium text-text-3">{byYear.get(y)!.length}개월</span>
                  </h2>
                  {/* [1015 · 규칙 I] 카드 타일 묶음 → 리퀴드 행 목록(blue = 실거래·거래 건수) */}
                  <div data-tone="blue" className="lq-panel flex flex-col divide-y">
                    {byYear.get(y)!.map((m) => (
                      <Link
                        key={m.ym}
                        prefetch={false}
                        href={`/reports/${m.ym}`}
                        className="flex min-h-[48px] items-center justify-between gap-3 py-2.5 no-underline"
                      >
                        <span className="t-body font-bold text-ink">
                          {formatYmKo(m.ym)} 실거래 리포트
                          {/* 신고 기한이 안 지난 달 — 완결처럼 보이지 않게 */}
                          {!reportingClosed(m.ym, now) && (
                            <span className="ml-1.5 inline-block whitespace-nowrap rounded-md bg-primary-soft px-1.5 py-0.5 t-caption font-bold text-primary align-middle">
                              신고 중
                            </span>
                          )}
                        </span>
                        <span className="t-num shrink-0 t-sub font-bold text-text-3">
                          {m.regionCount}개 지역 · {m.txCount.toLocaleString("ko-KR")}건 ›
                        </span>
                      </Link>
                    ))}
                  </div>
                </section>
              ))
            ) : (
              <div className="card rounded-2xl px-5 py-8 text-center t-body text-text-3 max-md:py-5">
집계된 월 없음 · 실거래 신고가 집계되면 표시돼요.
              </div>
            )}

            {/* N12 — 계절(이사철) 검증 리포트. 계절의 모든 달이 확정 집계된 해가
                하나라도 있어야 목록에 나온다. 절반만 모인 계절은 만들지 않는다. */}
            {seasons.length > 0 && (
              <section className="rise-in-4">
                <h2 className="mb-2 t-section text-ink">이사철 통념 검증 리포트</h2>
                {/* [1015 · 규칙 B] 설명 문단("…확인합니다. 같은 지역끼리만 비교하며…") → 사실 한 줄로. 계산 기준은 상세의 ⓘ */}
                <div data-tone="sand" className="lq-panel flex flex-col divide-y">
                  {seasons.map((s) => (
                    <Link
                      key={s.def.slug}
                      href={`/reports/season/${s.def.slug}`}
                      className="flex min-h-[48px] items-center justify-between gap-3 py-2.5 no-underline"
                    >
                      <span className="min-w-0">
                        <span className="block t-body font-bold text-ink">
                          {s.def.label} ({s.def.monthsLabel})
                        </span>
                        <span className="mt-0.5 block t-sub text-text-3">{s.def.claim}</span>
                      </span>
                      <span className="t-num shrink-0 t-sub font-bold text-text-3">
                        {s.observedYears.map((y) => `${y}년`).join(" · ")} ›
                      </span>
                    </Link>
                  ))}
                </div>
                <p className="mt-1.5 t-caption text-text-3">같은 해 같은 지역끼리 비교 · 신고 진행 중인 잠정 월 제외</p>
              </section>
            )}
          </div>

          {/* [1015 · 규칙 F·G] 데스크톱 오른쪽 레일 — 연도 목차 · 관련 화면 · 데이터 출처 · 광고 1. 폰은 본문 아래에 이어진다(광고는 숨김). */}
          <aside className="flex flex-col gap-3 lg:sticky lg:top-[76px] lg:self-start">
            {years.length > 1 && (
              <nav aria-label="연도" className="card rounded-2xl px-4 py-3">
                <div className="t-caption font-bold text-text-3">연도</div>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {years.map((y) => (
                    <a key={y} href={`#y${y}`} className="chip border border-line bg-bg px-3 py-1.5 t-sub font-bold text-text-2 no-underline">
                      {y}년
                    </a>
                  ))}
                </div>
              </nav>
            )}
            <nav aria-label="관련 화면" className="card rounded-2xl px-4 py-1">
              <Link href="/tx" className={`${railLinkCls} border-b border-divider`}>
                지역별 실거래 상세 <span aria-hidden="true" className="text-text-3">›</span>
              </Link>
              <Link href="/analysis/timing" className={`${railLinkCls} border-b border-divider`}>
                매수·매도 타이밍 분석 <span aria-hidden="true" className="text-text-3">›</span>
              </Link>
              <Link href="/developers" className={railLinkCls}>
                공개 집계 API <span aria-hidden="true" className="text-text-3">›</span>
              </Link>
            </nav>
            <p className="px-1 t-caption leading-[1.6] text-text-3">
              데이터 출처: 국토교통부 실거래가 공개시스템 신고분(해제 신고분 제외). 신고 기한(계약 후 30일) 전인 달은 잠정치.
            </p>
            <AdZone placement="sidebar" seed={1} plan={null} className="hidden lg:block" />
          </aside>
        </div>

        {/* [961 → 1015 · 규칙 G] 페이지 끝 광고 1 — 예전 AdSenseUnit(목록 하단·데스크톱 전용) 자리 */}
        <AdZone placement="page_bottom" seed={2} plan={null} className="mt-6 max-md:mt-4" />
      </div>
    </PageShell>
  );
}
