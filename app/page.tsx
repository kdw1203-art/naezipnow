import Link from "@/app/components/IntentLink";
import { Header } from "./components/Header";
import { TopBanner } from "@/app/components/ads/TopBanner";
import { DesktopSideNav } from "./components/DesktopSideNav";
import { TabBar } from "./components/TabBar";
import { Fineprint } from "./components/Fineprint";
/* [1103 · 번들] 이어서 쓰기 팝업은 지연 로더로(초안 파서 · 상대 시각이 홈 첫 로드 번들에서 빠진다 — 서버 HTML 은 원래 비어 있다) */
import { ResumeDraftPopupLazy as ResumeDraftPopup } from "./components/home/ResumeDraftPopupLazy";
import { EmptyState, ErrorState } from "./components/ui/EmptyState";
import { AdZone } from "./components/ads/AdZone";
import { StartSteps } from "./components/nav/StartSteps";
import { AdSenseUnit } from "./components/ads/AdSenseUnit";
import { Footer } from "./components/Footer";
import { HomeHeroSearch } from "./components/home/HomeHeroSearch";
import { CoverImage } from "./components/CoverImage";
import type { KpiTemp } from "./components/home/HomeKpiRow";
import { HomeTodayLine } from "./components/home/HomeTodayLine";
import { RollingPanel } from "./components/home/RollingPanel";
import { chunkPages } from "./components/home/chunk-pages";
import { HomeTownBlock } from "./components/home/HomeTownBlock";
import { HomeHubLinks } from "./components/home/HomeHubLinks";
import { HomeRecentDeals, toHomeDealRows, type HomeDealRow } from "./components/home/HomeRecentDeals";
import { HomeMarketBoard } from "./components/home/HomeMarketBoard";
import { HomeAltBoard } from "./components/home/HomeAltBoard";
import { HomeRegionTable } from "./components/home/HomeRegionTable";
import { listRegionTransactions } from "@/lib/market/store";
import { complexCanonicalPathFromNames } from "@/lib/complex/complex-store";
import { getActiveComplexes } from "@/lib/ai/popular-complexes";
import { HomeTalkSection } from "./components/home/HomeTalkSection";
import { loadLatestTemperatures } from "./components/MarketTempWidget";
import { loadNewHomeData } from "@/lib/newui/home-data";
import { loadHomeCoverage } from "@/lib/newui/home-coverage";
import { formatCount } from "@/lib/newui/home-coverage";
import { Explain } from "./components/explain/Explain";
import { getBaseRate } from "@/lib/market/base-rate";
import type { Metadata } from "next";
import { HOME_PAGE_H1 } from "@/lib/brand/home-copy";
import { logger } from "@/lib/log";
import { seoAlternates } from "@/lib/seo/alternates";

