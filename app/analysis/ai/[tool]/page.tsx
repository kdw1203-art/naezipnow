/* [1026b · AI 분석 8종] 나머지 8종(리스크 점검·비교·수익률 계산·갭·경제지표·자산 구성·체크리스트·계약 점검)도 1026 틀 — 도구 색 래퍼
   (.tool-scope + personaVars: 리스크 빨강·수익률 초록 …)를 12종 모두에서 걷고 전역 파랑 하나. 빈 상태 한 문장(EMPTY_LINE)은 12종 모두
   서버가 넘긴다(클라이언트 번들 0). 8종 머리는 흰 PageHead(premise 한 줄) 그대로 · 4종 머리는 WorkbenchClient. 면책·캐시·메타 그대로. */
/* [1026 · 단지 분석 4종] 1025 표준 "채움 파랑 하나 · 초록·주황 채움 금지" — 단지 분석 4종(진단·예측·동선·타이밍)은 도구 색 래퍼
   (.tool-scope + personaVars — 안쪽 --primary 를 도구 색으로 갈아 끼운다: 임장 동선 초록 · 매수 타이밍 주황)를 걷고 전역 파랑을 쓴다.
   나머지 8종은 예전 도구 색 그대로. 머리·면책·캐시·메타는 그대로. */
/* [1023 · AI 분석] 나머지 8종의 단지 고르기 전 머리 — 네이비 면(hub-hero + 한지 글리프 칸) → 흰 PageHead(아이콘 칩 40 · h1.t-title · premise 한 줄).
   브레드크럼은 PageShell 이 이미 그린다. 4종(frame) 머리·면책·캐시·메타는 그대로. */
/* [1022 · 단지 분석 고도화] 지시 3 — 시세 예측의 내 조건에 대출 비율·금리·상환 기간(prediction-cost-fields.ts)을 붙여
   부채꼴 위 "비용 포함 손익분기" 선의 재료로 쓴다(엔진이 읽는 키만). 나머지는 그대로. */
/* [1012 · 규칙 8] font-bold(800) → font-bold(700) — 굵기 3단(400·500·700). 이 파일의 모든 자리에 적용. */
/* [1021 · 단지 분석 /analysis/ai] 단지 분석 4종(진단·예측·동선·타이밍)은 시안(mock8)대로 — 네이비/흰 히어로 카드 대신
   머리 한 줄(아이콘 칩 · 제목 · identity.useCase · 기준 시점 칩)을 WorkbenchClient 가 그린다(칩은 결과가 선 뒤 값이라 클라이언트).
   페르소나 전제문(persona.premise)은 넣지 않는다(1015 규칙). 나머지 8종은 예전 머리 그대로. 캐시·메타·면책은 그대로. */
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageShell } from "@/app/components/PageShell";
import { PageHead } from "@/app/components/PageHead";
import { ToolGlyph, WORKBENCH_GLYPH } from "../../ToolGlyph";
import { TIERS, WORKBENCH_ICONS } from "../../tool-catalog";
import { AI_TOOL_IDS, isAiAnalysisToolId, type AiAnalysisToolId } from "@/lib/ai/ai-tools";
import { TOOL_IDENTITIES } from "@/lib/ai/tool-identity";
import { TOOL_PERSONAS } from "@/lib/ai/tool-persona";
import { tuningFields } from "@/lib/ai/tool-tuning-fields";
import { isAnthropicConfigured, isOpenAiConfigured } from "@/lib/ai/env-keys";
import { getActiveComplexes } from "@/lib/ai/popular-complexes";
import { WorkbenchClient } from "./WorkbenchClient";
import { isFrameTool } from "./frame-tools";
import { PREDICTION_COST_FIELDS } from "./prediction-cost-fields";

/* [AI-31·32] 통합 AI 워크벤치 — 12종 도구의 단일 실행 표면.
   [1008 · W] ① 단지 고르기 → (공공데이터 자동 계산 결과가 바로 선다: 결과 요약·숫자 타일·그래프)
   → ② 내 조건(선택) → ③ 분석 실행(내 조건 반영 + 원하면 AI 해설). 결과에는 데이터 출처(AI-01)·기준 시점
   (AI-17)·자료 부족 표시(AI-03)·결과가 달라지는 경우(AI-04)·다음 할 일 3개(AI-38)·피드백(AI-46)이 붙는다. */



