import type { Metadata } from "next";
import { AdZone } from "@/app/components/ads/AdZone";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageShell } from "../../components/PageShell";
import { QaBlock } from "../../components/QaBlock";
import {
  getRegionSnapshot,
  getRegionSeries,
  getRegionMonthlyVolume,
  listRegionTransactions,
  type RegionTransactionRow,
  type RegionMonthlyVolumeRow,
} from "@/lib/market/store";
import type { RegionMarketSnapshot } from "@/lib/market/types";
import { listPublicNoteCards } from "@/lib/inspection/store-db";
import { settle, startDeadline } from "@/lib/data/section-budget";
import { getSupplyForAreaStrict, type SupplyItem } from "@/lib/market/supply";
import { catalogCityForRegionId } from "@/lib/market/sido-group";
import { findCatalogRegionById, findCatalogSuccessors } from "@/lib/region/catalog";
import type { PublicNoteCard } from "@/lib/inspection/store-db";
import {
  findComplexTxRegionById,
  listDistrictComplexSummaries,
  type ComplexSummary,
  type ComplexTxRegion,
} from "@/lib/market/complex-transactions";
import { ExpandableComplexRows } from "./ExpandableComplexRows";
/* [1009 · H] 머리(결론·큰 숫자)·추세 카드·단지 목록 — 이 폴더의 새 조각(표는 /complex/browse 가 계속 쓴다) */
import { RegionHero } from "./RegionHero";
import { MarketFreshnessLine } from "@/app/components/MarketFreshnessLine";
import { RegionTrendCard } from "./RegionTrendCard";
import { buildRegionTrendDatasets } from "./region-trends";
import { RegionComplexList } from "./RegionComplexList";
import { buildRegionOverview, countsToTrend, shiftYm, splitByReporting, toYm, ymMonth } from "./region-overview";
import { ScrubLineLazy } from "@/app/components/viz/ScrubLineLazy";
import { Explain } from "@/app/components/explain/Explain";
import { formatEokMan } from "@/lib/format/eok-man";
import { findTxRegionForMarketRegion, type TxRegionSummary } from "@/lib/market/tx-bands";
import { BAND_KIND_LABEL } from "@/lib/market/bands";
import { listDbProjects } from "@/lib/redevelopment/store";
import {
  labelForType,
  stageLabel,
  stageOrder,
  type RedevelopmentProject,
} from "@/lib/redevelopment/types";
import { findTemperatureRegion } from "@/lib/market/temperature";
import { logger } from "@/lib/log";
import { buildMarketRead } from "@/lib/region/market-read";
import { getRegionRentSnapshot, type RegionRentSnapshot } from "@/lib/market/rent";
import { getRegionTradeAreaBands, type RegionAreaBands } from "@/lib/market/area-bands-lite";
import { KeywordAlertButton } from "@/app/components/KeywordAlertButton";
import { EmbedSnippet } from "@/app/components/EmbedSnippet";
import {
  breadcrumbJsonLd,
  regionPlaceJsonLd,
  jsonLdScript,
  webPageJsonLd,
  datasetJsonLd,
  regionEntityId,
  type FaqItem,
} from "@/lib/seo/jsonld";
/* [1006 · E] speakable 셀렉터·temporalCoverage·dateModified 변환 — 순수 함수 */
import {
  AI_SUMMARY_SELECTOR,
  freshnessLabelToIsoDate,
  ymRangeToTemporalCoverage,
} from "@/lib/seo/citable-summary";
import { getMarketFreshnessDateLabel } from "@/lib/newui/freshness";
import { seoAlternates } from "@/lib/seo/alternates";
import { regionTitle } from "@/lib/seo/title-experiment";
import { formatKrwShort } from "@/lib/market/format";
import { noteMatchesRegion } from "@/lib/region/changed-region-paths";

/* ============================================================
   N9 — 지역 종합 가이드 (/region/[id])
   "○○구에 산다는 것" 을 실데이터로만 조립한다.
   시세 스냅샷(market_region_price) · 가격지수 추이 · 최근 실거래 ·
   월별 거래량(market_region_monthly) · 단지별 현황 · 입주 예정 물량 ·
   정비사업(DB 확정분만) · 공개 임장노트 · 면적대/가격대 구간.

   ── 두 가지 규칙 ────────────────────────────────────────────
   1) **조회 실패는 "데이터 없음"이 아니다.** 예전에는 스냅샷 조회를
      .catch(() => null) 로 삼키고 그대로 notFound() 를 불렀다. DB 가 잠깐
      느려진 것뿐인데 이 페이지가 404 를 냈고, 크롤러에게는 "이 지역 페이지는
      없어졌다"는 확정 신고가 됐다. 이제 스냅샷 조회 실패는 던진다(→ 5xx =
      "지금은 못 준다, 나중에 다시 와라"). notFound() 는 지역이 **정말로**
      목록에 없을 때만 부른다.
   2) 곁다리 섹션은 실패해도 페이지 전체를 죽이지 않지만, 실패를 "없음"이나
      "준비 중"으로 표기하지 않는다. 세 가지 상태(정상 / 정말 없음 / 조회 실패)를
      각각 다른 문장으로 적는다.

   캐시: 2026-08-01 부터 ISR 이다. 예전엔 `?complexes=30` 을 읽어서 —
   searchParams 를 읽는 순간 Next 는 요청마다 서버 렌더로 돌리고 `private,
   no-cache, no-store` 를 실어 보낸다 — CDN 이 이 페이지를 한 벌도 재사용하지
   못했다(2026-07-28 함수 호출 소진 사고의 남은 자리였다). 12↔30 확장을
   ExpandableComplexRows(클라이언트 토글)로 옮기고 generateStaticParams(빈
   배열)를 export 해 형제 라우트(/complex/[id] · /tx/[region])와 같은 ISR 로
   복귀시켰다. scripts/check-cache-policy.mjs 의 ISR_EXEMPT 면제도 해제됐다.
   ============================================================ */

/* [B001 1단계] 1h → 6h — 근거는 app/complex/[id]/page.tsx 의 revalidate 주석. */
/* [1010] 6h → 7일. 실측(2026-09-20~22): 이 라우트 하루 렌더 870회, 사람 방문은 그 몇십
   분의 일이고 크롤러 재방문 간격은 ≈2.2일이다. TTL 이 6시간이면 크롤러가 올 때마다 거의
   100% 재렌더가 돌았다(ISR Write + Fluid CPU + HTML 전송이 같이 든다).
   TTL 을 재방문 간격보다 길게 두는 대신, 이 화면을 바꾸는 쓰기 지점에서 즉시 비운다 —
   신선도 손해는 0 이다(1010 브리프 원칙 1).
     · 실거래·구간·단지·월별 거래량 → lib/region/invalidate-market.ts
       invalidateChangedMarketRegions() (reb-ingest 크론 00:50 UTC / 집계 갱신 직후)
     · 부동산원 시세 스냅샷(머리 큰 숫자) → 같은 파일 invalidateRebChangedRegions()
       (적재 전후 지문 비교 — 공표가 없는 날은 아무것도 비우지 않는다)
     · 공개 임장노트 → app/api/inspection/notes/route.ts · [id]/route.ts
       (사람이 쓴 것은 즉시 보인다 — 브리프 원칙 3)
     · 입주 예정 물량 → app/api/cron/supply-ingest/route.ts (새 공고가 들어온 날에만)
   아직 비우지 않는 곳: 정비사업 적재(redevelopment-ingest). 그 섹션은 DB 확정분만 싣고
   갱신이 월 단위라 7일 TTL 안에 들어온다 — 보고서에 적어 통합자가 판단한다. */
export const revalidate = 604_800;

/* 빈 generateStaticParams — 빌드 때는 아무 지역도 미리 만들지 않고, 첫 요청이
   ISR 로 채운다. ?complexes=30(searchParams)을 클라이언트 토글로 옮겼으므로
   이제 CDN 이 한 시간 창 안에서 응답을 재사용한다 (/complex/[id] 와 같은 판단). */
export async function generateStaticParams(): Promise<Array<{ id: string }>> {
  return [];
}

/* ---------- 세 갈래 상태 (정상 / 정말 없음 / 조회 실패) ---------- */

/* 세 갈래 상태와 공유 예산은 lib/data/section-budget.ts 로 옮겼다.
   /complex/[id] 등 다른 화면도 같은 규칙을 써야 하기 때문이다.
   핵심 스냅샷은 이 예산에 포함되지 않는다 — 그건 페이지의 존재 이유라서,
   실패하면 여전히 던져서 5xx 가 되어야 한다. */

/**
 * 곁다리 섹션 하나가 빠졌을 때의 안내.
 *
 * "새로고침해 주세요" 라고 쓰지 않는다 — 이 페이지는 revalidate=3600 이라
 * 이 화면이 그려진 순간 최대 1시간 동안 그대로 저장된다. 새로고침해도 같은
 * 화면이 나오는데 "새로고침하면 된다"고 적으면, 그것도 사실이 아닌 안내다.
 */
