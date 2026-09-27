/* [1012 · 규칙 8] font-extrabold(800) → font-bold(700) — 굵기 3단(400·500·700). 이 파일의 모든 자리에 적용. */
import type { Metadata } from "next";
import Link from "next/link";
import { cache } from "react";
import { notFound } from "next/navigation";
import { PageShell } from "@/app/components/PageShell";
import { QaBlock } from "@/app/components/QaBlock";
import { CitationBlock } from "@/app/components/CitationBlock";
import {
  listRegionTemperatureHistory,
  type TemperatureSnapshot,
} from "@/lib/market/temperature-archive";
import {
  findTemperatureRegion,
  formatWeekKorean,
  formatWeekLabel,
  type TemperatureRegion,
} from "@/lib/market/temperature";
import { breadcrumbJsonLd, jsonLdScript, type FaqItem } from "@/lib/seo/jsonld";
import { seoAlternates } from "@/lib/seo/alternates";
import { ScrubLineLazy } from "@/app/components/viz/ScrubLineLazy";
import { Explain } from "@/app/components/explain/Explain";
import { TEMPERATURE_EXPLAIN } from "../../temperature-explain";
import { weekSlots } from "../week-slots";
import { ScoreDiff } from "../score-diff";

/* ============================================================
   N11 — 지역별 시장 온도 주간 기록 · /analysis/temperature/[region]

   ── 조회 실패를 삼키지 않는다 ────────────────────────────────
   허브(/analysis/temperature)는 빌드 타임 프리렌더 대상이라 예외를 잡아
   "불러오지 못했습니다"를 렌더한다. 이 페이지는 동적 라우트라 사정이 다르다 —
   여기서 던지면 5xx 가 나가고, 크롤러는 그걸 "지금은 못 준다(나중에 다시
   와라)"로 읽는다. 조회 실패를 404 나 빈 화면으로 바꾸면 "이 지역 기록은
   영영 없다"는 잘못된 신호가 된다. 그래서 listRegionTemperatureHistory()
   가 던지는 오류를 그대로 통과시킨다.

   ── 기록이 0주인 경우는 실패가 아니다 ────────────────────────
   지역 자체는 유효한데 아직 그 주가 쌓이지 않았을 수 있다(첫 크론 실행 전,
   또는 지수 시계열이 없어 계산이 성립하지 않는 지역). 이때는 404 가 아니라
   "아직 기록이 없다"고 적고 noindex 로 둔다. 사이트맵도
   listArchivedRegionIds() 로 **행이 있는 지역만** 싣기 때문에, 빈 페이지를
   크롤러에게 광고하지는 않는다.
   ============================================================ */

/* [1010] 1h → 1일. 동적 세그먼트라 SOURCE_MAP(고정 경로)이 닿지 못하던 자리다 —
   시장 온도 스냅샷 크론이 성공한 직후 라우트 전체를 비우도록 배선했다
   (app/api/cron/market-temperature-snapshot/route.ts → invalidateTemperatureRegions).
   주 1회 갱신되는 값이라 1일 TTL 은 안전망으로 충분하다. */
export const revalidate = 86_400;
/* 빈 배열 = "빌드 때 미리 만들 경로는 없다". 이 export 가 있어야 Next 가 이
   라우트를 ISR 로 분류한다 — 없으면 `revalidate` 를 적어 둬도 요청마다 서버
   렌더로 돌면서 Next 가 `private, no-cache, no-store` 를 실어 보내고, CDN 은
   한 벌도 재사용하지 못한다(2026-07-28 함수 호출 소진 사고. 자세한 내용은
   app/complex/[id]/page.tsx 의 같은 자리 주석). dynamicParams 기본값이 true 라
   실제 요청이 오면 그때 만들어 캐시한다. */
export function generateStaticParams(): { region: string }[] {
  return [];
}

/** 표·차트에 쓰는 최대 주 수. 1년치면 계절성까지 눈에 들어온다. */
const MAX_WEEKS = 52;

type PageData = {
  region: TemperatureRegion;
  history: TemperatureSnapshot[];
};

const loadPage = cache(async (regionId: string): Promise<PageData | null> => {
  const region = findTemperatureRegion(regionId);
  if (!region) return null;
  // 실패는 던진다(위 주석 참고). 빈 배열은 "아직 기록 없음"이라는 사실이다.
  const history = await listRegionTemperatureHistory(region.id, MAX_WEEKS);
  return { region, history };
});

