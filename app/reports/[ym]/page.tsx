import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageShell } from "../../components/PageShell";
import { QaBlock } from "../../components/QaBlock";
import { CitationBlock } from "../../components/CitationBlock";
import { PressSummaryBlock } from "../../components/PressSummaryBlock";
import { getMonthlyReport, formatYmKo, isValidYm } from "@/lib/reports/monthly";
import { breadcrumbJsonLd, jsonLdScript, type FaqItem } from "@/lib/seo/jsonld";
import { seoAlternates } from "@/lib/seo/alternates";
import { formatKrwWon } from "@/lib/format/krw";
import { deltaText as stdDeltaText, signedPctText } from "@/lib/format/delta";
import { Delta } from "@/app/components/num/Delta";
import { Explain } from "@/app/components/explain/Explain";
import { reportingClosed, reportingDeadlineLabel } from "@/lib/newui/reporting-window";
import { logger } from "@/lib/log";
import { commonRegionCompare, reportSummary, type CommonCompare } from "./report-compare";

/* ============================================================
   S11/G7/G8/G14 — 월간 실거래 리포트 상세.
   market_region_monthly 집계에서 100% 자동 생성 — 사람이 쓴 시황이 아니다.
   AI 가 그대로 발췌·인용할 수 있는 완결 문장(첫 문단·Q&A·인용 블록)을
   실측치로만 조립하고, Article JSON-LD 에 dateModified(집계 갱신 시각)를 싣는다.
   데이터 없는 달은 404 — 빈 리포트를 만들지 않는다.

   404 는 "그 달 집계가 없다" 일 때만이다. 조회 실패는 잡지 않고 그대로
   던진다(→ 5xx). generateStaticParams 가 빈 배열이라 빌드 프리렌더 대상이
   아니므로 던져도 빌드가 깨지지 않고, 실패한 재검증은 직전 성공 페이지를
   그대로 유지시킨다. 반대로 DB 장애를 404 로 바꾸면 크롤러에게 "이 URL 은
   없어졌다" 고 확정 신고하는 꼴이다 — 5xx 는 재시도를 부르지만 404 는
   색인에서 지운다. 경위는 lib/market/tx-bands.ts 헤더 참고.
   ============================================================ */

/* [1010] 1h → 7일. 완결 월 스냅샷이다 — 값이 더 움직이는 달은 신고 지연(계약 후 30일)이
   걸린 최근 3개월뿐이고, 그 경로만 하루 1회 비운다
   (lib/region/invalidate-market.ts nationalReportPaths → invalidateMarketAnalysisRoutes).
   지난 달들은 더 이상 바뀌지 않는데 1시간마다 다시 그리고 있었다. 동적 세그먼트라
   SOURCE_MAP 의 "/reports"(목록)로는 닿지 않는 자리다. */
export const revalidate = 604_800;
/* 빈 배열 = "빌드 때 미리 만들 경로는 없다". 이 export 가 있어야 Next 가 이
   라우트를 ISR 로 분류한다 — 없으면 `revalidate` 를 적어 둬도 요청마다 서버
   렌더로 돌면서 Next 가 `private, no-cache, no-store` 를 실어 보내고, CDN 은
   한 벌도 재사용하지 못한다(2026-07-28 함수 호출 소진 사고. 자세한 내용은
   app/complex/[id]/page.tsx 의 같은 자리 주석). dynamicParams 기본값이 true 라
   실제 요청이 오면 그때 만들어 캐시한다. */
export function generateStaticParams(): { ym: string }[] {
  return [];
}

/** [967 · 31] 원 → "8.45억", null·0 이하 "—" — lib/format/krw.ts "eok" 스타일 */
function eok(krw: number | null): string {
  return formatKrwWon(krw, { style: "eok", below: "eok" });
}

/** [1009 · H] 표 칸의 평균가 — 소수 한 자리 고정("5.0억"·"5.9억"). 예전 "eok"(0 떼기)는 "5억"·"5.86억"이
    한 열에 섞여 자릿수가 들쭉날쭉했다. 문장(Q&A·언론 요약)은 그대로 eok() 를 쓴다. */
