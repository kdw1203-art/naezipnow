import type { Metadata } from "next";
import { TOOL_PERSONAS, personaVars } from "@/lib/ai/tool-persona";
import Link from "next/link";
import { cache } from "react";
import { PageShell } from "../../components/PageShell";
import { Bars } from "@/app/components/viz/Bars";
import { AnalysisCrossLinks } from "../AnalysisCrossLinks";
import { QaBlock } from "../../components/QaBlock";
import { CitationBlock } from "../../components/CitationBlock";
import {
  listLatestTemperatures,
  type TemperatureLatest,
} from "@/lib/market/temperature-archive";
import { formatWeekKorean } from "@/lib/market/temperature";
import { breadcrumbJsonLd, jsonLdScript, type FaqItem } from "@/lib/seo/jsonld";
import { seoAlternates } from "@/lib/seo/alternates";
import {
  LOAD_FAILED_LINE,
  loadWithinPrerenderBudget,
} from "@/lib/data/prerender-budget";
import { Explain } from "@/app/components/explain/Explain";
import { TEMPERATURE_EXPLAIN } from "../temperature-explain";
import { TempRegionCard } from "./TempRegionCard";

/* ============================================================
   N11 — 시장 온도 주간 기록 허브 (/analysis/temperature)

   /analysis/timing 은 "지금 이 순간의 온도" 하나만 보여 준다. 사람이 실제로
   알고 싶어 하는 문장은 "지금 62점"이 아니라 "3주 연속 오르고 있다" 쪽인데,
   시계열이 없으면 그 문장은 지어내는 수밖에 없다. 그래서 매주 값을 저장하고
   (public.market_temperature_snapshot) 이 허브가 그 기록의 입구가 된다.

   ── 저장값의 정의를 화면에 그대로 적는다 ───────────────────────────
   크론은 하루 두 번 도는데 키가 (지역, 그 주의 월요일)이라 같은 주의 행을
   계속 덮어쓴다. 그러니 저장된 값은 "그 주의 평균"도 "월요일의 값"도 아니라
   **그 주에 마지막으로 관측한 값**이다. 정의를 숨기면 숫자가 실제보다 정밀한
   것처럼 읽힌다 — 그래서 본문과 Q&A 양쪽에 적는다.

   ── 세 상태를 나눠 렌더하는 이유 ───────────────────────────────────
   /complex/compare 와 같은 규칙이다. 이 허브는 revalidate 가 있고 동적
   파라미터가 없어 `next build` 가 빌드 타임에 프리렌더하는데, CI 빌드 환경엔
   SUPABASE_SERVICE_ROLE_KEY 가 없다. 여기서 던지면 빌드가 깨진다.
     1) 정상 — 지역별 최신 주 점수 + 지난주 대비
     2) 조회 실패·시간 초과 — 그렇게 말하고 noindex
     3) 정말로 0주 — "아직 쌓인 주가 없다" (첫 크론 실행 전에는 이게 사실이다)
   2와 3을 같은 문장으로 처리하면 실패를 "데이터 없음"으로 위장하게 된다.

   ── 던지지 않는 것만으로는 부족했다 (배포 #263) ────────────────
   예외를 잡는 것만으로는 **느린** DB 를 못 막는다. Next 는 프리렌더 한 페이지에
   60초 상한을 두고 넘기면 빌드를 실패시키는데, 배포 #263 이 그렇게 죽었다 —
   이 페이지를 포함한 다섯 페이지가 각자 60초를 다 태워 릴리스가 통째로 막혔다.
   느린 DB 는 페이지 내용을 떨어뜨릴 수는 있어도 배포를 막아서는 안 된다.
   그래서 조회에 20초 상한을 씌우고, 넘기면 위 2)번 화면으로 접는다.
   ============================================================ */

/* [1010] 1h → 1일. 주간 스냅샷 화면이라 1시간 눈금은 원천보다 168배 촘촘했다.
   적재 직후 비움이 둘 있다: SOURCE_MAP.molit 의 "/analysis/temperature" 와,
   스냅샷 크론(app/api/cron/market-temperature-snapshot)의 invalidateTemperatureRegions(). */
export const revalidate = 86_400;

const PATH = "/analysis/temperature";

