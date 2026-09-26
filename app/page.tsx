import Link from "next/link";
import { Header } from "./components/Header";
import { DesktopSideNav } from "./components/DesktopSideNav";
import { TabBar } from "./components/TabBar";
import { AIPanel } from "./components/AIPanel";
import { ResumeDraftPopup } from "./components/home/ResumeDraftPopup";
import { EmptyState, ErrorState } from "./components/ui/EmptyState";
import { BetaNoticeModal } from "./components/BetaNoticeModal";
import { AdZone } from "./components/ads/AdZone";
import { AdSenseUnit } from "./components/ads/AdSenseUnit";
import { Footer } from "./components/Footer";
import { HomeHeroSearch } from "./components/home/HomeHeroSearch";
import { HomeBudgetChips } from "./components/home/HomeBudgetChips";
import { HomeStartDoors } from "./components/home/HomeStartDoors";
import { HomeMyRail } from "./components/home/HomeMyRail";
import type { KpiRegion, KpiTemp } from "./components/home/HomeKpiRow";
import { HomeTodayLine } from "./components/home/HomeTodayLine";
import { RegionPulseCards } from "./components/home/RegionPulseCards";
import { HomeTownBlock } from "./components/home/HomeTownBlock";
import { loadLatestTemperatures } from "./components/MarketTempWidget";
import { loadNewHomeData } from "@/lib/newui/home-data";
import { loadHomeCoverage } from "@/lib/newui/home-coverage";
import { HomeCoverageLine } from "./components/home/HomeCoverageLine";
import { Explain } from "./components/explain/Explain";
import { getBaseRate } from "@/lib/market/base-rate";
import type { Metadata } from "next";
import type { HomeBriefing } from "@/lib/newui/home-data";
import {
  HOME_AI_BRIEFING_LABEL,
  HOME_AI_EXAMPLE_LINE,
  HOME_AI_GATEWAY_LEAD,
  HOME_AI_GATEWAY_TITLE,
  HOME_CTA_AI,
  HOME_HERO_SUBLINE_SHORT,
  HOME_PAGE_H1,
} from "@/lib/brand/home-copy";
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

const LAB_NOTES_CAPTION =
  "Lab 데이터 노트는 실거래·통계로 편집부가 정리한 노트예요. 이웃이 직접 다녀와 쓴 노트가 올라오면 여기에 함께 보입니다.";

function HomeAiGateway({
  briefing,
  exampleNoteId,
}: {
  briefing: HomeBriefing | null;
  exampleNoteId: string | null;
}) {
  return (
    <AIPanel
      title={HOME_AI_GATEWAY_TITLE}
      cta={{ href: HOME_CTA_AI.href, label: HOME_CTA_AI.label }}
    >
      <p className="m-0 t-body t-fit">{HOME_AI_GATEWAY_LEAD}</p>
      {/* [1008 · J] 예시 두 칸(입력 → AI 정리, [963]) → 한 줄. 두 칸은 모바일에서 세로 150px 을 차지했다 —
          검색 아래 "어디서부터 시작할까요?" 문 넷을 넣은 만큼 여기서 덜어 첫 화면 높이를 지킨다.
          형태(메모 → 리스크·장점·다음에 볼 것)는 이 한 줄이 그대로 말한다(수치 창작 없음). */}
      <p className="fit m-0 mt-1 rounded-lg border border-white/15 bg-white/5 px-2.5 py-2 t-sub t-fit leading-[1.55] text-white/85">
        {HOME_AI_EXAMPLE_LINE}
      </p>
      {/* 링크 세 줄 → 한 줄. [958] 분석 허브로 가는 길 · 실제 공개 노트 예시. "로그인 없이 단지 데이터 진단
          미리보기"([1002])는 검색 아래 문 ② "후보가 있어요 → 단지 종합 진단"이 같은 화면으로 간다(중복 제거).
          [989] 카드 안에 단독으로 서는 링크 — 위아래 6px 로 31px. */}
      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
        <Link href="/analysis" className="w-fit py-1.5 text-[12px] font-bold text-ai-accent no-underline">
          AI 분석 도구 4종 ›
        </Link>
        {exampleNoteId && (
          <Link
            href={`/notes/${exampleNoteId}`}
            className="w-fit py-1.5 text-[12px] font-bold text-ai-accent no-underline"
          >
            실제 정리된 공개 노트 보기 ›
          </Link>
        )}
      </div>
      <div className="fit mt-2 border-t border-white/15 pt-2">
        <div className="mb-1 t-caption font-extrabold text-ai-muted">
          {HOME_AI_BRIEFING_LABEL}
        </div>
        {briefing ? (
          <div className="t-body t-fit">
            {briefing.text}
            <span className="ml-1.5 inline-flex items-center rounded border border-white/20 px-1 py-px align-middle text-[10px] font-semibold text-ai-muted">
              {briefing.asOfLabel}
            </span>
            {/* [950] 무엇을 잰 값인지 — 티커의 지역 평균과 같은 기준임을 한 줄로 */}
            <div className="mt-0.5 t-caption t-fit text-ai-muted">{briefing.basis}</div>
          </div>
        ) : (
          <div className="t-body t-fit">
            오늘 브리핑을 아직 만들지 못했어요. 실거래 데이터가 갱신되면 표시됩니다.
          </div>
        )}
      </div>
    </AIPanel>
  );
}

