import { AdZone } from "@/app/components/ads/AdZone";
import Link from "next/link";
import { PageShell } from "../components/PageShell";
import { Icon } from "@/app/components/Icon";
import type { InspectionNote } from "@/lib/inspection/store-db";
import { listPublicNotesWithFallback } from "@/lib/inspection/public-notes-cached";
import { listPublicNotes } from "@/lib/inspection/store-db";
import { buildPageMetadata } from "@/lib/seo/page-metadata";
import { loadHubTeasers, type HubTeaser } from "./hub-teasers";
import { loadHomeCoverage } from "@/lib/newui/home-coverage";
import { FEATURE_RULES } from "@/lib/subscriptions/access";
import { isTierOnSale } from "@/lib/subscriptions/sell-config";
import { HubPickedProvider } from "./hub-context";
import { HubHero } from "./hub-hero";
import { WorkbenchGrid } from "./hub-tiers";
import { workbenchCardData } from "./workbench-cards";
import { HubNoteAnalysis } from "./hub-picker";
import { HubMyNoteTeaser, HubRecordStart } from "./hub-record-start";
import { CompareTrayCount } from "./tool-cards-client";
import { ToolCard } from "./hub-tool-card";
import { AI_TOOL_COUNT, MARKET_LIVE, RECORD_LIVE, SIM_TOOLS, TIERS, type TierId } from "./tool-catalog";


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

   글자 크기는 램프 유틸(.t-display/.t-title/.t-section/.t-sub/.t-caption)만
   쓴다 — 이 화면에 있던 text-[24px]·[15px]·[13.5px]·[11.5px]·[10.5px]·[9px]
   같은 임의값을 전부 걷어냈다(UI-07).
   ============================================================ */

/** 공개 노트에서 AI(또는 규칙) 요약 문구가 있는 첫 건 — 게스트 미리보기용 */
function pickPublicAiPreview(notes: InspectionNote[]): {
  id: string;
  title: string;
  teaser: string;
  badge: string;
} | null {
  for (const n of notes) {
    const ai = n.aiAnalysis;
    if (!ai) continue;
    const teaser = [ai.narrativeSummary, ai.summary, ai.detailedConclusion].find(
      (x): x is string => typeof x === "string" && x.trim().length > 0,
    );
    if (!teaser) continue;
    const engine = typeof ai.engine === "string" ? ai.engine : "";
    const badge = engine.startsWith("rule-based") ? "규칙 기반 분석" : "AI 생성";
    const title =
      n.aptName && !n.title.includes(n.aptName)
        ? `${n.aptName} — ${n.title}`
        : n.title;
    return { id: n.id, title, teaser: teaser.trim().slice(0, 160), badge };
  }
  return null;
}

/* 설명문은 이 화면이 실제로 하는 일만 적는다. SIM_TOOLS 는 아직 실연동이
   아니므로 "예시 계산"이라는 사실을 description 에도 남긴다 — 검색 결과만
   보고 실측 분석을 기대하고 들어오면 그게 곧 거짓말이 된다. */
export const metadata = buildPageMetadata({
  title: "분석 도구",
  description:
    "단지 하나를 깊게, 지역 시장 흐름을, 내 임장노트를 — 국토교통부 실거래 기반 분석 도구를 한곳에서. 실연동 전 도구는 '예시 계산'으로 따로 표시합니다.",
  path: "/analysis",
});

const TIER_ICON: Record<TierId, string> = {
  complex: "building2",
  market: "trending-up",
  record: "notebook-pen",
};

