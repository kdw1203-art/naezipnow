/* [1026c · 폰 글자·상자 90%] 도구 수 링크("2종")가 폭 19px — 탭 하한 24px 로 받친다(min-w). */
/* [1023 · AI 분석] 검토(docs/review-1022.md 3장) 적용 — 최근 실행 결과 3건(hub-recent) · 실행 4칸 "마지막 실행 N일 전" · 시장 카드 티저 지역 고정 해제
   (loadHubTeasersByRegion → ToolCard teaserByRegion) · 계열 "N종" 배지 → 그 계열 앵커 · 기록 시작 카드 게스트/로그인 같은 최소 높이(.hub-start). */
/* [1022 · 정렬·글씨·테마] 지시 4 — 머리 한 모양(PageHead) · 램프 글자 · 흰 카드 테마 · 사실 문장. 자세한 사유는 본문의 [1022 · 정렬·글씨·테마] 주석. */
import { AdZone } from "@/app/components/ads/AdZone";
import { TopBanner } from "@/app/components/ads/TopBanner";
import { Icon } from "@/app/components/Icon";
import { buildPageMetadata } from "@/lib/seo/page-metadata";
import { loadHomeCoverage } from "@/lib/newui/home-coverage";
import { FEATURE_RULES } from "@/lib/subscriptions/access";
import { isTierOnSale } from "@/lib/subscriptions/sell-config";
import { HubPickedProvider } from "./hub-context";
import { HubHero } from "./hub-hero";
import { WorkbenchGrid } from "./hub-tiers";
import { workbenchCardData } from "./workbench-cards";
import { loadRegionSiseData, RegionSiseEntry } from "./region-sise-entry";
import { AI_TOOL_COUNT, TIERS, type TierId } from "./tool-catalog";
import { AI_TOOL_IDS } from "@/lib/ai/ai-tools";
import { TOOL_IDENTITIES } from "@/lib/ai/tool-identity";


/* ============================================================
   분석 허브 — 2026-08-25 리디자인 (UI-01 ~ UI-10)

   소유자 피드백 그대로: "딱딱하고 개성이 없다 · 내용이 너무 많다 ·
   인터랙티브하지 않다 · 뭐가 중요한지, 어떤 게 어느 기능인지 모르겠다."

   실측 진단(같은 날):
     · 한 화면 진입점 23개 — 전부 같은 무게로 평평
     · 이름이 겹치는 쌍 5개(비교·포트폴리오·타이밍·갭·시나리오)
     · 상호작용 요소 23개 중 1개(검색기 — 그마저 화면 중간)
     · 글자 크기 10종 · 모서리 반경 3종
     · 워크벤치 12장이 전부 같은 문장("… · 약 1분")을 밑줄에 달고 있었음
     · 워크벤치 30일 실행 0회

   구조를 "기능 목록"에서 **질문 3개**로 바꿨다. 사용자는 기능 이름이 아니라
   목적으로 고른다 — 단지 하나 / 지역·시장 / 내 기록.

     [히어로]  검색 + 3단계 스텝퍼            ← 출발점을 첫 화면으로 (UI-05·10)
     [계열 1]  단지 하나를 깊게 — 워크벤치 4 + 접힌 8 (UI-01·03)
     [계열 2]  지역·시장 흐름 — 실데이터 4종 + 스파크라인 (UI-09)
     [계열 3]  내 기록 — 임장노트·비교 트레이 + 노트 AI 실행
     [에이전트] 여러 데이터를 물어보는 자리 (계열을 가로지르는 하나)
     [체험]    예시 계산 4종 — 접힘. 실데이터와 섞지 않는다 (UI-04)

   [1110 · AI 분석 2차 통폐합] 소유자 2026-11-07 ~ 08 지시로 화면은 **둘**이 됐다 —
     [계열 1]  단지 분석 4줄 — 펼침 문구 없이 바로 열기
     [계열 2]  지역 시세 분석 하나 — 시 · 구 · 동 검색 + 시/도 필터 → 그 지역의 종합 화면(/region/[id])
   내 임장노트(임장노트 분석 · 후보 단지 비교 · 노트 AI 실행)와 에이전트는 임장노트 카테고리(/notes/analysis)로 옮겼다 —
   "임장노트 카테고리에서 끝낼 수 있도록 · AI 분석에서는 제외". 예시 계산 구역은 1109 에서 없어졌다.

   글자 크기는 램프 유틸(.t-display/.t-title/.t-section/.t-sub/.t-caption)만
   쓴다 — 이 화면에 있던 t-display·[15px]·[13.5px]·[11.5px]·[10.5px]·[9px]
   같은 임의값을 전부 걷어냈다(UI-07).
   ============================================================ */

