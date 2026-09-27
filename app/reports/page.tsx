/* [1012 · 규칙 8] font-extrabold(800) → font-bold(700) — 굵기 3단(400·500·700). 이 파일의 모든 자리에 적용. */
import { cache } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { PageShell } from "../components/PageShell";
import { SummaryRow } from "@/app/complex/[id]/SummaryRow";
import { AdSenseUnit } from "@/app/components/ads/AdSenseUnit";
import { formatYmKo, listReportMonths, type ReportMonthSummary } from "@/lib/reports/monthly";
/* [1009 · 리뷰 H] 목록 로더(listReportMonths)가 1,000행에서 잘리던 것은 lib 에서 고쳤다 — 끝까지 나눠 읽는다 */
import { listSeasonAvailability, type SeasonAvailability } from "@/lib/reports/seasonal";
import { buildPageMetadata } from "@/lib/seo/page-metadata";
import { logger } from "@/lib/log";
import { reportingClosed } from "@/lib/newui/reporting-window";

/* [1010] 1h → 1일. 목록(데이터가 있는 달 + 관측된 계절)은 월 경계에서만 늘어난다.
   적재 직후 SOURCE_MAP.molit 이 "/reports" 를 이미 비우므로 TTL 은 안전망이다. */
export const revalidate = 86_400;

