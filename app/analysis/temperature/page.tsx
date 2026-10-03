import type { Metadata } from "next";
import { TOOL_PERSONAS, personaVars } from "@/lib/ai/tool-persona";
import Link from "next/link";
import { cache } from "react";
import { PageShell } from "../../components/PageShell";
import { AnalysisCrossLinks } from "../AnalysisCrossLinks";
import { QaBlock } from "../../components/QaBlock";
import { CitationBlock } from "../../components/CitationBlock";
import {
  listLatestTemperatures,
  listRegionTemperatureHistory,
  listTemperaturesForWeek,
  shiftWeeks,
  type TemperatureLatest,
  type TemperatureSnapshot,
} from "@/lib/market/temperature-archive";
import { formatWeekKorean } from "@/lib/market/temperature";
import { breadcrumbJsonLd, jsonLdScript, type FaqItem } from "@/lib/seo/jsonld";
import { seoAlternates } from "@/lib/seo/alternates";
import {
  LOAD_FAILED_LINE,
  loadWithinPrerenderBudget,
} from "@/lib/data/prerender-budget";
import { logger } from "@/lib/log";
import { weekSlots } from "./week-slots";
import { pairWeeks } from "./temp-map-model";
import { TempMapClient, type HistoryView, type WeekView } from "./TempMapClient";
import { OpenOnDesktop } from "./OpenOnDesktop";
import { DEFAULT_OG_IMAGES } from "@/lib/seo/page-metadata";

/* [1026 · 지역 시세] 1025 표준 — 절차 한 줄 · 결론 한 줄 · 대표 그림(온도 지도)은 TempMapClient(주 칩·시/도가 결론을 바꾼다).
   여기서는 서버 마크업만 얹는다: 레일의 다음 행동 카드(채움 파랑 "이 지역 알림 받기" — 이번 주 가장 뜨거운 지역, 이어서 칩과 같은 주인공 ·
   지도 · 노트 쓰기 · 결정 카드) · 폰 하단 바 · 인용 안내와 Q&A 는 폰에서 닫힌 <details>(OpenOnDesktop — 데스크톱은 펼침, JSON-LD 그대로) ·
   빈 상태는 카드 하나 + 회색 타일 견본 + 한 문장. 섹션 점은 파랑 하나(.nz-dot-blue). 캐시 정책·SEO·Q&A·인용 문장 그대로.
   [1022 · 온도 지도] 지시 1 — 타일 지도를 우리나라 지도 모양으로(TempMapClient): 전국 시/도 타일 → 시/도 안 lat/lng 배치.
   서버는 그대로다 — 같은 주간 기록을 내리고, 시/도 선택은 클라이언트 상태(?sido= 는 replaceState 로만 · 서버는 쿼리를 읽지 않는다).
   권역 select 는 시/도 선택과 겹쳐 없앴다. 캐시 정책·SEO·Q&A·인용 그대로.
   [1021 · 지역 시세 temperature] 시안(mock8/temp)대로 — 네이비/게이지 히어로(ToolHero) 대신
   머리(아이콘 칩·제목·사실 한 줄 | 주 선택 칩·권역) → 타일 5칸 → 69곳 색 타일 지도(+목록 보기 토글) →
   12주 온도 선(주간 기록이 있을 때만) | 레일(온도 높은 순 8곳 · 이어서 칩). 본문은 TempMapClient(주 전환은 클라이언트 상태).
   데이터: 이번 주(listLatestTemperatures)에 더해 지난주·4주 전(listTemperaturesForWeek — 그 주와 그 직전 주)과
   1위 지역 최근 12주(listRegionTemperatureHistory)를 같은 프리렌더 예산 안에서 읽는다. 곁가지 조회의 실패는
   그 칩·선을 **빼는** 것으로 그친다(본문 "못 읽음"은 이번 주 조회에만 걸린다). 캐시 정책·SEO·Q&A·인용은 그대로. */

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
  /** [1021] 주 선택 칩 — 이번 주(rows) + 기록이 있는 지난주·4주 전만 */
  weeks: WeekView[];
  /** [1021] 1위 지역 최근 12주(오래된 → 최근). 없으면 [] */
  history: TemperatureSnapshot[];
};