export default async function Home() {
  /* 세 조회는 서로 의존이 없다 — 한 Promise.all 로 임계 경로를 가장 느린 하나로.
     [991] 다이제스트·신선도 라벨 조회는 티커·"더 알아보기"와 함께 내려갔다. */
  const [data, baseRateData, coverage] = await Promise.all([
    loadNewHomeData(),
    // 기준금리: ECOS(한국은행) 연동 시 실값, 미연동 시 "—" (허위 수치 금지)
    getBaseRate(),
    // [950] 커버리지 실수치(실거래·단지·지역) — 6시간 데이터 캐시, 실패 시 줄 생략
    loadHomeCoverage(),
  ]);

  // 실데이터만 사용한다 — 0건이면 빈 상태를 그린다(가짜 카드로 채우지 않는다).
  const regions = data.regions;
  const notes = data.notes;
  const failed = data.failed;
  /* [1007] 상대 시각 라벨의 기준 — 렌더당 한 번(ISR 300s 동안 굳는다 — 분 단위라 무방) */
  const renderedAt = Date.now();
  /* [950] 공개 노트가 전부 Lab(데이터·AI 편집) 노트면 그 사실을 한 줄로 적는다 */
  const allLabNotes = notes.length > 0 && notes.every((n) => n.kind === "lab");
  /* [950] 검색 아래 지역 칩 — 시세 카드와 같은 지역(실데이터). 지역 카드가 비면 칩도 없다. */
  const heroRegionChips = regions.slice(0, 4).map((r) => ({
    label: r.name,
    href: `/map?region=${encodeURIComponent(r.name)}`,
  }));

  /* 오늘의 한 문장 재료 — 전부 실측, 없으면 그 항목이 빠진다(가짜 숫자·"—" 채움 없음) */
  const saleIndexSeoul = data.saleIndexSeoul ?? "—";
  const loanRate = data.loanRate;
  const baseRate = baseRateData?.label ?? "—";
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
      };
    }
  } catch {
    kpiTemp = null; // 아카이브 없음/조회 실패 — 온도 항목만 빠진다
  }
  const kpiRegion: KpiRegion | null = regions[0]
    ? {
        name: regions[0].name,
        price: regions[0].price,
        delta: regions[0].delta,
        tone: regions[0].tone,
        /* [1009 · H 리뷰] 건수는 trades(제 달·원천이 함께 있다)만 — meta 의 "N건"은 달을 모른다 */
        tradeLabel:
          typeof regions[0].trades === "number" ? `${regions[0].trades.toLocaleString("ko-KR")}건` : null,
        href: `/map?region=${encodeURIComponent(regions[0].name)}`,
        periodLabel: regions[0].periodLabel,
        /* [1009 · H] 문장이 변동의 기준(지수/평균가)과 "변동 미상"을 가를 수 있게 원값을 넘긴다 */
        changePct: regions[0].changePct ?? null,
        changeBasis: regions[0].changeBasis,
        /* [1009 · H 리뷰] 등락의 달 · 거래 건수의 제 달과 원천 · 가격 원천(월 집계 카드 = 국토부 실거래 평균) */
        changeYm: regions[0].changeYm ?? null,
        tradesYm: regions[0].tradesYm ?? null,
        tradesSource: regions[0].tradesSource,
        priceKind: regions[0].stale ? "molit" : "reb",
      }
    : null;

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

          {/* [968 · 39] 클로즈 베타 안내 — 본문 위 한 줄. 서버 HTML 에는 없다(null). */}
          <BetaNoticeModal />
          {/* 작성 중 노트 복귀 — 우하단 팝업(소유자 지시 2026-08-16) */}
          <ResumeDraftPopup />

          {/* ① 검색 — 질문 한 줄 + 대형 검색 + 실기록 칩. 전폭. */}
          <div className="flex flex-col gap-3 pb-3 pt-1.5 md:py-5">
            <p className="t-display text-center text-ink">어느 단지가 궁금하세요?</p>
            <p className="-mt-1 text-center t-sub text-text-2">{HOME_HERO_SUBLINE_SHORT}</p>
            <HomeHeroSearch
              regionChips={heroRegionChips}
              coverage={
                <HomeCoverageLine coverage={coverage} publicNotes={data.publicNotesTotal} />
              }
            />
            {/* [1002] 조건 탐색 입구 — 단지 이름을 모르는 방문자는 검색창에 칠 게 없다.
                예산 한 줄로 지도 필터(?priceMax=억)에 바로 들어간다. 지역은 첫 시세 카드와
                같은 곳(실데이터), 카드가 없으면 지역 없이 예산만. 서버 렌더·클라이언트 JS 없음. */}
            <HomeBudgetChips regionName={regions[0]?.name ?? null} />
            {/* [1008 · J] 상황으로 고르는 입구 — 구경·후보·계약·처음. 서버 렌더·JS 없음(HomeStartDoors 주석). */}
            <HomeStartDoors />
          </div>

          {/* ② 오늘의 시장 — 한 문장. 넷을 동시에 말하면 무엇이 중요한지 사라진다. */}
          <div className="mb-3 md:mb-4">
            <HomeTodayLine
              region={kpiRegion}
              temp={kpiTemp}
              saleIndex={saleIndexSeoul}
              baseRate={baseRate}
              loanRate={loanRate}
              publicNotes={data.publicNotesTotal}
            />
          </div>

          {/* 본문 | 사이드바 — 모바일은 사이드바(내 관심·AI 입구)가 먼저 온다.
              DOM 순서가 곧 모바일 순서고, lg 에서는 order 로 오른쪽에 붙인다.
              두 벌을 그리지 않고 한 벌을 재배치하는 것이 이 파일의 전부다. */}
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-4">
            <aside
              data-autotrim=""
              className="flex flex-col gap-3 lg:order-2 lg:sticky lg:top-[76px] lg:self-start"
            >
              {/* ⑥ 내 관심 — 로그인만, 클라이언트 섬. 서버 HTML(공유 캐시)에는 없다. */}
              <HomeMyRail />
              {/* ④ AI 입구 — 예시 두 칸으로 결과의 모양을 먼저 보인다 */}
              <HomeAiGateway briefing={data.briefing} exampleNoteId={notes[0]?.id ?? null} />
              {/* 배너/하우스 광고 — 없으면 아무것도 그리지 않는다. plan={null}: 공유 캐시라
                  보는 사람의 플랜을 모른다(광고 제거는 AdFreeGate 가 클라이언트에서). */}
              <AdZone placement="home_feed" seed={0} plan={null} className="hidden lg:block" />
              <AdSenseUnit />
            </aside>

            <div data-autotrim="" className="flex flex-col gap-3 lg:order-1 lg:gap-4">
              {/* ③ 공개 임장노트 — 증거. 누가 쓴 노트인지(Lab/이웃)를 숨기지 않는다. */}
              <section className="card flex flex-col gap-2 rounded-2xl px-4 py-4">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="t-section text-ink">공개 임장노트</h2>
                  <span className="flex items-center gap-2">
                    {/* [1009 · H] 점수 배지의 뜻 — 예전 `title="현장 체크 5개 항목 평균 × 20"`(마우스를 올려야만 보여
                        휴대폰에선 없던 설명)을 누르면 열리는 ⓘ 시트로. 배지는 링크 행 안이라 ⓘ 는 머리에 한 번만 둔다
                        (링크 안 버튼 = 중첩 인터랙티브). 계산은 lib/newui/home-data.ts noteScoreOf ·
                        lib/inspection/store-db.ts inspectionAverageScore 그대로. */}
                    {notes.length > 0 && (
                      <span className="inline-flex items-center t-caption text-text-3">
                        임장 점수
                        <Explain
                          title="임장 점수"
                          body="노트 작성자가 매긴 항목 점수를 100점 만점으로 바꾼 숫자예요. 같은 단지라도 쓴 사람·시점마다 달라요."
                          how={[
                            "입지·학군·교통·시설·미래가치 5개 항목(항목마다 5점 만점) 중 점수를 매긴 항목만 평균해요.",
                            "그 평균 × 20 을 반올림해 100점 만점으로 적어요.",
                            "75점 이상은 파란 배지로 표시해요.",
                          ]}
                          source="공개 임장노트 · 작성자 입력"
                        />
                      </span>
                    )}
                    <Link
                      href="/notes"
                      className="inline-block py-[5px] text-[12px] text-text-3 transition-colors hover:text-primary"
                    >
                      더보기
                    </Link>
                  </span>
                </div>
                {notes.length === 0 ? (
                  failed.notes ? (
                    <p className="t-sub text-text-3">목록을 지금 불러오지 못했어요.</p>
                  ) : (
                    <EmptyState
                      icon="notebook-pen"
                      title="아직 공개된 임장노트가 없어요"
                      desc="첫 노트를 남기면 여기에 소개됩니다."
                      action={{ label: "첫 공개 노트 남기기", href: "/notes/new" }}
                    />
                  )
                ) : (
                  notes.slice(0, 3).map((n, i, arr) => (
                    <Link
                      key={n.id}
                      href={`/notes/${n.id}`}
                      className={`press -mx-1.5 flex items-center justify-between gap-3 rounded-lg px-1.5 py-[7px] t-body no-underline transition-colors hover:bg-bg ${
                        i < arr.length - 1 ? "border-b border-divider" : ""
                      }`}
                    >
                      <span className="flex min-w-0 items-center gap-1.5">
                        <span
                          className={`shrink-0 rounded px-1 py-px t-caption font-extrabold ${
                            n.kind === "lab"
                              ? "bg-[rgba(0,0,0,.05)] text-text-3"
                              : "bg-primary-soft text-primary"
                          }`}
                        >
                          {n.kind === "lab" ? "Lab 데이터" : "이웃"}
                        </span>
                        <span className="truncate font-semibold text-text-1">{n.title}</span>
                      </span>
                      <span
                        className={`shrink-0 rounded-md px-1.5 py-0.5 t-caption font-extrabold tabular-nums ${
                          n.hot ? "bg-primary-soft text-primary" : "bg-bg text-text-3"
                        }`}
                      >
                        <span className="sr-only">임장 점수 </span>
                        {n.score}
                      </span>
                    </Link>
                  ))
                )}
                {allLabNotes && <p className="m-0 t-caption text-text-3">{LAB_NOTES_CAPTION}</p>}
              </section>

              {/* ⑤ 지역 동향 — 4장(모바일 2열·xl 4열). 스파크라인·딥링크는 카드 안.
                  [1009 · H 리뷰] 제목 "지역 시세" → "지역 동향": 카드 4장 중 서울 3장의 가격은 국토부 신고 실거래 평균이라
                  "시세" 낱말 규칙(실거래만 있는 곳에 '시세' 금지)에 걸린다. 등락은 한국부동산원 지수(시세 지수) — 카드가 적는다. */}
              <section className="flex flex-col gap-3">
                <div className="flex items-baseline justify-between gap-2">
                  <h2 className="t-section text-ink">지역 동향</h2>
                  <Link
                    href="/map"
                    className="inline-block py-[5px] t-sub font-bold text-primary no-underline"
                  >
                    지도에서 전체 보기 ›
                  </Link>
                </div>
                {regions.length === 0 ? (
                  failed.regions ? (
                    <ErrorState
                      title="지역 동향을 지금 불러오지 못했어요"
                      desc="데이터가 없는 게 아니라 조회가 실패했어요. 잠시 후 다시 열어 주세요."
                      action={{ label: "지도에서 찾아보기", href: "/map" }}
                    />
                  ) : (
                    <EmptyState
                      icon="map"
                      title="지역 동향을 아직 불러오지 못했어요"
                      desc="실거래 스냅샷이 준비되면 여기에 표시됩니다."
                      action={{ label: "지도에서 찾아보기", href: "/map" }}
                    />
                  )
                ) : (
                  <>
                    <RegionPulseCards regions={regions.slice(0, 4)} />
                    {/* [1002] 스냅샷 실패 → 월 집계 폴백 카드. 값은 실측이지만 시점이
                        오래됐다는 사실을 카드 아래 한 줄로 적는다(카드 meta 의 "마지막 집계"
                        와 같은 말). 실패를 "준비 중"으로도, 오래된 값을 "지금"으로도 위장하지 않는다. */}
                    {data.regionsStale && (
                      <p className="m-0 t-caption text-text-3">
                        실시간 집계를 지금 불러오지 못해 마지막 월 집계를 보여드려요.
                      </p>
                    )}
                  </>
                )}
              </section>

              {/* ⑦ [1007 · P2] 동네이야기(사람의 기록) · 뉴스룸(자동수집) — 1006 의 .story-* / .news-*
                  재질 규칙을 홈에서도 쓴다. 두 칸은 같은 조회(readRelatedTownPosts, 5분 캐시)에서
                  isStoryPost 로 갈라 만든 것이라 추가 왕복이 없고, 클라이언트 JS 도 없다.
                  0건은 0건으로(가짜 카드 없음), 실패는 실패로 말한다. */}
              <HomeTownBlock stories={data.stories} news={data.news} failed={failed.town} now={renderedAt} />

              {/* [1008 · J] 본문 끝 "임장노트 쓰기" 버튼은 뺐다 — 헤더 "노트 쓰기"(데스크톱 상시)·탭바 "기록"(모바일
                  상시)·AI 입구 "노트로 AI 정리 시작"과 같은 목적지라 네 번째 같은 말이었다. 검색 아래 문 넷을 넣은 만큼
                  홈을 덜어 낸 자리다(파일 머리 [991]·[1008] 주석). */}

              <AdZone placement="home_feed" seed={1} plan={null} className="lg:hidden" />
            </div>
          </div>
        </div>
      </main>

      {/* P0-3: 공통 푸터 — 사업자 고지·약관 링크·면책 */}
      <Footer />
      <TabBar />
    </>
  );
}
