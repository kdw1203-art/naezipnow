import { cache } from "react";
import { loanRegionFromRegionName } from "@/lib/finance/loan-rules";
import { logger } from "@/lib/log";
import {
  createTimeoutBreaker,
  recordSuccess,
  recordTimeout,
  shouldSkipRetry,
} from "@/lib/db/timeout-breaker";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageShell } from "../../components/PageShell";
import {
  getComplexBaseById,
  enrichComplexRow,
  getTransactionHistoryWithBands,
  getComplexPosts,
  getComplexDeals,
  listComplexesInDistrict,
  listComplexesInDong,
  COMPLEX_DEALS_ROW_CAP,
  type AreaBandRow,
  type ComplexRow,
  type ComplexTransactionRow,
  type ComplexTransactionRowWithBands,
} from "@/lib/complex/complex-store";
/* [1009 · C] 첫 화면 대표 실거래가(AI 분석과 같은 규칙)·평형별 추이·최근 실거래 목록 — 순수 계산 */
import {
  baseSince,
  hubHeadline,
  hubSeries,
  recentDealTuples,
  type HubDeal,
  type HubHeadline,
} from "@/lib/complex/hub-price";
import { changeSentence } from "@/lib/format/delta";
import { hubFaqPriceAnswer, hubMetaPrice } from "@/lib/complex/hub-meta";
/* [1009 · C 리뷰] 월별 줄 등락의 기준 달(전월/빈 달 다음은 그 달) — 요약 탭 미리보기 줄은 서버에서 센다 */
import { monthDeltaView, ymRangeShort, type MonthDeltaView } from "@/lib/complex/month-delta";
import { formatEokMan } from "@/lib/format/eok-man";
import { HubPriceHero } from "./HubPriceHero";
import { ComplexInfoGrid, type ComplexInfoFacts } from "./ComplexInfoGrid";
import { AreaTextLazy as AreaText } from "./AreaTextLazy";
import { ExplainLazy as Explain } from "./ExplainLazy";
/* [995] 읍면동 파싱·평형 요약·최근 12개월 건수 — 순수 함수(단위테스트 complex-seo-995) */
import {
  parseDong,
  areaBandTitle,
  topAreaBands,
  bandPriceLabel,
  ymShortLabel,
  countDealsInWindow,
  resolveRegionId,
} from "@/lib/complex/dong";
import { kstParts } from "@/lib/format/kst";
/* [967 · 16] 억/만 표기·전월비·행 변환은 클라이언트 필터(면적대·정렬)와 같은
   구현을 써야 하므로 lib 로 옮겼다 — 이 파일 안의 사본을 지웠다. */
import { ALL_BANDS, formatManwon, toHubTrades, tradeDeltaBases } from "@/lib/complex/hub-trades";
/* [967 · 17] 모바일 하단 액션 바(관심·노트·호가 점검·AI 분석) — 클라이언트, 원래 CTA 가 보이면 숨김.
   [1008 · Q] 본체는 처음 스크롤할 때 받는다(MobileActionBarLazy — 번들 상쇄) */
import { MobileActionBarLazy } from "./MobileActionBarLazy";
import {
  prefetchComplexSections,
  prefetchAxisSummary,
  sectionRegionLabel,
  axisRegionName,
  loadAreaBands,
  loadRentHistory,
  loadHubInspectionNotes,
  withSectionBudget,
} from "./section-loaders";
/* [1007 · P2] 전세가율·자료 완성도 — 지도 패널(detail API)과 같은 순수 모듈·같은 규칙 */
import {
  buildComplexFacts,
  type ComplexFacts,
  type ComplexNotesBrief,
  type RentSample,
  type TradeSample,
} from "@/lib/complex/complex-facts";
import { getTradeWindowSamples } from "@/lib/complex/complex-trade-window";
import { ComplexFactsCard } from "./ComplexFactsCard";
import {
  ComplexHubTabs,
  CompareTrayButton,
  WatchlistButton,
  type HubTrade,
  type HubNote,
  type HubListing,
} from "./hub-client";
/* [968 · 4] 차트는 서버가 그려 탭 컴포넌트에 엘리먼트로 넘긴다.
   [1009 · C] 서버 SVG → 평형별 ScrubLine(따로 받는 청크 PriceTrendLazy — 라우트 번들 밖) */
import { PriceTrendChart, type PricePoint } from "./PriceTrendChart";
import { complexCanonicalPath, decodeComplexId } from "@/lib/complex/complex-store";
import { ComplexAxisSummary } from "./ComplexAxisSummary";
import { pureIdFromParam, complexHrefFromId} from "@/lib/seo/complex-slug";
import { geocodeAndCache } from "@/lib/map/complex-geocode";
import { settle, startDeadline, SIDE_SECTION_BUDGET_MS } from "@/lib/data/section-budget";
import { getMarketFreshnessDateLabel } from "@/lib/newui/freshness";
import { RecentComplexRecorder } from "../../components/RecentComplexes";
import { MarketFreshnessLine } from "../../components/MarketFreshnessLine";
import { QaBlock } from "../../components/QaBlock";
import { AdZone } from "@/app/components/ads/AdZone";
import { BrandWatermark } from "@/app/components/BrandWatermark";
import type { FaqItem } from "@/lib/seo/jsonld";
/* [968 · 3 · 4] 후기 섹션은 뷰포트 근처에서 청크·데이터를 함께 받는 래퍼로 */
import { ComplexReviewsLazy } from "./ComplexReviewsLazy";
import { ComplexAreaBands } from "./ComplexAreaBands";
import { RegionRelative } from "./RegionRelative";
import { NearbyRedevelopment } from "./NearbyRedevelopment";
import { UpcomingSupply } from "./UpcomingSupply";
import { ComplexRentSection } from "./ComplexRentSection";
import { ComplexNearbyPoi } from "./ComplexNearbyPoi";
import { ShareLinkButton } from "@/app/components/ShareLinkButton";
import { EmbedSnippet } from "@/app/components/EmbedSnippet";
import { ComplexNotesNewsAi } from "./ComplexNotesNewsAi";
/* [1008 · Q] 브리핑 본체는 누를 때 받는다(번들 상쇄) · 호가 점검 펼침 버튼 */
import { AiBriefingLazy } from "./AiBriefingLazy";
import { AskingCheckToggle } from "./AskingCheckToggle";
import { SEOUL_BROWSE_REGIONS, buildComplexTxSlug } from "@/lib/market/complex-transactions";
import {
  complexResidenceJsonLd,
  breadcrumbJsonLd,
  jsonLdScript,
  webPageJsonLd,
  complexEntityId,
} from "@/lib/seo/jsonld";
/* [1006 · E] 인용 가능한 요약(GEO) — 순수 함수, 실거래 최신월이 있을 때만 문단을 만든다 */
import {
  buildComplexCitableSummary,
  freshnessLabelToIsoDate,
  AI_SUMMARY_SELECTOR,
} from "@/lib/seo/citable-summary";
import { seoAlternates } from "@/lib/seo/alternates";
import { RoadviewButton } from "@/components/map/RoadviewButton";
import {
  listApprovedListings,
  LISTING_TYPE_LABEL,
  type PublicListing,
} from "@/lib/listings/store-db";

/* ============================================================
   단지 허브 (연동 중심축 화면, SEO 핵심 랜딩 겸용)
   실데이터: market_transactions(국토부 실거래) → getComplexById·getTransactionHistory
   + posts(getComplexPosts). 존재하지 않는 단지 → notFound() (사실 우선: 목업 금지).
   (#150 — 이전 주석은 complexes·complex_transactions 를 가리켰으나 두 테이블은
    운영 DB에 없다. 단지·시세 모두 market_transactions 에서 파생된다.)
   비로그인 열람 허용 — index 대상.
   ============================================================ */

/* ── 캐시(운영 P0) ────────────────────────────────────────────────────────
   이 페이지는 searchParams·쿠키·세션을 쓰지 않는다. 주소 하나에 HTML 한 벌이다.

   2026-07-28 사고: `revalidate` 만 적어 두면 ISR 이 되는 줄 알았는데 아니었다.
   동적 세그먼트(`[id]`)에 generateStaticParams 가 없으면 Next 는 이 라우트를
   "요청마다 서버 렌더"로 분류한다. 그러면 응답에 Next 가 직접
   `private, no-cache, no-store` 를 실어 보내고, 미들웨어가 앞서 붙여 둔 공유
   캐시 헤더는 그 값에 덮인다. 빌드 산출물로도 확인된다 —
   .next/prerender-manifest.json 의 dynamicRoutes 에 이 라우트가 없었다.
   사이트맵에 실린 25,310개 단지 주소가 크롤될 때마다 CDN 을 건너뛰고 함수를
   불렀고, Vercel 무료 티어 함수 호출 100만 회가 그렇게 소진됐다.

   빈 배열을 돌려주는 generateStaticParams 가 그 분류를 바꾼다. 빌드 때는 아무
   경로도 미리 만들지 않고(프리렌더 예산은 그대로), 첫 요청에 한 벌 렌더해서
   ISR 캐시에 넣은 뒤 revalidate 창 동안 CDN 이 그걸 재사용한다.

   재검증 창을 2분에서 1시간으로 넓힌 이유: 함수 호출 수를 정하는 눈금이
   바로 이 값이다. 시세 원본은 국토부 실거래라 하루 단위로 들어오지만 이 화면엔
   임장노트·Q&A·매물처럼 사람이 실시간으로 쓰는 것도 같이 있어서 하루를 통째로
   묵히지는 않는다. 1시간이면 그 손해는 감당할 만하고, 크롤러가 같은 주소를
   하루에 몇 번씩 긁어도 오리진 렌더는 시간당 한 번으로 접힌다.
   lib/http/cache-policy.ts 의 같은 경로 규칙도 3600 으로 맞춰 뒀다.
   ──────────────────────────────────────────────────────────────────────── */
/* [A003·B001 1단계 2026-08-31] 1시간 → 6시간.
   실거래는 하루 1번 적재된다(etl.yml molit 매일). 그런데 이 페이지 26,229개가
   1시간마다 만료되니, 크롤러가 훑을 때마다 무거운 재렌더(7갈래 조회)가 돌았고
   그 동시 재렌더가 DB 를 밀어 "단지 정보 조회 시간 초과" 611건/7일을 만들었다.
   6시간이면 재렌더 빈도가 1/6 — 커뮤니티 섹션(단지 이야기·Q&A)의 반영 지연
   상한도 6시간이라 실사용 피해가 없다. */
/* [1010] 6시간 → 7일. 위 판단의 전제("시간이 신선도를 맡는다")를 바꾼다.
   실측(2026-09-20~22 Vercel 청구 2일치): 이 라우트 하루 11,523 렌더 vs 사람 방문 30일 27회.
   크롤러 재방문 간격이 ≈2.2일인데 TTL 이 6시간이라, 크롤러가 올 때마다 거의 100% 재렌더가
   돌았다(운영 샘플 4/4 x-vercel-cache: REVALIDATED). 재렌더 1회 = ISR Write + Fluid CPU +
   Fast Origin Transfer(HTML gz ≈35KB) — 청구서의 절반이 여기서 나왔다.

   TTL 을 재방문 간격보다 훨씬 길게 잡는 대신, **이 화면의 내용을 바꾸는 쓰기 지점에서
   그 단지만 즉시 비운다.** 그래서 신선도는 오히려 좋아진다(옛날엔 최대 6시간 지연):
     · 단지 이야기 글·수정·삭제·댓글·공감 → app/api/community/posts/** (invalidateComplexById)
     · 공개 임장노트 저장·공개 전환·수정·삭제 → app/api/inspection/notes/**
     · 매물 승인·반려·수정·삭제·거래완료 → app/api/listings/** · app/api/admin/listings
     · 실거래 적재 → app/api/cron/molit-transactions-ingest (그 실행이 실제로 적재한 단지만)
   거주민 후기는 클라이언트가 /api/complex-reviews 로 직접 받으므로 ISR HTML 과 무관하다.
   비우는 경로 표기는 lib/complex/complex-invalidate.ts 주석 참고(정규 주소는 슬러그가 붙는다). */
export const revalidate = 604_800;

/* 빈 배열 = "빌드 때 미리 만들 경로는 없다". dynamicParams 기본값(true)이라
   실제 요청이 오면 그때 만들어 캐시한다. 지우면 다시 완전 동적 SSR 로 돌아가고
   위 사고가 그대로 재현되므로, scripts/check-cache-policy.mjs 가 이 라우트가
   prerender-manifest 의 dynamicRoutes 에 있는지 매 빌드마다 확인한다. */
export function generateStaticParams(): { id: string }[] {
  return [];
}

/**
 * 곁다리 5개 중 몇 개가 실패하면 화면을 그리지 않고 던지는가.
 * 자세한 이유는 loadView() 안의 주석과 /region/[id] 의 같은 이름 상수 참고.
 * (실거래 상세 링크가 질의를 그만두면서 6개 → 5개가 됐다. "거의 다 실패했다"는
 *  뜻을 유지하려고 5/6 이던 기준을 4/5 로 함께 낮춘다.)
 */
const SIDE_FAILURE_ABORT_THRESHOLD = 4;

/* [968 · 1] 곁다리 예산을 둘로 나눈다.
   - 실거래(tx)는 히어로(시세·KPI 6칸·타이틀·OG)의 정체성이다 — 종전 공유 예산(8초)을
     그대로 둔다. 3초로 줄이면 느린 DB 에서 "조회 실패" 히어로가 6시간 캐시에 얼어붙는
     빈도가 늘어난다(base 와 함께 "히어로 파도"를 이룬다).
   - 나머지 넷(이야기·인근·좌표·매물)은 5초(오케스트레이터 조정 — 3초로 두면 DB 가
     3~5초로 느린 저녁 집계 창에서 4/5 실패 → 5xx 가 잦아진다. 5초는 "느리지만 완성본"과
     "빈 껍데기 캐시 방지" 사이의 절충). 넘기면 settle() 이 { ok:false } 로 접고
     toView 가 "노트 ?"·"매물 ?"(조회 실패)로 정직하게 그린다 — 확인: 예전 8초 때와 같은
     경로라 새 폴백 코드는 없다. 이 넷이 렌더를 8초까지 붙들 이유가 없었다.
   - 섹션 컴포넌트 7종(면적대·지역대비·전월세·Q&A·정비사업·입주물량·노트/기사)도 같은
     3초 시계(section-loaders.ts withSectionBudget)를 본다 — 예전엔 상한이 없어 로더
     하나가 읽기 타임아웃(최대 45초)까지 페이지를 붙들 수 있었다.
   왜 Suspense 가 아닌가: 이 라우트는 ISR(generateStaticParams + revalidate) 이고
   Next 15.5 는 정적 생성 렌더에서 스트림의 allReady 를 기다린 뒤 첫 바이트를 낸다
   (next/dist/server/stream-utils/node-web-streams-helper.js continueFizzStream,
   app-render.js generateStaticHTML = supportsDynamicResponse !== true). 경계를 둬도
   ISR 미스의 TTFB 는 그대로이고, 캐시 정책 게이트(check-cache-policy.mjs)가 요구하는
   ISR 분류를 깨지 않는 한 스트리밍은 불가능하다. 그래서 파도 수·상한만 줄인다. */
