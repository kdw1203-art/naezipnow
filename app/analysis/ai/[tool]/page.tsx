import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageShell } from "@/app/components/PageShell";
import { ToolGlyph, WORKBENCH_GLYPH } from "../../ToolGlyph";
import { AI_TOOL_IDS, isAiAnalysisToolId, type AiAnalysisToolId } from "@/lib/ai/ai-tools";
import { TOOL_IDENTITIES } from "@/lib/ai/tool-identity";
import { TOOL_PERSONAS, personaVars } from "@/lib/ai/tool-persona";
import { tuningFields } from "@/lib/ai/tool-tuning-fields";
import { isAnthropicConfigured, isOpenAiConfigured } from "@/lib/ai/env-keys";
import { getActiveComplexes } from "@/lib/ai/popular-complexes";
import { WorkbenchClient } from "./WorkbenchClient";

/* [AI-31·32] 통합 AI 워크벤치 — 12종 도구의 단일 실행 표면.
   [1008 · W] ① 단지 고르기 → (공공데이터 자동 계산 결과가 바로 선다: 결과 요약·숫자 타일·그래프)
   → ② 내 조건(선택) → ③ 분석 실행(내 조건 반영 + 원하면 AI 해설). 결과에는 데이터 출처(AI-01)·기준 시점
   (AI-17)·자료 부족 표시(AI-03)·결과가 달라지는 경우(AI-04)·다음 할 일 3개(AI-38)·피드백(AI-46)이 붙는다. */

/* [1008 · W] 도구마다 "보여 주는 것" — 머리와 첫 방문 안내 3단계가 같은 말을 한다 */
const RESULT_KIND: Record<AiAnalysisToolId, string> = {
  "ai-diagnosis": "5가지 항목 점수·레이더와 이 단지 실거래가 그래프",
  "ai-prediction": "1~5년 뒤 가격 시나리오(낙관·기본·비관) 그래프",
  "ai-timing": "가격 흐름·거래 열기·입주 물량 신호등 3개",
  "ai-inspection": "함께 볼 단지와 하루 임장 순서",
  "ai-risk": "위험 신호 5가지 체크리스트",
  "ai-compare": "담은 단지 2~3곳의 같은 숫자 칸 비교표",
  "my-checklist": "임장·계약 전에 확인할 항목 체크리스트(체크는 이 기기에 저장)",
  "ai-portfolio": "관심 단지가 어느 지역·가격대에 몰렸는지",
  "ai-simulator": "대출액·월 상환액·이자(원리금균등 계산)",
  "ai-gap": "갭 비율과 지역 전세가율·월세 비중",
  "ai-economy": "기준금리·미분양 같은 지표 숫자",
  "contract-risk": "전세가율로 본 위험도와 계약 전에 확인할 것·특약 문장",
};

/** [1008 · 리뷰 A-3] "넣는 것" — 도구마다 실제로 결과를 바꾸는 입력만 적는다 */
const INPUT_KIND: Record<AiAnalysisToolId, string> = {
  "ai-diagnosis": "단지 이름 하나",
  "ai-prediction": "단지 이름 · 기준 가격·기간은 선택",
  "ai-timing": "단지 이름 하나",
  "ai-inspection": "단지 이름 하나",
  "ai-risk": "단지 이름 하나",
  "ai-compare": "비교할 단지 2~3곳",
  "my-checklist": "단지 이름 하나",
  "ai-portfolio": "내 관심 단지(로그인)",
  "ai-simulator": "단지 이름 · 대출 비율·금리(기간은 선택)",
  "ai-gap": "단지 이름 · 매매가·전세가는 선택",
  "ai-economy": "없음 — 기준금리·지역 지표를 자동으로",
  "contract-risk": "이 집 전세가율·보증금 · 등기부·보증보험 확인 여부",
};

/* [1010] 1h → 1일. 실측(2026-09-20~22) 하루 1,512 렌더 — 도구 12개짜리 라우트가
   그만큼 돌았다는 건 크롤러 방문마다 다시 그렸다는 뜻이다. 서버 렌더에 들어가는
   유동 값은 getActiveComplexes()(market 태그·6시간 데이터 캐시) 하나뿐이고, 나머지는
   코드 상수(도구 정체성·설명)다. 이 경로는 SOURCE_MAP 목록에 없어서 비움이 없던 자리라,
   lib/region/invalidate-market.ts invalidateMarketAnalysisRoutes() 가 하루 1회
   라우트 전체를 비운다(12개라 셀 단위로 고를 이유가 없다). */
export const revalidate = 86_400;

export function generateStaticParams() {
  return AI_TOOL_IDS.map((tool) => ({ tool }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ tool: string }>;
}): Promise<Metadata> {
  const { tool } = await params;
  /* [970 · C-25] 접미 없던 제목에 `| 내집나우` */
  if (!isAiAnalysisToolId(tool)) return { title: "AI 분석 도구 | 내집나우" };
  const id = TOOL_IDENTITIES[tool as AiAnalysisToolId];
  return {
    title: `${id.title} — AI 분석 도구 | 내집나우`,
    description: `${id.tagline}. 국토교통부 실거래·전월세 신고·입주 예정·이웃 임장노트 실데이터로 계산하고, 모든 수치에 출처를 표기합니다.`,
    alternates: { canonical: `/analysis/ai/${tool}` },
  };
}

