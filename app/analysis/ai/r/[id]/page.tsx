import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageShell } from "@/app/components/PageShell";
import { getServiceSupabase } from "@/lib/supabase/service";
import { TOOL_IDENTITIES } from "@/lib/ai/tool-identity";
import { TOOL_PERSONAS, personaVars } from "@/lib/ai/tool-persona";
import type { Verdict } from "@/lib/ai/verdict";
import { VerdictCard } from "../../[tool]/VerdictCard";
import { isAiAnalysisToolId, type AiAnalysisToolId } from "@/lib/ai/ai-tools";
import { verdictNextActions } from "@/lib/ai/next-action-routing";
import { decodeNameIdSafe } from "@/lib/seo/complex-slug";

/* [AI-33] 분석 결과 공유 페이지 — 링크만 알면 로그인 없이 열람.
   실행 시점 스냅샷(마크다운·요약)을 그대로 보여준다(AI-02 재현성) —
   지금 데이터로 다시 계산하지 않고, 다시 계산은 "직접 실행" 버튼이 담당한다.
   작성자 이메일 등 개인 식별 정보는 렌더하지 않는다. */

/* [OPT-09] 공유 스냅샷은 불변(재현성: AI-02) — 요청마다 렌더할 이유가 없다.
   복도(2026-07-28) 교훈대로 빈 generateStaticParams 로 ISR 분류를 강제한다. */
export const revalidate = 3600;
export const dynamicParams = true;
export function generateStaticParams(): Array<{ id: string }> {
  return [];
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function loadRun(id: string) {
  if (!UUID_RE.test(id)) return null;
  const sb = getServiceSupabase();
  if (!sb) return null;
  const { data } = await sb
    .from("ai_analysis_runs")
    .select("id,tool,markdown,structured_summary,created_at,complex_id")
    .eq("id", id)
    .maybeSingle();
  return (data as {
    id: string;
    tool: string;
    markdown: string;
    structured_summary: { headline?: string; bullets?: string[]; verdict?: Verdict | null } | null;
    created_at: string;
    complex_id: string | null;
  } | null) ?? null;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const run = await loadRun(id);
  if (!run || !isAiAnalysisToolId(run.tool)) return { robots: { index: false } };
  const identity = TOOL_IDENTITIES[run.tool as AiAnalysisToolId];
  return {
    /* [970 · C-25] 접미 없던 제목에 `| 내집나우` */
    title: `${identity.title} 결과 공유 | 내집나우`,
    description: run.structured_summary?.headline ?? identity.tagline,
    robots: { index: false, follow: false },
  };
}

export default async function SharedRunPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const run = await loadRun(id);
  if (!run || !isAiAnalysisToolId(run.tool)) notFound();
  const identity = TOOL_IDENTITIES[run.tool as AiAnalysisToolId];
  const at = new Date(run.created_at).toLocaleString("ko-KR");
  /* [996] 공유받은 사람도 같은 두 행동 — 판단을 노트로, 근거는 단지 홈으로. 실행이 단지를
     저장했을 때만(complex_id). 단지명·지역은 순수 id 에서 푼다(kapt.* 는 못 풀어 id 만 넘긴다).
     메모 날짜는 판단이 계산된 시각(computedAt) — 스냅샷이므로 오늘 날짜를 적지 않는다. */
  const verdict = run.structured_summary?.verdict ?? null;
  const dec = run.complex_id ? decodeNameIdSafe(run.complex_id) : null;
  const next =
    run.complex_id && verdict
      ? verdictNextActions({
          tool: run.tool as AiAnalysisToolId,
          verdict,
          complexId: run.complex_id,
          complexName: dec?.name ?? null,
          region: dec?.region ?? null,
          noteHandoff: true,
        })
      : null;

  return (
    <PageShell breadcrumb={`${identity.title} 공유`}>
      <div className="mx-auto flex w-full max-w-[760px] flex-col gap-3">
        <div className="rise-in">
          <div className="text-[12px] font-bold text-text-3">
            내집나우 AI 분석 결과 공유 · {at} 실행 스냅샷
          </div>
          <h1 className="mt-1 text-[21px] font-extrabold text-ink">{identity.title}</h1>
          {!run.structured_summary?.verdict && run.structured_summary?.headline && (
            <p className="mt-1 text-[13px] font-bold leading-[1.6] text-text-1">
              {run.structured_summary.headline}
            </p>
          )}
        </div>

        {/* [993] 실행 시점의 판단 카드 — 공유받은 사람도 결과값을 먼저 본다 */}
        {verdict && (
          <div className="card tool-scope tool-rail flex flex-col gap-3 rounded-2xl p-4" style={personaVars(TOOL_PERSONAS[run.tool as AiAnalysisToolId])}>
            <VerdictCard verdict={verdict} />
            {next && (
              <div className="flex flex-wrap gap-2" aria-label="다음 행동">
                <Link href={next.primary.href} className="tool-fill press btn-md no-underline" title={next.primary.hint}>
                  {next.primary.label} ›
                </Link>
                {next.secondary && (
                  <Link href={next.secondary.href} className="btn-secondary btn-md no-underline">
                    {next.secondary.label}
                  </Link>
                )}
              </div>
            )}
          </div>
        )}

        <details className="card rounded-2xl p-4" open={!run.structured_summary?.verdict}>
          <summary className="cursor-pointer text-[13px] font-extrabold text-text-2">해석 본문</summary>
          <div className="mt-2 whitespace-pre-wrap text-[13px] leading-[1.75] text-text-1">{run.markdown}</div>
        </details>

        <div className="rounded-[10px] bg-bg px-4 py-3 text-[12px] leading-[1.7] text-text-3">
          이 화면은 실행 시점의 데이터 스냅샷입니다 — 지금 데이터와 다를 수 있어요.
          수치는 공공 데이터 기반 규칙 계산이며 투자 권유가 아닙니다.
        </div>

        <Link
          href={`/analysis/ai/${run.tool}`}
          className="btn-primary self-start rounded-[10px] px-4 py-2.5 text-[13px] font-extrabold no-underline"
        >
          지금 데이터로 직접 실행하기 ›
        </Link>
      </div>
    </PageShell>
  );
}
