import { Header } from "./components/Header";
import { DesktopSideNav } from "./components/DesktopSideNav";
import { TabBar } from "./components/TabBar";
import { ResumeDraftPopup } from "./components/home/ResumeDraftPopup";
import { BetaNoticeModal } from "./components/BetaNoticeModal";
import { AdSenseUnit } from "./components/ads/AdSenseUnit";
import { Footer } from "./components/Footer";
import { HomeHeroSearch } from "./components/home/HomeHeroSearch";
import { HomeEntryList } from "./components/home/HomeEntryList";
import { HomeNotesList } from "./components/home/HomeNotesList";
import { HomeRegionTrend } from "./components/home/HomeRegionTrend";
import { HomeTownBlock } from "./components/home/HomeTownBlock";
import { HomeDataSources } from "./components/home/HomeDataSources";
import { HomeWatchlistBrief } from "./components/HomeWatchlistBrief";
import { buildHomeEntries } from "@/lib/newui/home-entries";
import type { KpiTemp } from "./components/home/HomeKpiRow";
import { loadLatestTemperatures } from "./components/MarketTempWidget";
import { loadNewHomeData } from "@/lib/newui/home-data";
import { loadHomeCoverage } from "@/lib/newui/home-coverage";
import { getBaseRate } from "@/lib/market/base-rate";
import { AI_TOOL_IDS } from "@/lib/ai/ai-tools";
import type { Metadata } from "next";
import { HOME_CTA_AI, HOME_HERO_QUESTION, HOME_PAGE_H1 } from "@/lib/brand/home-copy";
import { seoAlternates } from "@/lib/seo/alternates";

/* ============================================================
   [991] 홈 — 트리 하나.

   왜 다시 짰나(30일 실측, 2026-09-12):
   · 홈은 165회 조회·평균 279초로 서비스의 절반이다. 그런데 아이폰 INP p75 가
     1,296ms — "탭하면 1.3초 뒤에 반응"이었다.
   · 원인은 구조였다. 모바일 트리(290줄)와 데스크톱 트리(412줄)를 **둘 다** 서버
     HTML 에 그리고, 같은 클라이언트 섬 13개를 두 번 마운트했다. 서버 트리 하나로 줄였다.
   첫 화면에는 rise-in·data-reveal 을 쓰지 않는다 — 첫 화면은 정적이어야 한다.

   [1012 · 채점 A] 첫 화면을 검색·실데이터로 — 중앙 정렬 슬로건·부제·예산 칩·"어디서부터 시작할까요?" 아이콘
   4문 타일([1008 · J])을 걷고 검색이 첫 요소, 그 아래 실데이터 입구 목록(HomeEntryList).
   문 넷의 목적지(/quiz · /journey · /journey/contract · AI 진단)는 GNB "임장노트" 하위·분석 허브에 그대로 있다.

   [v4 · 한 화면 한 가지 · 2026-09-27] 소유자: "너무 복잡하고 뭐가 중요한지 … 분산돼 어수선하다" · "상단 내용을 요약해
   짧게" · "글자를 요약본으로" · "최대한 한 줄로" · "삐뚤하게 교차로 보이는 건 별로 — 정렬해서".
   주인공은 **검색 하나**(채움 파랑 = 검색 버튼 하나). 위에서 아래로, 가운데 한 줄(최대 760px — 데스크톱도 사이드바 없음):
     ① 머리       입력 유도 질문 한 줄(t-title) + 검색 + 그 아래 한 줄(최근 검색·최근 본 단지 · 지도에서 찾기)
     (로그인)     관심 단지 최근 거래(HomeWatchlistBrief — 있을 때만)
     ② 입구 목록   구분선 행 ≤4 — 실거래 N건 · 시장 온도 N점 · 기준금리 · AI 단지 분석 N종(숫자는 오른쪽 열)
     ③ 공개 임장노트 행 3 + "임장노트 쓰고 AI 정리 받기" 행
     ④ 지역 동향   사실 한 줄(서울 N개 구 중 N곳 상승) + 지역 행 4(가격·등락 오른쪽) + 관심지역 행(로그인)
     ⑤ 동네 소식   이웃 글·기사 행 + 끝 캡션(첫 글 쓰기 · 뉴스룸)
     ⑥ 데이터 출처  <details> 하나 — 출처·기준·계산법(임장 점수 · Lab 노트 · 브리핑 기준 · 금리 공시)
   지운 것: 네이비 "오늘의 한 줄" 회전 배너(워터마크·점 6개·배지) · 네이비 "임장노트 AI 정리" 패널(AI 결과가 아닌 입구) ·
   검색 아래 지역 칩 4개 · 노트 "Lab 데이터"/"이웃" 배지·점수 배지·"임장 점수 ⓘ"·Lab 설명 문장 · 지역 카드 2열(스파크라인·
   카운트업) · 동네이야기/뉴스룸 두 재질 카드 · 빈 상태 일러스트 카드 · 하우스 광고(AdZone) 2곳 · 1240px 2단 + 340px 사이드바.
   옮긴 사실: 온도·금리 → ②, 지역 문장 → ④ 행(문장은 행의 접근성 이름), 거래 건수 → ④ 행 보조 줄, 노트 수 → ③ 머리,
   브리핑 → ④ 사실 줄, 로그인 관심지역 → ④ 첫 행, "내 지역으로 바꾸기" → ④ 끝 캡션.
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
   데이터가 없으면 없다고 한 줄로 말하고(v4 규칙 8), 채우는 행동으로 안내한다. */