type HubData = {
  weekStart: string | null;
  rows: TemperatureLatest[];
  /** 조회가 실패했거나 상한 안에 끝나지 않았다. false 라야 "읽었고 결과가 이만큼"이다. */
  loadFailed: boolean;
};

const loadHub = cache(async (): Promise<HubData> => {
  const run = await loadWithinPrerenderBudget("[/analysis/temperature] 주간 기록", () =>
    listLatestTemperatures(),
  );
  /* 실패를 빈 목록으로 흘려보내면 "아직 쌓인 주가 없습니다" 가 뜬다 —
     크론이 매주 쌓아 둔 기록을 없다고 단정하는 셈이다. 반드시 갈라 놓는다. */
  return run.ok
    ? { weekStart: run.data.weekStart, rows: run.data.rows, loadFailed: false }
    : { weekStart: null, rows: [], loadFailed: true };
});

export async function generateMetadata(): Promise<Metadata> {
  const { weekStart, rows, loadFailed } = await loadHub();
  const description =
    rows.length > 0 && weekStart
      ? `${formatWeekKorean(weekStart)} 주 기준 ${rows.length}개 지역의 시장 온도(0~100)를 지난주와 나란히 봅니다. 매매가격지수 모멘텀과 실거래 거래량 추이로 계산하며, 매주 기록을 남겨 추세를 확인할 수 있습니다.`
      : "지역별 시장 온도(0~100)를 매주 기록해 추세를 확인합니다. 매매가격지수 모멘텀과 국토교통부 실거래 거래량 추이로만 계산하며, 근거가 없는 지역은 점수를 만들지 않습니다.";
  return {
    title: "지역별 시장 온도 주간 기록 | 내집나우",
    description,
    alternates: seoAlternates(PATH),
    // 조회가 실패한 상태의 껍데기를 색인시키지 않는다. 다음 재검증에서 성공하면 사라진다.
    ...(loadFailed ? { robots: { index: false, follow: true } } : {}),
    openGraph: {
      title: "지역별 시장 온도 주간 기록 | 내집나우",
      description,
      url: `https://naezipnow.com${PATH}`,
      type: "website",
    },
  };
}