/** 마지막 값이 이어 온 같은 방향 흐름의 길이. 1이면 "직전 주 대비 변화" 한 번뿐이다. */
function streak(history: TemperatureSnapshot[]): { dir: "up" | "down" | "flat"; weeks: number } {
  if (history.length < 2) return { dir: "flat", weeks: 0 };
  const diffs: number[] = [];
  for (let i = 1; i < history.length; i += 1) {
    diffs.push(history[i].score - history[i - 1].score);
  }
  const last = diffs[diffs.length - 1] ?? 0;
  if (last === 0) return { dir: "flat", weeks: 0 };
  const dir = last > 0 ? "up" : "down";
  let weeks = 0;
  for (let i = diffs.length - 1; i >= 0; i -= 1) {
    const d = diffs[i] ?? 0;
    if ((dir === "up" && d > 0) || (dir === "down" && d < 0)) weeks += 1;
    else break;
  }
  return { dir, weeks };
}

function streakSentence(history: TemperatureSnapshot[]): string | null {
  const { dir, weeks } = streak(history);
  if (weeks === 0) return null;
  const word = dir === "up" ? "상승" : "하락";
  return weeks >= 2
    ? `기록상 ${weeks}주 연속 ${word}했어요.`
    : `직전 주보다 ${word}했어요(연속 흐름은 아직 1주예요).`;
}

function pct(v: number | null, digits = 2): string {
  if (v === null || !Number.isFinite(v)) return "—";
  return `${v >= 0 ? "+" : ""}${v.toFixed(digits)}%`;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ region: string }>;
}): Promise<Metadata> {
  const { region: regionId } = await params;
  const data = await loadPage(regionId);
  if (!data) {
    return { title: "시장 온도 주간 기록 | 내집나우", robots: { index: false, follow: false } };
  }
  const { region, history } = data;
  const latest = history[history.length - 1] ?? null;
  const path = `/analysis/temperature/${region.id}`;

  if (!latest) {
    return {
      title: `${region.label} 시장 온도 주간 기록 | 내집나우`,
      description: `${region.label}의 시장 온도 주간 기록입니다. 아직 저장된 주가 없습니다.`,
      alternates: seoAlternates(path),
      // 내용이 없는 페이지를 색인시키지 않는다. 기록이 쌓이면 자연히 풀린다.
      robots: { index: false, follow: true },
    };
  }

  const description =
    `${region.label} 시장 온도는 ${formatWeekKorean(latest.weekStart)}이 속한 주 기준 ${latest.score}점(0~100, 50이 중립)입니다. ` +
    `${latest.headline}. 최근 ${history.length}주 기록을 한국부동산원 매매가격지수 모멘텀과 국토교통부 실거래 거래량 추이로 계산해 매주 저장합니다.`;
  return {
    title: `${region.label} 시장 온도 주간 기록 | 내집나우`,
    description,
    alternates: seoAlternates(path),
    robots: { index: true, follow: true },
    openGraph: {
      title: `${region.label} 시장 온도 주간 기록 | 내집나우`,
      description,
      url: `https://naezipnow.com${path}`,
      type: "website",
    },
  };
}

