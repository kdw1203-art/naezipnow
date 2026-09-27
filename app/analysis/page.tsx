import Link from "next/link";
import { PageShell } from "../components/PageShell";
import { buildPageMetadata } from "@/lib/seo/page-metadata";
import { loadHubTeasers, type HubTeasers } from "./hub-teasers";
import { loadHomeCoverage } from "@/lib/newui/home-coverage";
import { FEATURE_RULES } from "@/lib/subscriptions/access";
import { isTierOnSale } from "@/lib/subscriptions/sell-config";
import { planLabel } from "@/lib/subscriptions/labels";
import { HubPickedProvider } from "./hub-context";
import { HubSearch } from "./hub-search";
import { WorkbenchList } from "./hub-tiers";
import { workbenchRows } from "./workbench-cards";
import { HubNoteRow } from "./hub-picker";
import { CompareTrayValue } from "./tool-cards-client";
import { ToolRow } from "./hub-tool-card";
import { ROW_CLASS, RowChevron, RowText } from "./hub-row";
import {
  AI_TOOL_COUNT,
  HUB_TOOL_COUNT,
  MARKET_LIVE,
  MARKET_SOURCES,
  RECORD_LIVE,
  TIERS,
  type TierId,
} from "./tool-catalog";

/* ============================================================
   분석 허브 — v4 "한 화면 한 가지" (2026-09-27)

   소유자 지시: "너무 복잡하고 뭐가 중요한지 어떤걸 봐야하는지 필요없는 말들도 많아보이고 분산되서
   너무 어수선하고 정리가 안되어잇는것처럼 보여" → 화면마다 주인공 하나, 채움 파랑 하나, 설명 문장·
   출처 줄·배지는 지우고 나머지는 아래 목록으로(토스식 정돈).

     [머리]      제목 "AI 분석" + 사실 한 줄(실거래 있는 단지 수 · 도구 수) — 흰 바탕, 네이비 히어로 없음
     [주인공]    단지 검색 하나 + 채움 파랑 [검색] + "지도에서 단지 고르기"
     [목록 1]    단지 분석 12 — 앞 5행 + "12개 모두 보기"
     [목록 2]    지역 시세 4 — 행 오른쪽에 강남구 실측 숫자 · 섹션 끝 출처 캡션 한 줄
     [목록 3]    내 임장노트 2 — "임장노트 분석"(펼치면 노트 AI 실행) · 후보 단지 비교
     [행 하나]   에이전트에게 묻기
     [캡션]      단지 분석 한도(무료·플러스·프로) · 요금제 보기 ›

   지운 것: 네이비 히어로·워터마크·계열 칩 3개·1-2 스텝퍼·통계 3칸·한도 블록(→ 맨 끝 캡션),
   아이콘 타일·성격 배지·계열 배지·카드별 설명 문단·"결과:" 줄·카드별 출처 줄·추세선,
   "그 밖의 도구" 칩 구름(→ 접힌 행), 게스트 공개 노트 AI 미리보기/빈 안내 카드(버튼 3개),
   로그인 시작 카드, 네이비 에이전트 카드(→ 행), 예시 계산 3종 구역, 하우스 광고(AdZone).

   글자 크기는 램프 유틸(.t-title/.t-section/.t-sub/.t-caption)만 쓴다.
   ============================================================ */

/* 설명문은 이 화면이 실제로 하는 일만 적는다 — 도구 수는 카탈로그 배열 길이에서 */
export const metadata = buildPageMetadata({
  title: "분석 도구",
  description: `단지 분석 ${AI_TOOL_COUNT}종 · 지역 시세 ${MARKET_LIVE.length}종 · 내 임장노트 ${RECORD_LIVE.length}종 — 국토교통부 실거래·한국부동산원 통계 기반 분석 도구를 한곳에서.`,
  path: "/analysis",
});

/* [1007] ISR — 서버 렌더에는 사용자별 값이 한 조각도 없다(로그인·내 노트 수·?complexId·?noteId 는
   클라이언트 조각 hub-viewer · hub-picker · ComplexPicker 가 마운트 뒤 판정한다). CDN 한 벌을 모두에게 줘도 새는 것이 없다. */
/* [1010] 1h → 1일. 이 화면의 원천은 하루 1회 적재되는 국토부 실거래·집계이고,
   적재 직후 lib/cache/invalidate.ts SOURCE_MAP.molit(+reb)이 이 경로를 이미 비운다 —
   시간 TTL 은 안전망일 뿐이다. 실측(2026-09-20~22) 이 축의 분석 화면은 하루 수천 회
   렌더되는데 사람 방문은 7일 합계 ~120건이고, 크롤러 재방문 간격은 ≈2.2일이라
   1시간 눈금은 방문마다 재렌더를 뜻했다. */
export const revalidate = 86_400;

/** 섹션 제목 — 이름 + 도구 수(숫자). 배지·아이콘·설명 줄 없음 */
function SectionHead({ id, count }: { id: TierId; count: number }) {
  return (
    <h2 id={`tier-${id}-h`} className="flex items-baseline gap-1.5 t-section text-ink">
      {TIERS[id].label}
      <span className="t-num text-text-3">{count}</span>
    </h2>
  );
}

