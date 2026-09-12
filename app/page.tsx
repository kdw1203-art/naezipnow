import Link from "next/link";
import { Header } from "./components/Header";
import { TabBar } from "./components/TabBar";
import { AIPanel } from "./components/AIPanel";
import { ResumeDraftPopup } from "./components/home/ResumeDraftPopup";
import { EmptyState, ErrorState } from "./components/ui/EmptyState";
import { BetaNoticeModal } from "./components/BetaNoticeModal";
import { AdZone } from "./components/ads/AdZone";
import { AdSenseUnit } from "./components/ads/AdSenseUnit";
import { Footer } from "./components/Footer";
import { HomeHeroSearch } from "./components/home/HomeHeroSearch";
import { HomeMyRail } from "./components/home/HomeMyRail";
import type { KpiRegion, KpiTemp } from "./components/home/HomeKpiRow";
import { HomeTodayLine } from "./components/home/HomeTodayLine";
import { RegionPulseCards } from "./components/home/RegionPulseCards";
import { loadLatestTemperatures } from "./components/MarketTempWidget";
import { loadNewHomeData } from "@/lib/newui/home-data";
import { loadHomeCoverage } from "@/lib/newui/home-coverage";
import { HomeCoverageLine } from "./components/home/HomeCoverageLine";
import { getBaseRate } from "@/lib/market/base-rate";
import type { Metadata } from "next";
import type { HomeBriefing } from "@/lib/newui/home-data";
import {
  HOME_AI_BRIEFING_LABEL,
  HOME_AI_EXAMPLE_INPUT,
  HOME_AI_EXAMPLE_OUTPUT,
  HOME_AI_GATEWAY_LEAD,
  HOME_AI_GATEWAY_TITLE,
  HOME_CTA_AI,
  HOME_CTA_NOTE,
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
   비로그인 첫 화면 = ① 검색 ② 오늘의 시장 한 문장 ③ 공개 임장노트 ④ AI 입구
   ⑤ 지역 시세. 로그인이면 ⑥ 내 관심(클라이언트 섬)이 끼어든다. 출석·미션·레벨은
   /my 가 맡는다(같은 카드가 거기 이미 있다).
   첫 화면에는 rise-in·data-reveal 을 쓰지 않는다 — 첫 화면은 정적이어야 한다.
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
      {/* [963] 예시 두 칸 — 판정 기준을 **화면 폭에서 칸 폭으로** 바꿨다(.fit).
          예전엔 `sm:grid-cols-[1fr_auto_1fr]` 라 화면이 640px 만 넘으면 3열이 됐는데,
          데스크톱 사이드바는 340px 이라 한 칸에 한글 4~5자만 들어갔다 — 메모 한 줄이
          4줄로 접히며 카드가 세로로 늘어난 원인(소유자 캡처 2026-09-04).
          이제 이 칸이 420px 이상일 때만 좌우로 놓고, 좁으면 위아래로 쌓는다.
          글자는 .t-fit 이 램프 안에서 한 단 내려 준다. */}
      <div className="fit mt-2">
        <div className="fit-pair">
          <div className="rounded-lg border border-white/15 bg-white/5 px-2.5 py-2">
            <div className="t-caption t-fit font-extrabold text-ai-muted">예시 · 현장 메모</div>
            <div className="mt-0.5 t-body t-fit leading-[1.5] text-white/85">
              {HOME_AI_EXAMPLE_INPUT}
            </div>
          </div>
          <div className="fit-pair-arrow text-center text-ai-accent" aria-hidden="true">
            →
          </div>
          <div className="rounded-lg border border-ai-accent/40 bg-white/5 px-2.5 py-2">
            <div className="t-caption t-fit font-extrabold text-ai-muted">예시 · AI 정리</div>
            <ul className="mt-0.5 m-0 list-none p-0 t-body t-fit leading-[1.5] text-white/85">
              {HOME_AI_EXAMPLE_OUTPUT.map((line) => (
                <li key={line}>· {line}</li>
              ))}
            </ul>
          </div>
        </div>
      </div>
      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
        {exampleNoteId && (
          <Link
            href={`/notes/${exampleNoteId}`}
            /* [989] 실측 세로 19px — 카드 안에 단독으로 서는 링크. 위아래 6px 씩 줘
               31px 로 만든다(줄 간격 4px 이라 위아래가 겹치지 않는다) */
            className="w-fit py-1.5 text-[12px] font-bold text-ai-accent no-underline"
          >
            실제 정리된 공개 노트 보기 ›
          </Link>
        )}
        {/* [958] 홈에서 단지 분석 도구 12종으로 가는 길이 없었다 — 한 줄 링크 */}
        <Link href="/analysis" className="w-fit py-1.5 text-[12px] font-bold text-ai-accent no-underline">
          단지 분석 도구 12종 ›
        </Link>
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
        tradeLabel: regions[0].meta.match(/([\d,]+건)/)?.[1] ?? null,
        href: `/map?region=${encodeURIComponent(regions[0].name)}`,
        periodLabel: regions[0].periodLabel,
      }
    : null;

  return (
    <>
      <Header />

      {/* id 는 layout.tsx 의 "본문 바로가기" 스킵 링크 목적지다. */}
      <main
        id="main-content"
        className="mx-auto w-full max-w-[1240px] flex-1 px-3.5 pb-6 pt-3.5 md:px-5 md:pb-16 md:pt-5"
      >
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
              <div className="flex items-center justify-between">
                <h2 className="t-section text-ink">공개 임장노트</h2>
                <Link
                  href="/notes"
                  className="inline-block py-[5px] text-[12px] text-text-3 transition-colors hover:text-primary"
                >
                  더보기
                </Link>
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
                    className={`-mx-1.5 flex items-center justify-between gap-3 rounded-lg px-1.5 py-[7px] t-body no-underline transition-colors hover:bg-[rgba(29,79,216,.05)] ${
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
                      title="현장 체크 5개 항목 평균 × 20 (100점 만점)"
                      className={`shrink-0 rounded-md px-1.5 py-0.5 t-caption font-extrabold ${
                        n.hot ? "bg-primary-soft text-primary" : "bg-[rgba(0,0,0,.045)] text-text-3"
                      }`}
                    >
                      {n.score}
                    </span>
                  </Link>
                ))
              )}
              {allLabNotes && <p className="m-0 t-caption text-text-3">{LAB_NOTES_CAPTION}</p>}
            </section>

            {/* ⑤ 지역 시세 — 4장(모바일 2열·xl 4열). 스파크라인·딥링크는 카드 안. */}
            <section className="flex flex-col gap-3">
              <div className="flex items-baseline justify-between gap-2">
                <h2 className="t-section text-ink">지역 시세</h2>
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
                    title="지역 시세를 지금 불러오지 못했어요"
                    desc="데이터가 없는 게 아니라 조회가 실패했어요. 잠시 후 다시 열어 주세요."
                    action={{ label: "지도에서 찾아보기", href: "/map" }}
                  />
                ) : (
                  <EmptyState
                    icon="map"
                    title="지역 시세를 아직 불러오지 못했어요"
                    desc="실거래 스냅샷이 준비되면 여기에 표시됩니다."
                    action={{ label: "지도에서 찾아보기", href: "/map" }}
                  />
                )
              ) : (
                <RegionPulseCards regions={regions.slice(0, 4)} />
              )}
            </section>

            {/* 주 행동 — 기록 → AI → 지도 흐름을 이 버튼 하나가 시작한다 */}
            <Link
              href={HOME_CTA_NOTE.href}
              className="btn-primary glow press rounded-xl p-3 text-center text-[15px]"
            >
              {HOME_CTA_NOTE.label}
            </Link>

            <AdZone placement="home_feed" seed={1} plan={null} className="lg:hidden" />
          </div>
        </div>
      </main>

      {/* P0-3: 공통 푸터 — 사업자 고지·약관 링크·면책 */}
      <Footer />
      <TabBar />
    </>
  );
}