function LoadFailed({ what }: { what: string }) {
  return (
    <p className="py-6 text-center t-body text-text-3">
      {what}을 지금 불러오지 못했습니다. 데이터가 없다는 뜻이 아니라 조회에 실패했다는
      뜻입니다 — 이 화면은 최대 1시간 저장되므로, 잠시 뒤에 다시 방문해 주세요.
    </p>
  );
}

/**
 * 곁다리 7개 중 몇 개가 실패하면 "페이지가 아니라 DB 가 문제"로 볼 것인가.
 *
 * 곁다리들은 공유 마감시계(8초) 하나를 함께 본다. 그래서 DB 가 밀리는 순간에는
 * 하나가 아니라 남아 있던 것 전부가 동시에 실패한다. 그렇게 만들어진 화면은
 * 머리말만 있고 본문이 거의 없는 껍데기인데, revalidate=3600 이라 그 껍데기가
 * **1시간 동안 고정**된다. 방문자에게도 크롤러에게도 그건 "이 지역은 내용이
 * 없는 페이지"라는 잘못된 사실이 된다(승인 문서가 금지한 얇은 페이지 그대로다).
 *
 * 그래서 이 선을 넘으면 그리지 않고 던진다. 5xx 는 캐시되지 않으므로 DB 가
 * 회복된 다음 방문자는 제대로 된 페이지를 받는다 — "지금은 못 준다"가
 * "여긴 원래 비어 있다"보다 정확하다.
 *
 * 5/7 로 잡은 이유: 한두 섹션이 늦는 것은 평상시에도 있는 일이고, 그때는
 * 나머지 본문이 충분히 남아 있어 페이지로서 값어치가 있다.
 */
const SIDE_FAILURE_ABORT_THRESHOLD = 5;

/* ---------- 포맷 헬퍼 ---------- */

/* [967 · 31] 여기 있던 formatKrwShort 사본은 lib/market/format 의 공통 함수로 대체 — 출력 동일 */

/** "202606" → "2026.06" */
function formatYm(ym: string): string {
  return ym.length === 6 ? `${ym.slice(0, 4)}.${ym.slice(4)}` : ym;
}

function sourceLabel(source: RegionMarketSnapshot["source"]): string {
  if (source === "reb") return "한국부동산원(R-ONE)";
  if (source === "kb") return "KB부동산";
  return "자체 수집";
}

/** [1009 · H] 스냅샷에 값이 하나라도 있는가 — 서울 구는 부동산원 행이 period '' · 값 null 로 비어 있다(운영 실측) */
function snapshotHasValues(s: RegionMarketSnapshot | null): s is RegionMarketSnapshot {
  if (!s || !/^\d{6}$/.test(s.period)) return false;
  return [s.avgSale, s.medianSale, s.jeonseRatio, s.saleChangeMonthly].some(
    (v) => typeof v === "number" && Number.isFinite(v),
  );
}

/** [1009 · H] 한국 날짜의 yyyymm — 입주 예정 하한(이 달부터) */
/** [1009 · H 리뷰] 입주월 표기 — "202703" → "2027.03", 달이 00·13 등이면 "2027 · 월 미정", 연도도 없으면 "미정" */
function moveInLabel(ym: string): string {
  const y = ym.slice(0, 4);
  const m = Number(ym.slice(4, 6));
  if (!/^\d{4}$/.test(y)) return "미정";
  if (/^\d{6}$/.test(ym) && m >= 1 && m <= 12) return `${y}.${ym.slice(4, 6)}`;
  return `${y} · 월 미정`;
}

function kstYm(now: Date): string {
  const k = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return `${k.getUTCFullYear()}${String(k.getUTCMonth() + 1).padStart(2, "0")}`;
}

/* [1010] 공개 임장노트 지역 텍스트 매칭("고양시 덕양구" ↔ "고양 덕양구 행신동")은
   lib/region/changed-region-paths.ts 로 옮겼다. 판정 자체는 한 글자도 바뀌지 않았다.
   왜 옮겼나: 이 페이지의 TTL 이 7일이 되면서, 노트를 공개하는 쓰기 API 가 "어느 지역
   페이지가 바뀌는가" 를 **같은 판정으로** 알아야 하기 때문이다(그쪽이 다른 규칙을 쓰면
   안 비워지는 페이지가 생긴다). import 는 파일 머리에 있다. */

/* ---------- 메타데이터 ---------- */

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  /* 여기서도 실패를 삼키지 않는다. 삼키면 "존재하지 않는 지역"과 똑같이
     noindex 메타를 내보내게 되고, 장애 중에 크롤링된 페이지가 색인에서
     빠진다. 던지면 5xx 가 되고 크롤러는 다시 온다. */
  const snapshot = await getRegionSnapshot(id);
  if (!snapshot) {
    /* [998] 부동산원 스냅샷이 없어도 카탈로그에 있는 지역(2026-07 신설 구 등)은 페이지가 있다 —
       실거래 섹션으로 그린다. 다만 색인은 사이트맵과 같은 규칙(스냅샷 있는 지역만)으로 둔다:
       통계가 아직 없는 페이지를 색인에 넣어 얇은 페이지를 늘리지 않는다. REB 행이 오면 자동으로 풀린다. */
    const entry = findCatalogRegionById(id);
    if (!entry) return { title: "지역 시세 | 내집나우", robots: { index: false, follow: false } };
    return {
      title: `${entry.name} 아파트 실거래 | 내집나우`,
      description: `${entry.name} 아파트 최근 실거래·월별 거래량·단지별 현황(국토교통부 신고 기준). 한국부동산원 지역 통계는 아직 공표 전입니다.`,
      robots: { index: false, follow: true },
      alternates: seoAlternates(`/region/${id}`),
    };
  }
  const name = snapshot.regionName;
  /* [1009 · H] 서울 구 스냅샷은 period '' · 값 null 이다(운영 실측) — 예전 설명은 "시세 준비 중 ( 기준)"처럼
     빈 괄호가 나갔다. 값이 없으면 평균가·기준월 구절을 빼고 화면에 실제로 있는 것(지수·실거래 추이)을 적는다. */
  const period = /^\d{6}$/.test(snapshot.period) ? formatYm(snapshot.period) : null;
  const price =
    snapshot.avgSale !== undefined ? `평균 매매가 ${formatKrwShort(snapshot.avgSale)}` : "매매가격지수·실거래 추이";
  /* [#102] title CTR 실험 — id 해시로 A/B 결정적 배정(요청 간 불변). 배정표는
     /admin/seo, 판정 기준은 lib/seo/title-experiment.ts 주석. */
  const { title } = regionTitle(id, name);
  const description = `${name} 아파트 ${price}${period ? ` (${period} 기준)` : ""} — 시세 추이, 최근 실거래, 월별 거래량, 입주 예정 물량, 정비사업, 이웃 임장노트를 한 화면에서 확인하세요.`;
  const alternates = seoAlternates(`/region/${id}`);
  return {
    title,
    description,
    robots: { index: true, follow: true },
    alternates,
    openGraph: {
      title,
      description,
      url: alternates.canonical as string,
      siteName: "내집나우",
      locale: "ko_KR",
      type: "website",
      /* [개선 #4] 지역 카드 — 지역명·평균가가 박힌 동적 공유 카드(/api/og).
         카톡 미리보기가 밋밋한 기본 카드로 나가던 것을 교체. */
      images: [
        {
          url: `/api/og?${new URLSearchParams({
            title: `${name} 아파트 시세`,
            sub: period ? `${price} · ${period} 기준` : price,
            badge: "지역 시세",
          }).toString()}`,
          width: 1200,
          height: 630,
          alt: `${name} 시세 카드`,
        },
      ],
    },
  };
}

/* ---------- 페이지 ---------- */