export default async function AiToolPage({
  params,
}: {
  params: Promise<{ tool: string }>;
}) {
  const { tool } = await params;
  if (!isAiAnalysisToolId(tool)) notFound();
  const tid = tool as AiAnalysisToolId;
  const identity = TOOL_IDENTITIES[tid];
  /* [980] 도구 성격 — 색·연출·말투를 여기 한 곳에서 꽂고, 안쪽은 전부 CSS 변수를 읽는다.
     클래스마다 색을 적으면 도구가 16종이 되는 순간 반드시 어긋난다. */
  const persona = TOOL_PERSONAS[tid];
  /* [1008 · W] 첫 방문 빠른 선택 — 거래 많은 단지(실데이터, 6시간 캐시). 비어 있으면 줄을 안 그린다.
     단지 하나 스코프가 아닌 경제 모니터·계약 점검에는 필요 없다. */
  const quickPicks = tid === "ai-economy" || tid === "contract-risk" ? [] : await getActiveComplexes(6);

  return (
    <PageShell breadcrumb={`AI 분석 › ${identity.title}`}>
      <div
        /* [993] 880 → 1240: 데스크톱은 입력 좌·결과 우 2열이라 폭이 필요하다(계산기·시나리오와 동일) */
        className="tool-scope mx-auto flex w-full max-w-[1240px] flex-col gap-4"
        style={personaVars(persona)}
        data-tool={tid}
      >
        {/* [958] 도구 머리 — 네이비 면 + 결과물 글리프 + "넣는 것 → 계산 → 나오는 것".
            예전엔 제목·한 줄 설명뿐이라 12개 도구가 무엇이 다른지, 결과가 AI 인지
            규칙인지 실행 전에는 알 수 없었다. 실행 전에 말한다. */}
        <section className="hub-hero rise-in flex flex-col gap-4 p-5 md:p-6">
          <div className="flex items-start gap-4">
            {/* [980] 글리프 칸에 도구 색 띠 — 네이비 위 글자색은 on-dark 토큰 그대로(대비) */}
            <span
              className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-brand-hanji text-brand-hanji-ink"
              style={{ boxShadow: `inset 0 0 0 3px ${persona.palette.accent}` }}
            >
              <ToolGlyph id={WORKBENCH_GLYPH[tid] ?? "radar"} size={44} />
            </span>
            <div className="min-w-0 flex-1">
              <nav className="t-caption font-extrabold tracking-wider text-on-dark-muted">
                {/* [975] 네이비 위에서는 전역 링크 파랑이 2.32:1 로 무너진다 — 밑줄과 위치로 링크임을 말한다 */}
                <Link href="/analysis" className="inline-flex min-h-[24px] items-center text-on-dark no-underline hover:underline">
                  AI 분석
                </Link>{" "}
                › 단지 하나를 깊게
              </nav>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <h1 className="t-title text-on-dark">{identity.title}</h1>
                <span className="rounded-md bg-on-dark-panel px-2 py-px t-caption font-extrabold tracking-wider text-on-dark-muted">
                  {persona.character}
                </span>
              </div>
              {/* [1008 · W] 이 화면이 하는 일 한 줄(쉬운 말) — 기능 설명(tagline)과 두 줄로 겹치던 것을 하나로 */}
              <p className="mt-1 t-body text-on-dark">{persona.premise}</p>
            </div>
          </div>
          {/* [1008 · W] "넣는 것·계산·나오는 것" → 쉬운 말. "규칙 계산 · 판단 카드(구간·대표 수치·근거)" 는
              처음 온 사람이 알아듣지 못했다(소유자). 모바일에서는 접는다([993] 머리만 한 화면을 먹던 것). */}
          <div className="hidden grid-cols-1 gap-2 border-t border-on-dark-faint pt-4 sm:grid sm:grid-cols-3">
            <div className="rounded-xl bg-on-dark-panel px-3 py-2.5">
              <div className="t-caption font-extrabold text-on-dark-muted">넣는 것</div>
              <div className="t-sub text-on-dark">{INPUT_KIND[tid]}</div>
            </div>
            <div className="rounded-xl bg-on-dark-panel px-3 py-2.5">
              <div className="t-caption font-extrabold text-on-dark-muted">자동으로 불러오는 것</div>
              <div className="t-sub text-on-dark">국토부 실거래·전월세 신고 · 입주 예정 · 한국부동산원 지역 통계</div>
            </div>
            <div className="rounded-xl bg-on-dark-panel px-3 py-2.5">
              <div className="t-caption font-extrabold text-on-dark-muted">보여 주는 것</div>
              <div className="t-sub text-on-dark">{RESULT_KIND[tid]}</div>
            </div>
          </div>
        </section>

        <WorkbenchClient
          tool={tid}
          title={identity.title}
          tips={identity.tips}
          persona={persona}
          fields={tuningFields(tid)}
          llmAvailable={isOpenAiConfigured() || isAnthropicConfigured()}
          quickPicks={quickPicks}
          resultKind={RESULT_KIND[tid]}
        />

        {/* 면책 — check-ai-compliance.mjs 가 이 마커의 존재를 검사한다 */}
        <p
          data-ai-compliance="notice"
          className="rounded-[10px] bg-bg px-4 py-3 t-sub text-text-3"
        >
          이 화면의 숫자는 공공데이터(국토교통부 실거래·전월세 신고, 한국부동산원, 청약홈 등)를 정해진
          방식으로 자동 계산한 참고값이에요. AI 해설은 외부 AI 모델이 쓴 문장이라 [AI 서술]로 따로
          표시해요. 거래가 적거나 오래된 자료는 그 사실을 함께 적어요. 투자 권유·수익 보장·법률·세무
          자문이 아니며, 최종 판단과 책임은 이용자 본인에게 있어요.
        </p>
      </div>
    </PageShell>
  );
}