const SIDE_QUERY_BUDGET_MS = 5_000;

/**
 * generateMetadata 와 본문은 같은 요청 안에서 각자 이 둘을 불렀다 — 즉 렌더
 * 한 번에 똑같은 쿼리가 두 번씩, 합쳐서 두 왕복이 통째로 낭비였다.
 * React cache() 로 묶으면 요청당 한 번만 실제로 나간다
 * (/complex/tx/[slug] 의 loadPageData 와 같은 방식).
 *
 * 인자가 같아야 합쳐진다는 점이 중요하다. 그래서 메타데이터도 본문과 똑같이
 * TX_HISTORY_MONTHS 를 넘긴다 — getTransactionHistory 는 limit 과 무관하게
 * 이 단지의 실거래를 전부 읽어서 월별로 접은 뒤 마지막 limit개만 남긴다.
 */
/* 대표행 조회 상한.
   [973] 10초 → 4초. 이 조회는 평시 **15.8ms** 다(프로덕션 실행 계획 실측,
   mt_trade_complex_geo_idx 인덱스 스캔 22행). 10초는 평시의 600배이고, 그만큼
   기다린다고 답이 오지 않는다 — 그 시간 동안 붙잡는 건 함수 하나와 DB 연결
   하나다. 2026-09-07 사고에서 그 붙잡음이 포화를 더 키웠다(아래 사고 메모).
   4초는 "느린 날에도 성공할 수 있는 값"과 "포화를 키우지 않는 값" 사이다.
   주의: 시간 초과는 **throw** 다 — null 로 바꾸면 notFound() 가 "조회 실패"를
   "없는 단지(404)"로 위장하고, 그 404 가 ISR 로 6시간 얼어붙는다. */
const COMPLEX_ROW_TIMEOUT_MS = 4_000;
/** 2차 시도 상한 — 1차와 같게 둔다(짧게 잡을 이유가 없다. 아래 breaker 가 회수를 막는다). */
const COMPLEX_ROW_RETRY_TIMEOUT_MS = 4_000;
/* 재시도 1회. 이 조회 자체는 빠르므로 일시적 오류(PostgREST 503 등)에는 다시
   물어보는 게 맞다. 2026-08-24~25 에 181건(사용자 32명)이 10초를 넘겼을 때도
   원인은 이 쿼리가 아니라 그 시각 DB 포화였고, 그런 포화는 몇 초면 지나간다. */
const COMPLEX_ROW_RETRY_DELAY_MS = 350;

/* ──────────────────────────────────────────────────────────────────────────
   [973] 2026-09-07 사고 메모 — 이 블록이 왜 이렇게 생겼나

   Vercel 경보: /complex/[id] 5xx 급증(오류율 43.1% · 실패 135건), 로그에
   "단지 정보 조회 시간 초과 (6000ms)" 271건 · 서버 컴포넌트 렌더 오류 53건,
   같은 창에서 Supabase 503 14건 + Timeout 4건.

   원인은 이 페이지가 아니라 **DB 포화**였다(그 시각 분석용 대용량 질의 한 건이
   29.5초를 먹었다 — pg_stat_statements 실측). 하지만 이 코드가 포화를 **키웠다**:
     · Promise.race 상한은 약속만 버리고 질의를 취소하지 않았다 → 버려진 질의가
       Postgres 안에 계속 살아 있었다.
     · 그 위에 350ms 뒤 재시도가 하나를 더 얹었다 → 요청 하나가 살아 있는 질의 둘.
     · 조회는 상한 없는 **쓰기용** 클라이언트를 쓰고 있어 503 재시도도 없었다.

   그래서 세 가지를 바꿨다.
     1. 읽기 전용 클라이언트로(시도별 상한·총 예산·503 백오프) — complex-store.ts
     2. 상한이 끝나면 AbortSignal 로 **질의를 실제로 끊는다**
     3. 시간 초과가 연달아 나면 재시도를 잠깐 끈다(lib/db/timeout-breaker.ts)
   ────────────────────────────────────────────────────────────────────────── */
const rowBreaker = createTimeoutBreaker();

/** 시간 초과를 알아보는 표식 — 로그·차단기 판정이 문자열 비교에 기대지 않게. */
class QueryTimeoutError extends Error {}

/**
 * 상한 + **취소**. 예전 구현은 Promise.race 만 했다(취소 없음).
 * 넘긴 signal 을 조회에 실어 보내야 상한이 실제로 질의를 끊는다.
 */
function withTimeout<T>(
  run: (signal: AbortSignal) => Promise<T>,
  ms: number,
  label: string,
): Promise<T> {
  const ac = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    run(ac.signal),
    new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        ac.abort();
        reject(new QueryTimeoutError(`${label} (${ms}ms)`));
      }, ms);
    }),
  ]).finally(() => clearTimeout(timer)) as Promise<T>;
}

/* [949] 대표행을 두 단계로 받는다 — base(실거래 대표행, 시간 초과·재시도 포함) 와
   enrich(대장 마스터). loadView 는 base 를 받는 즉시 곁다리 조회와 섹션 프리페치를
   enrich 와 **나란히** 띄운다(직렬 파도 하나 제거). generateMetadata·본문은 여전히
   완성본(loadComplexRow)을 쓰고, React cache() 라 base 는 요청당 한 번만 조회된다. */
const loadComplexBase = cache(async (id: string) => {
  const label = "단지 정보 조회 시간 초과";
  try {
    const row = await withTimeout(
      (signal) => getComplexBaseById(id, signal),
      COMPLEX_ROW_TIMEOUT_MS,
      label,
    );
    recordSuccess(rowBreaker);
    return row;
  } catch (first) {
    const timedOut = first instanceof QueryTimeoutError;
    if (timedOut) recordTimeout(rowBreaker, Date.now());

    /* [973] 포화 중에는 재시도가 약이 아니라 독이다 — 밀리고 있는 DB 에 같은
       질의를 하나 더 얹는 일이다. 최근 창 안에서 시간 초과가 연달아 났으면
       한 번만 물어보고 실패를 올려보낸다(화면은 error.tsx 가 한국어로 그린다).
       성공 한 번이면 바로 원상복귀한다. */
    if (timedOut && shouldSkipRetry(rowBreaker, Date.now())) {
      logger.warn("[complex] 단지 조회 시간 초과 연속 — 재시도 생략(부하 경감)", {
        id,
        strikes: rowBreaker.strikes,
      });
      throw first;
    }

    logger.warn("[complex] 단지 조회 1차 실패 — 1회 재시도", {
      id,
      timedOut,
      message: first instanceof Error ? first.message : String(first),
    });
    await new Promise((r) => setTimeout(r, COMPLEX_ROW_RETRY_DELAY_MS));
    /* 주의: 시간 초과는 여전히 **throw** 다. null 로 바꾸면 notFound() 가
       "조회 실패"를 "없는 단지(404)"로 위장하고, 그 404 가 ISR 로 얼어붙는다. */
    try {
      const row = await withTimeout(
        (signal) => getComplexBaseById(id, signal),
        COMPLEX_ROW_RETRY_TIMEOUT_MS,
        label,
      );
      recordSuccess(rowBreaker);
      return row;
    } catch (second) {
      if (second instanceof QueryTimeoutError) recordTimeout(rowBreaker, Date.now());
      throw second;
    }
  }
});
/** 대장 보강 상한. [973] 예전엔 **상한이 없었다** — base 가 성공한 뒤 이 보강이
 *  밀리면 함수 상한(300초)까지 붙잡힐 수 있었다. 보강은 세대수·난방 같은 곁다리라
 *  없어도 화면이 선다(그 폴백은 원래부터 있다). 2.5초면 평시(수십 ms)의 100배다. */
const COMPLEX_ENRICH_TIMEOUT_MS = 2_500;

const loadComplexRow = cache(async (id: string) => {
  const base = await loadComplexBase(id);
  if (!base) return null;
  /* enrich 는 내부에서 실패를 삼키고(로그) base 를 그대로 돌려준다 — 예전
     getComplexById 와 같은 계약. [973] 여기에도 상한과 취소를 건다. 넘기면
     **던지지 않고** base 를 그대로 쓴다 — 곁다리가 페이지를 죽이면 안 된다. */
  try {
    return await withTimeout(
      (signal) => enrichComplexRow(base, signal),
      COMPLEX_ENRICH_TIMEOUT_MS,
      "단지 대장 보강 시간 초과",
    );
  } catch (e) {
    logger.warn("[complex] 대장 보강 상한 초과 — 실거래만으로 계속", {
      id,
      message: e instanceof Error ? e.message : String(e),
    });
    return base;
  }
});
/* [967 · 16] area_m2 를 함께 읽어 월별 행에 면적대 분할(bands)을 싣는 로더로 교체.
   월별 숫자는 getTransactionHistory 와 같은 규칙 — 메타데이터·본문이 같은 값을 본다. */
const loadTxHistory = cache(getTransactionHistoryWithBands);

/* [1007 · P2] 매매 12개월 **원표본** — 전세가율(6개월 중앙값)·면적대 중앙값 재료. 이 페이지가
   이미 읽는 월별 집계(loadTxHistory)는 평균·최저·최고로 접혀 있어 중앙값을 만들 수 없다
   (complex-trade-window.ts 주석). 이 한 질의(계약월 인덱스 창, 상한 2,000행)만 더 나간다 —
   대표행(base)이 오는 즉시 띄워 본문 2차 파도와 나란히 돈다(직렬 파도 추가 0). kapt id·
   미설정은 null(모른다) — 0건으로 위장하지 않는다. */
const loadTradeWindow = cache((canonicalId: string) => getTradeWindowSamples(canonicalId));

/* [1009 · C] 매매 **한 건 단위**(계약일·층 포함) — 첫 화면 대표 실거래가·평형별 추이·최근 실거래 목록의 재료.
   loadTxHistory 가 이미 읽은 공용 행(complex-store loadTradeRowsShared, React cache)을 그대로 쓴다 — 추가 질의 0.
   키는 canonical_id(name-id) — kapt URL 로 열린 단지도 같은 행이다. */
const loadDeals = cache((canonicalId: string) => getComplexDeals(canonicalId));

/**
 * [1007 · P2] 허브의 facts 재료 — 전부 **이미 띄운** 로더에서 받는다(전월세 원표본·임장노트는
 * prefetchComplexSections 가 base 시점에 띄운 것과 같은 인자 → React cache 적중, 추가 왕복 0).
 * 실패·예산 초과는 null(모른다)로 넘긴다 — buildComplexFacts 가 "지금 불러오지 못했어요"로 적는다.
 */
async function loadHubFacts(args: {
  row: ComplexRow | null;
  complexId: string;
  name: string;
  city: string;
  dong: string;
}): Promise<ComplexFacts> {
  const region = sectionRegionLabel(args.city, args.dong);
  const [trades, rents, notes] = await Promise.all([
    args.row
      ? withSectionBudget(loadTradeWindow(args.row.canonical_id)).catch((): TradeSample[] | null => null)
      : Promise.resolve<TradeSample[] | null>(null),
    withSectionBudget(loadRentHistory(region, args.name)).then(
      /* 로더의 null 은 "24개월 신고 없음"(complex-rent.ts) — 원표본 [] 로. 던지면 모른다(null). */
      (hist): RentSample[] | null => hist?.samples ?? [],
      (): RentSample[] | null => null,
    ),
    withSectionBudget(loadHubInspectionNotes(args.complexId, args.name)).then(
      (r): ComplexNotesBrief | null =>
        r.failed
          ? null
          : {
              count: r.notes.length,
              latest: r.notes[0]
                ? { id: r.notes[0].id, title: r.notes[0].title, visitDate: r.notes[0].visitDate, decision: null }
                : null,
            },
      (): ComplexNotesBrief | null => null,
    ),
  ]);
  return buildComplexFacts({ complex: args.row, trades, rents, notes });
}

/** 위 두 loader 가 쓰는 실거래 이력 개월 수 — 메타데이터·본문이 반드시 같아야 한다.
 *  허브 밀도: 18→24개월 (패널 detail API 와 맞춤). */
const TX_HISTORY_MONTHS = 24;