/* [1026] 단지 분석 4종 빈 상태 한 문장 — 단지를 고르면 무엇이 바로 나오는지(값 없음). 서버가 넘긴다(클라이언트 번들 0)
   [1026b] 나머지 8종도 같은 자리에 한 문장(경제지표 모니터는 단지를 고르지 않아 빈 상태가 없다)
   [1028] 도구마다 달랐던 문장("단지를 고르면 … 바로 나와요")은 바로 위 머리 한 줄(useCase · premise)과 같은 말이었다 —
   무엇이 나오는지는 머리가 말하고, 빈 상태는 11종 공통 한 줄. */
const EMPTY_LINE: Partial<Record<AiAnalysisToolId, string>> = {
  "ai-diagnosis": "단지 선택 → 결과",
  "ai-prediction": "단지 선택 → 결과",
  "ai-inspection": "단지 선택 → 결과",
  "ai-timing": "단지 선택 → 결과",
  "ai-risk": "단지 선택 → 결과",
  "ai-compare": "단지 선택 → 결과",
  "ai-simulator": "단지 선택 → 결과",
  "ai-gap": "단지 선택 → 결과",
  "ai-portfolio": "단지 선택 → 결과",
  "my-checklist": "단지 선택 → 결과",
  "contract-risk": "단지 선택 → 결과",
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
    description: `${id.tagline}. 국토교통부 실거래·전월세 신고·입주 예정·이웃 임장노트로 계산하고, 모든 수치에 출처를 표기합니다.`,
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
  /* [1021] 단지 분석 4종 — 머리는 클라이언트가 그린다(아이콘은 서버가 그린 글리프를 넘긴다) */
  const complexHeader = isFrameTool(tid)
    ? { icon: <ToolGlyph id={WORKBENCH_GLYPH[tid] ?? "radar"} size={26} />, useCase: identity.useCase, crumb: TIERS.complex.label }
    : null;

  return (
    <PageShell breadcrumb={`AI 분석 › ${identity.title}`}>
      <div
        /* [993] 880 → 1240: 데스크톱은 입력 좌·결과 우 2열이라 폭이 필요하다(계산기·시나리오와 동일)
           [1026 → 1026b] 12종 모두 도구 색을 걷는다(버튼·그래프·칩이 전역 파랑 하나) */
        className="mx-auto flex w-full max-w-[1240px] flex-col gap-4"
        data-tool={tid}
      >
        {/* [958→1011→1023] 도구 머리 — 예전 네이비 면 + 한지 글리프 칸을 걷고 허브·지역 도구와 같은 흰 PageHead
            (아이콘 칩 40 · h1.t-title · 이 화면이 하는 일 한 줄 = persona.premise). 브레드크럼은 PageShell 의 것 하나.
            [1011] "넣는 것 · 자동으로 불러오는 것 · 보여 주는 것" 3칸은 그때 걷었다(소유자 지시). */}
        {!complexHeader && (
          <PageHead
            icon={WORKBENCH_ICONS[tid] ?? "sparkles"}
            title={identity.title}
            sub={persona.premise}
            subOnPhone
          />
        )}

        <WorkbenchClient
          tool={tid}
          title={identity.title}
          persona={persona}
          fields={tid === "ai-prediction" ? [...tuningFields(tid), ...PREDICTION_COST_FIELDS] : tuningFields(tid)}
          llmAvailable={isOpenAiConfigured() || isAnthropicConfigured()}
          quickPicks={quickPicks}
          header={complexHeader}
          emptyLine={EMPTY_LINE[tid] ?? null}
        />

        {/* 면책 — check-ai-compliance.mjs 가 이 마커의 존재를 검사한다 */}
        <p
          data-ai-compliance="notice"
          className="rounded-lg bg-bg px-4 py-3 t-sub text-text-3"
        >
          {/* [1015 · 규칙 D] 어미만 다듬었다 — "투자 권유"·"책임" 등 면책 낱말은 그대로(check:ai-compliance) */}
          이 화면의 숫자는 공공데이터(국토교통부 실거래·전월세 신고, 한국부동산원, 청약홈 등)를 정해진
          방식으로 자동 계산한 참고값입니다. AI 해설은 외부 AI 모델이 쓴 문장이라 [AI 서술]로 따로
          표시하고, 거래가 적거나 오래된 자료는 그 사실을 함께 적습니다. 투자 권유·수익 보장·법률·세무
          자문이 아니며, 최종 판단과 책임은 이용자 본인에게 있습니다.
        </p>
      </div>
    </PageShell>
  );
}