export default async function AnalysisHubPage() {
  /* 지역 시세 행의 실측 숫자 — 실패/없음이면 그 키가 없고 행 오른쪽은 `›`(가짜 수치·"—" 채움 없음) */
  const [teasers, coverage] = await Promise.all([
    loadHubTeasers().catch((): HubTeasers => ({})),
    /* [958] 실거래 있는 단지 수 — 홈과 같은 6시간 캐시 실측값(실패면 null → 숫자 없이) */
    loadHomeCoverage().catch(() => ({ txCount: null, complexCount: null, regionCount: null })),
  ]);
  /* [980] 12행 내용은 서버에서 조립한다 — 클라이언트가 tool-identity·tool-persona 를
     직접 import 하면 번들 예산을 넘긴다(workbench-cards.ts 주석 참고). */
  const rows = workbenchRows();

  /* 머리 사실 한 줄 — 숫자·장소만(v4 규칙 1). 도구 수는 세 섹션 숫자의 합 */
  const headFact = [
    coverage.complexCount !== null
      ? `실거래 있는 단지 ${coverage.complexCount.toLocaleString("ko-KR")}곳`
      : "국토교통부 실거래 기준",
    `도구 ${HUB_TOOL_COUNT}개`,
  ].join(" · ");

  /* 단지 분석 한도 — lib/subscriptions/access.ts FEATURE_RULES.ai_analysis 그대로.
     [993] 무료는 누적(lifetime) 한도, 유료는 월 한도. 프로는 판매 중일 때만(sell-config). 이름은 planLabel 단일 출처 */
  const aiLimit = FEATURE_RULES.ai_analysis.monthlyLimit ?? {};
  const freeLifetime = FEATURE_RULES.ai_analysis.lifetimeLimit?.basic ?? null;
  const quota = [
    `${planLabel("basic")} ${freeLifetime != null ? `누적 ${freeLifetime}회` : `월 ${aiLimit.basic ?? 0}회`}`,
    `${planLabel("pro")} 월 ${aiLimit.pro ?? 0}회`,
    ...(isTierOnSale("expert")
      ? [`${planLabel("expert")} ${aiLimit.expert == null ? "무제한" : `월 ${aiLimit.expert}회`}`]
      : []),
  ].join(" · ");

  return (
    <PageShell>
      <HubPickedProvider>
        <div className="mx-auto flex w-full max-w-[760px] flex-col gap-8">
          {/* ── 머리: 제목 한 줄 + 사실 한 줄 ── */}
          <div className="flex flex-col gap-4">
            <header className="flex flex-col gap-0.5">
              <h1 className="t-title text-ink">AI 분석</h1>
              <p className="t-sub text-text-3">{headFact}</p>
            </header>

            {/* ── 주인공: 단지 검색 ── */}
            <HubSearch />
          </div>

          {/* ── 단지 분석 12 ── */}
          <section id="tier-complex" aria-labelledby="tier-complex-h" className="flex scroll-mt-24 flex-col gap-2">
            <SectionHead id="complex" count={AI_TOOL_COUNT} />
            <WorkbenchList rows={rows} />
          </section>

          {/* ── 지역 시세 4 — 행 오른쪽 = 강남구 실측 숫자 · 출처는 섹션 끝 한 줄 ── */}
          <section id="tier-market" aria-labelledby="tier-market-h" className="flex scroll-mt-24 flex-col gap-2">
            <SectionHead id="market" count={MARKET_LIVE.length} />
            <ul data-tone="blue" className="card flex flex-col divide-y divide-line rounded-lg px-4">
              {MARKET_LIVE.map((t) => (
                <ToolRow key={t.href} t={t} teaser={t.teaser ? teasers[t.teaser] ?? null : null} />
              ))}
            </ul>
            <p className="t-caption text-text-3">{MARKET_SOURCES}</p>
          </section>

          {/* ── 내 임장노트 2 + 에이전트 한 행 ── */}
          <section id="tier-record" aria-labelledby="tier-record-h" className="flex scroll-mt-24 flex-col gap-2">
            <SectionHead id="record" count={RECORD_LIVE.length} />
            <ul data-tone="hanji" className="card flex flex-col divide-y divide-line rounded-lg px-4">
              {RECORD_LIVE.map((t) =>
                t.href === "/notes" ? (
                  /* 펼치면 노트 AI 실행 — 로그인·내 노트 수·?noteId 는 이 조각이 마운트 뒤 판정 */
                  <HubNoteRow key={t.href} title={t.title} sub={t.sub} />
                ) : (
                  /* 후보 단지 비교 — 오른쪽 = 담은 후보 수(브라우저 트레이 실카운트) 또는 › */
                  <ToolRow key={t.href} t={t} value={t.href === "/analysis/compare" ? <CompareTrayValue /> : undefined} />
                ),
              )}
            </ul>
            {/* 에이전트는 도구가 아니라 여러 데이터를 조회해 답하는 자리 — 섹션 숫자에 세지 않고 행 하나로 따로 둔다 */}
            <ul className="card mt-2 flex flex-col rounded-lg px-4">
              <li>
                <Link href="/agent" className={ROW_CLASS}>
                  <RowText title="에이전트에게 묻기" sub="내 임장노트·수도권 실거래 조회 답변" />
                  <RowChevron />
                </Link>
              </li>
            </ul>
          </section>

          {/* ── 한도 캡션 한 줄 ── */}
          <p className="t-caption text-text-3">
            단지 분석 {quota} ·{" "}
            <Link href="/subscription" className="tap-line font-bold text-primary no-underline">
              요금제 보기 ›
            </Link>
          </p>
        </div>
      </HubPickedProvider>
    </PageShell>
  );
}