/* 설명문은 이 화면이 실제로 하는 일만 적는다. [1109] 예시 계산 구역이 없어져 "예시 계산 표시" 문구도 뺐다 —
   시나리오 화면은 제 화면 안에서 기준가 없을 때 예시임을 적는다. */
export const metadata = buildPageMetadata({
  title: "분석 도구",
  description:
    "AI 분석 · 단지 종합 진단 · 시세 예측 · 매수 타이밍 · 임장 동선 · 지역 시세 분석(시 · 구 · 동) · 국토교통부 실거래 기준", /* [1029 · 20] 낱말 꼴 · [1110] 임장노트 분석은 /notes/analysis */
  path: "/analysis",
});

const TIER_ICON: Record<TierId, string> = {
  complex: "building2",
  market: "trending-up",
  record: "notebook-pen",
};

function TierHead({ id, count, unit = "종" }: { id: TierId; count: number; unit?: string }) {
  const t = TIERS[id];
  return (
    <div className="hub-tier-head">
      <div className="flex items-center gap-2">
        <span
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${t.iconClass}`}
        >
          <Icon name={TIER_ICON[id]} size={16} />
        </span>
        {/* [1022 · 정렬·글씨·테마] 섹션 제목은 t-section — 화면 제목(t-title)은 머리 하나뿐 */}
        <h2 className="accent-underline t-section text-balance text-ink">{t.question}</h2>
        {/* [1015 · 규칙 C] 제목 옆 배지("단지 1곳 · 12종")는 개수만, 기능 설명 한 줄(hint)은 걷었다.
            [1023] 배지는 그 계열 앵커 링크(24px 하한) — 위 계열 칩과 같은 목적지 */}
        <a
          href={`#tier-${id}`}
          className="tap-line t-caption ml-auto inline-flex min-h-[24px] min-w-[24px] shrink-0 items-center justify-end text-text-3 tabular-nums no-underline hover:underline"
        >
          {count}{unit}
        </a>
      </div>
    </div>
  );
}

/* [1007] ISR 1시간 — 예전엔 `safeAuth()`(내 노트 수·로그인 분기)와 `searchParams`(noteId·
   complexId·apt 프리필) 때문에 force-dynamic 이었고, 24h 실측 함수 호출 1,828회 중 사람
   방문은 한 자릿수였다(7일 페이지뷰 ~120건 전체). 크롤러 요청마다 함수·세션·DB 조회가
   돌았고, 티저 캐시가 비는 시간대엔 [analysis-hub-price-teaser] 에러 로그까지 요청마다 찍혔다.
   세션이 갈랐던 세 조각은 클라이언트(hub-viewer · hub-record-start · hub-picker)가 판정하고,
   ?complexId/?apt 는 ComplexPicker 가 원래부터 마운트 뒤 URL 에서 읽는다(props 가 undefined 일 때).
   서버 렌더에는 사용자별 값이 한 조각도 없다 — CDN 한 벌을 모두에게 줘도 새는 것이 없다. */
/* [1010] 1h → 1일. 이 화면의 원천은 하루 1회 적재되는 국토부 실거래·집계이고,
   적재 직후 lib/cache/invalidate.ts SOURCE_MAP.molit(+reb)이 이 경로를 이미 비운다 —
   시간 TTL 은 안전망일 뿐이다. 실측(2026-09-20~22) 이 축의 분석 화면은 하루 수천 회
   렌더되는데 사람 방문은 7일 합계 ~120건이고, 크롤러 재방문 간격은 ≈2.2일이라
   1시간 눈금은 방문마다 재렌더를 뜻했다. */
export const revalidate = 86_400;