/* ============================================================
   [991] 홈 — 트리 하나, 블록 다섯.

   왜 다시 짰나(30일 실측, 2026-09-12):
   · 홈은 165회 조회·평균 279초로 서비스의 절반이다. 그런데 아이폰 INP p75 가
     1,296ms — "탭하면 1.3초 뒤에 반응"이었다.
   · 원인은 구조였다. 모바일 트리(290줄)와 데스크톱 트리(412줄)를 **둘 다** 서버
     HTML 에 그리고, 같은 클라이언트 섬 13개를 두 번 마운트했다. 안 보이는 벌의
     타이머·조회는 [968 · 8]의 shell 프롭으로 막았지만 하이드레이션·옵저버·
     애니메이션(rise-in 780곳·data-reveal)은 그대로 두 배였다.
   · 티커·슬로건 띠·미니지도·도구 추천·"더 알아보기" 8링크·동네이야기 입구는
     체류에 기여한 흔적이 없다(동네이야기 7초 이탈, 뷰포트 추적 5,198건/6명은
     측정이 아니라 잡음).

   지금: 서버 트리 하나. 모바일은 1열, lg 부터 본문 | 340px 사이드바.
   비로그인 첫 화면 = ① 검색(+ [1008] "어디서부터 시작할까요?" 문 넷) ② 오늘의 시장 한 문장 ③ 공개 임장노트
   ④ AI 입구 ⑤ 지역 시세 ⑦ 동네이야기·뉴스룸(1007 — 1006 재질 규칙으로, 서버 조각). 로그인이면
   ⑥ 내 관심(클라이언트 섬)이 끼어든다. 출석·미션·레벨은 /my 가 맡는다(같은 카드가 거기 이미 있다).
   첫 화면에는 rise-in·data-reveal 을 쓰지 않는다 — 첫 화면은 정적이어야 한다.

   [1008 · J] 문 넷을 ① 블록 **안**에 넣고(최상위 블록 수 그대로), 넣은 높이만큼 덜었다 — AI 입구의 예시 두 칸을
   한 줄로, 링크 세 줄을 한 줄로("로그인 없이 단지 진단"은 문 ②가 같은 곳으로 간다), 본문 끝의 중복 CTA
   "임장노트 쓰기"(헤더 "노트 쓰기"·모바일 탭바 "기록"과 같은 목적지)를 뺐다. 실측(개발 서버·비로그인·베타 안내 닫음):
   390px — 검색 묶음 327 → 473px(+146) · AI 입구 483 → 340px(−143) · 끝 CTA(−59) → <main> 2,185 → 2,128px(−57).
   1280px — 검색 묶음 266 → 360px(+94) · AI 입구 477 → 334px(−143, 사이드바) · 끝 CTA(−63) → 본문 열이 더 긴 열이
   되어 <main> 1,143 → 1,171px(+28). 최상위 블록 수 3 그대로, 본문 열 조각 5 → 4.
   ============================================================ */

// 스케일 지침 #21: 비로그인 홈은 정적 캐시 (5분 재검증) — 접속마다 재계산 금지
export const revalidate = 300;

/* 항목 43 — 홈 canonical. ReferralRedeem 이 ?ref_code= 트래픽을 홈으로
   보내므로, canonical 이 없으면 가장 권위 높은 URL 이 파라미터 변형으로
   쪼개진다. 제목·설명은 루트 레이아웃 것을 그대로 상속한다. */
export const metadata: Metadata = {
  alternates: seoAlternates("/"),
};

/* G10 / 사실 우선: 예시 폴백(가짜 시세·노트·글·모임·리포트)은 쓰지 않는다.
   데이터가 없으면 없다고 말하고, 채우는 행동(CTA)으로 안내한다. */

/* [1029 · 2] 낱말 꼴 — 문장 둘을 "무엇 = 누가·어떻게"로 접었다 */
const LAB_NOTES_CAPTION = "Lab 노트 = 편집부 정리(실거래·통계) · 이웃 노트 = 올라온 순";

/* [1108 · 홈 A안] 사이드바 "AI 입구" 판(HomeAiGateway · 임장노트 AI 정리 + 오늘의 시장 브리핑)은 걷었다 — AI 진입 12 → 3.
   브리핑 한 문장은 네이비 띠의 "오늘의 시장" 슬라이드로(HomeTodayLine briefing), 임장노트 AI 정리는 노트 쓰기 화면과 분석 허브
   (내 임장노트 계열)가 맡는다. 헤더 "AI 분석" 메뉴가 모든 화면에 있다. */