function TierHead({ id, count }: { id: TierId; count: number }) {
  const t = TIERS[id];
  return (
    <div className="hub-tier-head">
      <div className="flex items-center gap-2">
        <span
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] ${t.iconClass}`}
        >
          <Icon name={TIER_ICON[id]} size={16} />
        </span>
        <h2 className="accent-underline t-title text-balance text-ink">{t.question}</h2>
        <span className="t-caption ml-auto shrink-0 rounded border border-line px-1.5 py-px font-bold text-text-3">
          {t.badge} · {count}종
        </span>
      </div>
      <p className="t-sub text-text-3">{t.hint}</p>
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
  /* 카드별 실측 티저 + 12구간 추세선. 실패/없음이면 해당 키가 아예 없고,
     카드에서는 그 줄이 빠질 뿐이다(가짜 수치·"—" 채움 없음). */
  const [teasers, coverage, publicRows] = await Promise.all([
    loadHubTeasers().catch(() => ({})),
    /* [958] 히어로 커버리지 — 홈과 같은 6시간 캐시 실측값(0이면 0, 실패면 —) */
    loadHomeCoverage().catch(() => ({ txCount: null, complexCount: null, regionCount: null })),
    /* 게스트 미리보기 — 공개 노트의 실제 AI 요약. [949] 모두에게 같은 값이라 페이지 캐시(ISR)에
       실린다. [967 · 29a] DB 가 밀리는 시간대의 TimeoutError 는 마지막 정상본으로 받는다.
       실패는 null(빈 안내 카드) — 샘플로 채우지 않는다. */
    listPublicNotesWithFallback(24, (n) => listPublicNotes(n, { withAi: true }))
      .then((r) => r.notes)
      .catch(() => [] as InspectionNote[]),
  ]);
  /* [980] 12칸 카드는 서버에서 조립한다 — 클라이언트가 tool-identity·tool-persona 를
     직접 import 하면 번들 예산을 넘긴다(workbench-cards.ts 주석 참고). */
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

  const publicPreview = pickPublicAiPreview(publicRows);

  return (
    <PageShell>
      <HubPickedProvider>
        <div className="flex flex-col gap-6">
          {/* ── 히어로: 검색이 화면의 첫 요소 (UI-05·10) ── */}
          <HubHero
            coverage={coverage}
            quota={quota}
            toolCount={AI_TOOL_COUNT + MARKET_LIVE.length + RECORD_LIVE.length}
          />

          {/* ── 계열 1 · 단지 하나를 깊게 (UI-01·03) ── */}
          <section
            id="tier-complex"
            className="rise-in-1 flex scroll-mt-24 flex-col gap-3"
          >
            <TierHead id="complex" count={AI_TOOL_COUNT} />
            <WorkbenchGrid core={workbenchCards.core} more={workbenchCards.more} />
          </section>

          {/* ── 계열 2 · 지역·시장 흐름 (UI-09 실측 티저 + 추세선) ── */}
          <section
            id="tier-market"
            className="rise-in-2 flex scroll-mt-24 flex-col gap-3"
          >
            <TierHead id="market" count={MARKET_LIVE.length} />
            <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
              {MARKET_LIVE.map((t) => (
                <ToolCard
                  key={t.href}
                  t={t}
                  teaser={
                    t.teaser && t.teaser in teasers
                      ? (teasers as Record<string, HubTeaser>)[t.teaser]
                      : null
                  }
                />
              ))}
            </div>
          </section>

          {/* ── 계열 3 · 내가 쓴 기록 ── */}
          <section
            id="tier-record"
            className="rise-in-2 flex scroll-mt-24 flex-col gap-3"
          >
            <TierHead id="record" count={RECORD_LIVE.length} />

            {/* 시작 지점: 로그인=내 노트 실카운트 / 게스트=공개 노트 실 요약.
                [1007] 로그인 카드는 HubRecordStart(클라이언트)가 세션 판정 뒤 바꿔 끼운다 —
                게스트 카드는 여기 서버 JSX 그대로(ISR HTML 에 실리고 클라이언트 번들엔 안 들어간다). */}
            <HubRecordStart
              guest={
                publicPreview ? (
                  <div className="card flex flex-col gap-2.5 rounded-[14px] p-4">
                    <span className="t-section text-ink">공개 노트 AI 정리 미리보기</span>
                    <div className="ai-panel flex flex-col gap-1.5 rounded-[10px] p-3.5">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="t-caption inline-flex items-center rounded border border-line px-1.5 py-px font-semibold text-ai-muted">
                          {publicPreview.badge}
                        </span>
                        <span className="t-sub font-extrabold text-ai-text">
                          {publicPreview.title}
                        </span>
                      </div>
                      <p className="t-sub text-ai-text">
                        {publicPreview.teaser}
                        {publicPreview.teaser.length >= 160 ? "…" : ""}
                      </p>
                    </div>
                    <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                      <span className="t-sub text-text-3">
                        실제 공개 임장노트의 정리 결과예요. 로그인하면 내 노트도 같은
                        방식으로 정리해요
                      </span>
                      <div className="flex shrink-0 flex-wrap gap-2">
                        <Link
                          href={`/notes/${publicPreview.id}`}
                          className="btn-primary btn-md no-underline"
                        >
                          전체 AI 요약 보기
                        </Link>
                        <Link href="/notes/new" className="btn-soft btn-md no-underline">
                          내 노트 쓰기
                        </Link>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="card flex flex-col gap-2.5 rounded-[14px] p-4">
                    {/* 공개 AI 미리보기 0건 — 샘플 리포트로 채우지 않는다 */}
                    <span className="t-section text-ink">
                      아직 공개된 AI 정리가 없어요
                    </span>
                    <p className="t-body text-text-2">
                      샘플 리포트로 채우지 않아요. 임장노트를 남기면 같은 방식으로
                      장단점·시세 맥락을 정리해 드려요.
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <Link href="/notes/new" className="btn-primary btn-md no-underline">
                        임장노트 쓰고 AI 받기
                      </Link>
                      <Link href="/notes" className="btn-soft btn-md no-underline">
                        공개 노트 보기
                      </Link>
                      <Link href="/login" className="btn-soft btn-md no-underline">
                        로그인
                      </Link>
                    </div>
                  </div>
                )
              }
            />

            {/* 도구 2장 + 노트 AI 실행 카드를 한 그리드에 둔다. 따로 두면
                데스크톱에서 도구 카드가 화면 절반씩 늘어나 텅 비어 보였다. */}
            <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
              {RECORD_LIVE.map((t) => (
                <ToolCard
                  key={t.href}
                  t={t}
                  teaser={null}
                  extra={
                    /* [1007] 내 노트 수 티저는 클라이언트가 세션 판정 뒤 붙인다(HubMyNoteTeaser) */
                    t.teaser === "notes" ? (
                      <HubMyNoteTeaser />
                    ) : t.teaser === "compare" ? (
                      <CompareTrayCount />
                    ) : undefined
                  }
                />
              ))}
              {/* 히어로에서 고른 단지를 컨텍스트로 받는다 — ?noteId=·로그인 여부는 카드가 스스로 읽는다 */}
              <HubNoteAnalysis className="col-span-2" />
            </div>
          </section>

          {/* ── 계열을 가로지르는 하나: 에이전트 ──
              예전엔 도구 카드 8장 사이에 끼어 있어 "9번째 도구"처럼 보였다.
              하는 일이 다르다 — 도구는 한 대상을 깊게, 에이전트는 여러 데이터를
              검색·조합해 질문에 답한다. 그래서 자리를 따로 준다. */}
          <Link
            href="/agent"
            className="ai-panel tile rise-in-3 flex flex-col gap-2.5 rounded-[18px] p-5 no-underline md:flex-row md:items-center md:gap-5"
          >
            <span className="ai-chip tile-ico flex h-11 w-11 shrink-0 items-center justify-center rounded-[13px]">
              <Icon name="bot" size={20} />
            </span>
            <span className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="t-section text-ai-text">
                셋 다 아닌가요? 에이전트에게 그냥 물어보세요
              </span>
              <span className="t-sub text-ai-text">
                “내 노트 중 점수가 가장 높았던 단지, 지금 실거래는 어때?” — 내
                임장노트·실거래를 직접 조회해 답하고, 무엇을 봤는지 목록으로
                같이 보여 줍니다 (현재 수도권 실거래 기준)
              </span>
            </span>
            <span className="tile-go t-sub shrink-0 font-bold text-ai-accent">
              에이전트 열기 ›
            </span>
          </Link>

          {/* ── 체험 구역 (UI-04) — 실데이터와 섞지 않는다. 기본 접힘 ── */}
          <details className="hub-sim card rise-in-3 rounded-[14px] p-4">
            <summary className="flex flex-wrap items-center gap-2">
              <span className="t-section text-ink">
                예시 계산으로 먼저 감 잡기
              </span>
              <span className="t-caption rounded border border-line px-1.5 py-px font-bold text-text-3">
                실데이터 아님 · {SIM_TOOLS.length}종
              </span>
              <span className="t-sub ml-auto font-bold text-primary">
                <span className="hub-sim-closed">펼치기</span>
                <span className="hub-sim-open">접기</span>{" "}
                <span className="hub-sim-caret" aria-hidden="true">
                  ▾{/* dead-control-ok: <details><summary> 네이티브 토글의 열림 표시 — summary 전체가 실제 컨트롤이다 */}
                </span>
              </span>
            </summary>
            <p className="t-sub mt-2 text-text-3">
              아래 넷은 아직 실연동 전이라 예시 수치로 계산합니다. 위 도구들과
              달리 결과를 의사결정에 그대로 쓰면 안 됩니다.
            </p>
            <div className="mt-3 grid grid-cols-2 gap-2.5 lg:grid-cols-4">
              {SIM_TOOLS.map((t) => (
                <ToolCard
                  key={t.href}
                  t={t}
                  teaser={
                    t.teaser && t.teaser in teasers
                      ? (teasers as Record<string, HubTeaser>)[t.teaser]
                      : null
                  }
                  extra={
                    <span className="t-caption w-fit rounded border border-line px-1.5 py-px font-bold text-text-3">
                      예시 계산
                    </span>
                  }
                />
              ))}
            </div>
          </details>
        </div>
      </HubPickedProvider>
      {/* [961] 광고 공간 — 허브 맨 아래(도구 입력·결과 사이에는 두지 않는다) */}
      <AdZone placement="page_bottom" seed={2} plan={null} className="mt-8" />
    </PageShell>
  );
}