export default async function TemperatureHubPage() {
  const { weekStart, rows, loadFailed } = await loadHub();

  const weekLabel = weekStart ? formatWeekKorean(weekStart) : null;
  const hottest = rows[0] ?? null;
  const coldest = rows.length > 0 ? rows[rows.length - 1] : null;
  const rising = rows.filter((r) => r.previous && r.current.score > r.previous.score).length;
  const falling = rows.filter((r) => r.previous && r.current.score < r.previous.score).length;
  const compared = rows.filter((r) => r.previous).length;

  /* 첫 화면 숫자 — 62개 지역 카드 격자만 있던 자리에 "지금 시장이 어느 쪽인가"를 세운다. */
  const BIN = 10;
  const binned = new Map<number, number>();
  for (const r of rows) {
    const b = Math.min(90, Math.floor(r.current.score / BIN) * BIN);
    binned.set(b, (binned.get(b) ?? 0) + 1);
  }
  const binKeys = [...binned.keys()].sort((a, b) => a - b);
  const histValues = binKeys.map((k) => binned.get(k) ?? 0);
  const histLabels = binKeys.map((k) => `${k}`);
  const avgScore =
    rows.length > 0
      ? Math.round((rows.reduce((a, r) => a + r.current.score, 0) / rows.length) * 10) / 10
      : null;

  const crumbs = breadcrumbJsonLd([
    { name: "홈", url: "/" },
    { name: "AI 분석", url: "/analysis" },
    { name: "시장 온도 주간 기록", url: PATH },
  ]);

  const qa: FaqItem[] = [
    {
      q: "시장 온도는 어떻게 계산하나요?",
      a: "50점을 중립으로 두고, 한국부동산원 아파트 매매가격지수의 최근 3개월 평균 변동률(±25점)과 국토교통부 실거래 월별 거래량의 최근 구간 대비 직전 구간 증감(±25점)을 더해 0~100으로 나타냅니다. 거래량은 신고 지연이 있는 이번 달을 빼고 완결월이 4개 이상일 때만 반영하며, 그렇지 못한 지역은 지수 모멘텀만으로 계산했다고 각 지역 페이지에 표시합니다. 지수 시계열 자체가 4구간 미만이면 점수를 만들지 않습니다.",
    },
    {
      q: "여기 적힌 점수는 그 주의 평균인가요?",
      a: "아닙니다. 기록의 키는 그 주(한국시간 기준)의 월요일이고, 값은 그 주에 마지막으로 관측한 온도입니다. 수집 작업이 하루 두 번 돌면서 같은 주의 값을 계속 갱신하고, 주가 넘어가면 그 값이 그대로 굳습니다. 주간 평균이나 월요일 시점의 값으로 읽으시면 실제보다 정밀한 숫자로 오해하게 됩니다.",
    },
    {
      q: "점수가 높으면 지금 사야 한다는 뜻인가요?",
      a: "아닙니다. 시장 온도는 가격과 거래량이 어느 방향으로 얼마나 움직이고 있는지를 하나의 눈금으로 요약한 관측값일 뿐, 매수·매도 권유가 아닙니다. 같은 점수라도 지수 모멘텀에서 온 것인지 거래량에서 온 것인지에 따라 의미가 다르므로, 각 지역 페이지에서 입력값을 함께 확인해 주세요.",
    },
    {
      q: "왜 어떤 지역은 목록에 없나요?",
      a: "해당 지역의 매매가격지수 시계열이 4구간 미만이라 추세 판정 자체가 성립하지 않거나, 아직 그 지역의 주간 기록이 쌓이지 않은 경우입니다. 근거가 없는 지역에 점수를 만들어 붙이지 않습니다.",
    },
  ];

  const LINK = "tap-line font-bold text-primary no-underline";

  return (
    <PageShell breadcrumb="홈 › AI 분석 › 시장 온도 주간 기록" toolScope={personaVars(TOOL_PERSONAS["market:temperature"])}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript(crumbs) }}
      />

      {/* [v4 · 한 화면 한 가지] 머리(제목 + 사실 한 줄) → 주인공(평균 온도) + 분포 막대 → 지역 구분선 행(오른쪽 점수·지난주 대비) →
          링크 한 줄 → 이어서 분석 행 → 맨 끝 접힘 "읽는 법·Q&A".
          지운 것: 네이비 히어로·아이콘 타일·"성격" 배지·하는 일 문장·KPI 5칸·게이지(가장 뜨거운 곳 = 목록 첫 행),
          요약 문단(→ 사실 줄), 카드 격자(점수 타일 + 눈금 + 배지 → 행), 배지 설명 문단, "이 기록을 읽는 법" 카드(→ 접힘). */}
      <div className="mx-auto flex w-full max-w-[760px] flex-col gap-8">
        <div className="flex flex-col gap-4">
          <header className="flex flex-col gap-0.5">
            <h1 className="t-title text-ink">지역별 시장 온도 주간 기록</h1>
            <p className="t-sub text-text-3">
              {weekLabel ? `${weekLabel} 주 · ` : ""}
              {rows.length > 0 ? `${rows.length}곳 · ` : ""}
              {compared > 0 && (
                <>
                  지난주 대비 <span className="delta-up">▲{rising}</span> <span className="delta-down">▼{falling}</span>
                </>
              )}
            </p>
          </header>
          {/* [v4 · 규칙 2] 주인공 — 평균 온도 하나(0~100, 50 중립) + 분포 막대 */}
          {avgScore !== null && (
            <section aria-label="평균 온도" className="flex flex-col gap-2">
              <div>
                <p className="m-0 inline-flex items-center gap-0.5 t-caption text-text-3">
                  평균 온도 · 100점 중 · 50이 중립
                  <Explain {...TEMPERATURE_EXPLAIN} size={12} />
                </p>
                <p className="m-0 t-display t-num text-ink">{avgScore}</p>
                {/* 면책 — 늘 보이게 한 줄 */}
                <p className="m-0 t-sub text-text-2">관측값 요약 · 매수·매도 권유 아님</p>
              </div>
              {histValues.length > 1 && (
                <div className="card rounded-lg px-3 pb-1 pt-2 text-warning">
                  <span className="block pb-1 t-caption text-text-3">온도 분포 · 10점 구간별 지역 수</span>
                  <Bars values={histValues} labels={histLabels} height={62} valueSuffix="곳" ariaLabel="시장 온도 분포" />
                </div>
              )}
            </section>
          )}
        </div>

        {loadFailed ? (
          <p className="card rounded-lg px-4 py-6 text-center t-body text-text-3">
            <strong className="text-ink">{LOAD_FAILED_LINE}</strong> · 기록 없음이 아니라 조회 실패
          </p>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center gap-1 py-6 text-center">
            <p className="t-body text-text-3">쌓인 주 없음 · 매일 수집이 그 주 값을 갱신하며 생김</p>
            <Link href="/analysis/timing" className={`${LINK} t-sub`}>
              지금 이 순간의 시장 온도 보기
            </Link>
          </div>
        ) : (
          <section className="flex flex-col gap-2" data-reveal="">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="flex items-baseline gap-1.5 t-section text-ink">
                온도 높은 순 <span className="t-num text-text-3">{rows.length}</span>
              </h2>
              <span className="t-caption text-text-3">점수 · 지난주 대비</span>
            </div>
            {/* [v4 · 규칙 5] 카드 격자 → 구분선 행 */}
            <ul data-tone="blue" className="card flex flex-col divide-y divide-line rounded-lg px-4">
              {rows.map(({ current, previous }) => (
                <TempRegionCard
                  key={current.regionId}
                  current={current}
                  previous={previous}
                  href={`${PATH}/${current.regionId}`}
                />
              ))}
            </ul>
            <p className="t-caption text-text-3">
              한국부동산원 지수 · 국토교통부 거래량 · 그 주에 마지막으로 관측한 값 · 지난주 대비가 없으면 직전 주 기록 없음
            </p>
          </section>
        )}

        <p className="t-sub text-text-3">
          <Link href="/analysis/timing" className={LINK}>
            시세·타이밍 분석
          </Link>
          {" · "}
          <Link href="/methodology" className={LINK}>
            데이터 방법론
          </Link>
        </p>

        {/* #411 — 도구 간 이어가기. [D62·D55] 이 화면의 주인공 지역(이번 주 가장 뜨거운 곳)을 그대로 실어 보낸다 */}
        <AnalysisCrossLinks
          current="temperature"
          regionLabel={hottest?.current.regionLabel ?? null}
          regionFor={
            hottest
              ? {
                  price: hottest.current.regionLabel,
                  timing: hottest.current.regionId,
                  scenario: hottest.current.regionId,
                  map: hottest.current.regionLabel,
                }
              : undefined
          }
        />

        {/* [v4 · 규칙 3] 맨 끝 접힘 하나 — 읽는 법(네 문단 → 한 줄씩) · 인용 · Q&A(FAQPage 스키마) */}
        <details className="group border-t border-line pt-1">
          <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-2 t-body font-bold text-ink [&::-webkit-details-marker]:hidden">
            읽는 법·Q&amp;A
            <span aria-hidden="true" className="t-body text-text-3 transition-transform group-open:rotate-90">
              ›
            </span>
          </summary>
          <div className="flex flex-col pb-3 pt-1">
            <ul className="mb-4 flex list-none flex-col gap-0.5 p-0">
              <li className="t-caption text-text-3">값 = 그 주에 마지막으로 관측한 온도(주간 평균 아님) · 주가 넘어가면 굳음</li>
              <li className="t-caption text-text-3">점수 = 50 + 지수 모멘텀 ±25 + 거래량 추이 ±25 · 어느 항이 밀었는지는 지역 페이지</li>
              <li className="t-caption text-text-3">계산식을 바꾸면 공식 버전을 올려 함께 저장 · 과거 기록은 다시 칠하지 않음</li>
              <li className="t-caption text-text-3">신고 지연(최대 30일) 때문에 거래량 항은 이번 달 제외</li>
            </ul>
            {hottest && coldest && weekLabel && rows.length >= 2 && (
              <CitationBlock
                sentence={`내집나우(naezipnow.com) 집계에 따르면, ${weekLabel}이 속한 주의 시장 온도는 ${hottest.current.regionLabel}가 ${hottest.current.score}점으로 가장 높고 ${coldest.current.regionLabel}가 ${coldest.current.score}점으로 가장 낮다 (0~100 눈금, 50이 중립. 한국부동산원 매매가격지수 모멘텀과 국토교통부 실거래 거래량 추이 기반, 그 주에 마지막으로 관측한 값).`}
              />
            )}
            <QaBlock title="시장 온도 Q&A" items={qa} />
          </div>
        </details>
      </div>
    </PageShell>
  );
}
