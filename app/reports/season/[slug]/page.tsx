/* [1012 · 규칙 8] font-extrabold(800) → font-bold(700) — 굵기 3단(400·500·700). 이 파일의 모든 자리에 적용. */
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageShell } from "@/app/components/PageShell";
import { QaBlock } from "@/app/components/QaBlock";
import { CitationBlock } from "@/app/components/CitationBlock";
import { PressSummaryBlock } from "@/app/components/PressSummaryBlock";
import {
  getSeasonReport,
  seasonBySlug,
  seasonVerdict,
  seasonVerdictText,
  SEASON_LIFT_THRESHOLD_PCT,
} from "@/lib/reports/seasonal";
import { breadcrumbJsonLd, jsonLdScript, type FaqItem } from "@/lib/seo/jsonld";
import { seoAlternates } from "@/lib/seo/alternates";
import { formatKrwWon } from "@/lib/format/krw";
import { absPctText } from "@/lib/format/delta";
import { Delta } from "@/app/components/num/Delta";
import { Explain } from "@/app/components/explain/Explain";

/* ============================================================
   N12 — 계절(이사철) 리포트.

   이 페이지가 하는 일은 하나다: "2~3월은 이사철이라 거래가 몰린다" 같은
   통념을 국토교통부 실거래 집계로 검증하고, 나온 결과를 그대로 적는다.
   통념이 맞으면 맞다고, 반대면 반대라고, 차이가 없으면 없다고 쓴다.
   판정 문턱(±5%)은 lib/reports/seasonal.ts 에 상수로 고정돼 있어
   페이지가 결론에 맞춰 기준을 고를 수 없다.

   관측 안 된 계절-연도는 숨기지 않고 "왜 아직 못 세는지"까지 적는다
   (예: "2026년 — 7월 신고 진행 중(잠정), 8월 집계 없음").
   빠진 달을 조용히 무시하면 절반짜리 숫자가 계절 전체인 척하게 된다.

   관측된 계절-연도가 하나도 없으면 404 — 없는 리포트를 만들지 않는다.
   조회 실패는 잡지 않고 던진다(→ 5xx). generateStaticParams 가 빈 배열이라
   빌드 프리렌더 대상이 아니므로 던져도 빌드가 깨지지 않는다. DB 장애를
   404 로 바꾸면 크롤러에게 "이 URL 은 없어졌다" 고 확정 신고하는 꼴이다.
   ============================================================ */

/* [1010] 1h → 1일. 계절 리포트는 그 계절의 달이 모두 관측돼야 값이 생기고, 진행 중인
   해는 달이 하나씩 채워질 때마다 바뀐다 — 그 경계는 월 단위라 1일 눈금이 맞다.
   동적 세그먼트라 SOURCE_MAP 이 닿지 못해, 하루 1회 라우트 전체를 비운다
   (lib/region/invalidate-market.ts invalidateMarketAnalysisRoutes — 계절 4개라 싸다). */
export const revalidate = 86_400;
/* 빈 배열 = "빌드 때 미리 만들 경로는 없다". 이 export 가 있어야 Next 가 이
   라우트를 ISR 로 분류한다 — 없으면 `revalidate` 를 적어 둬도 요청마다 서버
   렌더로 돌면서 Next 가 `private, no-cache, no-store` 를 실어 보내고, CDN 은
   한 벌도 재사용하지 못한다(2026-07-28 함수 호출 소진 사고. 자세한 내용은
   app/complex/[id]/page.tsx 의 같은 자리 주석). dynamicParams 기본값이 true 라
   실제 요청이 오면 그때 만들어 캐시한다. */
export function generateStaticParams(): { slug: string }[] {
  return [];
}

/** [967 · 31] 원 → "8.45억", 빈값 "—" — lib/format/krw.ts "eok" 스타일 */
function eok(krw: number | null): string {
  return formatKrwWon(krw, { style: "eok", below: "eok" });
}

/** [1009 · H] 표 칸의 평균가 — 월간 리포트(/reports/[ym]) 표와 같은 소수 한 자리 고정("6.4억"·"5.0억").
    "eok"(0 떼기·둘째 자리)는 "5억"·"6.35억"이 한 열에 섞였다. 전년 대비 칸(두 평균의 작은 차이)은 eok() 그대로. */
function eokCell(krw: number | null): string {
  return formatKrwWon(krw, { style: "eok1", trimZeros: false });
}