interface HubView {
  id: string;
  name: string;
  /** 시군구(row.district) — 이름은 dong 이지만 "송파구" 다. 지역 라벨·지도 링크가 전부 이 값을 쓴다. */
  dong: string;
  /** 시/도 — JSON-LD addressRegion 용 (dong 은 시군구라 addressLocality) */
  city: string;
  /** [995] 읍면동("잠실동") — 대표행 address 에서 파싱. 못 뽑으면 null(지어내지 않는다). */
  emd: string | null;
  /** [995] "다른 단지" 블록 제목 — 동 단위로 찾았으면 "{읍면동} 다른 단지", 구로 물러섰으면 "{시군구} 다른 단지" */
  nearbyLabel: string;
  /** 총 세대수 — 대장 마스터에 매칭됐을 때만 값이 있다 */
  households: number | null;
  /** [1006 · E] 준공년 — 인용 요약 문장용(없으면 null, 문장에서 빠진다) */
  buildYear: number | null;
  metric: {
    /** 최근 **달** 실거래 평균(면적 혼합, eok1) — 메타데이터 제목·JSON-LD priceRange·FAQ 와 같은 값.
        [1009 · C] 첫 화면 대표가는 따로(HubPriceHero — 평형 기준). 이 값은 "월평균 · 면적 혼합"으로만 적는다. */
    price: string;
    priceSub: string;
    /** [1009 · C] 최근 달 "2026.08" — KPI 칸의 기준 달(없으면 null) */
    priceYm: string | null;
    listings: string;
    listingsSub: string;
    notes: string;
    notesSub: string;
    /** 최근 집계 기간 거래 건수 라벨 */
    deals: string;
    dealsSub: string;
    /** 준공/경과 라벨 */
    age: string;
    ageSub: string;
  };
  /** 상단 칩용 요약 스펙 */
  chips: string[];
  aiTitle: string;
  aiBody: string;
  /* [967 · 15] myRecord 문자열은 지웠다 — ISR HTML 은 방문자 공용이라 "로그인하면…"
     같은 개인 상태 문구를 서버가 그릴 수 없다. 내 기록 탭은 클라이언트가
     /api/me/complex-records 로 직접 읽는다. */
  listingsLabel: string;
  infoRows: { label: string; value: string }[];
  /** [1009 · C] 단지 정보 격자(네이버식) — 값이 있는 항목만 칸이 된다 */
  spec: ComplexInfoFacts;
  trades: HubTrade[];
  /** [970 · B-16] 집계 기간(trades 개월) 안의 실거래 **건수** 합 — 조회 실패면 null.
      trades.length 는 개월 수라 "실거래 N건"에 쓰면 틀린다. */
  dealCount: number | null;
  notes: HubNote[];
  /** 노트 조회가 실패했는지 — 빈 목록을 "없음"으로 단정하지 않기 위해 */
  notesFailed: boolean;
  /** 이 단지에 연결된 글 쓰기 (/town/write?complex=…) */
  notesWriteHref: string;
  listings: HubListing[];
  /** 실거래 월별 평균 시계열 (차트용 · 실데이터만) */
  priceSeries: PricePoint[];
  /** 내부 링크 그물(#34) — 같은 동 다른 단지 (0건이면 섹션 미표시) */
  nearby: { id: string; name: string; meta: string }[];
  /** 국토부 실거래 이력 상세(/complex/tx) — 동일 단지명 매칭 시에만 링크 */
  txHref: string | null;
  /** 지도 좌표 — 거리뷰·JSON-LD geo 용 (목업 폴백은 없음 → 거리뷰 자동 숨김) */
  lat?: number | null;
  lng?: number | null;
  /**
   * 이번 렌더에서 **조회에 실패한** 곁다리 섹션 이름들.
   *
   * 왜 필요한가: 이 화면은 실패를 전부 `.catch(() => [])` 로 삼키고 있었다.
   * 그러면 UI 가 "실매물 준비 중" · "시세 준비 중" 을 그린다 — 우리가 확인한
   * 사실이 아니다. 우리는 *못 읽었을* 뿐이다. 조회 실패는 데이터 없음이 아니다.
   */
  loadFailures: string[];
}

/* ===== 실데이터 변환 (map/page.tsx 방식) =====
   formatManwon·pctDelta·deltaLabel·toTrades 는 [967 · 16] 에서
   lib/complex/hub-trades.ts 로 옮겼다(클라이언트 필터와 같은 구현). */

/** 부스트 활성 여부 (만료·null 은 false) */
function isBoostActive(boostUntil: string | null): boolean {
  if (!boostUntil) return false;
  const t = Date.parse(boostUntil);
  return Number.isFinite(t) && t > Date.now();
}

/** 매물 가격 라벨 (WON → 매매/전세/월세). 값 없으면 "—". */
function listingPriceLine(l: PublicListing): string {
  if (l.listingType === "monthly") {
    return `월세 ${formatManwon((l.depositKrw ?? 0) / 1e4)}/${formatManwon((l.monthlyKrw ?? 0) / 1e4)}`;
  }
  const krw = l.listingType === "sale" ? l.priceKrw : l.depositKrw;
  return `${LISTING_TYPE_LABEL[l.listingType]} ${formatManwon((krw ?? 0) / 1e4)}`;
}

/** PublicListing → HubListing (허브 매물 탭 카드). D8: 빈 탭에 실 매물 연결. */
function toHubListing(l: PublicListing): HubListing {
  const boost = isBoostActive(l.boostUntil);
  const meta =
    [
      l.areaM2 != null ? `전용 ${l.areaM2}㎡` : null,
      l.floor != null ? `${l.floor}층` : null,
      l.regionName,
    ]
      .filter(Boolean)
      .join(" · ") || "실매물";
  return {
    /* [967 · 18] React key — 같은 가격의 매물이 둘이면 price 키가 충돌한다 */
    id: l.id,
    badge: LISTING_TYPE_LABEL[l.listingType],
    urgent: boost,
    price: listingPriceLine(l),
    priceNote: boost ? "부스트" : l.ownerVerified ? "소유확인" : null,
    meta,
    agent: l.authorLabel,
  };
}

interface ComplexPostRow {
  id: string;
  title: string;
  created_at: string;
  district: string | null;
  city: string | null;
  like_count: number | null;
  comment_count: number | null;
  view_count: number | null;
}

/* 내부 링크 그물(#34): 같은 동(district) 단지 조회 → 카드 데이터.
   [995] 자기 자신 제외는 canonical_id 로도 본다 — kapt 매칭 단지는 id 가 `kapt.…` 인데
   목록 행은 name-id 라 id 비교만으로는 자기 단지가 "다른 단지"에 섞였다. */
function toNearby(rows: ComplexRow[], selfId: string, selfCanonicalId?: string): HubView["nearby"] {
  return rows
    .filter((c) => c.id !== selfId && (!selfCanonicalId || c.canonical_id !== selfCanonicalId))
    .slice(0, 8)
    .map((c) => {
      const parts: string[] = [];
      if (c.build_year) parts.push(`${c.build_year}년`);
      if (c.households) parts.push(`${c.households.toLocaleString("ko-KR")}세대`);
      if (c.parking_per_hh) parts.push(`주차 ${c.parking_per_hh}`);
      return {
        id: c.id,
        name: c.name,
        meta: parts.length > 0 ? parts.join(" · ") : `${c.city} ${c.district}`.trim(),
      };
    });
}

/* [995] 같은 동 단지가 이보다 적으면(자기 제외) 구 단위로 물러선다 — 동 안에 거래
   이력 단지가 한두 곳뿐이면 "다른 단지" 블록이 너무 비어 내부 링크 구실을 못 한다. */
const NEARBY_DONG_MIN = 3;

type NearbyScope = "dong" | "district";

/**
 * [995] "다른 단지" 후보 — 읍면동이 있으면 **동 단위를 먼저** 묻고, 자기 제외 3곳
 * 미만일 때만 구 단위를 한 번 더 묻는다. 즉 평소엔 예전과 같은 왕복 1회, 동이
 * 작을 때만 +1회. 둘 다 complex_tx_stats_base(단지 단위 매트뷰) 조회라 3~4ms 다.
 */
async function loadNearbyRows(
  row: ComplexRow,
  emd: string | null,
  signal: AbortSignal,
): Promise<{ rows: ComplexRow[]; scope: NearbyScope }> {
  if (!row.district) return { rows: [], scope: "district" };
  if (emd) {
    const inDong = await listComplexesInDong(row.district, emd, 9, signal);
    const others = inDong.filter((c) => c.canonical_id !== row.canonical_id).length;
    if (others >= NEARBY_DONG_MIN) return { rows: inDong, scope: "dong" };
  }
  return { rows: await listComplexesInDistrict(row.district, 9, signal), scope: "district" };
}

/**
 * 서울 단지 — /complex/tx 상세 링크. **DB 를 다시 읽지 않는다.**
 *
 * 예전에는 여기서 listComplexTransactions(row.name, region, 1) 을 한 번 더 던져
 * "이 단지 실거래가 있나"를 확인했다. 같은 렌더에서 loadTxHistory 가 이미 같은
 * 단지의 market_transactions 를 읽고 있는데도 왕복이 하나 더 나갔고, 서울 단지는
 * 트래픽의 대부분이라 그 왕복이 매 렌더마다 붙었다.
 *
 * 대신 이미 읽은 실거래(txRows)로 판정한다. 두 질의의 조건이 포함관계라서
 * 성립한다 — getTransactionHistory 쪽이 /complex/tx 쪽의 **부분집합**이다:
 *   - complex_name  : 양쪽 같은 등치
 *   - region_name   : 이쪽은 dec.region("서울 OO구") 등치, 저쪽은
 *                     transactionRegionCandidates → ["OO구", "서울 OO구"] 중 하나.
 *                     city/district 는 splitRegion(dec.region) 에서 나오므로
 *                     `${city} ${district}` === dec.region 이 항상 참이다.
 *   - transaction_type='trade' · is_cancelled=false : 양쪽 같음
 *   - property_type='apartment' : 저쪽에만 있지만, market_transactions 에
 *                     행을 넣는 유일한 경로(lib/market/molit-transactions.ts)가
 *                     이 값을 상수로 박아 넣는다(실측 654,815행 전부 apartment).
 *   - deal_amount   : 이쪽 > 0 ⊂ 저쪽 not null
 * 즉 실거래가 1건이라도 잡혔으면 /complex/tx 페이지도 반드시 1건 이상을 본다 —
 * 죽은 링크(그 페이지는 0건이면 notFound)를 내보낼 일이 없다.
 */
function txDetailHref(row: ComplexRow, txRows: ComplexTransactionRow[]): string | null {
  if (txRows.length === 0) return null;
  if (!row.city?.startsWith("서울")) return null;
  const region = SEOUL_BROWSE_REGIONS.find((r) => r.name === row.district?.trim());
  if (!region) return null;
  return `/complex/tx/${buildComplexTxSlug(row.name, region.id)}`;
}

function toView(
  row: ComplexRow,
  /* [967 · 16] 면적대 분할(bands)이 실린 월별 행 — 시세 탭 필터 재료 */
  tx: ComplexTransactionRowWithBands[],
  posts: ComplexPostRow[],
  nearby: HubView["nearby"],
  txHref: string | null,
  listingRows: PublicListing[] = [],
  /** 조회에 실패한 섹션 이름 — "없음"과 "못 읽음"을 다른 문장으로 그리기 위해 */
  loadFailures: string[] = [],
  /** [995] 읍면동(파싱 결과)과 "다른 단지" 조회 범위 */
  place: { emd: string | null; nearbyScope: NearbyScope } = { emd: null, nearbyScope: "district" },
): HubView {
  const txFailed = loadFailures.includes("실거래");
  const listingsFailed = loadFailures.includes("매물");
  const postsFailed = loadFailures.includes("단지 이야기");
  const latest = tx.length > 0 ? tx[tx.length - 1] : null;
  /* [1009 · C 리뷰] 여기서 만들던 "▲ 15.8% 전월비"(면적 혼합 월평균끼리, 거래 있던 앞 달과의 비교)를 걷었다 — FAQ·요약 폴백에
     실려 첫 화면 대표가("29억 6,750만원 ▼0.8%")와 다른 말을 했다. 월평균은 "면적 혼합"이라고만 적는다. */
  const txRange = tx.length > 0 ? ymRangeShort(tx[0].yyyymm, tx[tx.length - 1].yyyymm) : null;
  const dong = row.district || row.city || "지역";
  /* [995] 동 단위로 찾았을 때만 동 이름을 제목에 쓴다 — 구 결과에 동 라벨을 붙이면 거짓말이다 */
  const nearbyLabel =
    place.nearbyScope === "dong" && place.emd ? `${place.emd} 다른 단지` : `${dong} 다른 단지`;
  // D8: 이 단지 실 매물(승인) 연결 — 없으면 빈 배열(클라이언트가 안내 문구 표시)
  const hubListings = listingRows.map(toHubListing);
  // 사실 우선: 실거래 데이터가 없으면 목업 대신 빈 배열(클라이언트가 안내 문구 표시)
  const trades = tx.length > 0 ? toHubTrades(tx) : [];
  // 차트용 월별 평균 시계열 (tx는 과거→최신 정렬) — 실데이터만
  const priceSeries: PricePoint[] = tx.map((r) => ({
    ym: r.yyyymm,
    avgManwon: r.avg_manwon,
    dealCount: r.deal_count,
  }));
  const notes: HubNote[] =
    posts.length > 0
      ? posts.slice(0, 12).map((p) => {
          const eng = [
            `공감 ${p.like_count ?? 0}`,
            p.comment_count != null && p.comment_count > 0
              ? `댓글 ${p.comment_count}`
              : null,
            p.view_count != null && p.view_count > 0 ? `조회 ${p.view_count}` : null,
          ]
            .filter(Boolean)
            .join(" · ");
          return {
            /* [967 · 18] React key — 제목이 같은 글이 둘이면 title 키가 충돌한다 */
            id: p.id,
            title: p.title,
            author: `${p.district ?? dong} · ${p.created_at.slice(5, 10).replace("-", ".")}`,
            score: eng || `공감 ${p.like_count ?? 0}`,
          };
        })
      : [];

  const dealSum = tx.reduce((s, r) => s + (r.deal_count || 0), 0);
  const chips: string[] = [];
  if (row.build_year) {
    chips.push(
      `${row.build_year}년 · ${new Date().getFullYear() - row.build_year}년차`,
    );
  }
  if (row.households) chips.push(`${row.households.toLocaleString("ko-KR")}세대`);
  if (row.building_count) chips.push(`${row.building_count}동`);
  if (row.parking_per_hh) chips.push(`주차 ${row.parking_per_hh}대/세대`);
  if (row.builder_name) chips.push(row.builder_name);
  if (row.heating) chips.push(row.heating);
  if (hubListings.length > 0) chips.push(`매물 ${hubListings.length}`);
  if (posts.length > 0) chips.push(`이야기 ${posts.length}`);
  /* [1009 · C 리뷰] "N개월"의 N 은 거래 있는 달 수였다 — 실제 계약월 범위로("26.01~26.08 134건") */
  if (dealSum > 0 && txRange) chips.push(`${txRange} ${dealSum}건`);

  const infoRows: { label: string; value: string }[] = [];
  if (row.build_year) {
    const age = new Date().getFullYear() - row.build_year;
    infoRows.push({ label: "준공", value: `${row.build_year}년 (경과 ${age}년)` });
  }
  if (row.households)
    infoRows.push({ label: "세대수", value: `${row.households.toLocaleString("ko-KR")}세대` });
  if (row.building_count)
    infoRows.push({ label: "동 수", value: `${row.building_count.toLocaleString("ko-KR")}동` });
  if (row.parking_count)
    infoRows.push({ label: "주차", value: `${row.parking_count.toLocaleString("ko-KR")}대` });
  if (row.parking_per_hh)
    infoRows.push({ label: "세대당 주차", value: `${row.parking_per_hh}대` });
  if (row.builder_name) infoRows.push({ label: "시공사", value: row.builder_name });
  if (row.heating) infoRows.push({ label: "난방", value: row.heating });
  /* [1009 · C] "유형"(building_type)은 데이터가 아니라 상수("아파트" — 실거래 적재가 아파트만 받는다)라 뺐다 */
  if (row.total_floors) infoRows.push({ label: "층수", value: `${row.total_floors}층` });
  if (row.kapt_code) infoRows.push({ label: "단지코드", value: row.kapt_code });
  infoRows.push({
    label: "주소",
    value: row.road_address || row.address || `${row.city} ${row.district}`.trim(),
  });

  return {
    id: row.id,
    name: row.name,
    dong,
    city: row.city,
    emd: place.emd,
    nearbyLabel,
    households: row.households,
    buildYear: row.build_year ?? null,
    metric: {
      /* 실패와 없음을 절대 같은 문장으로 그리지 않는다.
         "시세 준비 중" 은 "아직 쌓이지 않았다"는 뜻이고, 조회 실패에 그 문장을
         쓰면 방문자에게 거짓말이 된다. */
      /* [1009 · C] "시세 준비 중" → "실거래 없음" — 실거래만 있는 화면에 "시세"라는 말을 쓰지 않는다(표기 표준) */
      price: txFailed ? "조회 실패" : latest ? formatManwon(latest.avg_manwon) : "실거래 없음",
      priceSub: txFailed
        ? "실거래를 불러오지 못했습니다"
        : latest
          ? "월평균 · 면적 혼합"
          : "실거래 수집 중",
      priceYm: latest ? `${latest.yyyymm.slice(0, 4)}.${latest.yyyymm.slice(4, 6)}` : null,
      // D8: 실 매물 연동 — 등록 건수 반영(없으면 "—", 못 읽었으면 그렇다고 적는다)
      listings: listingsFailed ? "매물 ?" : hubListings.length > 0 ? `매물 ${hubListings.length}` : "매물 —",
      listingsSub: listingsFailed
        ? "조회 실패"
        : hubListings.length > 0
          ? "등록된 실매물"
          : "등록 대기",
      /* [970 · B-17] 이 KPI 는 동네이야기 글 수다 — 탭 라벨("이야기")과 맞춘다 */
      notes: postsFailed ? "이야기 ?" : `이야기 ${posts.length.toLocaleString("ko-KR")}`,
      notesSub: postsFailed
        ? "조회 실패"
        : posts.length > 0
          ? "동네이야기 글"
          : "첫 이야기를 남겨보세요",
      deals: txFailed ? "거래 ?" : dealSum > 0 ? `${dealSum}건` : "—",
      /* [1009 · C] "최근 N개월"의 N 은 **거래가 있는 달 수**였다(3개 달에 거래가 흩어진 단지도 "최근 3개월").
         실제로 센 계약월 범위를 적는다 — "26.01~26.08" */
      dealsSub: txFailed ? "조회 실패" : dealSum > 0 && txRange ? txRange : "실거래 없음",
      age: row.build_year
        ? `${new Date().getFullYear() - row.build_year}년`
        : "—",
      ageSub: row.build_year ? `${row.build_year}년 준공` : "준공 미확인",
    },
    chips,
    aiTitle: `AI 요약 · ${row.name}`,
    aiBody: txFailed
      ? "실거래를 지금 불러오지 못했습니다. 데이터가 없다는 뜻이 아니라 조회에 실패했다는 뜻입니다 — 잠시 후 새로고침해 주세요."
      : latest
        ? [
            /* [1009 · C 리뷰] 대표가를 못 세웠을 때만 쓰는 폴백 — 무엇의 평균인지 적고 혼합 전월비는 싣지 않는다 */
            `${latest.yyyymm.slice(0, 4)}.${latest.yyyymm.slice(4, 6)} 실거래 평균 ${formatManwon(latest.avg_manwon)}(면적 혼합${
              latest.deal_count ? ` · ${latest.deal_count}건` : ""
            })`,
            row.households ? `총 ${row.households.toLocaleString("ko-KR")}세대` : null,
            row.build_year ? `${row.build_year}년 준공` : null,
            row.builder_name ? `시공사 ${row.builder_name}` : null,
            "국토교통부 실거래·공공데이터 기준. 투자 권유가 아니며 현장 확인 후 판단하세요.",
          ]
            .filter(Boolean)
            .join(" · ")
        : "실거래가 쌓이면 여기에 요약을 보여 드려요.",
    listingsLabel: listingsFailed
      ? "매물 정보를 지금 불러오지 못했습니다 — 등록된 매물이 없다는 뜻이 아닙니다."
      : hubListings.length > 0
        ? `등록된 실매물 ${hubListings.length}건 · 국토부 실거래가와 비교하세요`
        : "실매물 준비 중",
    infoRows,
    spec: {
      households: row.households,
      buildingCount: row.building_count,
      parkingCount: row.parking_count,
      parkingPerHh: row.parking_per_hh,
      heating: row.heating,
      builder: row.builder_name,
      buildYear: row.build_year ?? null,
      roadAddress: row.road_address,
      address: row.address,
      kaptCode: row.kapt_code,
    },
    trades,
    dealCount: txFailed ? null : dealSum,
    notes,
    notesFailed: postsFailed,
    notesWriteHref: `/town/write?complex=${encodeURIComponent(row.id)}&complexName=${encodeURIComponent(
      row.name,
    )}`,
    priceSeries,
    // D8: 이 단지 실 매물(승인) 연결
    listings: hubListings,
    nearby,
    txHref,
    lat: row.lat,
    lng: row.lng,
    loadFailures,
  };
}