export default async function TemperatureRegionPage({
  params,
}: {
  params: Promise<{ region: string }>;
}) {
  const { region: regionId } = await params;
  const data = await loadPage(regionId);
  if (!data) notFound();
  const { region, history } = data;

  const path = `/analysis/temperature/${region.id}`;
  const latest = history[history.length - 1] ?? null;
  const prev = history.length >= 2 ? history[history.length - 2] : null;
  const diff = latest && prev ? latest.score - prev.score : null;

  const crumbs = breadcrumbJsonLd([
    { name: "홈", url: "/" },
    { name: "AI 분석", url: "/analysis" },
    { name: "시장 온도 주간 기록", url: "/analysis/temperature" },
    { name: region.label, url: path },
  ]);

  /* 기록이 아직 없는 경우 — 지역은 유효하므로 404 가 아니라 사실을 적는다. */
  if (!latest) {
    return (
      <PageShell breadcrumb={`홈 › AI 분석 › 시장 온도 주간 기록 › ${region.label}`}>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: jsonLdScript(crumbs) }}
        />
        {/* [v4 · 규칙 8] 빈 상태 — 제목 + 한 줄 + 링크(설명 두 문장 → 사실 한 줄) */}
        <div className="mx-auto flex w-full max-w-[760px] flex-col gap-4">
          <h1 className="t-title text-ink">{region.label} 시장 온도 주간 기록</h1>
          <p className="t-body text-text-3">저장된 주 없음 · 지수 시계열 4구간 이상부터 매주 쌓임</p>
          <p className="t-sub text-text-3">
            <Link href="/analysis/timing" className="tap-line font-bold text-primary no-underline">
              지금 이 순간의 시장 온도 보기
            </Link>
            {" · "}
            <Link href="/analysis/temperature" className="tap-line font-bold text-primary no-underline">
              시장 온도 주간 기록
            </Link>
          </p>
        </div>
      </PageShell>
    );
  }

  const scores = history.map((h) => h.score);
  const maxScore = Math.max(...scores);
  const minScore = Math.min(...scores);
  const avgScore = Math.round(scores.reduce((s, v) => s + v, 0) / scores.length);
  const firstWeek = history[0]?.weekStart ?? latest.weekStart;
  const rangeLabel =
    history.length >= 2
      ? `${formatWeekLabel(firstWeek)}~${formatWeekLabel(latest.weekStart)}`
      : formatWeekLabel(latest.weekStart);
  const flow = streakSentence(history);
  const recent = [...history].slice(-12).reverse();
  const slots = weekSlots(history);

  /* Dataset — 이 페이지가 실제로 보여 주는 주간 시계열을 데이터셋으로 기술한다.
     원출처(한국부동산원 지수·국토교통부 실거래)를 명시해 AI 가 우리 가공값을
     원자료로 오인하지 않게 한다. */
  const datasetJsonLd = {
    "@context": "https://schema.org",
    "@type": "Dataset",
    name: `${region.label} 시장 온도 주간 시계열`,
    description: `${region.label}의 시장 온도(0~100, 50이 중립) 주간 기록 ${history.length}주(${rangeLabel}). 한국부동산원 아파트 매매가격지수 모멘텀과 국토교통부 실거래 월별 거래량 추이를 합성한 값이며, 각 주의 값은 그 주에 마지막으로 관측한 것입니다.`,
    url: `https://naezipnow.com${path}`,
    inLanguage: "ko-KR",
    temporalCoverage: `${firstWeek}/${latest.weekStart}`,
    variableMeasured: "시장 온도 (0~100)",
    creator: { "@id": "https://naezipnow.com/#organization" },
    isBasedOn: ["https://www.reb.or.kr", "https://rt.molit.go.kr"],
    license: "https://naezipnow.com/methodology",
    keywords: [region.name, "시장 온도", "매매가격지수", "실거래", "주간"],
    /* 항목 45 — 최신 관측 주 = 기계 판독용 갱신일. 인용 가능한 공개 API 연결. */
    dateModified: latest.weekStart,
    distribution: [
      {
        "@type": "DataDownload",
        contentUrl: "https://naezipnow.com/api/public/v1/regions/monthly",
        encodingFormat: "application/json",
      },
    ],
  };

  const qa: FaqItem[] = [
    {
      q: `${region.label} 시장 온도는 지금 몇 점인가요?`,
      a: `${formatWeekKorean(latest.weekStart)}이 속한 주 기준 ${latest.score}점입니다(0~100 눈금, 50이 중립). ${latest.headline}에 해당합니다.${
        diff === null
          ? ""
          : diff === 0
            ? " 지난주와 같은 점수입니다."
            : ` 지난주(${prev?.score}점)보다 ${Math.abs(diff)}점 ${diff > 0 ? "높습니다" : "낮습니다"}.`
      }`,
    },
    ...(flow
      ? [
          {
            q: `${region.label} 시장 온도는 오르는 중인가요?`,
            a: `${rangeLabel} ${history.length}주 기록 기준으로 ${flow} 같은 기간 최고 ${maxScore}점, 최저 ${minScore}점, 평균 ${avgScore}점이었습니다. 주간 기록은 그 주에 마지막으로 관측한 값이므로, 주 중간의 등락은 담기지 않습니다.`,
          },
        ]
      : []),
    {
      q: "이 점수는 무엇으로 계산했나요?",
      a: `50점을 중립으로 두고 지수 모멘텀(±25점)과 거래량 추이(±25점)를 더합니다. ${formatWeekKorean(
        latest.weekStart,
      )} 주 기준 ${region.label}의 지수 최근 3개${latest.periodType === "monthly" ? "월" : "주"} 평균 변동률은 ${pct(
        latest.momentumPct,
      )}, 직전 3개${latest.periodType === "monthly" ? "월" : "주"}는 ${pct(latest.priorPct)}였습니다.${
        latest.volumeRecentCount !== null && latest.volumePriorCount !== null
          ? ` 거래량은 최근 구간 ${latest.volumeRecentCount.toLocaleString("ko-KR")}건, 직전 구간 ${latest.volumePriorCount.toLocaleString("ko-KR")}건으로 ${pct(latest.volumeDeltaPct, 0)} 변화했습니다.`
          : " 이 주에는 완결월 거래량이 충분하지 않아 지수 모멘텀만 반영했습니다."
      }`,
    },
    {
      q: "기록이 중간에 빠진 주가 있으면 어떻게 되나요?",
      a: "그 주의 행이 아예 없습니다. 앞뒤 값으로 보간하지 않습니다. 지나간 시점의 온도를 나중에 다시 계산해 채워 넣으면 그것은 관측이 아니라 재구성이므로, 빠진 주는 빠진 채로 둡니다.",
    },
  ];

  const LINK = "tap-line font-bold text-primary no-underline";

  return (
    <PageShell breadcrumb={`홈 › AI 분석 › 시장 온도 주간 기록 › ${region.label}`}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript([crumbs, datasetJsonLd]) }}
      />

      {/* [v4 · 한 화면 한 가지] 제목 + 사실 한 줄 → 주인공(이번 주 점수 t-display + 지난주 대비) → 주간 추이선 →
          주별 기록 구분선 행 → 링크 한 줄 → 맨 끝 접힘 "읽는 법·Q&A".
          지운 것: 요약 카드 테두리·정의 설명 문단(→ 접힘), 주별 표(5열 · 가로 스크롤 → 행), 출처 설명 문단(→ 캡션 한 줄),
          채움 파랑 + 카드 타일 CTA 4개(→ 링크 한 줄). */}
      <div className="mx-auto flex w-full max-w-[760px] flex-col gap-8">
        <div className="flex flex-col gap-4">
          <header className="flex flex-col gap-0.5">
            <h1 className="rise-in t-title text-ink">{region.label} 시장 온도 주간 기록</h1>
            <p className="t-sub text-text-3">
              {rangeLabel} · {history.length}주 기록 · 공식 v{latest.formulaVersion}
            </p>
          </header>
          {/* [1009 · A] 결론(큰 숫자) → 지난주 대비 등락 → 한 줄. [v4 · 규칙 2] 주인공 하나 */}
          <section aria-label="이번 주 온도" className="flex flex-col gap-0.5">
            <p className="m-0 inline-flex items-center gap-0.5 t-caption text-text-3">
              {formatWeekKorean(latest.weekStart)}이 속한 주 · 0~100 · 50이 중립
              <Explain {...TEMPERATURE_EXPLAIN} title="시장 온도" size={12} />
            </p>
            <p className="m-0 flex items-baseline gap-2">
              <span className="t-display t-num text-ink">{latest.score}</span>
              {diff !== null && (
                <span className="t-body font-bold">
                  <ScoreDiff d={diff} sr="지난주보다" />
                </span>
              )}
            </p>
            <p className="m-0 t-sub text-text-2">
              <b className="text-ink">{latest.headline}</b>
              {flow ? ` · ${flow}` : ""}
            </p>
            {/* 면책 — 늘 보이게 한 줄 */}
            <p className="m-0 t-caption text-text-3">관측값 요약 · 매수·매도 권유가 아닙니다</p>
          </section>
        </div>

        {/* 주간 추이 */}
        <section className="flex flex-col gap-2">
          <h2 className="flex items-baseline justify-between gap-3 t-section text-ink">
            주간 추이
            <span className="shrink-0 t-sub font-medium text-text-3">
              최고 {maxScore} · 평균 {avgScore} · 최저 {minScore}
            </span>
          </h2>
          {/* [1009 · A] 누르고 끌면 그 주 점수가 나오는 추세선(ScrubLine). 선 색 = 기간 등락(상승 빨강·하락 파랑). */}
          <div className="card rounded-lg px-3 py-3">
            <ScrubLineLazy
              values={slots.map((w) => w.row?.score ?? null)}
              labels={slots.map((w) => formatWeekLabel(w.weekStart))}
              fullLabels={slots.map((w) => `${formatWeekKorean(w.weekStart)} 주${w.row ? ` · ${w.row.headline}` : " · 기록 없음"}`)}
              format="int"
              suffix="점"
              tone="auto"
              height={150}
              ariaLabel={`${region.label} 시장 온도 주간 추이`}
              /* [1009 · A · 리뷰] 세로축을 0~100 으로 고정하고 중립 50 에 기준선 */
              yDomain={[0, 100]}
              refLine={{ value: 50, label: "중립 50" }}
              footnote="세로축 0~100점 · 가로 점선 = 중립 50 · 그 주에 마지막으로 관측한 값 · 기록이 빠진 주는 점선으로 건너뜀"
            />
          </div>
          {history.length < 4 && <p className="t-caption text-text-3">{history.length}주치 기록 — 추세로 보기엔 이름</p>}
        </section>

        {/* 주별 기록 — [v4 · 규칙 5] 표(5열) → 구분선 행: 왼쪽 주 + 보조 한 줄(지수·거래량·판정) / 오른쪽 점수·전주 대비 */}
        <section className="flex flex-col gap-2">
          <h2 className="flex items-baseline gap-1.5 t-section text-ink">
            주별 기록 <span className="t-num text-text-3">{recent.length}</span>
          </h2>
          <ul data-tone="blue" className="card flex flex-col divide-y divide-line rounded-lg px-4">
            {recent.map((h, i) => {
              const before = recent[i + 1] ?? null;
              const d = before ? h.score - before.score : null;
              return (
                <li key={h.weekStart} className="flex min-h-14 items-center justify-between gap-3 py-3">
                  <span className="min-w-0 flex-1">
                    <span className="block t-body font-bold tabular-nums text-ink">{formatWeekLabel(h.weekStart)} 주</span>
                    <span className="mt-0.5 block truncate t-sub tabular-nums text-text-3">
                      지수 {pct(h.momentumPct)} · 거래{" "}
                      {h.volumeRecentCount !== null && h.volumePriorCount !== null
                        ? `${h.volumeRecentCount.toLocaleString("ko-KR")}/${h.volumePriorCount.toLocaleString("ko-KR")}건`
                        : "미반영"}{" "}
                      · {h.headline}
                    </span>
                  </span>
                  <span className="flex shrink-0 flex-col items-end">
                    <span className="t-body t-num text-ink">{h.score}</span>
                    {d !== null && (
                      <span className="t-caption">
                        <ScoreDiff d={d} unit="" sr="전주보다" />
                      </span>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
          {/* [v4 · 규칙 3] 출처 설명 문단 → 캡션 한 줄 */}
          <p className="t-caption text-text-3">
            한국부동산원 매매가격지수 · 국토교통부 실거래 거래량 · 내집나우 주간 산출 · 미반영 = 완결월 거래량 4개월 미만(지수만)
          </p>
        </section>

        <p className="t-sub text-text-3">
          <Link href={`/analysis/timing?region=${encodeURIComponent(region.id)}`} className={LINK}>
            {region.name} 지수·거래량 원본 보기
          </Link>
          {" · "}
          <Link href={`/region/${region.id}`} className={LINK}>
            {region.name} 지역 허브
          </Link>
          {" · "}
          <Link href="/analysis/temperature" className={LINK}>
            다른 지역 온도
          </Link>
          {" · "}
          <Link href="/methodology" className={LINK}>
            데이터 방법론
          </Link>
        </p>

        {/* [v4 · 규칙 3] 맨 끝 접힘 하나 — 값의 정의 · 인용 · Q&A(FAQPage 스키마) */}
        <details className="group border-t border-line pt-1">
          <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-2 t-body font-bold text-ink [&::-webkit-details-marker]:hidden">
            읽는 법·Q&amp;A
            <span aria-hidden="true" className="t-body text-text-3 transition-transform group-open:rotate-90">
              ›
            </span>
          </summary>
          <div className="flex flex-col pb-3 pt-1">
            <p className="mb-4 t-caption text-text-3">
              값 = 그 주에 마지막으로 관측한 온도(주간 평균 아님) · 같은 주 안에서는 갱신되고 주가 넘어가면 굳음 · 공식 버전 v
              {latest.formulaVersion}
            </p>
            <CitationBlock
              sentence={`내집나우(naezipnow.com) 집계에 따르면, ${region.label}의 시장 온도는 ${formatWeekKorean(
                latest.weekStart,
              )}이 속한 주 기준 ${latest.score}점이다 (0~100 눈금, 50이 중립. 한국부동산원 아파트 매매가격지수 모멘텀과 국토교통부 실거래 거래량 추이 기반, 그 주에 마지막으로 관측한 값).`}
            />
            <QaBlock title={`${region.label} 시장 온도 Q&A`} items={qa} />
          </div>
        </details>
      </div>
    </PageShell>
  );
}