function pct(v: number): string {
  const s = Math.abs(v).toFixed(1);
  if (v > 0) return `+${s}%`;
  if (v < 0) return `-${s}%`;
  return "0.0%";
}

function n(v: number): string {
  return Math.round(v).toLocaleString("ko-KR");
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const def = seasonBySlug(slug);
  if (!def) {
    return { title: "계절 리포트 | 내집나우", robots: { index: false, follow: false } };
  }
  const report = await getSeasonReport(slug);
  if (!report) {
    return {
      title: `${def.label}(${def.monthsLabel}) 실거래 리포트 | 내집나우`,
      robots: { index: false, follow: true },
    };
  }
  const title = `${def.label} ${def.monthsLabel} 아파트 거래, 정말 몰릴까 — 실거래로 검증 | 내집나우`;
  const description = `${def.monthsLabel} 아파트 매매 실거래를 같은 해 다른 달과 비교했습니다. ${report.latest.year}년 ${def.monthsLabel} 거래 ${report.latest.txCount.toLocaleString("ko-KR")}건, 국토교통부 신고 기준.`;
  const path = `/reports/season/${slug}`;
  return {
    title,
    description,
    alternates: seoAlternates(path),
    openGraph: { title, description, url: `https://naezipnow.com${path}`, type: "article" },
  };
}