function eokCell(krw: number | null): string {
  return formatKrwWon(krw, { style: "eok1", trimZeros: false });
}


/** [1009 · H] 문장용 등락 — 사이트 표준(lib/format/delta: ▲/▼ 0.1% 단위 · |x|<0.05 보합 · 모르면 변동 미상) */
function deltaText(pct: number | null): string {
  return stdDeltaText(pct);
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ ym: string }>;
}): Promise<Metadata> {
  const { ym } = await params;
  const report = isValidYm(ym) ? await getMonthlyReport(ym) : null;
  if (!report) {
    return { title: "월간 실거래 리포트 | 내집나우", robots: { index: false, follow: false } };
  }
  const label = formatYmKo(report.ym);
  const title = `${label} 아파트 실거래 리포트 — ${report.regionCount}개 지역 ${report.txCount.toLocaleString("ko-KR")}건 | 내집나우`;
  const description = `${label} 전국 집계 지역 아파트 매매 실거래 ${report.txCount.toLocaleString("ko-KR")}건. 지역별 거래량·평균가와 평당가 전월 대비 변동을 국토교통부 신고 기준으로 정리했습니다.`;
  const path = `/reports/${report.ym}`;
  return {
    title,
    description,
    alternates: seoAlternates(path),
    openGraph: { title, description, url: `https://naezipnow.com${path}`, type: "article" },
  };
}