async function loadView(id: string): Promise<HubView | null> {
  // 사실 우선: 존재하지 않는 단지는 목업 대신 null → notFound()
  const t0 = Date.now();
  const base = await loadComplexBase(id);
  if (!base) return null;
  const tBase = Date.now();
  const dec = decodeComplexId(id);

  /* [949] 대표행(base)만 있으면 시작할 수 있는 섹션 조회에 지금 불을 붙인다.
     결과는 섹션 컴포넌트가 같은 로더로 받는다(section-loaders.ts). */
  prefetchComplexSections({
    complexId: id,
    name: base.name,
    city: base.city,
    district: base.district,
  });

  /* enrich(대장 마스터)는 곁다리 조회와 나란히 돈다. 곁다리 중 row.id 를 쓰는
     단지 이야기(getComplexPosts)만 enrich 결과를 기다린다 — kapt 매칭이 되면
     id 가 kapt 형태로 바뀌고 글은 그 id 로 묶여 있기 때문이다.
     주의: enrichComplexRow 는 base 객체를 **제자리에서** 채운다(applyMasterEnrich) —
     그래서 base 와 enriched 는 같은 참조이고, 아래에서 base.id 를 "enrich 전 값"으로
     쓰면 안 된다. 축 요약 키(kapt 형태일 수 있는 id)는 enrich 가 끝나는 순간 띄운다. */
  const rowP = loadComplexRow(id);
  void rowP.then((r) => {
    if (r) prefetchAxisSummary({ rowId: r.id, city: r.city, district: r.district });
  }).catch(() => undefined);
  const row: ComplexRow = base; // name·district·canonical_id·address 는 enrich 가 바꾸지 않는다
  /* [995] 읍면동 — address 문자열에서만 얻을 수 있다(대표행에 컬럼이 없다). 메타데이터도
     같은 함수로 같은 값을 만든다(순수 함수라 캐시가 필요 없다). */
  const emd = parseDong(row.address);

  /* 곁다리가 **함께** 쓰는 예산 — [968 · 1] 실거래(히어로) 8초 · 나머지 넷 3초.
     예전에는 각 조회가 `.catch(() => [])` 로 실패를 빈 배열로 바꿔서
     "없다"고 그렸고, 느릴 때는 각자 읽기 타임아웃(25초)을 꽉 채워 페이지가
     통째로 매달렸다. 이제 늦거나 실패한 섹션만 접고 페이지는 제때 그린다. */
  const heroBudget = startDeadline(SIDE_SECTION_BUDGET_MS);
  const budget = startDeadline(SIDE_QUERY_BUDGET_MS);
  /* 항목 25: budget.signal 을 로더에 넘겨, 예산 초과로 접힌 섹션의 PostgREST
     요청이 실제로 끊기게 한다(안 끊으면 최대 45초 더 살아 연결을 붙잡는다).
     loadTxHistory 는 React cache() 로 렌더 내 재사용(아래 tx 재호출)되므로
     signal 을 받지 않는다 — 인자에 신호를 섞으면 dedupe 키가 깨진다. */
  const [enriched, txR, postsR, sameDongR, coordR, listingsR] = await Promise.all([
    rowP,
    /* canonical_id 를 쓴다 — row.id 는 kapt 매칭 시 `kapt.A10027336` 이 되는데
       getTransactionHistory 는 decodeComplexId 로 시작하고 그 함수는 kapt id 에
       null 을 준다. 그래서 실거래가 160~212건 있는 단지가 조용히 빈 배열을 받아
       "실거래 없음 · 시세 준비 중"으로 그려지고 있었다(2026-08-05 표본 12개 중 6개).
       canonical_id 는 항상 name-id 라 decode 가 반드시 성공한다. */
    settle(`${row.name} 실거래 이력`, loadTxHistory(row.canonical_id, TX_HISTORY_MONTHS), heroBudget.expired),
    settle(
      `${row.name} 단지 이야기`,
      rowP.then((r) => getComplexPosts((r ?? row).id, 12, budget.signal)),
      budget.expired,
    ),
    // #34: 같은 동 다른 단지 — 자기 자신 제외분 확보 위해 더 넓게.
    // [995] 읍면동 먼저, 3곳 미만이면 구로 물러선다(loadNearbyRows).
    row.district
      ? settle(
          `${row.district}${emd ? ` ${emd}` : ""} 인근 단지`,
          loadNearbyRows(row, emd, budget.signal),
          budget.expired,
        )
      : Promise.resolve({
          ok: true as const,
          data: { rows: [] as ComplexRow[], scope: "district" as NearbyScope },
        }),
    // 좌표 지연 지오코딩(캐시) — 거리뷰·JSON-LD geo 용. 실패 시 좌표 없이 진행.
    dec
      ? settle(
          `${row.name} 좌표`,
          geocodeAndCache(dec.region, dec.name, row.address ?? undefined),
          budget.expired,
        )
      : Promise.resolve({ ok: true as const, data: null }),
    // D8: 이 단지명으로 등록된 승인 매물 (정확 일치)
    settle(
      `${row.name} 등록 매물`,
      listApprovedListings({ complexName: row.name, signal: budget.signal }),
      budget.expired,
    ),
  ]);
  budget.done();
  heroBudget.done();
  /* [949 · 계측] 본문 파도 시간 — 대표행(base)과 enrich+곁다리 파도를 따로 잰다.
     느린 렌더(600ms↑)는 전부, 나머지는 5% 표본만 남긴다. ISR 미스의 TTFB 는
     이 두 파도 + 섹션 파도이므로, 배포 뒤 이 로그로 "어느 파도가 남았는지"를 읽는다. */
  const tSides = Date.now();
  if (tSides - t0 >= 600 || Math.random() < 0.05) {
    // logger.info 는 운영에서 침묵한다(lib/log.ts) — 이 줄은 운영 로그가 목적이다.
    console.info(
      `[complex-timing] base=${tBase - t0}ms wave2=${tSides - tBase}ms total=${tSides - t0}ms ` +
        `fail=${[txR, postsR, sameDongR, coordR, listingsR].filter((r) => !r.ok).length} id=${id.slice(0, 40)}`,
    );
  }
  const rowFinal: ComplexRow = enriched ?? row;

  /* 껍데기를 캐시에 얼리지 않는다 (/region/[id] 의 SIDE_FAILURE_ABORT_THRESHOLD
     와 같은 판단). 한두 섹션이 늦는 것은 평상시에도 있는 일이고 그때는 아래
     문구들이 "조회 실패"라고 정직하게 말해 준다. 하지만 5개 중 4개가 한꺼번에
     실패했다면 그건 섹션 문제가 아니라 DB 가 내려간 것이고, 그렇게 만들어진
     빈 화면이 revalidate=120 으로 2분간 고정된다. 5xx 는 캐시되지 않으므로
     던지는 쪽이 정확하다 — "지금은 못 준다"가 "이 단지는 원래 비어 있다"보다
     참이다. */
  /* [968 · 1] 예산이 5초로 짧아졌으니 "4개 실패"에는 5초를 넘긴 것도 든다. DB 가
     5~8초로 느린 동안엔 예전처럼 늦게라도 완성본을 내는 대신 5xx(캐시 안 됨)가
     난다 — 그 상태의 반쪽짜리 페이지가 6시간 얼어붙는 것보다 낫다는 같은 판단이다. */
  const sideResults = [txR, postsR, sameDongR, coordR, listingsR];
  const sideFailures = sideResults.filter((r) => !r.ok).length;
  if (sideFailures >= SIDE_FAILURE_ABORT_THRESHOLD) {
    throw new Error(
      `[/complex/${id}] 곁다리 섹션 ${sideResults.length}개 중 ${sideFailures}개 조회 실패 — ` +
        "빈 껍데기를 캐시에 남기지 않기 위해 렌더를 중단합니다",
    );
  }

  /* 실패한 섹션 이름을 뷰까지 들고 간다 — toView 가 "없음"과 "못 읽음"을
     다른 문장으로 그릴 수 있도록. 좌표·링크는 없어도 화면이 조용히 줄어들
     뿐이라(거리뷰 숨김 등) 문구로 알릴 것이 없어 목록에 넣지 않는다. */
  const loadFailures: string[] = [];
  if (!txR.ok) loadFailures.push("실거래");
  if (!postsR.ok) loadFailures.push("단지 이야기");
  if (!listingsR.ok) loadFailures.push("매물");

  const coord = coordR.ok ? coordR.data : null;
  const located: ComplexRow = coord ? { ...rowFinal, lat: coord.lat, lng: coord.lng } : rowFinal;
  const nearbyRows = sameDongR.ok ? sameDongR.data.rows : [];
  return toView(
    located,
    txR.ok ? txR.data : [],
    postsR.ok ? postsR.data : [],
    toNearby(nearbyRows, located.id, located.canonical_id),
    txDetailHref(located, txR.ok ? txR.data : []),
    listingsR.ok ? listingsR.data : [],
    loadFailures,
    { emd, nearbyScope: sameDongR.ok ? sameDongR.data.scope : "district" },
  );
}

/** [1009 · C 리뷰] 월별 줄(전체)마다 등락 기준 — 앞 줄이 전달이면 "전월 대비", 가운데 달이 비었으면 "26.02 대비" */
function tradeDeltaViews(trades: HubTrade[]): Record<string, MonthDeltaView> {
  const bases = tradeDeltaBases(trades, ALL_BANDS);
  const out: Record<string, MonthDeltaView> = {};
  for (const t of trades) out[t.ym] = monthDeltaView(t.ym, bases.get(t.ym));
  return out;
}