/** 곁가지 조회 — 실패해도 본문을 접지 않는다(그 칩·선만 빠진다). 로그는 남긴다. */
async function quiet<T>(what: string, work: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await work();
  } catch (e) {
    logger.error(`[/analysis/temperature] ${what} 조회 실패 — 그 부분만 생략`, e);
    return fallback;
  }
}

const HISTORY_WEEKS = 12;

const loadHub = cache(async (): Promise<HubData> => {
  const run = await loadWithinPrerenderBudget("[/analysis/temperature] 주간 기록", async () => {
    const base = await listLatestTemperatures();
    const ws = base.weekStart;
    if (!ws || base.rows.length === 0) return { ...base, weeks: [] as WeekView[], history: [] as TemperatureSnapshot[] };
    const hottest = base.rows[0].current;
    const weekOf = (offset: number) =>
      quiet(`${offset}주 전`, () => listTemperaturesForWeek(shiftWeeks(ws, offset)), [] as TemperatureSnapshot[]);
    const [w1, w2, w4, w5, history] = await Promise.all([
      weekOf(-1),
      weekOf(-2),
      weekOf(-4),
      weekOf(-5),
      quiet("1위 지역 최근 주", () => listRegionTemperatureHistory(hottest.regionId, HISTORY_WEEKS), [] as TemperatureSnapshot[]),
    ]);
    const weeks: WeekView[] = [{ key: "this", weekStart: ws, rows: base.rows }];
    const prev = pairWeeks(w1, w2);
    if (prev.length > 0) weeks.push({ key: "prev", weekStart: shiftWeeks(ws, -1), rows: prev });
    const four = pairWeeks(w4, w5);
    if (four.length > 0) weeks.push({ key: "4w", weekStart: shiftWeeks(ws, -4), rows: four });
    return { weekStart: ws, rows: base.rows, weeks, history };
  });
  /* 실패를 빈 목록으로 흘려보내면 "아직 쌓인 주가 없습니다" 가 뜬다 —
     크론이 매주 쌓아 둔 기록을 없다고 단정하는 셈이다. 반드시 갈라 놓는다. */
  return run.ok
    ? { weekStart: run.data.weekStart, rows: run.data.rows, loadFailed: false, weeks: run.data.weeks, history: run.data.history }
    : { weekStart: null, rows: [], loadFailed: true, weeks: [], history: [] };
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
      images: DEFAULT_OG_IMAGES,
    },
  };
}