export default async function RegionHubPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  /* 이 페이지의 뼈대. 실패하면 던진다 → 5xx.
     [998] null 은 "부동산원 통계가 없다"이지 "지역이 없다"가 아니다 — 2026-07 신설 구(검단구·
     동탄구 …)는 카탈로그에 있지만 REB 가 아직 집계를 내지 않았다. 카탈로그에도 없을 때만 404.
     통계가 없는 자리는 지어내지 않고 "아직 없어요"로 적고, 실거래(국토부) 섹션은 그대로 그린다. */
  const snapshot: RegionMarketSnapshot | null = await getRegionSnapshot(id);
  const catalogEntry = findCatalogRegionById(id) ?? null;
  if (!snapshot && !catalogEntry) notFound();

  const name = snapshot?.regionName ?? catalogEntry?.name ?? id;
  /* [998] 폐지 구(인천 서구·중구)의 후속 구 — 있으면 머리에 한 줄 안내 + 링크 */
  const successors = findCatalogSuccessors(id);
  const retiredAt = catalogEntry?.retired ?? null;
  /* 단지별 현황 — 30개를 한 번에 받아 클라이언트 토글로 12↔30 을 오간다.
     예전의 ?complexes=30 방식은 searchParams 를 읽는 순간 페이지 전체가
     요청마다 서버 렌더가 되어 ISR 을 무력화했다(ExpandableComplexRows 주석). */
  const complexLimit = 30;
  /* [970 · B-03] 상위 시/도는 카탈로그(REGION_CATALOG.city)에서 — 예전 폴백은
     `incheon-` 접두가 아니면 전부 "서울"이라 대구 중구·부산 해운대구가 JSON-LD·
     /supply 링크·브라우즈 링크에서 서울 소속으로 나갔다. */
  const catalogCity = catalogCityForRegionId(id);
  const txRegion: ComplexTxRegion =
    findComplexTxRegionById(id) ?? { id, name, city: catalogCity ?? "서울" };
  /* [1009 · H] 지도 딥링크 이름 — "서울 강남구"·"경기 수원시 영통구". 구 이름만("중구")이면 /api/regions/search 가
     서울 중구로 푼다(로컬 실측). 시/도를 붙이면 legal_regions 1순위가 맞는다. */
  const mapRegion = txRegion.city && txRegion.city !== name ? `${txRegion.city} ${name}` : name;
  // 이 지역 자치구명 (예: "고양시 덕양구" → "덕양구") — 공급·정비사업 매칭 키
  const shortName = name.trim().split(/\s+/).pop() ?? name;
  /* [970 · B-02] 공급·정비사업은 시/도 + 자치구 두 키로 좁힌다 — "중구"만으로는
     서울·인천·대구·울산·부산·대전 중구가 한 페이지에 섞였다. */
  const sido = txRegion.city;
  /* 정비사업 sigungu 컬럼은 경기만 "성남시 수정구"처럼 시까지 적는다(seed·types 주석) —
     경기는 카탈로그 이름 그대로, 광역시·특별시는 자치구명으로 맞춘다. */
  const projectSigungu = sido === "경기" ? name.trim() : shortName;

  /* 곁다리 7개는 공유 마감시계 하나를 함께 본다. 하나가 늦어도 나머지가
     끝났으면 페이지는 8초 안에 그려진다.

     여덟 번째로 실거래 구간 매칭(txBandRegion)도 여기 같이 태운다. 예전에는
     이 Promise.all 이 끝난 **뒤에** 따로 await 했다 — 곁다리 7개가 모두 끝날
     때까지 기다렸다가 그제서야 아홉 번째 왕복을 시작했다는 뜻이고, 그 한 번이
     통째로 직렬 지연이었다. 같이 출발시키면 총 대기는 가장 느린 하나로 줄어든다.
     다만 이 값은 sideResults 에 넣지 않는다 — 아래 중단 판단은 "화면이 비었나"를
     세는 것이고, 이건 실패해도 내부 링크 하나가 빠질 뿐이라 성격이 다르다. */
  const budget = startDeadline();
  const [
    seriesR,
    transactionsR,
    complexR,
    notesR,
    volumeR,
    projectsR,
    supplyR,
    txBandRegion,
    rentSnap,
    areaBands,
    freshness,
    jeonseSeries,
  ] =
    await Promise.all([
      /* 항목 25: budget.signal 로 예산 초과 시 PostgREST 요청 자체를 끊는다.
         [1009 · H] 12 → 24칸 — 추세 카드가 데이터 길이만큼 그린다(지금 운영 13~14개월). 1년 전 대비(결론 둘째 줄)는
         13칸이 있어야 계산된다 — 12칸이면 11개월 변화를 "1년"이라 부르게 된다. */
      settle(
        `${id} 매매가격지수`,
        getRegionSeries(id, "sale_index", "monthly", 24, budget.signal),
        budget.expired,
      ),
      settle(`${id} 최근 실거래`, listRegionTransactions(id, name, 5, budget.signal), budget.expired),
      settle(
        `${id} 단지별 현황`,
        listDistrictComplexSummaries(txRegion, complexLimit, budget.signal),
        budget.expired,
      ),
      /* 카드 6칸만 그리는데 select("*") 로 100행을 통째로 받던 자리다. 그 행에는
         checklist·sections·photos·ai_analysis·metadata 다섯 jsonb 가 들어 있고
         전부 버려졌다. 카드 전용 컬럼만 읽는다(listPublicNoteCards 주석 참고). */
      settle("공개 임장노트", listPublicNoteCards(100, budget.signal), budget.expired),
      settle(`${id} 월별 거래량`, getRegionMonthlyVolume(id, name, 12, budget.signal), budget.expired),
      /* 정비사업은 DB 확정분만 쓴다(시드 폴백 없음). 이 화면은 "○○구에 산다는 것"을
         사실로만 조립하는 곳이고, 시드는 수기 정리본이라 여기 섞으면 안 된다. */
      settle(
        `${shortName} 정비사업`,
        listDbProjects({ sido, sigungu: projectSigungu, limit: 200, signal: budget.signal }),
        budget.expired,
      ),
      /* 웹16 — 목록은 6건만 보여주지만 연도별 미니 차트는 더 넓게 집계해야
         왜곡이 없다. 같은 단일 쿼리의 limit 만 24 로 올린다(추가 요청 없음). */
      settle(
        `${sido} ${shortName} 입주 예정 물량`,
        /* [1009 · H] 이 달(KST) 이후 입주분만 — 예전엔 하한 없이 오래된 24행부터 읽어, "입주 예정"에 이미 입주한 단지
           (강남구 2026.03 등)가 섞이고 제목은 "2026~2027"로 고정돼 있었다(1008 리뷰 A-2 와 같은 함정).
           Strict 는 실패를 던진다 — settle 이 "조회 실패"로 세고 섹션은 빠진다(예전 래퍼는 실패를 [] 로 삼켜 "없음"과 같았다). */
        getSupplyForAreaStrict(shortName, 24, budget.signal, sido, kstYm(new Date())),
        budget.expired,
      ),
      /* A5 — 이 지역의 면적대·가격대 실거래 랜딩. 실제 존재하는 지역만 잡히고,
         없으면 null 이라 링크 섹션 자체가 렌더되지 않는다(죽은 링크를 만들지 않는다).
         여기서는 실패를 삼켜도 된다 — 이 페이지의 본문은 지역 시세 스냅샷이고 이건
         곁다리 내부 링크라, 못 읽었으면 링크 하나가 빠질 뿐 틀린 내용이 나가지 않는다.
         다만 **조용히** 삼키지는 않는다. 2026-07-25 사고의 교훈이 정확히 그것이다. */
      findTxRegionForMarketRegion(id, name).catch((e: unknown): TxRegionSummary | null => {
        logger.error(
          `[/region/${id}] 실거래 구간 지역 매칭 실패 — 링크 섹션을 생략합니다:`,
          e instanceof Error ? e.message : String(e),
        );
        return null;
      }),
      /* [#94] 전월세 스냅샷 — txBandRegion 과 같은 성격의 보너스 섹션: 실패하면
         섹션이 빠질 뿐이라 sideResults(중단 판정)에는 넣지 않는다. */
      getRegionRentSnapshot(id, name, budget.signal).catch((e: unknown): RegionRentSnapshot | null => {
        logger.error(`[/region/${id}] 전월세 스냅샷 조회 실패 — 섹션 생략:`, e instanceof Error ? e.message : String(e));
        return null;
      }),
      /* [#52] 평형대별 시세 — 같은 규칙 */
      getRegionTradeAreaBands(id, name, budget.signal).catch((e: unknown): RegionAreaBands | null => {
        logger.error(`[/region/${id}] 평형대별 시세 조회 실패 — 섹션 생략:`, e instanceof Error ? e.message : String(e));
        return null;
      }),
      /* [1006 · E] 실거래 마지막 적재 성공일(market_ingest_log) — JSON-LD dateModified 재료.
         1시간 인메모리 캐시라 왕복이 거의 없고, 실패는 내부에서 null 로 접힌다(던지지 않는다).
         단지 허브(/complex/[id])와 같은 로더·같은 캡션 규칙. sideResults(중단 판정)엔 넣지 않는다. */
      getMarketFreshnessDateLabel(),
      /* [1009 · H] 부동산원 월간 전세가율 — 서울 구는 스냅샷 전세가율이 비어 있어(운영 실측) 숫자 칸·추세 카드가 이 시계열을 쓴다.
         전월세 스냅샷과 같은 보너스 성격: 실패하면 그 칸·탭이 빠질 뿐이라 sideResults(중단 판정)에 넣지 않는다. */
      getRegionSeries(id, "jeonse_ratio", "monthly", 24, budget.signal).catch(
        (e: unknown): Array<{ period: string; value: number }> => {
          logger.error(`[/region/${id}] 전세가율 시계열 조회 실패 — 칸 생략:`, e instanceof Error ? e.message : String(e));
          return [];
        },
      ),
    ]);
  budget.done();

  /* 껍데기를 1시간 얼리지 않는다 (위 SIDE_FAILURE_ABORT_THRESHOLD 설명 참고).
     실패 개수만 세서 판단한다 — 어떤 섹션이 실패했는지는 settle() 이 이미
     각각 로그로 남겼다. */
  const sideResults = [seriesR, transactionsR, complexR, notesR, volumeR, projectsR, supplyR];
  const sideFailures = sideResults.filter((r) => !r.ok).length;
  if (sideFailures >= SIDE_FAILURE_ABORT_THRESHOLD) {
    throw new Error(
      `[/region/${id}] 곁다리 섹션 ${sideResults.length}개 중 ${sideFailures}개 조회 실패 — ` +
        "빈 껍데기를 캐시에 남기지 않기 위해 렌더를 중단합니다",
    );
  }

  const series: Array<{ period: string; value: number }> = seriesR.ok ? seriesR.data : [];
  const transactions: RegionTransactionRow[] = transactionsR.ok ? transactionsR.data : [];
  const complexSummaries: ComplexSummary[] = complexR.ok ? complexR.data : [];
  const volume: RegionMonthlyVolumeRow[] = volumeR.ok ? volumeR.data : [];
  const supply: SupplyItem[] = supplyR.ok ? supplyR.data : [];
  /* 쿼리가 이미 is_public 으로 걸러 오므로 여기서 다시 보지 않는다
     (예전 select("*") 시절에는 매핑된 isPublic 을 한 번 더 확인했었다). */
  const allNotes: PublicNoteCard[] = notesR.ok ? notesR.data : [];
  const notes = allNotes.filter((n) => noteMatchesRegion(n.region, name)).slice(0, 4);

  /* 정비사업 — 진행단계가 앞선 순, 같으면 세대수 큰 순. 최대 8곳만. */
  const projects: RedevelopmentProject[] = (projectsR.ok ? projectsR.data : [])
    .filter((p) => !p.isSample)
    .sort((a, b) => {
      const s = stageOrder(b.stageKey) - stageOrder(a.stageKey);
      if (s !== 0) return s;
      return (b.households ?? 0) - (a.households ?? 0);
    });
  const projectsShown = projects.slice(0, 8);

  // N11 — 이 지역의 시장 온도 기록이 있으면 교차 링크
  const tempRegion = findTemperatureRegion(id);

  /* [1009 · H] 머리(결론 한 줄·큰 숫자) — 스냅샷·부동산원 월간 시계열·국토부 월 집계를 모아서(region-overview.ts).
     ISR(6시간) 렌더 시각으로 "신고가 끝난 달"을 가른다 — 기한(계약 후 30일)이 지난 달만 확정치로 쓴다. */
  const renderedAt = new Date();
  const statSnapshot = snapshotHasValues(snapshot) ? snapshot : null;
  const overview = buildRegionOverview({
    name,
    snapshot: statSnapshot,
    indexSeries: series,
    jeonseSeries,
    volume,
    now: renderedAt,
  });
  const { closed: volumeClosed, open: volumeOpen } = splitByReporting(volume, renderedAt);
  const jeonseRatio = overview.jeonse ? `${overview.jeonse.value.toFixed(1)}%` : "—";

  /* 첫 문단·Q&A 의 "최근 달"은 신고가 끝난 달 — 예전엔 신고 중인 달(예: 8월 80건)을 그대로 적어
     "거래가 반 토막"처럼 읽혔다. 끝난 달이 하나도 없으면 있는 마지막 달을 쓴다(문장에 신고 지연을 적는다). */
  const latestVolume =
    volumeClosed.length > 0 ? volumeClosed[volumeClosed.length - 1] : volume.length > 0 ? volume[volume.length - 1] : null;
  const volumeTotal = volume.reduce((acc, v) => acc + v.count, 0);

  /* [1009 · H] 입주 예정 제목의 연도 범위 — 고정 "2026~2027" 대신 받은 데이터에서 */
  const supplyYears = [...new Set(supply.map((si) => si.moveInYm.slice(0, 4)).filter((y) => /^\d{4}$/.test(y)))].sort();
  const supplyYearsLabel =
    supplyYears.length === 0
      ? null
      : supplyYears.length === 1
        ? `${supplyYears[0]}년`
        : `${supplyYears[0]}~${supplyYears[supplyYears.length - 1]}년`;

  /* 전월세 월별 신고 — 같은 규칙(신고가 끝난 달만 선으로) */
  const rentTrend = rentSnap ? countsToTrend("volume", "전월세", rentSnap.monthly, renderedAt) : null;
  const rentOpen = rentSnap ? splitByReporting(rentSnap.monthly, renderedAt).open : [];

  /* 추세 카드 — 지표 셋(있는 것만, region-trends.ts). 하네스와 같은 함수 */
  const trendDatasets = buildRegionTrendDatasets({
    name,
    indexSeries: series,
    jeonseSeries,
    volume,
    now: renderedAt,
  });

  /* ---------- G12 — 발췌해도 완결되는 첫 문단 ----------
     여기에 들어가는 문장은 전부 위에서 실제로 읽어 온 값에서 만든다.
     값이 없으면 그 문장을 아예 넣지 않는다(빈칸을 "—" 로 채우지 않는다). */
  const priceClauses: string[] = [];
  if (snapshot && snapshot.avgSale !== undefined && snapshot.avgSale > 0) {
    priceClauses.push(`평균 매매가 ${formatKrwShort(snapshot.avgSale)}`);
  }
  if (snapshot && snapshot.medianSale !== undefined && snapshot.medianSale > 0) {
    priceClauses.push(`중위 매매가 ${formatKrwShort(snapshot.medianSale)}`);
  }
  /* 스냅샷 문장에는 스냅샷의 전세가율만 — 같은 기준월끼리 묶는다(시계열 값은 아래 지수 문장이 쓴다) */
  if (statSnapshot?.jeonseRatio !== undefined && Number.isFinite(statSnapshot.jeonseRatio)) {
    priceClauses.push(`전세가율 ${statSnapshot.jeonseRatio.toFixed(1)}%`);
  }

  const leadSentences: string[] = [];
  /* [1009 · H] 스냅샷 값이 비어도(서울 구) 부동산원 월간 지수가 있으면 그걸로 첫 문장을 쓴다 — 예전엔
     "강남구의  기준 아파트 시세 지표는 아직 수집된 항목이 없습니다"(빈 기간)였다. */
  const idxNow = overview.index;
  leadSentences.push(
    statSnapshot && priceClauses.length > 0
      ? `${name}의 ${formatYm(statSnapshot.period)} 아파트 시세는 ${priceClauses.join(
          " · ",
        )}입니다(출처 ${sourceLabel(statSnapshot.source)}).`
      : idxNow
        ? `${name}의 ${formatYm(idxNow.ym)} 아파트 매매가격지수는 ${idxNow.value.toFixed(1)}${
            jeonseRatio !== "—" ? `, 전세가율은 ${jeonseRatio}` : ""
          }입니다(출처 한국부동산원 R-ONE 월간 통계).`
        : !overview.hasReb
          ? /* [998] 통계가 없는 사실만 적는다 — 이유(개편 뒤 미공표·집계 단위 불일치)는 지역마다 달라 단정하지 않는다 */
            `${name}의 한국부동산원(R-ONE) 지역 시세 통계는 아직 없습니다. 이 구 단위 집계가 공표되면 그때 붙습니다. 아래 실거래·거래량은 국토교통부 신고 자료입니다.`
          : `${name}의 한국부동산원 지역 시세 지표는 아직 수집된 항목이 없습니다.`,
  );
  const monthlyChange =
    statSnapshot && statSnapshot.saleChangeMonthly !== undefined && Number.isFinite(statSnapshot.saleChangeMonthly)
      ? statSnapshot.saleChangeMonthly
      : idxNow?.momPct ?? null;
  if (monthlyChange !== null) {
    leadSentences.push(
      Math.abs(monthlyChange) < 0.05
        ? "매매가격지수는 전월 대비 보합입니다."
        : `매매가격지수는 전월 대비 ${Math.abs(monthlyChange).toFixed(2)}% ${monthlyChange > 0 ? "올랐습니다" : "내렸습니다"}.`,
    );
  }
  if (latestVolume !== null) {
    const openTail =
      volumeOpen.length > 0
        ? `(${volumeOpen.map((v) => formatYm(v.month)).join("·")}분은 신고 기한 안이라 집계 중)`
        : "";
    leadSentences.push(
      `국토교통부에 신고된 아파트 매매는 ${formatYm(latestVolume.month)}에 ${latestVolume.count.toLocaleString(
        "ko-KR",
      )}건${openTail}이며, 최근 ${volume.length}개월 합계는 ${volumeTotal.toLocaleString("ko-KR")}건입니다.`,
    );
  }
  if (projectsShown.length > 0) {
    leadSentences.push(
      `공개 자료로 확인된 ${shortName} 정비사업 구역은 ${projects.length.toLocaleString(
        "ko-KR",
      )}곳입니다.`,
    );
  }
  if (supply.length > 0) {
    /* limit 24 조회라 24곳이면 "이상"일 수 있다 — 상한에 걸린 경우 표현을 바꾼다 */
    leadSentences.push(
      supply.length >= 24
        ? `입주 예정 물량으로 잡힌 단지는 24곳 이상입니다.`
        : `입주 예정 물량으로 잡힌 단지는 ${supply.length}곳입니다.`,
    );
  }
  if (notes.length > 0) {
    leadSentences.push(`이웃이 공개한 임장노트는 ${notes.length}편 있습니다.`);
  }
  leadSentences.push(
    "모두 공공 실거래·공표 통계에서 계산한 값이며, 중개 매물의 호가는 포함하지 않습니다.",
  );
  const lead = leadSentences.join(" ");

  /* [개선 #7] 시장 흐름 읽기 — 추가 조회 없이 위에서 읽은 값의 산술 서술 */
  /* [1009 · H] 입력을 정확히: 지수는 마지막 13칸(= 12개월 변화 — 문장이 "12개월 동안"이라고 말한다), 거래량은
     신고가 끝난 달만(신고 중인 달로 "전월 대비 58% 줄었습니다"를 쓰지 않게), 전세가율은 시계열 값(서울 구 스냅샷은 비어 있다). */
  /* [1009 · H 리뷰] market-read 문단은 "N개월 동안"이 아니라 **"12개월 동안"으로 고정**해 말한다(lib/region/market-read.ts) —
     지수가 12칸뿐인 지역(종로)은 11개월 변화를 "12개월 동안"이라고 적었다. 마지막 달과 정확히 12개월 전 달이 둘 다
     있을 때만 그 13칸을 넘기고, 아니면 지수 문단을 빼고 그린다(지수는 위 머리·추세 카드에 그대로 있다). */
  const readSeries = (() => {
    const tail = series.slice(-13);
    const lastYm = tail.length > 0 ? toYm(tail[tail.length - 1].period) : null;
    const firstYm = tail.length > 0 ? toYm(tail[0].period) : null;
    return lastYm && firstYm && shiftYm(lastYm, 12) === firstYm ? tail : [];
  })();
  const marketRead = buildMarketRead({
    name,
    series: readSeries,
    volume: volumeClosed.map((v) => ({ month: v.month, count: v.count })),
    supply: supply.map((si) => ({ households: si.households })),
    supplyCapped: supply.length >= 24,
    jeonseRatio: overview.jeonse?.value,
    avgSaleLabel:
      statSnapshot && statSnapshot.avgSale !== undefined && statSnapshot.avgSale > 0
        ? formatKrwShort(statSnapshot.avgSale)
        : null,
    /* [998] periodLabel 은 avgSaleLabel 이 있을 때만 문장에 쓰인다 — 스냅샷 없으면 둘 다 비어 문장이 안 만들어진다 */
    periodLabel: statSnapshot ? formatYm(statSnapshot.period) : "",
  });

  /* ---------- Q&A — 이 페이지에 실제로 보이는 숫자로만 ---------- */
  const faq: FaqItem[] = [];
  if (statSnapshot && priceClauses.length > 0) {
    faq.push({
      q: `${name} 아파트 시세는 얼마인가요?`,
      a: `${formatYm(statSnapshot.period)} 기준 ${name} 아파트는 ${priceClauses.join(
        " · ",
      )}입니다. ${sourceLabel(statSnapshot.source)}가 공표한 지역 통계이며, 개별 단지·평형에 따라 실제 거래가는 크게 다릅니다.`,
    });
  }
  if (latestVolume !== null) {
    faq.push({
      q: `${name}는 요즘 거래가 잘 되나요?`,
      a: `국토교통부 실거래 신고 기준으로 ${formatYm(latestVolume.month)} ${name} 아파트 매매는 ${latestVolume.count.toLocaleString(
        "ko-KR",
      )}건, 최근 ${volume.length}개월 합계는 ${volumeTotal.toLocaleString(
        "ko-KR",
      )}건입니다. 다만 계약일로부터 30일의 신고 기한이 있어 가장 최근 1~2개월은 실제보다 적게 집계됩니다.`,
    });
  }
  if (transactions.length > 0) {
    const t = transactions[0];
    faq.push({
      q: `${name}에서 가장 최근에 신고된 아파트 거래는 무엇인가요?`,
      a: `${formatYm(t.contractYm)}${
        t.contractDay ? `.${String(t.contractDay).padStart(2, "0")}` : ""
      } ${t.complexName}${t.areaM2 !== null ? ` ${t.areaM2.toFixed(1)}㎡` : ""}${
        t.floor !== null ? ` ${t.floor}층` : ""
      }이 ${formatKrwShort(t.dealAmountKrw)}에 거래된 건이 이 페이지에 수집된 가장 최근 신고분입니다.`,
    });
  }
  if (projectsShown.length > 0) {
    const top = projectsShown[0];
    faq.push({
      q: `${shortName}에 진행 중인 정비사업이 있나요?`,
      a: `공개 자료로 확인된 ${shortName} 정비사업 구역은 ${projects.length.toLocaleString(
        "ko-KR",
      )}곳입니다. 진행 단계가 가장 앞선 곳은 ${top.name}(${labelForType(
        top.typeKey,
      )} · ${stageLabel(top.stageKey)})입니다. 단계는 공개 고시·언론 공개정보 기준 참고값이며, 확정 일정은 조합·지자체 공고를 확인해야 합니다.`,
    });
  }
  faq.push({
    q: "이 페이지의 숫자는 어디서 오나요?",
    a: `${
      snapshot
        ? `시세 지표는 ${sourceLabel(snapshot.source)} 공표 통계, `
        : /* [998] 없는 통계를 출처로 말하지 않는다 */
          `시세 지표(한국부동산원 지역 통계)는 이 지역 단위로 아직 공표되지 않아 비어 있고, `
    }실거래와 거래량은 국토교통부 실거래가 공개시스템, 입주 예정 물량과 정비사업은 공공기관 공개 자료입니다. 매물 호가나 중개사 제공 가격은 쓰지 않으며, 값이 없는 항목은 추정치로 채우지 않고 비워 둡니다.`,
  });

  // JSON-LD(BreadcrumbList + Place) — 실데이터 스냅샷, 존재 필드만
  // (FAQPage 는 QaBlock 이 화면에 보이는 items 로 직접 생성한다)
  const regionJsonLd = [
    /* "지역 시세"는 목적지가 없는 라벨이라 뺐다 — item(URL) 없는 중간 항목은
       구글이 심각 오류로 처리해 탐색경로 전체를 버린다(2026-07-27 Search Console).
       화면 상단 breadcrumb 텍스트에는 그대로 남는다(그건 시각 라벨이다). */
    breadcrumbJsonLd([
      { name: "홈", url: "/" },
      { name, url: `/region/${id}` },
    ]),
    /* G6: 예전엔 여기 Place 와 별개로 @id 없는 Place 를 하나 더 내보내
       같은 지역이 두 엔티티로 읽혔다. 상위 시/도(txRegion.city)를 넘겨
       addressRegion=시/도 + addressLocality=구 로 합쳤다. */
    regionPlaceJsonLd({
      id,
      name,
      description:
        snapshot && snapshot.avgSale !== undefined
          ? `${name} 아파트 평균 매매가 ${formatKrwShort(snapshot.avgSale)} (${formatYm(
              snapshot.period,
            )} 기준)`
          : null,
      parentRegion: txRegion.city && txRegion.city !== name ? txRegion.city : null,
    }),
    /* [1006 · E] WebPage + speakable — 아래 G12 첫 문단(<section data-ai-summary>)을 가리킨다.
       dateModified 는 실거래 마지막 적재 성공일(렌더 시각 아님) — 캡션이 없으면 넣지 않는다. */
    webPageJsonLd({
      path: `/region/${id}`,
      name: `${name} 아파트 시세·실거래·정비사업`,
      description: lead,
      dateModified: freshnessLabelToIsoDate(freshness),
      speakableSelectors: [AI_SUMMARY_SELECTOR],
      mainEntityId: regionEntityId(id),
    }),
    /* [1006 · E] Dataset — 이 페이지가 실제로 그리는 월별 거래량·평균가 시계열(market_region_monthly).
       같은 집계를 공개 API(/api/public/v1/regions/monthly)가 JSON 으로 준다(N20). 시계열이
       비어 있거나 조회 실패면 노드를 만들지 않는다 — 없는 데이터셋을 기술하지 않는다. */
    ...(volumeR.ok && volume.length > 0
      ? [
          datasetJsonLd({
            path: `/region/${id}`,
            name: `${name} 아파트 매매 월별 거래량·평균가`,
            description:
              `${name} 아파트 매매 실거래의 월별 신고 건수와 평균가 ${volume.length}개월` +
              `(${formatYm(volume[0].month)}~${formatYm(volume[volume.length - 1].month)}). ` +
              "국토교통부 실거래가 공개시스템 신고분 기준, 해제 신고 제외. 최근 두 달은 신고 지연으로 잠정치.",
            keywords: [name, "아파트", "실거래가", "거래량", "월별"],
            temporalCoverage: ymRangeToTemporalCoverage(volume[0].month, volume[volume.length - 1].month),
            dateModified: freshnessLabelToIsoDate(freshness),
            variableMeasured: ["아파트 매매 신고 건수", "아파트 매매 평균가(원)"],
            spatialCoverage: txRegion.city && txRegion.city !== name ? `${txRegion.city} ${name}` : name,
            /* region 파라미터는 region_name 부분 일치(lib/api/public-aggregates.ts ilike) —
               "중구"처럼 여러 시/도에 있는 이름은 카탈로그 전체 이름(name)으로 좁힌다. */
            distributionUrl: `https://naezipnow.com/api/public/v1/regions/monthly?region=${encodeURIComponent(
              name,
            )}`,
          }),
        ]
      : []),
  ];

  return (
    <PageShell
      breadcrumb={`홈 › 지역 시세 › ${name}`}
      title={`${name}에 산다는 것`}
    >
      {/* JSON-LD(BreadcrumbList + Place) — 지역 SEO 구조화 데이터 */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript(regionJsonLd) }}
      />
      {/* [1009 · H] 예전 머리 줄("{기준월} 기준 · 출처 …")은 서울 구에서 기준월이 빈칸이었다 — 출처·기준일은 아래 머리 카드가 적는다 */}
      {/* [998] 폐지된 구 — 옛 통계는 그대로 두고, 지금의 구 페이지로 이어 준다 */}
      {retiredAt && successors.length > 0 && (
        <p className="rise-in mb-3 t-sub text-text-2">
          {retiredAt.slice(0, 7).replace("-", ".")} 행정구역 개편으로{" "}
          {successors.map((s, i) => (
            <span key={s.id}>
              {i > 0 && "·"}
              <Link href={`/region/${s.id}`} className="inline-flex min-h-[24px] items-center font-bold text-primary underline">
                {s.name}
              </Link>
            </span>
          ))}
          {successors.length > 1 ? "로 나뉘었어요" : "가 됐어요"}. 이 페이지는 개편 전 통계입니다.
        </p>
      )}
      {/* [1009 · H] 결론 한 줄 → 큰 숫자 넷(칸마다 비교 기준·ⓘ) → 출처 → 지도·월간 리포트·동네 홈.
          예전 "현재가 KPI 4카드"(서울 구에선 — 네 칸)와 [#64] 동네 홈 칩을 이 카드 하나로 합쳤다. */}
      <RegionHero
        id={id}
        name={name}
        mapRegion={mapRegion}
        overview={overview}
        freshnessLine={<MarketFreshnessLine label={freshness} className="mt-0.5" />}
      />

      {/* G12 — 이 문단만 떼어 인용해도 뜻이 통해야 한다.
          [1006 · E] data-ai-summary — 위 WebPage JSON-LD 의 speakable.cssSelector 가 이 블록을
          가리킨다(문단은 그대로, 껍데기만 section 으로). 새 요약 블록을 따로 만들지 않는다.
          [1009 · H] 결론·숫자는 위 카드가 먼저 말한다 — 이 문단은 그 아래 한 단계 옅게(요약 전문). */}
      <section data-ai-summary="" id="ai-summary" aria-label={`${name} 시세 요약`} className="rise-in mb-5">
        <p className="t-sub text-text-2">{lead}</p>
      </section>

      {/* [1009 · H] 시세 흐름 — 지수·전세가율·거래량을 한 카드에서 탭으로 바꿔 보고, 누르고 끌어 그 달 값을 읽는다.
          예전 두 CSS 막대(칸마다 title= — 휴대폰에선 값이 안 보였다)를 대신한다. 셋 다 없으면 예전처럼 사실을 적는다. */}
      {trendDatasets.length > 0 ? (
        <RegionTrendCard
          heading={`${name} 시세 흐름`}
          datasets={trendDatasets}
          after={
            tempRegion ? (
              <p className="mt-3 flex items-center gap-0.5 t-sub text-text-3">
                <Link
                  href={`/analysis/temperature/${encodeURIComponent(id)}`}
                  className="inline-flex min-h-[24px] items-center font-bold text-primary underline"
                >
                  {name} 시장 온도 주간 기록 보기 →
                </Link>
                {/* [1009 · H] 시장 온도의 뜻 — /methodology "시장 온도" 와 같은 말로 */}
                <Explain
                  term="sijang-ondo"
                  how={[
                    "50점을 중립으로 ① 매매가격지수 모멘텀(최근 3구간 평균 변동률 — 월간 지수면 월 ±1%, 주간 지수면 주 ±0.3% 를 ±25점)과 ② 거래량 추이(이번 달을 뺀 최근 최대 3개월 합을 그 직전 같은 개월 수의 합과 비교, ±50% 변화를 ±25점)를 더하고 5~95점 안으로 잘라요.",
                    "이번 달을 뺀 거래량 월이 4개 미만이면 지수 모멘텀만 반영해요.",
                    "매수·매도 추천이 아니라 시장 상태를 요약한 숫자예요.",
                  ]}
                  source="내집나우 주간 산출 · 한국부동산원 지수 · 국토교통부 실거래 신고"
                />
              </p>
            ) : null
          }
        />
      ) : (
        <section className="card mb-6 p-[var(--pad-card)]">
          <h2 className="t-section text-ink">{name} 시세 흐름</h2>
          {!seriesR.ok || !volumeR.ok ? (
            <LoadFailed what="시세 흐름" />
          ) : (
            <p className="py-6 text-center t-body text-text-3">
              이 지역의 매매가격지수·월별 거래량이 아직 두 달 치 이상 모이지 않았어요.
            </p>
          )}
        </section>
      )}

      {/* [개선 #7] 시장 흐름 읽기 — 위 표·차트의 숫자를 지역마다 다른 문장으로.
          전 문장이 이 페이지가 이미 읽은 실데이터의 산술 서술이다(전망·권유 없음,
          lib/region/market-read.ts). 값이 부족한 지역은 문단 수가 줄고, 아예
          없으면 섹션 자체가 안 그려진다 — 빈 틀을 만들지 않는다. */}
      {marketRead.paragraphs.length > 0 && (
        <section className="rise-in-1 card mb-6 p-[var(--pad-card)]">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="t-section text-ink">
              {name} 시장 흐름 읽기
            </h2>
            {/* [개선 #13] 지역 이름 키워드로 뉴스·동네글 알림 원탭 구독 */}
            <KeywordAlertButton scope="news" query={name} label={`${name} 새 소식`} />
          </div>
          <div className="mt-2 flex flex-col gap-2.5">
            {marketRead.paragraphs.map((p, i) => (
              <p key={i} className="t-body text-text-1">
                {p}
              </p>
            ))}
          </div>
          {/* [#79] 월간 아카이브 진입 — "그때 얼마였지"를 월 고정 페이지로 */}
          <div className="mt-3">
            <Link
              href={`/region/${id}/report`}
              className="inline-flex min-h-[24px] items-center t-body font-bold text-primary"
            >
              월간 리포트 아카이브 — 지난달까지의 월별 스냅샷 ›
            </Link>
          </div>
        </section>
      )}

      {/* 최근 실거래 5건 — [1009 · H] 한 건의 가격은 정밀 표기("12억 4,500만", 네이버 부동산 관례) */}
      <section className="rise-in-2 card mb-6 p-[var(--pad-card)]">
        <h2 className="t-section text-ink">
          최근 실거래{" "}
          <span className="t-sub font-medium text-text-3">
            아파트 매매 · 국토부 실거래가
          </span>
        </h2>
        {!transactionsR.ok ? (
          <LoadFailed what="최근 실거래" />
        ) : transactions.length === 0 ? (
          <p className="py-6 text-center t-body text-text-3">
            이 지역에서 수집된 아파트 매매 실거래가 아직 없습니다.
          </p>
        ) : (
          <ul className="mt-2">
            {transactions.map((t, i) => (
              <li
                key={`${t.complexName}-${t.contractYm}-${i}`}
                className={`flex items-center justify-between gap-3 py-3 ${
                  i < transactions.length - 1 ? "border-b border-border" : ""
                }`}
              >
                <div className="min-w-0">
                  <div className="t-body font-bold text-ink break-words">
                    {t.complexName}
                  </div>
                  <div className="mt-0.5 t-sub tabular-nums text-text-3">
                    {formatYm(t.contractYm)}
                    {t.contractDay ? `.${String(t.contractDay).padStart(2, "0")}` : ""}
                    {t.areaM2 !== null ? ` · ${t.areaM2.toFixed(1)}㎡` : ""}
                    {t.floor !== null ? ` · ${t.floor}층` : ""}
                  </div>
                </div>
                <div className="shrink-0 t-section t-num text-ink">
                  {formatEokMan(t.dealAmountKrw / 10_000)}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* 단지별 현황 — market_transactions 그룹 요약. [1009 · H] 표(가로 스크롤) → 누르는 목록 행(RegionComplexList) */}
      <section className="rise-in-2 card mb-6 p-[var(--pad-card)]">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="t-section text-ink">
            단지별 현황{" "}
            <span className="t-sub font-medium text-text-3">
              국토부 실거래가 기반 · 매물 호가 아님
            </span>
          </h2>
        </div>
        {complexSummaries.length > 0 && complexR.ok && (
          <p className="m-0 mt-1 t-caption text-text-3">최근 거래순 · 오른쪽 가격은 가장 최근 신고 1건이에요</p>
        )}
        <ExpandableComplexRows
          canExpand={complexSummaries.length > 12}
          collapsed={
            <RegionComplexList
              summaries={complexSummaries.slice(0, 12)}
              regionId={id}
              failed={!complexR.ok}
            />
          }
          expanded={
            <RegionComplexList
              summaries={complexSummaries}
              regionId={id}
              failed={!complexR.ok}
            />
          }
        />
        {/* [970 · B-03] 브라우즈는 서울 25개 구만 다룬다(SEOUL_BROWSE_REGIONS) — 다른 시/도
            지역에서 district=중구 로 보내면 강남구 폴백이 떴다. 서울일 때만 링크한다. */}
        {complexSummaries.length > 0 && txRegion.city === "서울" && (
          <div className="mt-3 text-right">
            <Link
              href={`/complex/browse?district=${encodeURIComponent(`서울 ${txRegion.name}`)}`}
              className="inline-flex min-h-[24px] items-center t-sub font-bold text-primary"
            >
              서울 전체 단지 브라우즈 →
            </Link>
          </div>
        )}
      </section>

      {/* [#94] 전월세 시장 — 46.9만 행의 첫 노출면. 산술 사실(중앙값·건수)만 서술,
          신고 지연·갱신/신규 미구분(원천 한계)은 화면에 명기한다. */}
      {rentSnap && (rentSnap.jeonse.count > 0 || rentSnap.wolse.count > 0) && (
        <section className="rise-in-2 card mb-6 p-[var(--pad-card)]">
          <h2 className="t-section text-ink">
            전월세 시장{" "}
            <span className="t-sub font-medium text-text-3">
              {rentSnap.periodLabel} 신고분 {rentSnap.sampleCount.toLocaleString("ko-KR")}건
              {rentSnap.sampleTruncated ? " 표본" : ""} 기준
            </span>
          </h2>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
            <div className="rounded-xl bg-bg px-3 py-2.5">
              <div className="t-caption text-text-3">전세 보증금 중앙값</div>
              <div className="mt-0.5 t-section tabular-nums text-ink">
                {rentSnap.jeonse.medianDepositKrw59_85 !== null
                  ? formatKrwShort(rentSnap.jeonse.medianDepositKrw59_85)
                  : rentSnap.jeonse.medianDepositKrw !== null
                    ? formatKrwShort(rentSnap.jeonse.medianDepositKrw)
                    : "—"}
              </div>
              <div className="t-caption text-text-3">
                {rentSnap.jeonse.medianDepositKrw59_85 !== null ? "59~85㎡ 기준" : "전체 면적 기준"} ·{" "}
                {rentSnap.jeonse.count.toLocaleString("ko-KR")}건
              </div>
            </div>
            <div className="rounded-xl bg-bg px-3 py-2.5">
              <div className="t-caption text-text-3">월세 중앙값</div>
              <div className="mt-0.5 t-section tabular-nums text-ink">
                {rentSnap.wolse.medianMonthlyKrw !== null
                  ? `월 ${Math.round(rentSnap.wolse.medianMonthlyKrw / 10_000).toLocaleString("ko-KR")}만`
                  : "—"}
              </div>
              <div className="t-caption text-text-3">
                보증금 중앙{" "}
                {rentSnap.wolse.medianDepositKrw !== null
                  ? formatKrwShort(rentSnap.wolse.medianDepositKrw)
                  : "—"}{" "}
                · {rentSnap.wolse.count.toLocaleString("ko-KR")}건
              </div>
            </div>
            <div className="rounded-xl bg-bg px-3 py-2.5">
              <div className="t-caption text-text-3">월세 비중</div>
              <div className="mt-0.5 t-section tabular-nums text-ink">
                {rentSnap.wolseShare !== null ? `${Math.round(rentSnap.wolseShare * 100)}%` : "—"}
              </div>
              <div className="t-caption text-text-3">전월세 신고 중 월세 계약</div>
            </div>
          </div>
          {/* [1009 · H] 월별 신고 건수 — 막대(칸마다 title=, 휴대폰에선 값이 안 보였다) → 훑는 추세선.
              신고 기한(30일)이 지나지 않은 달은 선에서 빼고 아래 줄에 따로 적는다(예전엔 "마지막 두 칸 점선"). */}
          {rentTrend && rentTrend.values.length >= 3 && (
            <ScrubLineLazy
              className="mt-4"
              values={rentTrend.values}
              labels={rentTrend.labels}
              fullLabels={rentTrend.fullLabels}
              format="int"
              suffix="건"
              tone="primary"
              height={150}
              title="월별 전월세 신고"
              caption="신고가 끝난 달"
              ariaLabel={`${name} 아파트 전월세 월별 신고 건수`}
            />
          )}
          <p className="mt-3 t-sub text-text-3">
            국토교통부 전월세 신고 기준.
            {rentOpen.length > 0
              ? ` ${rentOpen.map((m) => `${ymMonth(m.month)} ${m.count.toLocaleString("ko-KR")}건`).join("·")}은 신고 기한(계약 후 30일) 안이라 더 늘어요 — 그래프에서 뺐어요.`
              : ""}{" "}
            신고분에는 갱신·신규 계약이 섞여 있어 체감 시세와 다를 수 있습니다. 중앙값은 지역 전체
            기준이라 단지별 편차가 큽니다.
          </p>
        </section>
      )}

      {/* [#52] 평형대별 시세 — "○○구 30평대" 검색 수요를 지역 페이지 안에서 받는다 */}
      {areaBands && areaBands.bands.length > 0 && (
        <section className="rise-in-2 card mb-6 p-[var(--pad-card)]">
          <h2 className="t-section text-ink">
            평형대별 매매 시세{" "}
            <span className="t-sub font-medium text-text-3">
              {areaBands.periodLabel} 신고 {areaBands.sampleCount.toLocaleString("ko-KR")}건
              {areaBands.truncated ? " 표본" : ""} 기준
            </span>
          </h2>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[420px] t-body">
              <thead>
                <tr className="border-b border-line text-left t-sub text-text-3">
                  <th className="py-1.5 pr-3 font-semibold">면적대</th>
                  <th className="py-1.5 pr-3 text-right font-semibold">거래</th>
                  <th className="py-1.5 pr-3 text-right font-semibold">중앙값</th>
                  <th className="py-1.5 text-right font-semibold">평당 중앙값</th>
                </tr>
              </thead>
              <tbody>
                {areaBands.bands.map((b) => (
                  <tr key={b.key} className="border-b border-divider last:border-0">
                    <td className="py-2 pr-3 font-bold text-ink">{b.label}</td>
                    <td className="py-2 pr-3 text-right tabular-nums text-text-1">
                      {b.count.toLocaleString("ko-KR")}건
                    </td>
                    <td className="py-2 pr-3 text-right font-extrabold tabular-nums text-ink">
                      {formatKrwShort(b.medianKrw)}
                    </td>
                    <td className="py-2 text-right tabular-nums text-text-1">
                      {formatKrwShort(b.medianPerPyeongKrw)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 t-sub text-text-3">
            표본 5건 미만 면적대는 표시하지 않습니다. 중앙값 기준이라 단지·층·연식에 따라
            실제 가격은 다릅니다.
          </p>
        </section>
      )}

      {/* 이 지역 입주 예정 물량 — 조회 실패는 섹션 자체를 렌더하지 않는다
          (없다고 말하지 않기 위해서다) */}
      {supply.length > 0 && (
        <section className="rise-in-3 card mb-6 p-[var(--pad-card)]">
          <div className="flex items-center gap-0.5">
            <h2 className="t-section text-ink">
              {name} 입주 예정 물량{" "}
              <span className="t-sub font-medium text-text-3">
                {supplyYearsLabel ? `${supplyYearsLabel} 입주` : "입주 예정"}
              </span>
            </h2>
            <Explain
              term="ipju-mulryang"
              how={[
                "주소에 이 지역이 들어간 단지를 이번 달 이후 입주월 순으로 최대 24곳 읽어요 — 목록은 앞의 6곳, 연도 합계는 24곳 전부예요.",
                "연도 막대는 세대수가 공개된 단지만 더했어요 — 세대수 미상은 뺀 건수를 따로 적어요.",
                "입주월의 달이 비었거나 잘못 적힌 단지는 “월 미정”으로 적어요. 같은 단지가 두 입주월로 올라 있으면 연도 합계에 두 번 들어갈 수 있어요(원자료 그대로).",
                "사업 진행에 따라 입주 일정은 바뀔 수 있어요.",
              ]}
              source="청약홈 분양공고(매일 자동) · 공공데이터 입주예정물량(2026년 2월 수동)"
            />
          </div>
          {/* 웹16 — 연도별 세대 합 미니 막대. 세대수가 실려 있는 조회분만
              집계하고(미상 제외 건수 병기), 연도가 2개 이상일 때만 그린다
              (막대 1개는 비교가 아니라 장식이다). */}
          {(() => {
            const byYear = new Map<string, number>();
            let unknown = 0;
            for (const s of supply) {
              const y = s.moveInYm.slice(0, 4);
              if (!/^\d{4}$/.test(y)) continue;
              if (s.households == null || s.households <= 0) {
                unknown += 1;
                continue;
              }
              byYear.set(y, (byYear.get(y) ?? 0) + s.households);
            }
            const years = [...byYear.entries()].sort((a, b) => a[0].localeCompare(b[0]));
            if (years.length < 2) return null;
            const max = Math.max(...years.map(([, v]) => v));
            return (
              <div className="mt-3 flex flex-col gap-1.5">
                {years.map(([y, v]) => (
                  <div key={y} className="flex items-center gap-2.5 t-sub">
                    <span className="w-[38px] shrink-0 font-bold tabular-nums text-text-2">
                      {y}
                    </span>
                    <span className="h-[8px] flex-1 overflow-hidden rounded-full bg-bg">
                      <span
                        className="block h-full rounded-full bg-primary/55"
                        style={{ width: `${Math.max(2, Math.round((v / max) * 100))}%` }}
                      />
                    </span>
                    <span className="w-[76px] shrink-0 text-right tabular-nums text-text-2">
                      {v.toLocaleString("ko-KR")}세대
                    </span>
                  </div>
                ))}
                <p className="t-caption text-text-3">
                  조회분 {supply.length}건 중 세대수 확인분 합계
                  {unknown > 0 && ` (세대수 미상 ${unknown}건 제외)`} · 일정은 변동될 수
                  있습니다
                </p>
              </div>
            );
          })()}
          <ul className="mt-2">
            {supply.slice(0, 6).map((s, i) => (
              <li
                key={`${s.moveInYm}-${i}`}
                className="flex items-center justify-between gap-3 border-b border-border py-3 last:border-0"
              >
                <div className="min-w-0">
                  <div className="truncate t-body font-bold text-ink">
                    {s.aptName ?? "미정"}
                    {s.bizType ? (
                      <span className="ml-1.5 rounded-full bg-primary-soft chip-pad-tight t-caption font-semibold text-primary">
                        {s.bizType}
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-0.5 truncate t-sub text-text-3">
                    {s.address ?? ""}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  {/* [1009 · H 리뷰] 달이 00·13 같은 행(운영 /region/mapo "2027.00")은 "월 미정" — /supply 의 validYm 과 같은 규칙 */}
                  <div className="t-body font-extrabold tabular-nums text-ink">{moveInLabel(s.moveInYm)}</div>
                  <div className="t-sub text-text-3">
                    {s.households ? `${s.households.toLocaleString()}세대` : "—"}
                  </div>
                </div>
              </li>
            ))}
          </ul>
          <Link
            href={`/supply?region=${encodeURIComponent(txRegion.city)}`}
            className="mt-3 inline-flex min-h-[24px] items-center t-sub font-bold text-primary"
          >
            {txRegion.city} 전체 입주 물량 ›
          </Link>
        </section>
      )}

      {/* 정비사업 — DB 확정분만. 0곳이거나 조회 실패면 섹션을 만들지 않는다.
          "정비사업이 없는 동네" 는 우리가 확인할 수 없는 주장이다. */}
      {projectsShown.length > 0 && (
        <section className="rise-in-3 card mb-6 p-[var(--pad-card)]">
          <h2 className="t-section text-ink">
            {shortName} 정비사업{" "}
            <span className="t-sub font-medium text-text-3">
              공개 자료 확인분 {projects.length.toLocaleString("ko-KR")}곳
            </span>
          </h2>
          <ul className="mt-2">
            {projectsShown.map((p) => (
              <li
                key={p.id}
                className="flex items-center justify-between gap-3 border-b border-border py-3 last:border-0"
              >
                <div className="min-w-0">
                  <div className="truncate t-body font-bold text-ink">{p.name}</div>
                  <div className="mt-0.5 truncate t-sub text-text-3">
                    {labelForType(p.typeKey)} · {stageLabel(p.stageKey)}
                    {p.address ? ` · ${p.address}` : ""}
                  </div>
                </div>
                <div className="shrink-0 text-right t-sub text-text-3">
                  {p.households ? `${p.households.toLocaleString("ko-KR")}세대` : "세대수 미공개"}
                </div>
              </li>
            ))}
          </ul>
          <p className="mt-3 t-sub text-text-3">
            진행 단계는 공개 고시·언론 공개정보 기준 참고값입니다. 확정 일정과 조건은
            조합·지자체 공고를 확인해 주세요.
          </p>
          <Link
            href="/redevelopment"
            className="mt-2 inline-flex min-h-[24px] items-center t-sub font-bold text-primary"
          >
            정비사업 지도에서 보기 ›
          </Link>
        </section>
      )}

      {/* 이 지역 공개 임장노트 */}
      <section className="rise-in-3 card mb-6 p-[var(--pad-card)]">
        <h2 className="t-section text-ink">
          {name} 공개 임장노트
        </h2>
        {!notesR.ok ? (
          <LoadFailed what="공개 임장노트" />
        ) : notes.length === 0 ? (
          <p className="py-6 text-center t-body text-text-3">
            아직 이 지역의 공개 임장노트가 없어요. 첫 노트를 남겨보세요.
          </p>
        ) : (
          <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
            {notes.map((n) => (
              <Link
                key={n.id}
                href={`/notes/${n.id}`}
                className="card tile block p-4"
              >
                <div className="truncate t-body font-bold text-ink">
                  {n.title}
                </div>
                <div className="mt-1 t-sub text-text-3">
                  {n.region}
                  {n.aptName ? ` · ${n.aptName}` : ""} · {n.visitDate}
                </div>
                {n.summary ? (
                  <p className="mt-2 line-clamp-2 t-sub text-text-2">
                    {n.summary}
                  </p>
                ) : null}
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* A5 — 면적대·가격대별 실거래 랜딩 내부 링크 */}
      {txBandRegion && (
        <section className="rise-in-3 card mb-6 p-[var(--pad-card)]">
          <h2 className="t-section text-ink">
            면적대·가격대별 실거래{" "}
            <span className="t-sub font-medium text-text-3">
              국토부 신고 {txBandRegion.txCount.toLocaleString("ko-KR")}건 기준
            </span>
          </h2>
          {(["area", "price"] as const).map((kind) => {
            const cells = kind === "area" ? txBandRegion.areaCells : txBandRegion.priceCells;
            if (cells.length === 0) return null;
            return (
              <div key={kind} className="mt-3">
                <div className="mb-1.5 t-sub text-text-3">{BAND_KIND_LABEL[kind]}</div>
                <div className="flex flex-wrap gap-2">
                  {cells.map((c) => (
                    <Link
                      key={c.bandSlug}
                      href={`/tx/${encodeURIComponent(txBandRegion.slug)}/${kind}/${c.bandSlug}`}
                      className="tile rounded-full border border-border px-3 py-1.5 t-sub font-bold text-ink"
                    >
                      {c.bandLabel}
                      <span className="ml-1 font-medium text-text-3">
                        {c.txCount.toLocaleString("ko-KR")}건
                      </span>
                    </Link>
                  ))}
                </div>
              </div>
            );
          })}
          <p className="mt-3 t-sub text-text-3">
            <Link
              href={`/tx/${encodeURIComponent(txBandRegion.slug)}`}
              className="inline-flex min-h-[24px] items-center font-bold text-primary underline"
            >
              {txBandRegion.name} 구간 전체 보기 →
            </Link>
          </p>
        </section>
      )}

      {/* Q&A — 위 숫자로만 만든 항목. FAQPage JSON-LD 는 QaBlock 이 함께 낸다. */}
      <QaBlock title={`${name} 자주 묻는 질문`} items={faq} />

      {/* [#88] 지역 시세 위젯 배포 진입점 — 중개사 블로그·홈페이지용. 위젯 안에
          출처 링크가 박혀 있으므로 퍼가기가 곧 백링크다(단지 위젯 N17 과 동일 원리).
          [998] 위젯 내용이 스냅샷(평균가·전세가율)이라 스냅샷 없는 지역에는 권하지 않는다(빈 카드가 나간다). */}
      {snapshot && (
        <EmbedSnippet
          kind="region"
          id={id}
          heading={`${name} 시세를 블로그·홈페이지에 붙이기`}
          desc={`중개사무소 블로그·홈페이지에 iframe 한 줄로 ${name} 평균 매매가·전세가율·지수 변동 카드를 실을 수 있습니다. 시세가 갱신되면 붙여넣은 위젯도 함께 갱신됩니다.`}
          className="rise-in-3 mb-4"
        />
      )}

      {/* CTA */}
      <section className="rise-in-3 mb-4 flex flex-wrap gap-2">
        <Link
          href="/notes/new"
          className="rounded-xl bg-primary px-5 py-3 t-body font-bold text-white shadow-[var(--shadow-cta)]"
        >
          이 지역 임장노트 쓰기
        </Link>
        <Link
          href="/map"
          className="card tile px-5 py-3 t-body font-bold text-ink"
        >
          지도에서 보기
        </Link>
        <Link
          href="/notifications"
          className="card tile px-5 py-3 t-body font-bold text-ink"
        >
          시세 알림 구독
        </Link>
      </section>
      {/* [961] 광고 공간 — 페이지 끝 */}
      <AdZone placement="page_bottom" seed={0} plan={null} className="mt-6" />
    </PageShell>
  );
}