/* ===== SEO — 단지명 title/description, 비로그인 열람 허용 (index 대상) ===== */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id: rawId } = await params;
  /* [#51] 슬러그 장식 제거 — 조회 계층은 언제나 순수 id 만 받는다
     (장식이 섞인 id 가 decodeComplexId 에 들어가면 "없음"으로 위장된다). */
  const id = pureIdFromParam(decodeURIComponent(rawId));
  /* 사실 우선: 존재하지 않는 단지는 목업 메타 대신 noindex 안내.
     여기 try/catch 로 실패를 null 로 바꾸던 자리다. getComplexById 는 없는
     단지에만 null 을 주고 조회 실패는 던지도록 일부러 만들어졌는데(그 함수
     주석 참고), 그 설계를 이 catch 가 되돌리고 있었다 — 실재하는 단지가
     장애 몇 초 때문에 "찾을 수 없습니다" + noindex,nofollow 로 나갔다.
     이제 던지게 둔다: 본문과 똑같이 5xx 가 되고, 크롤러는 "나중에 다시 오라"로
     읽는다. 404·noindex 는 정말 없는 단지에만 남는다. */
  const row: ComplexRow | null = await loadComplexRow(id);
  if (!row) {
    /* ⚠ 알려진 한계(2026-08-10 실측): loading.tsx 스트리밍 때문에 없는 단지도
       HTTP 200 으로 나간다(소프트 404). generateMetadata 의 notFound() 로도
       상태 코드를 바꿀 수 없음을 봇 UA 포함으로 확인했다 — 200 이 먼저 커밋된다.
       noindex 가 색인 유입을 막고 있으므로 당장의 방어는 유효하다. 진짜 404 를
       원하면 loading 경계 위에서 존재 확인이 필요하다(구조 변경 — 워크오더). */
    return {
      title: "단지를 찾을 수 없습니다 | 내집나우",
      description: "요청하신 단지 정보를 찾을 수 없습니다.",
      robots: { index: false, follow: false },
    };
  }

  const name = row.name;
  const region = `${row.city} ${row.district}`.trim() || "지역";
  /* [995] 읍면동 — 본문(loadView)과 같은 순수 함수·같은 address 라 값이 같다 */
  const emd = parseDong(row.address);
  /* [1009 · C] "시세 준비 중" → "실거래 없음" — 첫 화면과 같은 말(실거래만 있는 곳에 "시세" 낱말을 쓰지 않는다).
     이 값은 거래 없는 단지의 공유 카드(OG 이미지 쿼리)에 그대로 실린다. */
  let price = "실거래 없음";
  let delta = "";
  /* .catch(() => []) 로 삼키던 자리다. 실패하면 price 가 "시세 준비 중"으로
     남고 그 문자열이 OG 이미지 쿼리에 그대로 실려, 공유 카드가 "아직 시세를
     안 만들었다"고 단정했다 — 사실은 못 읽은 것뿐이다. 본문도 실패하면 던지므로
     메타데이터도 똑같이 던진다. */
  /* 본문(line ~527)과 **반드시 같은 인자**여야 한다 — loadTxHistory 는 cache() 라
     인자가 다르면 렌더 안에서 두 번 조회하고, 메타데이터와 본문이 다른 값을 말한다.
     canonical_id 를 쓰는 이유는 본문 쪽 주석 참고. */
  /* [995] 면적대는 본문이 base 시점에 띄우는 섹션 로더(loadAreaBands, React cache)를
     같은 인자(순수 id)로 부른다 — 추가 질의 없이 같은 약속을 받는다. 3초 공유 예산을
     넘기거나 실패하면 null 로 접고 설명에서 평형 숫자만 뺀다(실패 로그는 섹션
     컴포넌트 ComplexAreaBands 가 한 번 남긴다 — 여기서 또 적지 않는다).
     실거래(8초 예산)와 나란히 기다리므로 메타데이터 해석 시간은 늘지 않는다. */
  /* [1009 · C] 한 건 단위 매매(loadDeals)도 같이 — 제목·설명·공유 카드의 숫자를 첫 화면 대표가와 맞춘다.
     본문과 같은 인자(canonical_id)라 React cache 적중이고, 행은 loadTxHistory 가 읽은 공용 행이라 추가 질의 0.
     실패·예산 초과는 null → 예전 월평균 문구로 접는다(메타데이터 때문에 페이지가 실패하지 않게). */
  const [tx, bands, metaDeals]: [ComplexTransactionRow[], AreaBandRow[] | null, HubDeal[] | null] =
    await Promise.all([
      loadTxHistory(row.canonical_id, TX_HISTORY_MONTHS),
      withSectionBudget(loadAreaBands(id)).then(
        (d) => d,
        () => null,
      ),
      withSectionBudget(loadDeals(row.canonical_id)).then(
        (d) => d,
        (): HubDeal[] | null => null,
      ),
    ]);
  const latest = tx.length > 0 ? tx[tx.length - 1] : null;
  /** "▲ 1.2%" — 보합·비교 불가면 "" (설명 문장·OG 카드가 각자 조립) */
  let deltaPct = "";
  if (latest) {
    /* [1009 · C 리뷰] 대표가가 없을 때의 폴백 — 그 달 평균(면적 혼합)만. 예전엔 "▲ 15.8% 전월비"를 붙였는데, 면적 혼합
       평균끼리이고 앞 달이 비면 두세 달 전과의 비교였다(월별 줄 기준 달 주석 — lib/complex/month-delta). */
    price = formatManwon(latest.avg_manwon);
  }
  /* [1009 · C] 제목·설명·공유 카드 = 첫 화면 대표가(HubPriceHero 와 같은 hubHeadline). 예전 값은 "그 달 평형 혼합 평균 ·
     혼합 평균끼리의 전월비"라, 실측 헬리오시티 공유 카드가 "30.9억 ▲ 15.8% 전월비"(8월 4건 84·110㎡ vs 7월 11건 39·59㎡ 포함)
     인데 들어오면 첫 화면은 "29억 6,750만원 ▼0.8%"였다 — 방향까지 반대. 대표가가 없으면(한 건 목록이 비었거나 실패) 예전 문구. */
  const head: HubHeadline | null =
    latest && metaDeals && metaDeals.length > 0
      ? hubHeadline(metaDeals, new Date(), { capped: metaDeals.length >= COMPLEX_DEALS_ROW_CAP })
      : null;
  /** 제목·설명 괄호 — 이 가격이 무엇의 값인지(lib/complex/hub-meta, 테스트 hub-price-1009) */
  let titleNote: string | null = null;
  let descNote: string | null = null;
  /** 공유 카드 큰 숫자 — 언제나 짧은 표기(한 건의 정밀 표기는 카드에서 두 줄로 떨어진다) */
  let ogPrice: string | null = null;
  if (head) {
    const m = hubMetaPrice(head);
    price = m.price;
    ogPrice = m.ogPrice;
    deltaPct = m.deltaPct;
    delta = m.ogDelta;
    titleNote = m.titleNote;
    descNote = m.descNote;
  }

  /* [945 · 실사용50 #24] 타이틀에 최신 실거래가·시점 — 검색결과에서
     "잠실엘스 실거래가"를 찾는 사람에게 클릭 전에 답의 존재를 보여준다.
     값은 위에서 이미 읽은 월별 집계의 최신월 평균(추가 조회 없음) — 시점을
     같이 적어 오래된 값이 현재가로 읽히지 않게 한다. 거래 없는 단지는
     수치 없는 기본 타이틀(없는 값을 타이틀에 지어내지 않는다).
     [1009 · C] 대표가(head)가 있으면 제목 괄호는 "84㎡ 26.7~8월 6건 평균"(titleNote), 없을 때만 이 월평균·최신월. */
  const ymLabel = ymShortLabel(latest?.yyyymm);
  /* [995] 검색 의도 "단지명 시세/실거래/평형" — 제목에 읍면동·평형, 설명에 최근 12개월
     건수·평형별 최근가·세대수·준공을 싣는다. 값이 없는 조각은 통째로 뺀다("undefined"·
     빈 괄호 금지). 12개월 창은 오늘(KST) 기준 달력이다 — 거래가 있는 달만 행으로
     오므로 "마지막 12행"이 아니라 달력으로 센다(countDealsInWindow). */
  const now = kstParts(Date.now());
  const nowYm = now ? `${now.year}${String(now.month).padStart(2, "0")}` : "";
  const n12 = countDealsInWindow(tx, nowYm, 12);
  const bandsText = areaBandTitle(bands, bandPriceLabel, 2);
  const emdPrefix = emd ? `${emd} ` : "";
  const titleParen = titleNote ?? ymLabel;
  const title = latest
    ? `${name} 실거래가 ${price}${titleParen ? ` (${titleParen})` : ""} · ${emdPrefix}시세·평형별 실거래 | 내집나우`
    : `${name} ${emdPrefix}시세·매물·임장노트 | 내집나우`;
  const placeLabel = `${region}${emd ? ` ${emd}` : ""}`;
  const priceNote = [ymLabel ? `${ymLabel} 신고분` : null, deltaPct ? `전월비 ${deltaPct}` : null]
    .filter(Boolean)
    .join(", ");
  const description = latest
    ? [
        descNote
          ? `${placeLabel} ${name} 최근 실거래가 ${price}(${descNote})`
          : `${placeLabel} ${name} 최신 실거래 평균 ${price}${priceNote ? `(${priceNote})` : ""}`,
        n12 > 0 ? `최근 12개월 ${n12}건` : null,
        `평형별 ${bandsText || "실거래"}`,
        row.households ? `${row.households.toLocaleString("ko-KR")}세대` : null,
        row.build_year ? `${row.build_year}년 준공` : null,
        "이웃 임장노트",
      ]
        .filter(Boolean)
        .join(" · ") + "."
    : `${placeLabel} ${name} 단지 홈 — 실거래 시세, 매물, 이웃 임장노트, 안전 진단을 한 화면에서 확인하세요.`;
  // 동적 OG 이미지 — 실데이터 값 URL 인코딩 (metadataBase 기준 절대화)
  // [995] 지역 줄에 읍면동까지("서울 송파구 잠실동") — 카드 템플릿은 그대로다.
  const ogQuery = new URLSearchParams({ name, price: ogPrice ?? price, region: placeLabel });
  if (delta) ogQuery.set("delta", delta);
  /* [997] 평형별 최근가 칩(설명과 같은 2개) — 공유 카드에서도 검색 의도("평형")에 답한다 */
  if (bandsText) ogQuery.set("bands", bandsText.split(" · ").slice(0, 3).join("|"));
  const ogImageUrl = `/api/og/complex?${ogQuery.toString()}`;

  // G6: 단지 허브는 사이트맵 URL 의 대부분(2.5만 건)을 차지하는 롱테일 랜딩이다.
  // canonical 이 없으면 `?utm_...`·중복 진입 경로마다 별개 URL 로 색인돼 신호가 쪼개진다.
  //
  // N-fix(2026-08-05): 여기서 `row.id` 를 쓰고 있었다. kapt 매칭이 되면 id 가
  // `kapt.A10027336` 으로 바뀌는데, 사이트맵은 (region_name, complex_name) 만 가진
  // 집계 MV 에서 만들어져 그 형태를 낼 수 없다. 그래서 제출 URL 과 canonical 이
  // 갈라졌고, 구글은 제출 URL 을 "대체 페이지(적절한 표준 태그 있음)"로 처리해
  // 색인하지 않았다. 실측 30%(약 7,700개 URL).
  // canonical_id 는 kapt 매칭 여부와 무관하게 항상 name-id 라 사이트맵과 일치한다.
  const alternates = seoAlternates(complexCanonicalPath(row));

  /* 선별 색인 — 실거래가 한 건도 없는 단지는 "시세 준비 중 · 거래 없음 · 노트 0"
     만 남는 템플릿 페이지다. 이런 URL 을 2만 개 색인 요청하면 크롤 예산을 태우고
     사이트 전체 품질 평가를 끌어내린다(구글 scaled content abuse).
     follow 는 유지해서 내부 링크는 계속 따라가게 둔다.
     tx 는 위에서 이미 읽었으므로 추가 조회가 없다. 거래가 들어오는 순간
     자동으로 색인 대상이 된다 — 별도 배치가 필요 없다. */
  const hasSubstance = tx.length > 0;

  return {
    title,
    description,
    robots: hasSubstance
      ? { index: true, follow: true }
      : { index: false, follow: true },
    alternates,
    openGraph: {
      title,
      description,
      url: alternates.canonical as string,
      siteName: "내집나우",
      locale: "ko_KR",
      type: "website",
      images: [
        {
          url: ogImageUrl,
          width: 1200,
          height: 630,
          alt: `${name} 실거래가 카드`,
        },
      ],
    },
    /* [995] 트위터 카드 — OG 만 있으면 X 는 작은 summary 카드로 접는다. 큰 이미지 카드는
       twitter:card 를 명시해야 나온다(다른 상세 페이지 /listings·/town/news 와 같은 모양). */
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [ogImageUrl],
    },
  };
}