export default async function SeasonReportPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  if (!seasonBySlug(slug)) notFound();
  const report = await getSeasonReport(slug);
  if (!report) notFound();

  const { def, latest, yoy } = report;

  /* 판정 — 같은 해 계절 외 월과의 비교가 있는 연도만 대상으로 한다. */
  const compared = report.years.filter((y) => y.vsOffSeason !== null);
  const verdicts = compared.map((y) => seasonVerdict(y.vsOffSeason!.liftPct));
  const higherCount = verdicts.filter((v) => v === "higher").length;
  const lowerCount = verdicts.filter((v) => v === "lower").length;

  /* [1009 · H] 결론 한 줄(토스식) — 가장 최근에 비교 가능한 해의 실제 판정으로만. 비교가 없으면 null(문장을 쓰지 않는다) */
  const lastCompared = compared.length > 0 ? compared[compared.length - 1]! : null;
  const headline = (() => {
    if (!lastCompared?.vsOffSeason) return null;
    const lift = lastCompared.vsOffSeason.liftPct;
    const v = seasonVerdict(lift);
    const head = `${lastCompared.year}년 ${def.monthsLabel} 거래는 같은 해 다른 달`;
    if (v === "higher") return `${head}보다 ${absPctText(lift)} 많았어요`;
    if (v === "lower") return `${head}보다 ${absPctText(lift)} 적었어요`;
    return `${head}과 거의 차이가 없었어요`;
  })();

  /* G12 — 발췌해도 완결되는 첫 문단. 비교가 불가능하면 그 사실을 문장으로 쓴다. */
  let leadSentence: string;
  if (compared.length === 0) {
    leadSentence = `${latest.year}년 ${def.monthsLabel} 아파트 매매 실거래는 ${latest.txCount.toLocaleString("ko-KR")}건입니다. 같은 해 다른 달의 집계가 아직 없어 "${def.label}에 거래가 몰리는가"는 이 데이터로 판단할 수 없습니다 — 국토교통부 실거래 신고 기준.`;
  } else {
    const c = compared[compared.length - 1]!;
    const vs = c.vsOffSeason!;
    const v = seasonVerdict(vs.liftPct);
    /* [1009 · H] 예전 "…16,543건보다 -3.5% 거의 차이가 없었습니다"(2026-09-22 로컬 /reports/season/spring-move) —
       부호 붙은 %와 판정 낱말이 부딪혔다. 크기(절댓값)는 방향 낱말과 함께, 문턱 안이면 그 사실을 적는다. */
    const abs = absPctText(vs.liftPct);
    const tail =
      v === "higher"
        ? `보다 ${abs} ${seasonVerdictText(v)}`
        : v === "lower"
          ? `보다 ${abs} ${seasonVerdictText(v)}`
          : abs === "0.0%"
            ? `과 ${seasonVerdictText(v)}`
            : `보다 ${abs} ${vs.liftPct > 0 ? "많았지만" : "적었지만"} ±${SEASON_LIFT_THRESHOLD_PCT}% 안이라 ${seasonVerdictText(v)}`;
    leadSentence = `${c.year}년 ${def.monthsLabel}의 아파트 매매 실거래는 월평균 ${n(vs.seasonPerMonth)}건으로, 같은 해 같은 지역(${vs.regionCount}곳)의 다른 달 월평균 ${n(vs.offPerMonth)}건${tail} — 국토교통부 실거래 신고 기준.`;
  }

  const citation =
    compared.length === 0
      ? `내집나우(naezipnow.com) 집계에 따르면, ${latest.year}년 ${def.monthsLabel} 아파트 매매 실거래는 ${latest.txCount.toLocaleString("ko-KR")}건이다 (국토교통부 실거래 신고 기반, 같은 해 다른 달과의 비교는 아직 불가).`
      : `내집나우(naezipnow.com) 집계에 따르면, ${compared[compared.length - 1]!.year}년 ${def.monthsLabel}의 아파트 매매 실거래는 같은 해 같은 지역의 다른 달 대비 월평균 ${pct(compared[compared.length - 1]!.vsOffSeason!.liftPct)} 수준이었다 (국토교통부 실거래 신고 기반).`;

  const faq: FaqItem[] = [
    {
      q: `${def.monthsLabel}에 아파트 거래가 정말 몰리나요?`,
      a:
        compared.length === 0
          ? `아직 판단할 수 없습니다. ${latest.year}년 ${def.monthsLabel} 실거래는 ${latest.txCount.toLocaleString("ko-KR")}건으로 집계됐지만, 비교 기준이 될 같은 해 다른 달의 집계가 없습니다. 비교 없이 "몰린다/뜸하다"를 말하지 않습니다.`
          : `${compared[compared.length - 1]!.year}년 기준으로는 ${leadSentence.replace(/^[^,]*년 /, "")} 다만 관측된 해가 ${report.years.length}개라 ${report.canClaimSeasonality ? "여러 해에 걸친 경향으로 볼 여지가 있습니다" : "이것만으로 매년 반복되는 계절성이라고 말하기는 어렵습니다"}.`,
    },
    {
      q: `이 비교는 어떻게 계산했나요?`,
      a: `${def.monthsLabel}의 월평균 거래량과, 같은 해 ${def.monthsLabel}을 제외한 달들의 월평균 거래량을 비교했습니다. 달마다 집계되는 지역 수가 다르면 계절성이 아니라 수집 범위를 재게 되므로, 비교 대상 달에 모두 등장하는 공통 지역으로만 계산합니다. 신고 기한(계약 후 30일)이 지나지 않은 잠정 월과, 계절의 일부 달만 있는 해는 아예 제외합니다.`,
    },
  ];
  if (yoy) {
    faq.push({
      q: `${def.monthsLabel} 거래량은 작년보다 늘었나요?`,
      a: `두 해 ${def.monthsLabel}에 모두 집계된 지역 ${yoy.regionCount}곳 기준으로, ${yoy.fromYear}년 ${yoy.fromTx.toLocaleString("ko-KR")}건에서 ${yoy.toYear}년 ${yoy.toTx.toLocaleString("ko-KR")}건으로 ${pct(yoy.txDeltaPct)} 변동했습니다.`,
    });
  }

  /* N18 — 기사 리드로 옮길 수 있는 문장. 위에서 쓴 실측치 재사용만 한다. */
  const pressSentences: string[] = [
    compared.length === 0
      ? `내집나우가 국토교통부 실거래 신고 자료를 집계한 결과, ${latest.year}년 ${def.monthsLabel} 아파트 매매 실거래는 ${latest.txCount.toLocaleString("ko-KR")}건으로 나타났다. 같은 해 다른 달 집계가 없어 계절 간 비교는 하지 않았다.`
      : `내집나우가 국토교통부 실거래 신고 자료를 집계한 결과, ${compared[compared.length - 1]!.year}년 ${def.monthsLabel}의 아파트 매매 실거래는 월평균 ${n(compared[compared.length - 1]!.vsOffSeason!.seasonPerMonth)}건으로, 같은 해 같은 지역의 다른 달(월평균 ${n(compared[compared.length - 1]!.vsOffSeason!.offPerMonth)}건) 대비 ${pct(compared[compared.length - 1]!.vsOffSeason!.liftPct)} 수준이었다.`,
  ];
  if (compared.length >= 2) {
    pressSentences.push(
      `비교가 가능한 ${compared.length}개 연도 가운데 ${def.monthsLabel}이 다른 달보다 거래가 많았던 해는 ${higherCount}개, 적었던 해는 ${lowerCount}개였다 (±${SEASON_LIFT_THRESHOLD_PCT}% 이내는 차이 없음으로 분류).`,
    );
  }
  if (yoy) {
    pressSentences.push(
      `두 해 모두 집계된 지역 ${yoy.regionCount}곳만 놓고 보면 ${def.monthsLabel} 거래량은 ${yoy.fromYear}년 대비 ${pct(yoy.txDeltaPct)} 변동했다.`,
    );
  }

  const articleJsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: `${def.label}(${def.monthsLabel}) 아파트 실거래 검증 리포트`,
    description: leadSentence,
    inLanguage: "ko-KR",
    author: { "@type": "Organization", name: "내집나우", url: "https://naezipnow.com" },
    publisher: { "@id": "https://naezipnow.com/#organization" },
    ...(report.updatedAt
      ? { dateModified: report.updatedAt, datePublished: report.updatedAt }
      : {}),
    mainEntityOfPage: `https://naezipnow.com/reports/season/${def.slug}`,
  };

  const crumbs = breadcrumbJsonLd([
    { name: "홈", url: "/" },
    { name: "월간 실거래 리포트", url: "/reports" },
    { name: `${def.label} 리포트`, url: `/reports/season/${def.slug}` },
  ]);

  return (
    <PageShell breadcrumb={`실거래 리포트 › ${def.label}`}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript([articleJsonLd, crumbs]) }}
      />
      {/* [v4 · 한 화면 한 가지] 제목(질문) + 통념 한 줄 → 주인공(계절 월평균 t-display + 다른 달 대비) →
          연도별 표 → 전년 대비 행 → 거래 상위 지역 표 → 맨 끝 접힘 "데이터 출처·인용".
          지운 것: 결론 문장(숫자·등락과 같은 말), 요약 카드 테두리·두 칸 상자, 통념 카드(→ 머리 한 줄, 근거 문단은 접힘),
          표 아래 방법 문단 두 개(→ 캡션 한 줄씩), 전년 대비 두 칸 상자(→ 구분선 행). */}
      <div className="mx-auto flex max-w-[760px] flex-col gap-8">
        <div className="flex flex-col gap-4">
          <header className="flex flex-col gap-0.5">
            <h1 className="rise-in t-title text-ink">
              {def.label}({def.monthsLabel}), 정말 거래가 몰릴까
            </h1>
            {/* 검증 대상 통념 — 이 페이지가 무엇에 답하는지(예전 카드 → 사실 줄) */}
            <p className="t-sub text-text-3">&ldquo;{def.claim}&rdquo;</p>
          </header>

          {/* [1009 · H] 결론 → 큰 숫자(계절 월평균 vs 다른 달 월평균) → 판정 기준. [v4 · 규칙 2] 주인공 하나 */}
          {headline && lastCompared?.vsOffSeason && (
            <section aria-label="검증 결과" className="flex flex-col gap-1">
              <p className="m-0 t-caption text-text-3">
                {lastCompared.year}년 {def.monthsLabel} 월평균 · 공통 지역{" "}
                {lastCompared.vsOffSeason.regionCount.toLocaleString("ko-KR")}곳 · 국토교통부 실거래 신고
              </p>
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <span className="t-display t-num text-ink">
                  {n(lastCompared.vsOffSeason.seasonPerMonth)}
                  <span className="won-u">건</span>
                </span>
                <Delta pct={lastCompared.vsOffSeason.liftPct} srContext="다른 달보다" className="t-body" />
              </div>
              <p className="m-0 flex flex-wrap items-center gap-0.5 t-caption text-text-3">
                같은 해 다른 달 월평균 {n(lastCompared.vsOffSeason.offPerMonth)}건 대비 · ±{SEASON_LIFT_THRESHOLD_PCT}% 안은 차이 없음
                <Explain
                  title="계절 판정"
                  body="이사철 통념을 실거래 신고 건수로 확인해요. 판정 문턱은 결론에 맞춰 고르지 않도록 코드에 고정돼 있어요."
                  how={[
                    `${def.monthsLabel}의 월평균 거래와 같은 해 나머지 달의 월평균 거래를 비교해요.`,
                    "비교 대상 달에 모두 등장하는 공통 지역만 더해요 — 달마다 집계 지역 수가 달라 생기는 착시를 없애려고요.",
                    `차이 = (${def.monthsLabel} 월평균 − 다른 달 월평균) ÷ 다른 달 월평균 × 100, ±${SEASON_LIFT_THRESHOLD_PCT}% 이상이면 "많았다/적었다"`,
                    "신고 기한(계약 후 30일)이 안 지난 잠정 월과 계절의 일부 달만 있는 해는 빼요.",
                  ]}
                  source="국토교통부 실거래 신고 · 월별 집계"
                />
              </p>
            </section>
          )}

          {!report.canClaimSeasonality && (
            /* 정직성 한 줄 — 한 해만으로 계절성을 단정하지 않는다(예전 두 문장 → 사실 한 줄) */
            <p className="m-0 t-sub text-text-2">
              온전히 집계된 해 {report.years.length}개({report.years.map((y) => `${y.year}년`).join(", ")}) ·{" "}
              <strong className="text-ink">매년 반복되는 계절성으로 단정하지 않음</strong>
            </p>
          )}
        </div>

        {/* 연도별 계절 vs 계절 외 */}
        <section className="flex flex-col gap-2">
          <h2 className="t-section text-ink">
            연도별 {def.monthsLabel} vs 같은 해 다른 달
          </h2>
          {/* [1009 · H] 차이 열 — <Delta>. ±5% 안이면 숫자 옆에 "차이 없음". 숫자 열은 tabular-nums.
              relative — 표 안 <Delta> 의 sr-only 글자가 가로 스크롤 상자 밖 문서 폭을 넓히지 않게(390px 실측 461px). */}
          <div className="card relative overflow-x-auto rounded-lg px-4 py-1">
            {/* [1009 · H] 390px 에서 가로 스크롤 없이 — 계절 합계 열(월평균과 같은 정보)은 sm 부터 */}
            <table className="w-full text-left t-body">
              <thead>
                <tr className="border-b border-line t-sub text-text-3">
                  <th className="py-2 font-medium">연도</th>
                  <th className="hidden py-2 text-right font-medium sm:table-cell">{def.monthsLabel} 거래</th>
                  <th className="py-2 text-right font-medium">{def.monthsLabel} 월평균</th>
                  <th className="py-2 text-right font-medium">다른 달 월평균</th>
                  <th className="py-2 text-right font-medium">차이</th>
                </tr>
              </thead>
              <tbody>
                {report.years.map((y) => (
                  <tr key={y.year} className="border-b border-line last:border-b-0">
                    <td className="py-2.5 font-bold text-ink">{y.year}년</td>
                    <td className="hidden py-2.5 text-right tabular-nums text-text-2 sm:table-cell">
                      {y.txCount.toLocaleString("ko-KR")}건
                    </td>
                    <td className="py-2.5 pl-2 text-right font-bold tabular-nums text-ink">
                      {y.vsOffSeason ? `${n(y.vsOffSeason.seasonPerMonth)}건` : "—"}
                    </td>
                    <td className="py-2.5 text-right tabular-nums text-text-2">
                      {y.vsOffSeason ? `${n(y.vsOffSeason.offPerMonth)}건` : "—"}
                    </td>
                    <td className="py-2.5 text-right">
                      {y.vsOffSeason ? (
                        <span className="inline-flex flex-col items-end">
                          <Delta pct={y.vsOffSeason.liftPct} srContext="다른 달보다" />
                          {seasonVerdict(y.vsOffSeason.liftPct) === "flat" && (
                            <span className="t-caption text-text-3">차이 없음(±{SEASON_LIFT_THRESHOLD_PCT}%)</span>
                          )}
                        </span>
                      ) : (
                        <span className="text-text-3">비교 불가</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* [v4 · 규칙 3] 방법 문단 두 개 → 캡션 한 줄씩 */}
          {compared.length > 0 && (
            <p className="t-caption text-text-3">
              공통 지역만 비교(최근 {compared[compared.length - 1]!.vsOffSeason!.regionCount}곳) · ±
              {SEASON_LIFT_THRESHOLD_PCT}% 안은 차이 없음
            </p>
          )}
          {report.pending.length > 0 && (
            <p className="t-caption text-text-3">
              제외한 해: {report.pending.map((p) => `${p.year}년(${p.reason})`).join(" · ")}
            </p>
          )}
        </section>

        {/* 전년 대비 — [v4 · 규칙 5] 두 칸 상자 → 구분선 행(왼쪽 항목 + 보조 한 줄 / 오른쪽 등락) */}
        {yoy && (
          <section className="flex flex-col gap-2">
            <h2 className="t-section text-ink">
              {yoy.fromYear}년 → {yoy.toYear}년 {def.monthsLabel}
            </h2>
            <ul data-tone="sand" className="card flex flex-col divide-y divide-line rounded-lg px-4">
              <li className="flex min-h-14 items-center justify-between gap-3 py-3">
                <span className="min-w-0 flex-1">
                  <span className="block t-body font-bold text-ink">거래량</span>
                  <span className="mt-0.5 block truncate t-sub tabular-nums text-text-3">
                    {yoy.fromTx.toLocaleString("ko-KR")}건 → {yoy.toTx.toLocaleString("ko-KR")}건
                  </span>
                </span>
                <Delta pct={yoy.txDeltaPct} srContext={`${yoy.fromYear}년보다`} className="shrink-0 t-body" />
              </li>
              <li className="flex min-h-14 items-center justify-between gap-3 py-3">
                <span className="min-w-0 flex-1">
                  <span className="block t-body font-bold text-ink">평균 매매가</span>
                  <span className="mt-0.5 block truncate t-sub tabular-nums text-text-3">
                    {eok(yoy.fromAvgKrw)} → {eok(yoy.toAvgKrw)}
                  </span>
                </span>
                {yoy.avgDeltaPct !== null && (
                  <Delta pct={yoy.avgDeltaPct} srContext={`${yoy.fromYear}년보다`} className="shrink-0 t-body" />
                )}
              </li>
            </ul>
            <p className="t-caption text-text-3">
              두 해 모두 집계된 {yoy.regionCount}곳 기준 · 평균가는 거래량 가중 평균
            </p>
          </section>
        )}

        {/* 최신 관측 연도의 지역별 */}
        {report.topRegions.length > 0 && (
          <section className="flex flex-col gap-2">
            <h2 className="flex items-baseline gap-1.5 t-section text-ink">
              {latest.year}년 {def.monthsLabel} 거래 상위 <span className="t-num text-text-3">{report.topRegions.length}</span>
            </h2>
            <div className="card overflow-x-auto rounded-lg px-4 py-1">
              <table className="w-full text-left t-body">
                <thead>
                  <tr className="border-b border-line t-sub text-text-3">
                    <th className="py-2 font-medium">지역</th>
                    <th className="py-2 text-right font-medium">{def.monthsLabel} 거래</th>
                    <th className="py-2 text-right font-medium">평균 매매가</th>
                  </tr>
                </thead>
                <tbody>
                  {report.topRegions.map((r) => (
                    <tr key={r.regionName} className="border-b border-line last:border-b-0">
                      <td className="py-2.5 font-bold text-ink">{r.regionName}</td>
                      <td className="py-2.5 text-right tabular-nums text-text-2">
                        {r.txCount.toLocaleString("ko-KR")}건
                      </td>
                      <td className="py-2.5 text-right font-bold tabular-nums text-ink">{eokCell(r.avgKrw)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="t-caption text-text-3">
              거래량순 · 면적 구분 없는 거래량 가중 평균 · 해제 신고 제외 ·{" "}
              <Link href="/methodology" className="tap-line font-bold text-primary no-underline">
                집계 방법론 보기
              </Link>
            </p>
          </section>
        )}

        <p className="t-sub text-text-3">
          <Link href="/reports" className="tap-line font-bold text-primary no-underline">
            월간 실거래 리포트
          </Link>
          {" · "}
          <Link href="/analysis/timing" className="tap-line font-bold text-primary no-underline">
            매수·매도 타이밍 분석
          </Link>
          {" · "}
          <Link href="/tx" className="tap-line font-bold text-primary no-underline">
            지역별 실거래 상세
          </Link>
        </p>

        {/* [v4 · 규칙 3] 맨 끝 접힘 하나 — G12 첫 문단 · 통념 근거 · G8 인용 · N18 언론 요약 · Q&A(FAQPage JSON-LD 포함) */}
        <details className="group border-t border-line pt-1">
          <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-2 t-body font-bold text-ink [&::-webkit-details-marker]:hidden">
            데이터 출처·인용
            <span aria-hidden="true" className="t-body text-text-3 transition-transform group-open:rotate-90">
              ›
            </span>
          </summary>
          <div className="flex flex-col pb-3 pt-1">
            <p className="mb-2 t-body text-text-2">{leadSentence}</p>
            <p className="mb-4 t-sub text-text-3">{def.rationale}</p>
            <CitationBlock sentence={citation} />
            <PressSummaryBlock
              sentences={pressSentences}
              asOfLabel={`${latest.year}년 ${def.monthsLabel} 실거래 신고 기준`}
              provisional={false}
            />
            <QaBlock title={`${def.label} 실거래 Q&A`} items={faq} />
          </div>
        </details>
      </div>
    </PageShell>
  );
}