export default async function Home() {
  /* 세 조회는 서로 의존이 없다 — 한 Promise.all 로 임계 경로를 가장 느린 하나로. */
  const [data, baseRateData, coverage] = await Promise.all([
    loadNewHomeData(),
    // 기준금리: ECOS(한국은행) 연동 시 실값, 미연동 시 null — 그 행을 뺀다(허위 수치 금지)
    getBaseRate(),
    // [950] 커버리지 실수치(실거래·단지·지역) — 캐시, 실패 시 행 생략
    loadHomeCoverage(),
  ]);

  // 실데이터만 사용한다 — 0건이면 빈 상태 한 줄(가짜 카드로 채우지 않는다).
  const regions = data.regions;
  const notes = data.notes;
  const failed = data.failed;
  /* [1007] 상대 시각 라벨의 기준 — 렌더당 한 번(ISR 300s 동안 굳는다 — 분 단위라 무방) */
  const renderedAt = Date.now();

  /* 시장 온도 — 대표 지역(지역 동향 첫 행)의 것, 없으면 가장 높은 지역. 실패면 행만 빠진다 */
  let kpiTemp: KpiTemp | null = null;
  try {
    const t = await loadLatestTemperatures();
    const row = t.rows.find((r) => r.current.regionId === (regions[0]?.id ?? "")) ?? t.rows[0] ?? null;
    if (row) {
      const m = row.current.weekStart.match(/^\d{4}-(\d{2})-(\d{2})$/);
      kpiTemp = {
        score: row.current.score,
        headline: row.current.headline,
        weekLabel: m ? `${Number(m[1])}.${m[2]} 주` : row.current.weekStart,
        regionLabel: row.current.regionLabel || null,
      };
    }
  } catch {
    kpiTemp = null; // 아카이브 없음/조회 실패 — 온도 행만 빠진다
  }

  /* [1012 → v4] 검색 아래 입구 목록 — 위에서 이미 읽은 값만 넘긴다. 없는 줄은 함수가 뺀다. */
  const homeEntries = buildHomeEntries({
    coverage,
    temp: kpiTemp,
    baseRate: baseRateData?.label ?? null,
    loanRate: data.loanRate,
    loanRateAsOf: data.loanRateAsOf,
    aiTools: AI_TOOL_IDS.length,
  });

  return (
    <>
      <Header />

      {/* id 는 layout.tsx 의 "본문 바로가기" 스킵 링크 목적지다. */}
      {/* [999] 좌측 내비는 가장자리 hover 오버레이 — 본문은 1열(PageShell 과 같은 규칙). */}
      <DesktopSideNav />
      <main id="main-content" className="w-full flex-1 px-3.5 pb-6 pt-3.5 md:px-5 md:pb-16 md:pt-5">
        {/* [v4 · 규칙 12] 데스크톱도 가운데 한 줄(최대 760px) — 모바일과 같은 순서로 읽힌다 */}
        <div className="mx-auto flex w-full max-w-[760px] flex-col gap-8">
          {/* 이 문서의 유일한 H1. 질문 줄은 <p> 다. */}
          <h1 className="sr-only">{HOME_PAGE_H1}</h1>

          {/* ① 머리 + 주인공 — 베타 안내(본문 위 한 줄 · 서버 HTML 에는 없다) · 질문 한 줄 · 검색 */}
          <div className="flex flex-col gap-3">
            {/* [968 · 39] 클로즈 베타 안내 — 닫으면 30일 안 뜬다. 작성 중 노트 복귀는 우하단 팝업(2026-08-16). */}
            <BetaNoticeModal />
            <ResumeDraftPopup />
            <p className="m-0 truncate t-title text-ink">{HOME_HERO_QUESTION}</p>
            <HomeHeroSearch />
          </div>

          {/* (로그인) 관심 단지 최근 거래 — 클라이언트 섬, 서버 HTML(공유 캐시)에는 없다. 없으면 아무것도 그리지 않는다.
              [v4 · 규칙 8] 옛 "내 관심" 레일의 "최근 본 단지" 칩은 뺐다 — 검색 아래 한 줄이 같은 단지를 이미 보여 준다
              (칩의 지우기(×)는 /search 의 같은 칩에 그대로 있다). */}
          <HomeWatchlistBrief />

          {/* ② 실데이터 입구 목록 */}
          <HomeEntryList entries={homeEntries} />

          {/* ③ 공개 임장노트 — 누가 쓴 노트인지(Lab/이웃)는 메타 줄이 말한다 */}
          <HomeNotesList
            notes={notes}
            total={data.publicNotesTotal}
            today={data.notesToday}
            failed={failed.notes}
            cta={HOME_CTA_AI}
          />

          {/* ④ 지역 동향 */}
          <HomeRegionTrend
            regions={regions}
            briefing={data.briefing}
            stale={data.regionsStale}
            failed={failed.regions}
          />

          {/* ⑤ 동네 소식 — 이야기·뉴스는 같은 조회(readRelatedTownPosts, 5분 캐시)라 추가 왕복·클라이언트 JS 없음 */}
          <HomeTownBlock stories={data.stories} news={data.news} failed={failed.town} now={renderedAt} />

          {/* ⑥ 데이터 출처 — 맨 끝 접힘 하나 */}
          <HomeDataSources
            regions={regions.slice(0, 4)}
            briefing={data.briefing}
            hasCoverage={Boolean(coverage.txCount)}
            hasTemp={kpiTemp !== null}
            hasRate={Boolean(baseRateData?.label)}
            loanRateAsOf={data.loanRate ? data.loanRateAsOf : null}
            hasNotes={notes.length > 0}
            hasLabNotes={notes.some((n) => n.kind === "lab")}
            hasNews={!failed.town && data.news.length > 0}
          />

          {/* 애드센스 디스플레이 — 데스크톱 전용(모바일 제외는 컴포넌트가 CSS 로도 이중 보장), 없으면 null */}
          <AdSenseUnit />
        </div>
      </main>

      {/* P0-3: 공통 푸터 — 사업자 고지·약관 링크·면책 */}
      <Footer />
      <TabBar />
    </>
  );
}