export default async function ComplexHubPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  /* [#51] 장식 슬러그 제거 — 아래 전 조회가 순수 id(base64·kapt)만 쓰게 한다 */
  const complexId = pureIdFromParam(decodeURIComponent(id));
  /* 신선도 라벨은 row 에 의존하지 않는다 — 본문 로드와 병렬로 받는다.
     (직렬이면 이 페이지의 3단 직렬 최악이 그만큼 더 길어진다.) */
  const [v, freshness, rowForFacts] = await Promise.all([
    loadView(complexId),
    // 데이터 신선도 라벨(#21) — 조회 실패 시 null → 캡션 미표시
    getMarketFreshnessDateLabel(),
    /* [1007] 대장 보강행 — loadView 안의 같은 React cache 약속(추가 조회 0). 실패는 loadView 쪽이 던진다. */
    loadComplexRow(complexId).catch((): ComplexRow | null => null),
    /* [1007] 매매 원표본 창 — 대표행(base, enrich 전)이 오는 즉시 띄운다(canonical_id 는 enrich 가
       바꾸지 않는다). 본문 2차 파도(enrich+곁다리)와 나란히 돌아 직렬 파도가 늘지 않는다. */
    loadComplexBase(complexId)
      .then((b) => {
        if (b) void loadTradeWindow(b.canonical_id).catch(() => undefined);
      })
      .catch(() => undefined),
  ]);
  // 사실 우선: 존재하지 않는 단지는 목업 대신 404
  if (!v) notFound();
  /* [1007 · P2] 전세가율·자료 완성도 — 지도 패널과 같은 규칙(buildComplexFacts). 재료는 위에서
     이미 띄운 로더들(전월세 원표본·임장노트·매매 원표본 창)이라 여기서 기다리기만 한다. */
  const facts = await loadHubFacts({
    row: rowForFacts,
    complexId,
    name: v.name,
    city: v.city,
    dong: v.dong,
  });

  /* [1009 · C] 대표 실거래가(AI 분석과 같은 규칙) · 평형별 추이 · 최근 실거래 목록 — loadView 가 이미 받은 공용 행.
     실거래 조회가 실패했으면 부르지 않는다(같은 행이라 같이 실패한다 — "없음"으로 그리지 않는다). */
  const txFailed = v.loadFailures.includes("실거래");
  const deals: HubDeal[] | null = txFailed
    ? null
    : await withSectionBudget(loadDeals(rowForFacts?.canonical_id ?? complexId)).catch((): HubDeal[] | null => null);
  /* 월별 이력은 있는데 한 건 목록만 비면(키가 안 풀림 등) "거래 없음"이라 단정하지 않는다 — 모른다(null) */
  const dealsKnown: HubDeal[] | null =
    deals && (deals.length > 0 || v.priceSeries.length === 0) ? deals : null;
  const nowDate = new Date();
  /* [1009 · C 리뷰] 읽기 상한에 걸렸으면 가장 이른 달을 비교 기준에서도 뺀다(그래프와 같은 기간) */
  const dealsCapped = (dealsKnown?.length ?? 0) >= COMPLEX_DEALS_ROW_CAP;
  const headline: HubHeadline | null = dealsKnown ? hubHeadline(dealsKnown, nowDate, { capped: dealsCapped }) : null;
  const series = dealsKnown
    ? hubSeries(dealsKnown, {
        now: nowDate,
        headline,
        capped: dealsCapped,
      })
    : null;
  const dealTuples = dealsKnown ? recentDealTuples(dealsKnown, 60) : [];
  /* 요약 탭 첫 카드 — 예전엔 "AI 요약"이라 적힌 칸에 규칙으로 이은 문장(면적 혼합 월평균·전월비)이 있었다.
     AI 가 쓴 글이 아니고, 첫 화면 대표가와 다른 숫자를 말했다. 지도 단지 패널과 같은 한 줄(facts.summaryLine —
     있는 숫자만)에 대표가 문장을 앞세운다. 둘 다 없으면 예전 문장. */
  const headlineLine =
    headline?.kind === "rep"
      ? [
          `최근 실거래가 ${formatEokMan(headline.priceManwon, { unit: "만원" })}(${
            headline.basis === "band" ? headline.bandLabel : `전용 ${headline.unitM2}㎡`
          } 최근 ${headline.sampleSize}건 평균)`,
          headline.base
            ? changeSentence({
                curr: headline.priceManwon,
                base: headline.base.avgManwon,
                since: baseSince(headline.base),
                unit: "manwon",
              })
            : null,
        ]
          .filter(Boolean)
          .join(" — ")
      : headline?.kind === "single"
        ? `최근 실거래 ${formatEokMan(headline.priceManwon, { unit: "만원" })}(한 건)`
        : null;
  const summaryBody =
    facts.summaryLine || headlineLine
      ? [headlineLine, facts.summaryLine].filter(Boolean).join(". ") +
        ". 국토교통부 실거래·공공데이터 기준 — 투자 권유가 아니며 현장 확인 후 판단하세요."
      : v.aiBody;
  /* 계산기 프리필 — 첫 화면 대표가와 같은 숫자(없으면 최근 달 평균) */
  const calcManwon =
    headline?.priceManwon ??
    (v.priceSeries.length > 0 ? Math.round(v.priceSeries[v.priceSeries.length - 1]?.avgManwon ?? 0) : 0);

  /* [995] 첫 화면 "평형별 최근 실거래" 칩 — 본문이 base 시점에 띄운 면적대 로더(React
     cache)를 같은 인자로 받는다. loadView 가 끝난 뒤라 대개 이미 결과가 와 있고, 아직이면
     아래 ComplexAreaBands 가 기다릴 3초 예산 안에서 같이 기다린다(추가 질의·추가 대기 없음).
     실패·초과면 칩 줄을 통째로 숨긴다 — 실패 문구는 표 섹션이 한 번만 적는다. */
  const heroBands = topAreaBands(
    await withSectionBudget(loadAreaBands(complexId)).then(
      (d) => d,
      () => null,
    ),
    3,
  );
  /* [995] 지역 허브 id·라벨("서울 송파구") — 브레드크럼 칩·JSON-LD 탐색경로·"시장 보기"
     알약이 같은 값을 쓴다(resolveRegionId 주석 참고). */
  const regionId = resolveRegionId(v.city, v.dong);
  const regionLabel = axisRegionName(v.city, v.dong) || v.dong;

  /* JSON-LD — 이 페이지가 설명하는 실체는 "단지 하나"다.
     G6 이전엔 ApartmentComplex(@id 있음)와 별도의 Residence(@id 없음) 두 노드를
     같이 내보내 같은 건물이 서로 다른 두 엔티티로 읽혔다. 하나로 합치고,
     Residence 쪽에만 있던 좌표·읍면동을 ApartmentComplex 로 옮겼다.
     값은 전부 페이지가 이미 가진 실데이터 — 없으면 필드 자체를 넣지 않는다. */
  const complexAddress = v.infoRows.find((r) => r.label === "주소")?.value ?? null;
  /* JSON-LD 에는 확인된 값만 넣는다. "시세 준비 중"·"조회 실패" 같은 상태
     문구가 priceRange 로 새 나가면 구조화 데이터가 곧 거짓말이 된다. */
  /* [1009 · C 리뷰] priceRange·FAQ = 첫 화면 대표가(제목·공유 카드와 같은 hubMetaPrice). 대표가가 없을 때만 예전 월평균 */
  const complexPriceRange = headline
    ? hubMetaPrice(headline).price
    : v.metric.price && !/준비|수집|실패|없음|\?/.test(v.metric.price)
      ? v.metric.price
      : null;

  /* [1006 · E] 인용 요약 재료 — 전부 loadView 가 이미 읽은 값이다(추가 질의 없음).
     priceSeries 는 과거→최신 정렬(toView). 12개월 창은 메타데이터와 같은 달력 규칙
     (countDealsInWindow, 오늘 KST 기준). 실거래 조회 실패면 요약을 만들지 않는다 —
     "조회 실패"를 인용 문장에 실을 수는 없다. */
  const latestPoint = v.priceSeries.length > 0 ? v.priceSeries[v.priceSeries.length - 1] : null;
  const nowKst = kstParts(Date.now());
  const nowYmForSummary = nowKst ? `${nowKst.year}${String(nowKst.month).padStart(2, "0")}` : "";
  const citable = buildComplexCitableSummary({
    name: v.name,
    regionLabel: regionLabel,
    emd: v.emd,
    latestYm: latestPoint?.ym ?? null,
    latestAvgManwon: latestPoint?.avgManwon ?? null,
    latestDealCount: latestPoint?.dealCount ?? null,
    deals12m: countDealsInWindow(v.priceSeries, nowYmForSummary, 12),
    households: v.households,
    buildYear: v.buildYear,
    txFailed: v.loadFailures.includes("실거래"),
    /* [1007] 2~4번째 문장은 패널 한 줄 요약과 같은 조각(complex-facts) — 두 화면이 같은 숫자를 말한다 */
    fragments: facts.summaryFragments,
  });
  /* dateModified = 국토교통부 실거래 마지막 적재 성공일(market_ingest_log) — 렌더 시각이 아니다.
     캡션이 없으면(조회 실패) 날짜도 넣지 않는다. */
  const dataModifiedIso = freshnessLabelToIsoDate(freshness);

  const complexJsonLd = [
    /* WebPage + speakable — 아래 <section data-ai-summary> 를 가리킨다. 요약이 없으면
       speakable 도 넣지 않는다(없는 셀렉터를 가리키지 않는다). */
    webPageJsonLd({
      path: `/complex/${encodeURIComponent(complexId)}`,
      name: `${v.name} 실거래 시세·임장노트`,
      description: citable?.text ?? null,
      dateModified: dataModifiedIso,
      speakableSelectors: citable ? [AI_SUMMARY_SELECTOR] : [],
      mainEntityId: complexEntityId(complexId),
    }),
    complexResidenceJsonLd({
      id: complexId,
      name: v.name,
      address: complexAddress,
      // 시/도는 addressRegion. 읍면동(emd)이 있으면 그것이 addressLocality 이고,
      // 없으면 예전처럼 dong(=row.district, 시군구)을 둔다 — [995]
      regionName: v.city,
      locality: v.dong,
      dong: v.emd,
      lat: v.lat,
      lng: v.lng,
      households: v.households,
      priceRange: complexPriceRange,
    }),
    /* 예전엔 여기에 { name: v.dong } 이 끼어 있었다. 동 이름만 있고 갈 수 있는
       페이지가 없어 item(URL)이 빠졌고, 구글은 이걸 심각 오류로 보고 이 페이지의
       탐색경로를 통째로 무시했다(2026-07-27 Search Console). 링크 없는 라벨은
       탐색경로의 단계가 아니다.
       [995] 지역 허브(/region/{id})가 풀리는 단지는 홈 → 지역 → 단지 세 단계 — 세
       항목 모두 URL 이 있다. 안 풀리면 예전 두 단계 그대로(없는 URL 을 지어내지 않는다). */
    breadcrumbJsonLd([
      { name: "홈", url: "/" },
      ...(regionId ? [{ name: regionLabel, url: `/region/${regionId}` }] : []),
      { name: v.name, url: `/complex/${encodeURIComponent(complexId)}` },
    ]),
  ];

  /* [967 · 17] 임장노트 프리필 주소를 한 번만 만든다 — CTA·상단 알약·하단 액션 바·
     내 기록 탭이 전부 같은 주소여야 한다(NoteForm 은 ?apt=&region=&complexId=&lat=&lng=
     를 읽는다). 예전엔 세 곳이 각자 조립해 좌표가 빠지는 곳이 있었다. */
  const noteHref = (() => {
    const params = new URLSearchParams({ apt: v.name });
    if (v.dong) params.set("region", v.dong);
    if (complexId) params.set("complexId", complexId);
    if (typeof v.lat === "number" && typeof v.lng === "number") {
      params.set("lat", String(v.lat));
      params.set("lng", String(v.lng));
    }
    return `/notes/new?${params.toString()}`;
  })();
  /* [992 · A1] 하단 바 세 번째 칸: 전문가 상담(/town/experts, 보관) → 이 단지 AI 분석.
     ComplexNotesNewsAi 의 analysisHref 와 같은 목적지(분석 허브가 complexId 를 받는다). */
  const analysisHref = `/analysis?complexId=${encodeURIComponent(complexId)}`;

  /* [1008 · Q] 호가 점검 — 실거래가 있거나(없음이 확인되지 않았거나) 할 때만 입구를 둔다.
     거래가 한 건도 없는 단지에 "호가 점검"을 걸면 누른 뒤 "비교할 거래가 없어요"만 남는다. */
  const showAsking = v.priceSeries.length > 0 || v.loadFailures.includes("실거래");
  /* 호가 점검 API 키 — 실거래 조회 키는 name-id(canonical_id). kapt URL 로 열린 단지도 같은 키로 */
  const askingApiId = rowForFacts?.canonical_id ?? complexId;

  const cta = (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        {/* 연결성: 단지명·지역·단지ID·좌표 프리필로 임장노트 작성 진입 */}
        <Link
          href={noteHref}
          className="btn-primary btn-cta flex-1 rounded-[10px] p-3 text-center t-body"
        >
          이 단지 임장노트 쓰기
        </Link>
        <CompareTrayButton complexId={complexId} name={v.name} region={v.dong} />
      </div>
      <div className={`grid gap-2 ${showAsking ? "grid-cols-2" : "grid-cols-1"}`}>
        {showAsking && (
          <a href="#asking-check" className="btn-soft rounded-[10px] p-2.5 text-center text-xs">
            호가 점검 ›
          </a>
        )}
        <Link href="/map" className="btn-soft rounded-[10px] p-2.5 text-center text-xs">
          지도에서 보기 ›
        </Link>
      </div>
      {/* [1008 · Q] 결정 여정(/journey, 1008 · J) 한 줄 입구 — 단지 하나를 보다가 "그다음 단계"로 */}
      <Link
        href="/journey"
        className="inline-flex min-h-[24px] items-center justify-center t-sub font-bold text-primary"
      >
        내 집 마련 여정 — 계약까지 단계별로 보기 ›
      </Link>
    </div>
  );

  return (
    <PageShell>
      {/* JSON-LD(ApartmentComplex + Breadcrumb) — 단지 하나를 한 노드로 기술 */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript(complexJsonLd) }}
      />

      {/* 최근 본 단지 기록 (localStorage nz_recent_complexes · 목업 폴백은 미기록) */}
      <RecentComplexRecorder id={v.id} name={v.name} region={v.dong} />

      {/* [968 · 2] fold — 첫 화면(브레드크럼·히어로·축 요약·행동 알약·KPI·스펙)은 767px
          이하에서 rise-in 지연 리빌을 끈다(globals.css `.fold.rise-in`, `.fold [class^="rise-in"]`).
          `backwards` 채움이라 애니메이션이 시작되기 전까지 LCP 후보(히어로 시세)가
          투명했다. 래퍼는 스타일 없는 블록이라 레이아웃·LCP 요소 순서에 영향이 없다. */}
      <div className="fold">
        {/* 브레드크럼 칩 — ‹ 지도 · 시/도+시군구 · 읍면동 · 단지명
            [995] 시군구 칩은 지역 허브(/region/{id})로 — JSON-LD 탐색경로와 같은 목적지.
            허브 id 가 안 풀리는 지역만 예전처럼 지역 지도(?region=)로 간다. 읍면동 칩은
            같은 동 단지 목록(#nearby-complexes)으로 — 동 단위 페이지는 없으므로 페이지
            안 앵커가 정직한 목적지다(목록이 없으면 누를 수 없는 라벨로 둔다). */}
        <div className="rise-in flex flex-wrap gap-1.5">
          <Link
            href="/map"
            className="chip border border-line bg-surface px-2.5 py-1 t-sub font-bold text-text-2"
          >
            ‹ 지도
          </Link>
          {regionId ? (
            <Link
              href={`/region/${regionId}`}
              className="chip border border-line bg-surface px-2.5 py-1 t-sub font-bold text-text-2"
            >
              {regionLabel}
            </Link>
          ) : (
            <Link
              href={`/map?region=${encodeURIComponent(v.dong)}`}
              className="chip border border-line bg-surface px-2.5 py-1 t-sub font-bold text-text-2"
            >
              {regionLabel}
            </Link>
          )}
          {v.emd &&
            (v.nearby.length > 0 ? (
              <a
                href="#nearby-complexes"
                className="chip border border-line bg-surface px-2.5 py-1 t-sub font-bold text-text-2 no-underline"
              >
                {v.emd}
              </a>
            ) : (
              <span className="chip border border-line bg-surface px-2.5 py-1 t-sub font-bold text-text-2">
                {v.emd}
              </span>
            ))}
          {/* [970 · B-06] 네이비 칩 글자 text-surface → text-on-dark(다크에서 안 보였다) */}
          <span className="chip bg-brand-navy px-2.5 py-1 t-sub font-extrabold text-on-dark">
            {v.name}
          </span>
        </div>

        {/* 단지명 + 팔로우 — 가격 히어로와 한 덩어리.
            [962] 옅은 파랑 그라데이션 → 브랜드 네이비 면 + 심볼 워터마크(홈 시안 "딥 네이비 단색 + 심볼").
            시세 캡션 앞의 숨쉬는 온점 = "지금 값"(티커와 같은 언어). 델타 색은 남색 위 전용.
            [968 · 2] 클래스 문자열이 rise-in 으로 시작하지 않아 `.fold.rise-in` 이 맞도록 fold 를 직접 단다. */}
        <div className="brand-navy-card fold rise-in mt-3 rounded-[18px] px-4 py-4 sm:px-5">
          <BrandWatermark />
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="t-title tracking-tight text-on-dark">
                {v.name}
              </h1>
              <p className="mt-0.5 t-sub text-on-dark-muted">
                {v.dong}
                {v.city && v.city !== v.dong ? ` · ${v.city}` : ""}
              </p>
            </div>
            <WatchlistButton complexId={v.id} complexName={v.name} tone="dark" />
          </div>

          {/* [1009 · C] 결론 — 대표 실거래가(AI 분석과 같은 평형 규칙, 숫자 크게·단위 작게) + 비교 기준이 적힌 등락 +
              한 줄 문장. 예전 "최근 실거래 평균 30.9억 ▲ 1.2% 전월비"는 평형 혼합 월평균이었다(HubPriceHero 주석). */}
          <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
            <div className="min-w-0">
              <HubPriceHero
                headline={headline}
                txFailed={txFailed}
                freshness={freshness}
                fallback={
                  !dealsKnown && !txFailed && v.priceSeries.length > 0
                    ? { price: v.metric.price, ym: v.metric.priceYm }
                    : null
                }
              />
            </div>
            {typeof v.lat === "number" && typeof v.lng === "number" && (
              <RoadviewButton lat={v.lat} lng={v.lng} label={v.name} />
            )}
          </div>

          {/* [995] 평형별 최근 실거래 — 검색 의도 "단지명 평형"의 답을 첫 화면에 둔다.
              거래 많은 구간 3개, 값은 그 구간의 최근 실거래가와 그 계약월(면적대 표와 같은
              재료). 누르면 아래 면적대별 표(#area-bands)로. 촘촘한 인라인 링크 기준(24px)
              을 넘기도록 min-h-6 — `.chip` 은 붙이지 않는다(터치에서 40px 로 커져 히어로
              밀도가 깨진다). 재료가 없으면 줄 자체를 그리지 않는다. */}
          {heroBands.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-1">
              {/* [1009 · C] 칩 값은 그 면적대의 **최근 한 건** — 반올림 없이("29억 6,750만"). 면적은 사용자 단위.
                  누르면 아래 표로 내려가는 링크라 눌림(press)을 준다. */}
              <span className="mr-0.5 t-caption font-bold text-on-dark-muted">면적대별 최근 실거래</span>
              {heroBands.map((b) => {
                const ym = ymShortLabel(b.latestYm);
                return (
                  <a
                    key={b.label}
                    href="#area-bands"
                    className="brand-photo-chip press inline-flex min-h-6 items-center gap-1 rounded-full px-2.5 py-[5px] t-sub font-bold no-underline tabular-nums"
                  >
                    <span>
                      <AreaText band={b.label} />
                    </span>
                    <span className="font-extrabold">{formatEokMan(b.latestManwon)}</span>
                    {ym && <span className="font-medium opacity-80">· {ym}</span>}
                  </a>
                );
              })}
            </div>
          )}

          {v.chips.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1">
              {v.chips.map((c) => (
                <span
                  key={c}
                  className="brand-photo-chip rounded-full px-2.5 py-[4px] t-sub font-bold"
                >
                  {c}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* [1006 · E] 인용 가능한 요약(GEO) — 서버 HTML 에 "어디의 무엇이 언제 기준 얼마"가
            완결 문장으로 있어야 AI 검색이 이 페이지를 출처로 댈 수 있다. 위 히어로는 숫자
            조각(KPI)이고 AI 요약 탭은 클라이언트라, 떼어 인용할 문단이 서버 HTML 에 없었다.
            data-ai-summary 는 위 WebPage JSON-LD 의 speakable.cssSelector 가 가리키는 자리.
            실거래가 없거나 조회 실패면 섹션 자체가 없다(껍데기 금지). */}
        {citable && (
          <section
            data-ai-summary=""
            id="ai-summary"
            aria-label={`${v.name} 실거래 요약`}
            className="rise-in-1 card mt-3 rounded-2xl px-4 py-3"
          >
            <p className="t-body text-text-1">{citable.text}</p>
            <p className="mt-1.5 t-caption text-text-3">
              단순 평균이며 매물 호가가 아닙니다. 최근 1~2개월 수치는 신고 지연(계약 후 30일)으로
              늘어날 수 있습니다.
            </p>
          </section>
        )}

        {/* [OPT-48] 허브 2.0 — AI 워크벤치와 같은 라이브 컨텍스트 요약(1.2초 예산·자체 생략).
            regionName 은 dec.region 포맷("서울 중랑구")과 같아야 한다 — city===dong 중복 방어. */}
        <ComplexAxisSummary complexId={v.id} regionName={axisRegionName(v.city, v.dong)} />

        {/* [개선 #32] 행동 줄 — 보고 끝나는 화면에서 다음 행동이 있는 화면으로.
            [1008 · Q] 결정 도구 둘(호가 점검·비교 담기)을 여기로 모았다: 임장노트 쓰기 · 호가 점검 ·
            비교 담기 · 공유. "{지역} 시장 보기" 알약은 뺐다 — 같은 목적지(/region/{id})가 바로 위
            브레드크럼 칩에 있다(행동 줄이 늘지 않게 하나를 덜었다). 모양은 비교 담기 버튼
            (CompareTrayButton: btn-secondary · rounded-[10px] · p-3 · 13px — 공용 컴포넌트라 className 을
            못 받는다)에 맞춘 같은 버튼 넷 — 모바일 2×2, sm 이상 한 줄. 그리드인 이유: 그 버튼의 flex-1 이
            flex 줄에선 남는 폭을 다 먹는다. 터치 하한 44px 은 globals.css 의 .btn-secondary 규칙이 준다. */}
        {(() => {
          const act =
            "btn-secondary inline-flex items-center justify-center rounded-[10px] p-3 text-center text-[13px]";
          return (
            /* [967 · 17] id 는 하단 액션 바의 감시 대상 — 이 줄이 화면에 있으면 바를 숨긴다 */
            <div
              id="complex-actions-top"
              /* lg 에선 폭을 묶는다 — 본문 폭(1,200px) 그대로 늘리면 버튼 하나가 300~400px 로 퍼졌다 */
              className={`rise-in-1 mt-3 grid gap-2 ${
                showAsking ? "grid-cols-2 sm:grid-cols-4 lg:max-w-[720px]" : "grid-cols-3 lg:max-w-[540px]"
              }`}
            >
              <Link href={noteHref} className={act}>
                임장노트 쓰기
              </Link>
              {showAsking && (
                <a href="#asking-check" className={act}>
                  호가 점검
                </a>
              )}
              <CompareTrayButton complexId={complexId} name={v.name} region={v.dong} />
              <ShareLinkButton title={`${v.name} 실거래가·임장노트`} variant="text" className={act} />
            </div>
          );
        })()}

        {/* 지표 6칸 — 월평균·거래·매물·노트·세대·연차 */}
        <div className="rise-in-1 mt-3 grid grid-cols-3 gap-1.5 md:grid-cols-6">
          {/* [1009 · C] "시세" → "월평균" — 실거래만 있는 곳에 "시세"라는 말을 쓰지 않고, 이 숫자가 그 달 거래의
              면적 혼합 평균임을 적는다(첫 화면 대표가와 다른 숫자인 이유). 혼합 평균끼리의 전월비는 팔린 평형
              구성만 바뀌어도 움직여서 여기서는 빼고, 등락은 대표가(같은 평형) 한 곳에서만 말한다. */}
          <div className="card rounded-xl px-2.5 py-2.5 text-center sm:px-3">
            <div className="t-caption text-text-3">월평균</div>
            <div className="mt-0.5 truncate t-section text-ink tabular-nums sm:text-[15px]">
              {v.metric.price}
            </div>
            <div className="mt-0.5 truncate t-caption text-text-3 tabular-nums">
              {v.metric.priceYm ? `${v.metric.priceYm.slice(2)} · 면적 혼합` : v.metric.priceSub}
            </div>
          </div>
          <div className="card rounded-xl px-2.5 py-2.5 text-center sm:px-3">
            <div className="inline-flex items-center justify-center gap-0.5 t-caption text-text-3">
              거래
              <Explain
                term="geoRae-ryang"
                how={[
                  "아래 기간(계약월)에 신고된 매매 거래 수를 모두 더했어요 — 해제 신고된 거래는 빼요.",
                  "신고 기한이 계약 후 30일이라 최근 1~2개월은 덜 들어와 있을 수 있어요.",
                ]}
                source="국토교통부 실거래가"
              />
            </div>
            <div className="mt-0.5 truncate t-section text-ink tabular-nums sm:text-[15px]">
              {v.metric.deals}
            </div>
            <div className="mt-0.5 truncate t-caption text-text-3">{v.metric.dealsSub}</div>
          </div>
          <div className="card rounded-xl px-2.5 py-2.5 text-center sm:px-3">
            <div className="t-caption text-text-3">매물</div>
            <div className="mt-0.5 truncate t-section text-ink sm:text-[15px]">
              {v.metric.listings}
            </div>
            <div className="mt-0.5 truncate t-caption text-text-3">{v.metric.listingsSub}</div>
          </div>
          <div className="card rounded-xl px-2.5 py-2.5 text-center sm:px-3">
            <div className="t-caption text-text-3">노트</div>
            <div className="mt-0.5 truncate t-section text-ink sm:text-[15px]">
              {v.metric.notes}
            </div>
            <div className="mt-0.5 truncate t-caption text-text-3">{v.metric.notesSub}</div>
          </div>
          <div className="card rounded-xl px-2.5 py-2.5 text-center sm:px-3">
            <div className="t-caption text-text-3">세대</div>
            <div className="mt-0.5 truncate t-section text-ink tabular-nums sm:text-[15px]">
              {v.households ? `${v.households.toLocaleString("ko-KR")}` : "—"}
            </div>
            <div className="mt-0.5 truncate t-caption text-text-3">
              {v.households ? "공공데이터" : "미확인"}
            </div>
          </div>
          <div className="card rounded-xl px-2.5 py-2.5 text-center sm:px-3">
            <div className="t-caption text-text-3">연차</div>
            <div className="mt-0.5 truncate t-section text-ink sm:text-[15px]">
              {v.metric.age}
            </div>
            <div className="mt-0.5 truncate t-caption text-text-3">{v.metric.ageSub}</div>
          </div>
        </div>

        {/* [1009 · C] 단지 정보 — 네이버 부동산식 사실 격자. 값이 있는 항목만 칸이 된다(ComplexInfoGrid 주석) */}
        <ComplexInfoGrid facts={v.spec} nowYear={new Date().getFullYear()} />
      </div>
      {/* [968 · 2] fold 끝 — 여기서부터는 스크롤 아래(리빌 유지) */}

      {/* [1007 · P2] 전세가율 · 자료 완성도 — 지도 패널(1006)과 같은 규칙. 스펙 시트 바로 아래:
          "무엇이 있고 무엇이 왜 없는지"가 스펙 다음에 오는 것이 자연스럽다. */}
      <ComplexFactsCard facts={facts} noteHref={noteHref} />

      {/* 면적대·지역 대비 — 상단 밀도 블록.
          [968 · 7] cv-auto — 화면 밖이면 레이아웃·페인트를 미룬다(globals.css
          `.cv-auto{content-visibility:auto;contain-intrinsic-size:auto 420px}`). 모바일에서는
          스펙 시트 아래라 첫 화면 밖이다. 래퍼를 새로 두지 않고 기존 루트에 단다 —
          main 의 data-autotrim(`> :empty`)이 빈 블록을 접는 규칙을 그대로 타게. 아래
          섹션 컴포넌트들도 각자의 <section> 루트에 같은 클래스를 단다.
          [995] id="area-bands" — 히어로의 평형 칩이 여기로 내려온다. 면적대 표가 이 그리드의
          첫 칸이라 그리드에 단다(래퍼 div 를 끼우면 표가 없을 때 빈 칸이 autotrim 을 피해
          여백만 남긴다). scroll-mt-24 는 다른 앵커 섹션과 같은 상단 바 여유. */}
      <div
        id="area-bands"
        className="cv-auto mt-3 grid scroll-mt-24 grid-cols-1 gap-3 lg:grid-cols-2"
      >
        <ComplexAreaBands complexId={complexId} compact />
        <RegionRelative complexId={complexId} compact />
      </div>

      {/* [1008 · Q] 호가 점검 — "이 가격 괜찮을까?". 면적대별 표 바로 아래(같은 재료의 다음 질문).
          머리말은 서버 HTML, 펼침 버튼만 클라이언트, 본체·데이터는 펼칠 때(API · CDN 1시간).
          행동 줄의 "호가 점검"(#asking-check)이 여기로 스크롤하며 펼친다. */}
      {showAsking && (
        <section id="asking-check" aria-labelledby="asking-check-title" className="rise-in-1 mt-3 scroll-mt-24">
          <div className="card flex flex-wrap items-center justify-between gap-x-3 rounded-2xl px-4 py-3.5">
            <div className="min-w-0 flex-1">
              <h2 id="asking-check-title" className="flex flex-wrap items-center gap-x-1 t-section text-ink">
                이 가격 괜찮을까? <span className="t-sub font-bold text-primary">호가 점검</span>
                {/* [1009 · C] 무엇을 계산하는지 — lib/complex/asking-check 와 같은 말로 */}
                <Explain
                  term="hoga"
                  how={[
                    "같은 면적대의 최근 12개월 매매 실거래(3건이 안 되면 24개월)에서 최저·중앙값·최고와, 넣은 호가가 그 사이 어디쯤인지 보여 드려요.",
                    "적정가·목표가를 계산하지 않아요 — 지난 거래 사이에서의 위치예요. 층·향·수리 상태는 반영되지 않아요.",
                    "해제 신고된 거래는 빼요. 거래가 3건이 안 되면 위치를 말하지 않아요.",
                  ]}
                  source="국토교통부 실거래가"
                />
              </h2>
              <p className="mt-0.5 t-sub text-text-3">
                매물 호가를 넣으면 같은 면적대 최근 실거래 사이 어디쯤인지 보여 드려요.
              </p>
            </div>
            <AskingCheckToggle apiId={askingApiId} />
          </div>
        </section>
      )}

      {/* 국토부 실거래 이력 상세 — 동일 단지명 매칭 시에만 노출 */}
      {v.txHref && (
        <div className="rise-in-1 mt-3">
          <Link
            href={v.txHref}
            className="card tile flex items-center justify-between rounded-xl px-4 py-3"
          >
            <span className="t-body font-bold text-ink">
              {v.name} 국토부 실거래 이력 보기
              <span className="ml-2 t-sub font-medium text-text-3">
                실거래가 기반 · 매물 호가 아님
              </span>
            </span>
            <span className="t-body font-bold text-primary">→</span>
          </Link>
        </div>
      )}

      {/* 데이터 신선도 캡션(#21) — market_ingest_log 최근 성공 기준.
          [1007 · P2] 지역 허브와 같은 조각·같은 문장("실거래 마지막 반영 YYYY-MM-DD · 신고 지연 최대 30일"). */}
      <MarketFreshnessLine label={freshness} className="rise-in-1 mt-1.5" />

      {/* 본문 — 모바일 1열(시안), 데스크탑 2열 확장 */}
      <div className="mt-4 grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <ComplexHubTabs
          aiTitle="한눈에 요약"
          aiBody={summaryBody}
          listingsLabel={v.listingsLabel}
          trades={v.trades}
          notes={v.notes}
          notesFailed={v.notesFailed}
          notesWriteHref={v.notesWriteHref}
          /* [967 · 15] 내 기록 탭의 API 조회 키 — 노트 metadata.complexId 와 같은
             순수 id(complexId)여야 한다. 라우트 파라미터(id)는 슬러그 장식이 붙어
             있을 수 있어 조회에 못 쓴다. 지도 딥링크(/map?complexId=)도 순수 id 로. */
          complexId={complexId}
          /* 대장 매칭 시 v.id 는 kapt.… — 예전 링크로 쓴 노트가 그 id 를 달고 있다 */
          altComplexId={v.id !== complexId ? v.id : undefined}
          complexName={v.name}
          noteHref={noteHref}
          /* [970 · B-39] 시세 탭 → /analysis/price?region= 프리필(지역명 규칙은 축 요약과 같다) */
          priceRegion={axisRegionName(v.city, v.dong) || undefined}
          /* [1008] 계산기 지역 프리필(규제지역·수도권·그 외) — 서버에서 한 번 정해 문자열만 넘긴다(규칙표를
             클라이언트 번들에 싣지 않는다 — 이 라우트 479/480KB). 모르는 지역이면 undefined(사용자가 고른다). */
          loanRegion={loanRegionFromRegionName(axisRegionName(v.city, v.dong)) ?? undefined}
          listings={v.listings}
          /* [968 · 4] 차트는 여기(서버)서 한 번 그려 엘리먼트로 넘긴다 — 요약·시세 탭이
             같은 엘리먼트를 쓰고, 차트 코드·점 배열은 클라이언트 번들·props 에서 빠진다.
             그라데이션 id 씨앗은 단지 id(문서 안에서 유일). */
          priceChart={series ? <PriceTrendChart series={series} complexName={v.name} /> : null}
          /* [1009 · C] 계산기 프리필 = 첫 화면 대표가(없으면 최근 달 평균) */
          latestAvgManwon={calcManwon}
          /* [1009 · C] 최근 실거래 한 건 단위(최대 60건, [계약월, 일, 만원, 전용㎡, 층]) — 요약 탭 8건·시세 탭 전체 */
          deals={dealTuples}
          dealsFailed={txFailed}
          /* [1009 · C 리뷰] 월별 줄 등락의 기준 달 — 요약 탭은 한 건 목록이 없을 때만 월별 줄을 그린다 */
          tradeDeltas={dealTuples.length === 0 ? tradeDeltaViews(v.trades) : undefined}
        />

        {/* 데스크탑 우측 — 중복 스펙 대신 한눈에 + 인근 + CTA */}
        <aside className="hidden flex-col gap-3 lg:flex">
          <div className="rise-in-2 card flex flex-col gap-2 rounded-[18px] px-4 py-4">
            <div className="t-body font-extrabold text-ink">한눈에 보기</div>
            <div className="grid grid-cols-2 gap-1.5">
              <div className="rounded-xl bg-bg px-2.5 py-2">
                <div className="t-caption text-text-3">월평균 · 면적 혼합</div>
                <div className="t-section text-ink tabular-nums">{v.metric.price}</div>
              </div>
              <div className="rounded-xl bg-bg px-2.5 py-2">
                <div className="t-caption text-text-3">거래</div>
                <div className="t-section text-ink tabular-nums">{v.metric.deals}</div>
              </div>
              <div className="rounded-xl bg-bg px-2.5 py-2">
                <div className="t-caption text-text-3">매물</div>
                <div className="t-section text-ink">{v.metric.listings}</div>
              </div>
              <div className="rounded-xl bg-bg px-2.5 py-2">
                <div className="t-caption text-text-3">노트</div>
                <div className="t-section text-ink">{v.metric.notes}</div>
              </div>
            </div>
            {v.chips.slice(0, 8).length > 0 && (
              <div className="flex flex-wrap gap-1 pt-1">
                {v.chips.slice(0, 8).map((c) => (
                  <span
                    key={c}
                    className="rounded-full bg-bg chip-pad t-caption font-bold text-text-2"
                  >
                    {c}
                  </span>
                ))}
              </div>
            )}
          </div>
          {v.nearby.length > 0 && (
            <div className="rise-in-2 card flex flex-col gap-1.5 rounded-[18px] px-4 py-3.5">
              {/* [995] 동 단위로 찾았으면 "{읍면동} 다른 단지", 구로 물러섰으면 "{시군구} 다른 단지" */}
              <div className="mb-0.5 t-body font-extrabold text-ink">{v.nearbyLabel}</div>
              {v.nearby.slice(0, 5).map((n) => (
                <Link
                  key={n.id}
                  href={complexHrefFromId(n.id)}
                  className="press rounded-xl px-2 py-2 transition-colors hover:bg-bg"
                >
                  <div className="truncate t-sub font-bold text-ink">{n.name}</div>
                  <div className="truncate t-caption text-text-3">{n.meta}</div>
                </Link>
              ))}
            </div>
          )}
          <div className="rise-in-3">{cta}</div>
          {/* [944] 방문 전 AI 예습 브리핑 — CTA 바로 아래, 노트 시작 동선과 한 몸 */}
          <AiBriefingLazy
            complexId={complexId}
            region={v.dong ?? v.city ?? ""}
            aptName={v.name}
            noteHref={noteHref}
          />
          <AdZone placement="sidebar" seed={0} plan={null} />
        </aside>
      </div>

      {/* 내부 링크 그물(#34) — 모바일·전체 그리드.
          [968 · 7] 탭 아래 섹션 전부 cv-auto — 뷰포트 밖이면 레이아웃·페인트를 미루고
          스크롤로 다가오면 그때 그린다(브라우저가 온디맨드로 렌더). 하단 CTA
          sentinel(#complex-actions-bottom)은 cv-auto 밖에 둔다.
          [995] #area-bands·#nearby-complexes 앵커가 생겼다 — content-visibility:auto 는
          fragment 이동 대상을 "사용자와 관련 있음"으로 보고 그 자리에서 렌더하므로
          앵커 이동이 막히지 않는다(scroll-mt-24 는 상단 바 여유). */}
      {v.nearby.length > 0 && (
        <section id="nearby-complexes" className="cv-auto rise-in-5 mt-6 scroll-mt-24">
          <h2 className="mb-2 px-1 t-section text-ink">
            {v.nearbyLabel}{" "}
            <span className="t-sub font-medium text-text-3">{v.nearby.length}곳</span>
          </h2>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            {v.nearby.map((n) => (
              <Link
                key={n.id}
                href={complexHrefFromId(n.id)}
                className="card tile rounded-2xl px-3.5 py-3"
              >
                <div className="truncate t-body font-extrabold text-ink">
                  {n.name}
                </div>
                <div className="mt-0.5 truncate t-sub text-text-3">{n.meta}</div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* 거주민 후기 (호갱노노 벤치마크) — 실단지 매칭 시에만 (목업 폴백엔 미표시) */}
      {v.id === complexId && complexId !== "mock-1" && (
        <section className="cv-auto rise-in-5 mt-6">
          <ComplexReviewsLazy complexId={complexId} complexName={v.name} />
        </section>
      )}

      {/* [#94 잔여] 전월세 실거래 이력 — 매매 중심 화면에 임차 수요 관점 추가 */}
      <ComplexRentSection region={sectionRegionLabel(v.city, v.dong)} name={v.name} />

      {/* [#96] 도보권 학교·역 — 데이터 적재 후 자동 표시(미적재 시 미표시) */}
      <ComplexNearbyPoi lat={v.lat} lng={v.lng} name={v.name} />

      {/* D3 정비사업 · D4 입주물량 (면적대·지역대비는 상단으로 이동) */}
      {/* [970 · B-02] 시/도까지 넘긴다 — v.dong("중구")만으로는 다른 도시 자료가 섞였다 */}
      <NearbyRedevelopment sigungu={v.dong} city={v.city} />
      <UpcomingSupply area={v.dong} city={v.city} />
      {/* [992 · A1] 단지 Q&A(ComplexQna → /qna)는 보관(비노출) — 이 화면의 질문 입구는
          임장노트·AI 분석(아래 ComplexNotesNewsAi)이 맡는다. */}

      {/* 이 단지 임장노트 · AI 분석 재료 · 관련 기사 —
          지도 팝업에서 "전체 화면으로 자세히 보기"로 넘어온 사람이 더 알고 싶은 것들.
          위쪽 "단지 이야기"는 커뮤니티 글이고, 이쪽은 직접 다녀와 쓴 임장노트다. */}
      <ComplexNotesNewsAi
        complexId={complexId}
        name={v.name}
        region={v.dong}
      />

      {/* G5+G13 — 실데이터 Q&A + FAQPage 스키마. 시세가 "준비 중"이면 그 질문은 뺀다. */}
      {(() => {
        const faq: FaqItem[] = [];
        /* [1009 · C 리뷰] 답 = 첫 화면 대표가(같은 평형 최근 N건 평균 · 한 건이면 한 건). 예전 답은 면적 혼합 월평균과
           그 전월비("30.9억입니다 (▲ 15.8% 전월비)")라 첫 화면·제목·공유 카드("29.7억 ▼0.8%")와 달랐다 */
        if (headline) {
          faq.push({ q: `${v.name} 최근 실거래가는 얼마인가요?`, a: hubFaqPriceAnswer(v.name, headline) });
        } else if (complexPriceRange && v.metric.priceYm) {
          faq.push({
            q: `${v.name} 최근 실거래가는 얼마인가요?`,
            a: `${v.name}의 ${v.metric.priceYm} 실거래 평균은 ${v.metric.price}입니다(그 달 거래 전체 평균 · 평형 혼합). 매물 호가가 아닌 국토교통부에 신고된 실거래 기준이며, 면적대별 실거래가는 위 면적대별 표를 참고하세요.`,
          });
        }
        if (typeof v.households === "number" && v.households > 0) {
          faq.push({
            q: `${v.name}는 몇 세대 단지인가요?`,
            a: `${v.name}는 ${v.dong}에 위치한 총 ${v.households.toLocaleString("ko-KR")}세대 단지입니다 (공동주택 공공데이터 기준).`,
          });
        }
        return <div className="cv-auto mt-6"><QaBlock title={`${v.name} Q&A`} items={faq} /></div>;
      })()}

      {/* N17 — 위젯 배포 진입점. 위젯에는 출처 링크가 박혀 있으므로 퍼가기가 곧 백링크다.
          [992 · A1] 생성기(/widget)는 보관 — 코드를 여기서 바로 보여 준다. */}
      <EmbedSnippet
        kind="complex"
        id={complexId}
        heading="이 단지 실거래가를 블로그에 붙이기"
        desc="최근 실거래가 카드를 iframe 한 줄로 퍼갈 수 있어요. 새 실거래가 신고되면 붙여 둔 카드도 함께 바뀌어요."
        className="cv-auto rise-in-5 mt-6"
      />

      {/* 모바일 CTA 2개 (시안 하단) — id 는 하단 액션 바의 감시 대상([967 · 17]) */}
      <div id="complex-actions-bottom" className="rise-in-4 mt-4 lg:hidden">
        {cta}
      </div>

      {/* [967 · 17] 모바일 하단 액션 바 — 관심 등록·노트 쓰기·AI 분석. 위 두 CTA 블록이
          화면에 있으면 숨겨 같은 행동이 두 번 보이지 않게 한다. 사용자별 상태(관심
          여부)는 바 안의 WatchlistButton 이 마운트 뒤 읽는다 — ISR HTML 은 공용이다. */}
      <MobileActionBarLazy
        complexId={v.id}
        complexName={v.name}
        noteHref={noteHref}
        analysisHref={analysisHref}
        askingHref={showAsking ? "#asking-check" : undefined}
        sentinelIds={["complex-actions-top", "complex-actions-bottom"]}
      />
    </PageShell>
  );
}