export default async function MonthlyReportPage({
  params,
}: {
  params: Promise<{ ym: string }>;
}) {
  const { ym } = await params;
  if (!isValidYm(ym)) notFound();
  const report = await getMonthlyReport(ym);
  if (!report) notFound();

  const label = formatYmKo(report.ym);
  const monthOnly = `${Number(report.ym.slice(4, 6))}월`;
  const txText = report.txCount.toLocaleString("ko-KR");

  /* [1009 · H] 전월 비교는 **두 달 모두 신고 기한(말일 + 30일)이 지났고**, **두 달 모두 집계된 지역끼리**만 한다.
     왜(리뷰 실측, 2026-09-22): /reports/202609 가 "9월 아파트 매매 신고가 전월보다 27,532건(87.6%) 줄었어요"
     (9월 86곳 3,889건 — 신고 기한 10/30 전 — 대 8월 248곳 31,421건), 202608 도 "23.3% 줄었어요"(8월분은 9/30 까지 신고)라고
     반쪽 집계로 급감을 선언했다. 기한이 지난 달도 달마다 집계 지역 수가 달라(2월 218곳 · 3월 252곳) 합계끼리 나누면
     범위가 넓어진 만큼을 거래 증가로 적었다(report-compare.ts). 비교 원천은 전월 리포트의 지역별 건수(추가 조회 1회). */
  const now = new Date();
  const open = !reportingClosed(report.ym, now);
  const deadline = reportingDeadlineLabel(report.ym);
  let compare: CommonCompare | null = null;
  if (!open && report.prevYm && reportingClosed(report.prevYm, now)) {
    try {
      const prev = await getMonthlyReport(report.prevYm);
      compare = prev ? commonRegionCompare(report.rows, prev.rows) : null;
    } catch (e) {
      /* 비교는 곁가지 — 못 읽으면 비교 문장 없이 이 달 숫자만 그린다(지어내지 않는다) */
      logger.warn(`[reports/${report.ym}] 전월 지역별 집계 조회 실패 — 비교 없이 그림`, e);
      compare = null;
    }
  }
  const prevLabel = report.prevYm ? formatYmKo(report.prevYm) : "전월";
  /* 머리 한 줄 · 비교 문구 · 첫 문단(G12 — 발췌해도 완결되는 정의형 문장)은 순수 함수(report-compare.ts · 테스트로 잠금) */
  const { headline, leadSentence } = reportSummary({
    label,
    monthOnly,
    txCount: report.txCount,
    regionCount: report.regionCount,
    open,
    deadline,
    compare,
  });

  const citation = `내집나우(naezipnow.com) 집계에 따르면, ${label} 집계 지역 ${report.regionCount}곳의 아파트 매매 실거래는 ${report.txCount.toLocaleString("ko-KR")}건이다 (국토교통부 실거래 신고 기반).`;

  const faq: FaqItem[] = [
    {
      q: `${label} 아파트 실거래는 총 몇 건인가요?`,
      a: leadSentence,
    },
  ];
  const top = report.rows[0];
  if (top) {
    faq.push({
      q: `${label} 거래가 가장 많았던 지역은 어디인가요?`,
      a: `${top.regionName}이(가) ${top.txCount.toLocaleString("ko-KR")}건으로 가장 많았습니다${
        top.avgKrw ? `. 이 지역의 ${label} 평균 매매가는 ${eok(top.avgKrw)}입니다` : ""
      } (국토교통부 실거래 신고 기준).`,
    });
  }
  if (!open && report.risers.length > 0) {
    const r = report.risers[0];
    faq.push({
      /* [1009 · H] 이 변동률(trend_delta_pct)은 평균 매매가가 아니라 **평당가 평균**의 전월비다(운영 DB 함수
         refresh_market_region_monthly — 두 달 모두 10건 이상일 때만 값). 예전 문장은 "평균 매매가가 …"라고 적었다 */
      q: `${label} 평당가가 가장 많이 오른 지역은?`,
      a: `이번 달과 전월 모두 거래 10건 이상인 지역 중 ${r.regionName}의 평당가 평균이 전월 대비 ${deltaText(r.deltaPct)} 변동으로 상승 폭이 가장 컸습니다. 평당가 평균은 그 달 거래된 단지·연식 구성에 따라 달라질 수 있는 단순 평균입니다.`,
    });
  }

  /* N18 — 기사 리드로 그대로 옮길 수 있는 3문장. 전부 위에서 쓴 실측치 재사용이고,
     여기서 새로 계산하거나 해석을 덧붙이지 않는다. 근거가 없으면 문장을 뺀다. */
  const pressSentences: string[] = [
    `내집나우가 국토교통부 실거래 신고 자료를 집계한 결과, ${label} 전국 집계 지역 ${report.regionCount}곳의 아파트 매매 실거래는 ${txText}건으로 나타났다${
      compare
        ? ` (두 달 모두 집계된 ${compare.regionCount}곳 기준 전월 ${prevLabel} 대비 ${signedPctText(compare.pct)})`
        : open
          ? ` (신고 기한${deadline ? ` ${deadline}` : ""} 전 잠정치)`
          : ""
    }.`,
  ];
  if (top) {
    pressSentences.push(
      `거래량이 가장 많았던 지역은 ${top.regionName}(${top.txCount.toLocaleString("ko-KR")}건)이었다${
        top.avgKrw ? `, 이 지역의 ${label} 평균 매매가는 ${eok(top.avgKrw)}이다` : ""
      }.`,
    );
  }
  if (!open && (report.risers.length > 0 || report.fallers.length > 0)) {
    const upPart =
      report.risers.length > 0
        ? `평당가 평균의 상승 폭이 가장 컸던 지역은 ${report.risers[0].regionName}(전월 대비 ${(report.risers[0].deltaPct ?? 0).toFixed(1)}%)`
        : "";
    const downPart =
      report.fallers.length > 0
        ? `하락 폭이 가장 컸던 지역은 ${report.fallers[0].regionName}(전월 대비 ${(report.fallers[0].deltaPct ?? 0).toFixed(1)}%)`
        : "";
    pressSentences.push(
      `이번 달과 전월 모두 거래 10건 이상인 지역만 놓고 보면 ${[upPart, downPart].filter(Boolean).join(", ")}였다 (거래 건별 평당가의 단순 평균 기준).`,
    );
  }

  const articleJsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: `${label} 아파트 실거래 리포트`,
    description: leadSentence,
    inLanguage: "ko-KR",
    author: { "@type": "Organization", name: "내집나우", url: "https://naezipnow.com" },
    publisher: { "@id": "https://naezipnow.com/#organization" },
    ...(report.updatedAt
      ? { dateModified: report.updatedAt, datePublished: report.updatedAt }
      : {}),
    mainEntityOfPage: `https://naezipnow.com/reports/${report.ym}`,
  };

  const crumbs = breadcrumbJsonLd([
    { name: "홈", url: "/" },
    { name: "월간 실거래 리포트", url: "/reports" },
    { name: label, url: `/reports/${report.ym}` },
  ]);

  return (
    <PageShell breadcrumb={`월간 실거래 리포트 › ${label}`}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript([articleJsonLd, crumbs]) }}
      />
      <div className="mx-auto max-w-[860px]">
        <h1 className="rise-in text-[24px] font-extrabold text-ink">
          {label} 아파트 실거래 리포트
        </h1>
        {/* [1009 · H] 결론 → 큰 숫자 → 비교 기준(토스식 한 화면 한 메시지). 아래 첫 문단(G12)은 인용용 전문이라 그대로 둔다 */}
        <section aria-label={`${label} 거래 요약`} className="rise-in-1 card mt-3 rounded-2xl p-[var(--pad-card)]">
          <p className="m-0 t-caption text-text-3">
            집계 지역 {report.regionCount.toLocaleString("ko-KR")}곳 · 국토교통부 실거래 신고
            {open ? ` · 신고 중${deadline ? `(기한 ${deadline})` : ""}` : ""}
          </p>
          <p className="m-0 mt-0.5 t-title text-ink break-words">{headline}</p>
          <div className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span className="t-display t-num text-ink">
              {txText}
              <span className="won-u">건</span>
            </span>
            {compare && (
              <>
                <Delta pct={compare.pct} srContext="같은 지역 전월보다" className="t-body" />
                <span className="t-caption text-text-3">
                  두 달 모두 집계된 {compare.regionCount.toLocaleString("ko-KR")}곳 기준 · {prevLabel}{" "}
                  {compare.prevTx.toLocaleString("ko-KR")}건 → {compare.curTx.toLocaleString("ko-KR")}건
                </span>
              </>
            )}
          </div>
        </section>
        <p className="rise-in-1 mt-3 text-[13px] leading-[1.7] text-text-2">{leadSentence}</p>
        {/* [1009 · H] 신고 중인 달이라는 사실은 머리 카드("신고 중(기한 10/30)")와 첫 문단이 말한다 — 같은 말을 한 번 더 두지 않는다 */}

        {/* 상승·하락 상위 (거래 10건 이상 지역만 — 소표본 변동 과대 해석 방지) */}
        {!open && (report.risers.length > 0 || report.fallers.length > 0) && (
          <div className="rise-in-2 mt-5 grid grid-cols-1 gap-3 md:grid-cols-2">
            {report.risers.length > 0 && (
              <div className="card rounded-2xl p-5">
                <div className="flex items-center gap-0.5">
                  <h2 className="text-[13px] font-extrabold text-ink">평당가 상승 상위</h2>
                  {/* [1009 · H] 예전 머리 "평균가 상승 상위" — 실제 순위 기준은 평당가 평균의 전월비(trend_delta_pct)다 */}
                  <Explain
                    title="평당가 상승·하락 상위"
                    body="그 달 평당가(3.3㎡당 가격) 평균이 전월보다 가장 많이 오르거나 내린 지역이에요. 평균 매매가의 순위가 아니에요."
                    how={[
                      "이번 달과 전월 모두 거래 10건 이상인 지역만 비교해요(적은 표본의 큰 출렁임 제외).",
                      "평당가 평균 = 해제 신고를 뺀 거래 건별 평당가의 단순 평균 — 그 달 어떤 단지·연식이 많이 팔렸는지에 따라 움직여요.",
                      "변동률 = (이번 달 평당가 평균 − 전월 평당가 평균) ÷ 전월 평당가 평균 × 100",
                    ]}
                    source={`국토교통부 실거래 신고 · ${label} 집계`}
                  />
                </div>
                {report.risers.map((r) => (
                  <div key={r.regionName} className="mt-2 flex justify-between gap-2 text-[13px]">
                    <span className="font-bold text-ink break-words">{r.regionName}</span>
                    <Delta pct={r.deltaPct} srContext="평당가 전월보다" className="shrink-0" />
                  </div>
                ))}
              </div>
            )}
            {report.fallers.length > 0 && (
              <div className="card rounded-2xl p-5">
                <h2 className="text-[13px] font-extrabold text-ink">평당가 하락 상위</h2>
                {report.fallers.map((r) => (
                  <div key={r.regionName} className="mt-2 flex justify-between gap-2 text-[13px]">
                    <span className="font-bold text-ink break-words">{r.regionName}</span>
                    <Delta pct={r.deltaPct} srContext="평당가 전월보다" className="shrink-0" />
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 지역별 표 */}
        <section className="rise-in-3 card mt-5 p-[var(--pad-card)]">
          <h2 className="text-[15px] font-extrabold text-ink">
            지역별 거래량·평균가{" "}
            <span className="text-[12px] font-medium text-text-3">거래량순 · {report.regionCount}개 지역</span>
          </h2>
          {/* [1009 · H] 390px 에서 가로 스크롤(min-width 520) 없이 — 평당가 열은 sm 부터. 숫자 열은 tabular-nums,
              등락은 <Delta>(예전 text-danger/text-primary 는 테마를 타는 색이었다). 평당가는 평균이라 짧은 표기 —
              예전 "11,783만"은 억으로 넘기지 않은 표기였다. 신고 기한 안의 달은 전월 대비 열을 그리지 않는다(반쪽 비교). */}
          <div className="mt-3">
            <table className="w-full text-left text-[13px]">
              <thead>
                <tr className="border-b border-border text-[12px] text-text-3">
                  <th className="py-2 font-medium">지역</th>
                  <th className="py-2 text-right font-medium">거래량</th>
                  <th className="py-2 text-right font-medium">평균가</th>
                  <th className="hidden py-2 text-right font-medium sm:table-cell">평당가</th>
                  {!open && (
                    <th className="py-2 text-right font-medium">
                      평당가
                      <br />
                      전월 대비
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {report.rows.map((r) => (
                  <tr key={r.regionName} className="border-b border-border last:border-b-0">
                    <td className="py-2.5 pr-2 font-bold text-ink break-words">{r.regionName}</td>
                    <td className="py-2.5 text-right tabular-nums text-text-2">
                      {r.txCount.toLocaleString("ko-KR")}건
                    </td>
                    <td className="py-2.5 pl-2 text-right font-extrabold tabular-nums text-ink">{eokCell(r.avgKrw)}</td>
                    <td className="hidden py-2.5 text-right tabular-nums text-text-2 sm:table-cell">{eokCell(r.perPyeongKrw)}</td>
                    {!open && (
                      <td className="py-2.5 pl-2 text-right">
                        <Delta pct={r.deltaPct} srContext="평당가 전월보다" />
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-[12px] leading-[1.6] text-text-3">
            평균가·평당가는 면적·타입 구분 없는 단순 평균입니다.{" "}
            {open
              ? "신고 기한이 지나지 않은 달이라 전월과 비교하지 않습니다."
              : "전월 대비는 평당가 평균의 변동률로, 이번 달과 전월 모두 거래 10건 이상일 때만 적습니다."}{" "}
            해제(취소) 신고분은 집계에서 제외했습니다 —{" "}
            <Link href="/methodology" className="inline-flex min-h-[24px] items-center font-bold text-primary underline">
              집계 방법론 보기
            </Link>
          </p>
        </section>

        {/* G8 인용 블록 + N18 언론 인용 요약 + G5/G13 Q&A */}
        <div className="rise-in-4 mt-5">
          <CitationBlock sentence={citation} />
          <PressSummaryBlock
            sentences={pressSentences}
            asOfLabel={`${label} 실거래 신고 기준`}
            provisional={open}
          />
          <QaBlock title={`${label} 실거래 Q&A`} items={faq} />
        </div>

        <p className="mb-8 text-[12px] text-text-3">
          <Link href="/reports" className="inline-flex min-h-[24px] items-center font-bold text-primary underline">
            다른 달 리포트
          </Link>
          {" · "}
          <Link href="/tx" className="inline-flex min-h-[24px] items-center font-bold text-primary underline">
            지역별 실거래 상세
          </Link>
        </p>
      </div>
    </PageShell>
  );
}