export default async function AnalysisHubPage() {
  /* [1110] 지역 시세 분석 입구의 지금 값(스냅샷 전 지역 · 이번 주 온도)과 히어로 커버리지 — 실패/없음은 그 칸이 "—" 또는 빠질 뿐(가짜 수치 없음) */
  const [regionSise, coverage] = await Promise.all([
    loadRegionSiseData("[/analysis]"),
    /* [958] 히어로 커버리지 — 홈과 같은 6시간 캐시 실측값(0이면 0, 실패면 —) */
    loadHomeCoverage().catch(() => ({ txCount: null, complexCount: null, regionCount: null })),
  ]);
  /* [980] 카드는 서버에서 조립한다 — 클라이언트가 tool-identity·tool-persona 를 직접 import 하면 번들 예산을 넘긴다(workbench-cards.ts 주석 참고). */
  const workbenchCards = workbenchCardData();
  const aiLimit = FEATURE_RULES.ai_analysis.monthlyLimit ?? {};
  /* [993] 무료는 992 부터 누적 3회(lifetimeLimit) — 월 한도(null)를 0회로 적고 있었다 */
  const freeLifetime = FEATURE_RULES.ai_analysis.lifetimeLimit?.basic ?? null;
  const quota = {
    free: freeLifetime ?? aiLimit.basic ?? 0,
    freeLifetime: freeLifetime != null,
    plus: aiLimit.pro ?? 0,
    pro: aiLimit.expert === undefined ? null : aiLimit.expert,
    proOnSale: isTierOnSale("expert"),
  };

  return (
    <>
      <HubPickedProvider>
        <div className="flex flex-col gap-6 max-md:gap-3">
          {/* ── 히어로: 검색이 화면의 첫 요소 (UI-05·10) ── */}
          <HubHero
            coverage={coverage}
            quota={quota}
            toolCount={AI_TOOL_COUNT + 1}
            /* [1109] 최근 실행 결과 3건의 제목 — 통합된 도구의 옛 결과도 이름으로 읽히게 12종 정체성 전부(목록은 살아 있는 4종만) */
            toolTitles={Object.fromEntries(AI_TOOL_IDS.map((id) => [id, TOOL_IDENTITIES[id].title]))}
          />

          {/* [1098 · 배너] 상단 띠 배너 자리 — 히어로 아래 */}
          <TopBanner placement="page_bottom" plan={null} />

          {/* ── 계열 1 · 단지 하나를 깊게 (UI-01·03) — [1109] 살아 있는 4종만(종합 진단 · 시세 예측 · 매수 타이밍 · 임장 동선).
              "그 밖의 8종" 칸은 없다: 운영 60일 표본에서 그 8종은 열린 적이 0~3회였고 이름이 겹치는 쌍(비교 · 갭 · 포트폴리오 ·
              시나리오)이 "어떤 게 어느 기능인지"를 흐렸다. 주소는 같은 일을 하는 화면으로 308(lib/ai/ai-tools RETIRED_AI_TOOLS). ── */}
          <section
            id="tier-complex"
            className="rise-in-1 flex scroll-mt-24 flex-col gap-3"
          >
            <TierHead id="complex" count={AI_TOOL_COUNT} />
            {/* [1110] 줄을 누르면 바로 도구 — 펼침 칸(분석 순서 · 시장 신호)은 걷었다(소유자 "1, 2 같은 문구는 필요없어") */}
            <WorkbenchGrid core={workbenchCards.core} />
          </section>

          {/* ── 계열 2 · 지역 시세 분석 — [1110] 도구 5줄(면적대별 · 시세·타이밍 · 시장 온도 · 갭 스크리너 · 시나리오) → 하나.
              검색(시 · 구 · 동) + 시/도 필터 → 그 지역의 종합 화면(/region/[id] 탭 여섯). 같은 조각이 /analysis/timing 에도 선다. ── */}
          <section
            id="tier-market"
            className="rise-in-2 flex scroll-mt-24 flex-col gap-3"
          >
            <TierHead id="market" count={regionSise.regions.length} unit="곳" />
            <RegionSiseEntry data={regionSise} />
          </section>

          {/* [1110] 내 임장노트 묶음 · 에이전트 · 예시 계산은 이 화면에 없다 — 임장노트 분석(/notes/analysis)과 1109 참고. 화면의 묶음은 둘(단지 · 지역). */}
        </div>
      </HubPickedProvider>
      {/* [961] 광고 공간 — 허브 맨 아래(도구 입력·결과 사이에는 두지 않는다) */}
      <AdZone placement="page_bottom" seed={2} plan={null} className="mt-8 max-md:mt-4" />
    </>
  );
}