export default async function TemperatureHubPage() {
  const { weekStart, rows, loadFailed, weeks, history } = await loadHub();

  const weekLabel = weekStart ? formatWeekKorean(weekStart) : null;
  const hottest = rows[0] ?? null;
  const coldest = rows.length > 0 ? rows[rows.length - 1] : null;

  /* [1021] 12주 온도 선 — 주간 기록이 2주 이상일 때만. 빠진 주는 week-slots 가 null 칸으로 끊는다 */
  const historyView: HistoryView | null =
    hottest && history.length >= 2
      ? {
          regionId: hottest.current.regionId,
          regionLabel: hottest.current.regionLabel,
          slots: weekSlots(history).map((w) => ({
            weekStart: w.weekStart,
            score: w.row?.score ?? null,
            headline: w.row?.headline ?? null,
          })),
        }
      : null;

  const crumbs = breadcrumbJsonLd([
    { name: "홈", url: "/" },
    { name: "분석", url: "/analysis" },
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

  return (
    <PageShell breadcrumb="홈 › 분석 › 시장 온도 주간 기록" toolScope={personaVars(TOOL_PERSONAS["market:temperature"])}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript(crumbs) }}
      />

      <div className="nz-dot-blue">
        {loadFailed ? (
          <section className="card mb-6 rounded-2xl p-4 max-md:p-3.5" data-reveal="">
            <p className="t-body py-8 text-center text-text-3">
              <strong className="text-ink">{LOAD_FAILED_LINE}</strong>
              <br />
              주간 기록이 없다는 뜻이 아니라, 조회가 제때 끝나지 않았거나 실패했다는 뜻입니다.
            </p>
          </section>
        ) : rows.length === 0 ? (
          /* [1026] 빈 상태 — 카드 하나 + 회색 견본(온도 타일 윤곽) + 한 문장 */
          <section className="card mb-6 rounded-2xl p-4 text-center max-md:p-3.5" data-reveal="">
            <div className="mx-auto grid max-w-[360px] grid-cols-6 gap-1.5" aria-hidden="true">
              {Array.from({ length: 12 }, (_, i) => (
                <span key={i} className="block h-8 rounded-lg border border-dashed border-line-strong" />
              ))}
            </div>
            <p className="mt-3 t-body text-text-2">아직 쌓인 주가 없습니다.</p>
            <Link href="/analysis/timing" className="inline-flex min-h-10 items-center t-sub font-bold text-primary no-underline">
              지금 이 순간의 시장 온도 보기 ›
            </Link>
          </section>
        ) : (
          /* [1021] 시안(mock8/temp) 본문 — 머리·타일·타일 지도·12주 선·레일. 주 칩은 기록이 있는 주만(loadHub 가 이번 주→지난주→4주 전 순으로 담는다) */
          <div className="mb-6 max-md:mb-3">
            <TempMapClient
              weeks={weeks}
              history={historyView}
              totalCount={rows.length}
              rail={
                <>
                  {/* [1026] 다음 행동 카드(채움 파랑 + 지도 · 노트 쓰기 · 결정 카드)와 폰 하단 바는 [1027] TempMapClient 가 그린다 —
                      지역이 화면에서 고른 주·시/도를 따라가야 해서다(여기서 만들면 "이번 주 전국 1위"로 굳는다). */}
                  {/* #411 — 도구 간 이어가기. [D62·D55] 이 화면의 주인공은 이번 주 가장 뜨거운 지역 — 그 지역을 실어 보낸다 */}
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
                </>
              }
            />
          </div>
        )}

        {/* [1026] 인용 안내 · Q&A — 폰은 닫힌 <details>, 데스크톱은 펼침(내용·JSON-LD 는 늘 DOM 에) */}
        <OpenOnDesktop summary="시장 온도 Q&A · 인용 안내" note={`${qa.length}문항`}>
          {hottest && coldest && weekLabel && rows.length >= 2 && (
            <CitationBlock
              sentence={`내집나우(naezipnow.com) 집계에 따르면, ${weekLabel}이 속한 주의 시장 온도는 ${hottest.current.regionLabel}가 ${hottest.current.score}점으로 가장 높고 ${coldest.current.regionLabel}가 ${coldest.current.score}점으로 가장 낮다 (0~100 눈금, 50이 중립. 한국부동산원 매매가격지수 모멘텀과 국토교통부 실거래 거래량 추이 기반, 그 주에 마지막으로 관측한 값).`}
            />
          )}
          <QaBlock title="시장 온도 Q&A" items={qa} />
        </OpenOnDesktop>

        {/* [1015 · 규칙 B] "이 기록을 읽는 법" 문단 → 위 ⓘ 로. 안내문("~에서 확인하실 수 있습니다") → 링크 칩 */}
        {/* [998] mb-8 제거 — 본문 pb-16 + 푸터 pt-6 과 겹쳐 데스크톱에서 빈 띠(빈 공간 게이트). 도구 간 이어가기 칩은 [1021] 레일로 */}
        <nav aria-label="관련 화면" className="flex flex-wrap gap-1.5">
          <Link href="/analysis/timing" className="chip chip-soft t-sub px-3 py-1.5 no-underline">
            시세·타이밍 분석 ›
          </Link>
          <Link href="/methodology" className="chip chip-soft t-sub px-3 py-1.5 no-underline">
            데이터 방법론 ›
          </Link>
        </nav>
      </div>
    </PageShell>
  );
}