export default async function Home() {
  /* 세 조회는 서로 의존이 없다 — 한 Promise.all 로 임계 경로를 가장 느린 하나로.
     [991] 다이제스트·신선도 라벨 조회는 티커·"더 알아보기"와 함께 내려갔다. */
  const [data, baseRateData, coverage, activeComplexes] = await Promise.all([
    loadNewHomeData(),
    // 기준금리: ECOS(한국은행) 연동 시 실값, 미연동 시 "—" (허위 수치 금지)
    getBaseRate(),
    // [950] 커버리지 실수치(실거래·단지·지역) — 6시간 데이터 캐시, 실패 시 줄 생략
    loadHomeCoverage(),
    // [1081 · #27] 거래 많은 단지(도시당 1곳 · 1일 데이터 캐시) — 실패·0행이면 빈 배열(그 줄이 빠진다)
    getActiveComplexes(12),
  ]);

  // 실데이터만 사용한다 — 0건이면 빈 상태를 그린다(가짜 카드로 채우지 않는다).
  const regions = data.regions;
  /* [1108] 최근 실거래 — 대표 지역(regions[0])의 최신 매매 신고 6건. 지역 화면과 같은 함수(한 왕복 · ISR 300초 안에서 굳는다).
     실패는 실패로(빈 배열로 뭉개지 않는다 — listRegionTransactions 가 던진다) */
  const dealsRegion = regions[0] ?? null;
  let recentDeals: HomeDealRow[] = [];
  let recentDealsFailed = false;
  if (dealsRegion) {
    try {
      recentDeals = toHomeDealRows(await listRegionTransactions(dealsRegion.id, dealsRegion.name, 20), complexCanonicalPathFromNames);
    } catch (e) {
      recentDealsFailed = true;
      logger.warn("[home] 최근 실거래 조회 실패 — 실패로 그린다", e);
    }
  }
  /* [1114] 지역 동향 표 — 대표 지역은 위 "시장 한눈에"가 말한다(같은 숫자 두 곳 금지) */
  const tableRegions = dealsRegion ? regions.filter((r) => r.id !== dealsRegion.id) : regions;
  const notes = data.notes;
  const failed = data.failed;
  /* [1007] 상대 시각 라벨의 기준 — 렌더당 한 번(ISR 300s 동안 굳는다 — 분 단위라 무방) */
  const renderedAt = Date.now();
  /* [950] 공개 노트가 전부 Lab(데이터·AI 편집) 노트면 그 사실을 한 줄로 적는다 */
  const allLabNotes = notes.length > 0 && notes.every((n) => n.kind === "lab");
  /* [950] 검색 아래 지역 칩 — 시세 카드와 같은 지역(실데이터). 지역 카드가 비면 칩도 없다. */
  /* [1081 · #26] 칩 4 → 8 — 폰은 가로 스크롤 줄, PC 는 접힘(HomeHeroSearch 컨테이너) */
  /* [1113 · 중복 제거] 아래 "지역 · 단지 바로가기"의 지역 줄(같은 이름 · /region)과 합쳤다 — 칩이 지역 종합 화면으로 간다(지도는 옆 "지도에서 내 동네 찾기") */
  const heroRegionChips = regions.slice(0, 8).map((r) => ({
    label: r.name,
    href: `/region/${encodeURIComponent(r.id)}`,
  }));

  /* 오늘의 한 문장 재료 — 전부 실측, 없으면 그 항목이 빠진다(가짜 숫자·"—" 채움 없음) */
  const saleIndexSeoul = data.saleIndexSeoul ?? "—";
  const loanRate = data.loanRate;
  const baseRate = baseRateData?.label ?? "—";
  /* [1054] 두 금리의 시점 — 기준금리는 ECOS cycle(YYYYMMDD) · 주담대는 finlife 공시월(YYYY-MM). 시점 없는 금리는
     일 단위 기준금리와 월 공시 금리를 같은 날 값으로 읽게 한다(home-data 의 loanRateAsOf 주석) */
  const cyc = baseRateData?.cycle ?? "";
  const baseRateAsOf = /^\d{8}$/.test(cyc) ? `${cyc.slice(0, 4)}.${cyc.slice(4, 6)}.${cyc.slice(6, 8)}` : /^\d{6}$/.test(cyc) ? `${cyc.slice(0, 4)}.${cyc.slice(4, 6)}` : null;
  const loanRateAsOf = data.loanRateAsOf ? data.loanRateAsOf.replace("-", ".") : null;
  let kpiTemp: KpiTemp | null = null;
  try {
    const t = await loadLatestTemperatures();
    const row =
      t.rows.find((r) => r.current.regionId === (regions[0]?.id ?? "")) ??
      t.rows[0] ??
      null;
    if (row) {
      const m = row.current.weekStart.match(/^\d{4}-(\d{2})-(\d{2})$/);
      kpiTemp = {
        score: row.current.score,
        headline: row.current.headline,
        weekLabel: m ? `${Number(m[1])}.${m[2]} 주` : row.current.weekStart,
        /* [1054] 지역 이름 — 고른 행이 관심 지역이 아닐 수도 있다(첫 행). 문장에 지역을 적어야 점수가 누구 것인지 안다 */
        regionName: row.current.regionLabel ?? null,
      };
    }
  } catch {
    kpiTemp = null; // 아카이브 없음/조회 실패 — 온도 항목만 빠진다
  }
  /* [1022] 커버리지 숫자는 검색 칩 줄에서 빼고 ⓘ 안 한 줄로 */
  const coverageLine = [
    coverage.txCount ? `국토교통부 실거래 ${formatCount(coverage.txCount)}건` : null,
    coverage.complexCount ? `단지 ${formatCount(coverage.complexCount)}개` : null,
    coverage.regionCount ? `전국 ${formatCount(coverage.regionCount)}개 시군구` : null,
    data.publicNotesTotal ? `공개 임장노트 ${formatCount(data.publicNotesTotal)}편` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  /* [1114] 오늘의 시장 띠의 대표 지역 슬라이드(가격 · 등락 · 거래)는 걷었다 — 아래 "시장 한눈에" 숫자 칸이 같은 지역 · 같은 숫자다.
     로그인해 관심 지역이 있으면 그 지역 문장은 HomeTodayLine 이 클라이언트에서 그대로 띄운다. */

  return (
    <>
      <Header />

      {/* id 는 layout.tsx 의 "본문 바로가기" 스킵 링크 목적지다. */}
      {/* [999] 좌측 내비는 가장자리 hover 오버레이 — 본문은 1열(PageShell 과 같은 규칙). */}
      <DesktopSideNav />
      <main
        id="main-content"
        className="mx-auto w-full max-w-[1240px] flex-1 px-3.5 pb-6 pt-3.5 md:px-5 md:pb-16 md:pt-5"
      >
        <div className="min-w-0">
          {/* 이 문서의 유일한 H1. 히어로 제목은 <p> 다. */}
          <h1 className="sr-only">{HOME_PAGE_H1}</h1>

          {/* [968 · 39] 클로즈 베타 안내 한 줄(BetaNoticeModal)은 [1077] 에 걷었다 — 소유자(2026-10-18) "신뢰도":
              처음 온 사람이 가장 먼저 읽는 글자가 "베타"였다. 값이 없으면 "—" 로 비워 두는 규칙은 그대로다. */}
          {/* 작성 중 노트 복귀 — 우하단 팝업(소유자 지시 2026-08-16) */}
          <ResumeDraftPopup />

          {/* ① [1108 · 홈 A안] 네이비 검색 띠 — 검색 한 칸 + 바로 보기 칩 + "오늘의 시장" 한 줄이 한 판.
              예전엔 검색 묶음(흰 바탕) → 띠 배너 → 오늘의 시장(네이비 카드) 세 층이었다. 1012 실측(기준 사이트 4곳: 검색 · 지도 · 목록으로
              시작)과 1022 "검색 부분을 심플하게"를 한 판으로 잇는다 — 돌아온 사람이 여는 화면이라 첫 줄이 검색, 둘째 줄이 오늘 숫자다.
              내 동네 숫자 3칸은 따로 두지 않는다: 지역 동향 첫 카드와 같은 숫자가 된다(1050 중복 검토) — 숫자는 "오늘의 시장" 슬라이드
              (관심 지역이면 그 지역 문장)가 말한다. 첫 화면에는 rise-in·data-reveal 을 쓰지 않는다. */}
          <section className="brand-navy-card flex flex-col gap-2.5 rounded-2xl px-4 pb-2.5 pt-3.5 md:gap-3 md:px-6 md:pb-3 md:pt-4" aria-label="검색 · 오늘의 시장">
            <svg className="brand-wm text-on-dark" width="150" height="140" viewBox="0 0 120 120" aria-hidden="true">
              <path d="M14 46 C 38 64, 82 64, 106 46" fill="none" stroke="currentColor" strokeWidth="7" strokeLinecap="round" />
              <circle cx="60" cy="86" r="8.5" fill="currentColor" />
            </svg>
            {/* [1030 · G1] 질문문 → 낱말. 예시는 검색칸 placeholder 가 든다. */}
            {/* [1132 · 띠 높이 줄이기] 소유자 2026-11-10 "홈에서 해당 부분이 너무 큰 세로 공간" — 큰 제목 줄을 화면에서 걷고(검색칸 흐린 글자가 같은 말을 한다 · 읽기 프로그램용으로만 남김)
                위아래 여백 · 칸 사이 간격 · 오늘의 시장 문장 줄 높이를 줄였다. */}
            <p className="sr-only">단지 · 동네 검색</p>
            {/* [1015 · 규칙 B] "예산으로 찾기" 칩 줄과 "어디서부터 시작할까요?" 문 4개는 뺐다(소유자: "필요 없는 부분 —
                물음표 칸으로 마우스를 올리면 보이는 정도로"). 네 입구는 ⓘ 하나(hover 미리보기·탭 시트)로 접었다.
                [1024] 소유자(캡처): "이런건 한줄로 바꿔줘" — "처음이라면 ⓘ" 를 칩 행의 coverage 슬롯으로 넘겨 칩과 같은 줄에 둔다. */}
            <HomeHeroSearch
              onDark
              regionChips={heroRegionChips}
              coverage={
                <span className="inline-flex min-h-[24px] shrink-0 items-center gap-1 whitespace-nowrap t-caption text-on-dark-muted">
                  처음이라면
                  <Explain
                    title="처음 오신 분께"
                    body={[
                      "실거래가 게임: 두 단지 중 실거래가가 더 비싼 쪽 맞히기",
                      "단지 종합 진단: 단지 이름으로 실거래·전월세·공급·뉴스를 한 화면에",
                      "계약·잔금 일정표: 계약일·잔금일로 할 일과 법정 기한을 날짜순으로",
                      "내 집 마련 여정: 시장 파악부터 계약·입주까지 6단계",
                      "단지 종합 진단은 메뉴 AI 분석, 나머지 셋은 메뉴 임장노트에 있어요.",
                    ]}
                    source={[coverageLine, "예산으로 찾기는 지도의 가격 필터"].filter(Boolean).join(" · ")}
                  />
                </span>
              }
            />
            {/* ② 오늘의 시장 — 한 문장씩(배너형 회전) · 띠 안에 든 모양(embedded). [1108] AI 브리핑도 슬라이드 하나 */}
            <HomeTodayLine
              embedded
              region={null}
              temp={kpiTemp}
              saleIndex={saleIndexSeoul}
              baseRate={baseRate}
              baseRateAsOf={baseRateAsOf}
              loanRate={loanRate}
              loanRateAsOf={loanRateAsOf}
              publicNotes={data.publicNotesTotal}
              briefing={data.briefing ? { text: data.briefing.text, asOfLabel: data.briefing.asOfLabel } : null}
            />
          </section>

          {/* [1098 · 배너] 상단 띠 배너 자리 — 검색 띠와 본문 사이 한 줄(띠 배너가 없으면 관리자에게만 점선 자리) */}
          <TopBanner placement="home_feed" plan={null} className="mt-3 md:mt-4" />
          {/* [1124 · 처음 온 사람의 길] 비회원에게만 — 가입 → 임장노트 → 지도 → AI 분석 네 단계 + 전문가 등록 */}
          <StartSteps from="home" className="mt-3 md:mt-4" />

          {/* [1131 · 홈 자리 비우기] 소유자 2026-11-10 "이런 부분은 마이페이지에서 보거나 검색창에 음영처리로 · 홈 화면에서는 자리를 차지하지 않도록" —
              로그인 묶음(출석 · 포인트 · 내 관심단지 브리핑 · 최근 본 단지 · 내 관심 지역)을 홈에서 걷었다. 출석 · 포인트 · 최근 본 단지는 마이에 이미 있고,
              관심단지 브리핑 · 관심 지역은 마이로 옮겼다(app/my/MyHomeBrief). 최근 본 단지는 위 검색칸의 흐린 글자(placeholder)와 펼침 목록에서. */}

          {/* [1114 · 홈 벤토] 소유자 2026-11-09 시안 A 선택 — 지역 화면 형식(숫자 칸 · 시세 흐름 그래프 · 표)을 홈에 그대로.
              lg 12칸: 왼쪽 8 = 대표 지역 시장 한눈에(숫자 칸) + 시세 흐름(지표 탭 그래프) · 오른쪽 4 = 실거래 금액 순위 배너 + 지역 동향 표
              · 아래 = 공개 임장노트(7) | 거래 많은 단지(5) · 동네이야기 · 뉴스룸(전폭). 폰은 같은 순서 1열(DOM 순서 = 읽는 순서). */}
          <div className="mt-3 grid grid-cols-1 gap-3 md:mt-4 lg:grid-cols-12 lg:gap-4">
            <div data-autotrim="" className="flex min-w-0 flex-col gap-3 lg:col-span-8 lg:gap-4">
              {/* [1137 · 홈 개편] 시세판(B) ↔ 내 화면(C)을 같은 자리에서 번갈아 — 비회원은 시세판만(서버 HTML 그대로). 로그인하면 탭 둘 + 자동 넘김 */}
              <HomeAltBoard market={dealsRegion ? <HomeMarketBoard id={dealsRegion.id} name={dealsRegion.name} /> : null} />
            </div>

            <aside data-autotrim="" className="flex min-w-0 flex-col gap-3 lg:col-span-4 lg:gap-4">
              {/* ③ [1114] 실거래 금액 순위 — 옅은 파랑 판이 아래에서 위로 넘어가는 배너(소유자 지시) */}
              {dealsRegion && (
                <HomeRecentDeals
                  regionName={dealsRegion.name}
                  rows={recentDeals}
                  failed={recentDealsFailed}
                  mapHref={`/map?region=${encodeURIComponent(dealsRegion.name)}`}
                />
              )}
              {/* ⑤ 지역 동향 — [1114] 표 */}
              <section className="card flex flex-col gap-2 rounded-2xl p-[var(--pad-card)]">
                <div className="flex items-baseline justify-between gap-2">
                  <h2 className="t-section text-ink">지역 동향</h2>
                  <Link
                    href="/map"
                    className="tap-line inline-block py-[5px] t-sub font-bold text-primary no-underline"
                  >
                    지도에서 전체 보기 ›
                  </Link>
                </div>
                {regions.length === 0 ? (
                  failed.regions ? (
                    <ErrorState
                      title="지역 동향 불러오기 실패"
                      desc="잠시 후 다시"
                      action={{ label: "지도에서 찾아보기", href: "/map" }}
                    />
                  ) : (
                    <EmptyState
                      icon="map"
                      title="지역 동향 없음"
                      desc="지역 집계가 준비되면 여기에 표시돼요."
                      action={{ label: "지도에서 찾아보기", href: "/map" }}
                    />
                  )
                ) : (
                  <>
                    {/* [1114 · 홈 벤토] 회전 카드(4장씩) → 표 하나 — 등락 큰 순 · 이름 아래 막대. 대표 지역(위 시장 한눈에)은 뺀다 */}
                    <HomeRegionTable regions={tableRegions} />
                    {/* [1002] 스냅샷 실패 → 월 집계 폴백 카드. 값은 실측이지만 시점이
                        오래됐다는 사실을 카드 아래 한 줄로 적는다(카드 meta 의 "마지막 집계"
                        와 같은 말). 실패를 "준비 중"으로도, 오래된 값을 "지금"으로도 위장하지 않는다. */}
                    {data.regionsStale && (
                      <p className="m-0 t-caption text-text-3">
                        실시간 집계 불러오기 실패 · 마지막 월 집계 표시
                      </p>
                    )}
                    {/* [1113 · 중복 제거] 서울 25개 구 막대(최고 · 최저 · 펼치면 구별)는 뺐다 — 아래 실시간 토론의 지역 순위(지수 전월비 상승 · 하락)가 같은 값이다 */}
                    {/* [1036 · 밀도] 카드마다 붙던 범례를 섹션 아래 한 번, 접어서 */}
                    {/* [1052] 거래 건수 원천은 카드마다 다르다 — 카드 끝에 원천을 적으니 여기서 한쪽으로 단정하지 않는다 */}
                    <Fineprint label="기준 · 출처">
                      가격 = 평균 매매가(한국부동산원) 또는 실거래 평균(국토교통부 신고 월 집계 · 줄 아래 표기) · 전월 대비 = 매매가격지수 전월 대비 · 막대 = 등락 크기
                    </Fineprint>
                  </>
                )}
              </section>
              <AdZone placement="home_feed" seed={0} plan={null} spot="side" className="hidden lg:block" />
              <AdSenseUnit />
            </aside>

              {/* ④ 공개 임장노트 — 증거. 누가 쓴 노트인지(Lab/이웃)를 숨기지 않는다. */}
              <section className="card flex flex-col gap-2 rounded-2xl px-4 py-4 lg:col-span-7">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="t-section text-ink">공개 임장노트</h2>
                  <span className="flex items-center gap-2">
                    {/* [1009 · H] 점수 배지의 뜻 — 누르면 열리는 ⓘ 시트로. 배지는 링크 행 안이라 ⓘ 는 머리에 한 번만 둔다
                        (링크 안 버튼 = 중첩 인터랙티브). 계산은 lib/newui/home-data.ts noteScoreOf ·
                        lib/inspection/store-db.ts inspectionAverageScore 그대로. */}
                    {notes.length > 0 && (
                      <span className="inline-flex items-center t-caption text-text-3">
                        기록 점수
                        <Explain
                          title="기록 점수"
                          body="작성자가 매긴 항목 평점(5점 만점)을 100점 만점으로 바꾼 숫자예요. 같은 단지라도 쓴 사람·시점마다 달라요."
                          how={[
                            "항목 평점: 입지·학군·교통·시설·미래가치 5개 항목(항목마다 5점 만점) 중 점수를 매긴 항목만 평균해요.",
                            "기록 점수: 항목 평점 × 20 을 반올림해요.",
                            "75점 이상은 파란 배지로 표시해요.",
                          ]}
                          source="공개 임장노트 · 작성자 입력"
                        />
                      </span>
                    )}
                    <Link
                      href="/notes"
                      className="tap-line inline-block py-[5px] t-sub text-text-3 transition-colors hover:text-primary"
                    >
                      더보기
                    </Link>
                  </span>
                </div>
                {notes.length === 0 ? (
                  failed.notes ? (
                    <p className="t-sub text-text-3">공개 임장노트 불러오기 실패 · 잠시 후 다시</p>
                  ) : (
                    <EmptyState
                      icon="notebook-pen"
                      title="공개된 임장노트 없음"
                      desc="공개로 저장한 노트가 여기에 보여요."
                      action={{ label: "첫 공개 노트 남기기", href: "/notes/new" }}
                    />
                  )
                ) : (
                  /* [1015 · 규칙 H·C] 행 왼쪽 44px 정사각 썸네일(고른 템플릿 → 첫 사진 → 단색 칸), "Lab 데이터/이웃" 배지 대신
                     메타 줄(동네 · 단지 · 작성 주체). 점수 배지는 그대로. */
                  /* [1022] 3편씩 쪽으로 나눠 아래→위로 넘긴다(공개 임장노트도 지역 동향과 같은 회전판) */
                  <RollingPanel
                    label="공개 임장노트 쪽"
                    pages={chunkPages(notes, 3).map((page, pi) => (
                      <div key={pi} className="flex flex-col">
                        {page.map((n, i, arr) => (
                    <Link
                      key={n.id}
                      href={`/notes/${n.id}`}
                      className={`press -mx-1.5 flex items-center justify-between gap-3 rounded-lg px-1.5 py-[7px] t-body no-underline transition-colors hover:bg-bg ${
                        i < arr.length - 1 ? "border-b border-divider" : ""
                      }`}
                    >
                      <span className="flex min-w-0 items-center gap-2.5">
                        <span className="relative h-11 w-11 shrink-0 overflow-hidden rounded-lg bg-divider" aria-hidden="true">
                          {n.cover && (
                            <CoverImage src={n.cover} alt={`${n.title} 노트 커버`} sizes="44px" imgClassName="absolute inset-0 h-full w-full object-cover" />
                          )}
                        </span>
                        <span className="flex min-w-0 flex-col gap-0.5">
                          <span className="truncate font-semibold text-text-1">{n.title}</span>
                          <span className="truncate t-caption text-text-3">
                            {[n.region, n.kind === "lab" ? "내집나우 Lab" : null].filter(Boolean).join(" · ")}
                          </span>
                        </span>
                      </span>
                      <span
                        className={`shrink-0 rounded-md px-1.5 py-0.5 t-caption font-bold tabular-nums ${
                          n.hot ? "bg-primary-soft text-primary" : "bg-bg text-text-3"
                        }`}
                      >
                        <span className="sr-only">기록 점수 </span>
                        {n.score}
                      </span>
                    </Link>
                  ))}
                      </div>
                    ))}
                  />
                )}
                {allLabNotes && <Fineprint label="표시 기준">{LAB_NOTES_CAPTION}</Fineprint>}
              </section>

            <div className="flex min-w-0 flex-col gap-3 lg:col-span-5">
              {/* [1081 · #27] 거래 많은 단지 — 단지 상세로 가는 직행 링크(크롤 경로) */}
              <HomeHubLinks regions={regions} complexes={activeComplexes} />
              {/* [1015 · 규칙 G → 1101] 폰 광고 자리 1곳(데스크톱은 오른쪽 열) */}
              <AdZone placement="home_feed" seed={1} plan={null} className="lg:hidden" />
            </div>

            {/* ⑦ [1007 · P2] 동네이야기 · 뉴스룸 — 전폭 */}
            <div className="min-w-0 lg:col-span-12">
              <HomeTownBlock stories={data.stories} news={data.news} failed={failed.town} now={renderedAt} />
            </div>
          </div>
          {/* [1051] 홈 맨 아래 — 실시간 토론(지역 · 단지 한 줄). 전폭. 판은 화면 가까이 오면 받는다 */}
          <HomeTalkSection />
        </div>
      </main>

      {/* P0-3: 공통 푸터 — 사업자 고지·약관 링크·면책 */}
      <Footer />
      <TabBar />
    </>
  );
}