/* [v4.1 · 리퀴드 목록] 연도 묶음 톤 순환(globals.css `data-tone`) — 실거래는 blue 로 시작 */
const YEAR_TONES = ["blue", "hanji", "mint", "sand"] as const;

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
      "[/reports] 월간 집계를 읽지 못했습니다 — 리포트가 없는 것이 아니라 조회가 실패했습니다:",
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

  /* [v4 · 규칙 1] 머리 사실 한 줄 — 출처 · 달 수(실데이터). "시황 글 아님"은 글의 성격을 밝히는 정직성 문구라 남긴다([1011]) */
  const headFact = ["국토교통부 실거래 집계", ...(months.length > 0 ? [`${months.length}개월`] : []), "시황 글 아님"].join(" · ");
  /* [v4.1 · 리퀴드 목록] 이사철 묶음은 sand(시기) — 바로 위 마지막 연도 묶음이 sand 로 끝나면 hanji 로 비켜 선다 */
  const yearCount = new Set(months.map((m) => m.ym.slice(0, 4))).size;
  const seasonTone = yearCount > 0 && yearCount % YEAR_TONES.length === 0 ? "hanji" : "sand";

  return (
    <PageShell breadcrumb="월간 실거래 리포트">
      {itemListJsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListJsonLd) }}
        />
      )}
      {/* [v4 · 한 화면 한 가지] 제목 + 사실 한 줄 → 달 목록(구분선 행, 오른쪽 거래 건수) → 이사철 검증 행 → 방법 캡션 한 줄.
          지운 것: 소개 문단(두 문장), 카드 타일(달마다 한 장), "신고 중" 배지(→ 보조 줄 글자), 이사철 설명 문단(→ 끝 캡션). */}
      <div className="mx-auto flex max-w-[760px] flex-col gap-8">
        <header className="flex flex-col gap-0.5">
          <h1 className="rise-in t-title text-ink">월간 아파트 실거래 리포트</h1>
          <p className="t-sub text-text-3">
            {headFact} ·{" "}
            <Link href="/methodology" className="tap-line font-bold text-primary no-underline">
              방법론 ›
            </Link>
          </p>
        </header>

        {loadError ? (
          /* "못 읽었다"와 "없다"를 섞지 않는다 — 한 줄로 */
          <p className="card rounded-lg px-4 py-6 text-center t-body text-text-3">
            월간 집계를 <strong className="text-ink">불러오지 못했어요</strong> · 조회 실패(리포트 없음 아님) · 잠시 후 다시 열기
          </p>
        ) : months.length > 0 ? (
          /* 고도화 38 — 연도별 구분·앵커. 연도 칩은 실재하는 연도가 2개 이상일 때만 그린다(칩 1개는 장식이다). */
          (() => {
            const byYear = new Map<string, ReportMonthSummary[]>();
            for (const m of months) {
              const y = m.ym.slice(0, 4);
              const bucket = byYear.get(y);
              if (bucket) bucket.push(m);
              else byYear.set(y, [m]);
            }
            const years = [...byYear.keys()].sort((a, b) => b.localeCompare(a));
            return (
              <div className="flex flex-col gap-6">
                {years.length > 1 && (
                  <div className="flex gap-2 overflow-x-auto [scrollbar-width:none]">
                    {years.map((y) => (
                      <a
                        key={y}
                        href={`#y${y}`}
                        className="chip inline-flex min-h-[32px] shrink-0 items-center border border-line bg-surface px-3 t-sub font-bold text-text-2 no-underline"
                      >
                        {y}년
                      </a>
                    ))}
                  </div>
                )}
                {years.map((y, i) => (
                  <section key={y} id={`y${y}`} className="flex scroll-mt-24 flex-col gap-2">
                    <h2 className="flex items-baseline gap-1.5 t-section text-ink">
                      {y}년 <span className="t-num text-text-3">{byYear.get(y)!.length}</span>
                    </h2>
                    {/* [v4 · 규칙 5] 구분선 목록 행 — 왼쪽 달(굵게) + 보조 한 줄(지역 수 · 신고 중) / 오른쪽 거래 건수
                        [v4.1 · 리퀴드 목록] 실거래 = blue 에서 시작해 연도마다 톤 순환 — 이웃한 해가 같은 색을 갖지 않는다 */}
                    <ul data-tone={YEAR_TONES[i % YEAR_TONES.length]} className="card flex flex-col divide-y divide-line rounded-lg px-4">
                      {byYear.get(y)!.map((m) => (
                        <li key={m.ym}>
                          <Link
                            prefetch={false}
                            href={`/reports/${m.ym}`}
                            className="press flex min-h-14 items-center justify-between gap-x-3 py-3 no-underline"
                          >
                            <span className="min-w-0 flex-1">
                              <span className="block t-body font-bold text-ink">{formatYmKo(m.ym)}</span>
                              <span className="mt-0.5 block truncate t-sub text-text-3">
                                {m.regionCount}개 지역
                                {/* 신고 기한이 안 지난 달 — 완결처럼 보이지 않게(배지 → 글자) */}
                                {!reportingClosed(m.ym, now) && <span className="font-bold text-primary"> · 신고 중</span>}
                              </span>
                            </span>
                            <span className="flex shrink-0 items-center gap-1.5">
                              <span className="t-body t-num text-ink">{m.txCount.toLocaleString("ko-KR")}건</span>
                              <span aria-hidden="true" className="t-body text-text-3">
                                ›
                              </span>
                            </span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </section>
                ))}
              </div>
            );
          })()
        ) : (
          <p className="card rounded-lg px-4 py-6 text-center t-body text-text-3">아직 집계된 달 없음 · 한 달치 신고가 쌓이면 생김</p>
        )}

        {/* N12 — 계절(이사철) 검증 리포트. 계절의 모든 달이 확정 집계된 해가
            하나라도 있어야 목록에 나온다. 절반만 모인 계절은 만들지 않는다. */}
        {seasons.length > 0 && (
          <section className="flex flex-col gap-2">
            <h2 className="flex items-baseline gap-1.5 t-section text-ink">
              이사철 통념 검증 <span className="t-num text-text-3">{seasons.length}</span>
            </h2>
            <ul data-tone={seasonTone} className="card flex flex-col divide-y divide-line rounded-lg px-4">
              {seasons.map((s) => (
                <SummaryRow
                  key={s.def.slug}
                  label={`${s.def.label} (${s.def.monthsLabel})`}
                  sub={s.def.claim}
                  value={s.observedYears.map((y) => `${y}년`).join(" · ")}
                  href={`/reports/season/${s.def.slug}`}
                />
              ))}
            </ul>
            {/* [v4 · 규칙 3] 설명 문단 → 방법 캡션 한 줄 */}
            <p className="t-caption text-text-3">같은 해 다른 달과 같은 지역끼리만 비교 · 신고 중인 잠정 달 제외</p>
          </section>
        )}

        {/* 애드센스 데스크탑 유닛 — 목록 하단 빈공간. 모바일 미노출. */}
        <AdSenseUnit />
      </div>
    </PageShell>
  );
}
