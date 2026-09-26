import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageShell } from "@/app/components/PageShell";
import { getServiceSupabase } from "@/lib/supabase/service";
import { cleanAiMarkdown } from "@/lib/ai/ai-tail";
import { TOOL_IDENTITIES } from "@/lib/ai/tool-identity";
import { TOOL_PERSONAS, personaVars } from "@/lib/ai/tool-persona";
import type { Verdict } from "@/lib/ai/verdict";
import { VerdictCard } from "../../[tool]/VerdictCard";
import { metricExplain, tileExplain } from "../../[tool]/verdict-explain";
import { Explain } from "@/app/components/explain/Explain";
import { isAiAnalysisToolId, type AiAnalysisToolId } from "@/lib/ai/ai-tools";
import { verdictNextActions } from "@/lib/ai/next-action-routing";
import { decodeNameIdSafe } from "@/lib/seo/complex-slug";

/* [AI-33] 분석 결과 공유 페이지 — 링크만 알면 로그인 없이 열람.
   실행 시점 스냅샷(마크다운·요약)을 그대로 보여준다(AI-02 재현성) —
   지금 데이터로 다시 계산하지 않고, 다시 계산은 "직접 실행" 버튼이 담당한다.
   작성자 이메일 등 개인 식별 정보는 렌더하지 않는다. */

/* [OPT-09] 공유 스냅샷은 불변(재현성: AI-02) — 요청마다 렌더할 이유가 없다.
   복도(2026-07-28) 교훈대로 빈 generateStaticParams 로 ISR 분류를 강제한다. */
/* [1010] 1h → 7일. 제안값은 1일이었지만 이 페이지만 더 길게 잡는다 — 여기 실리는 것은
   실행 시점에 굳은 ai_analysis_runs 한 행(마크다운·요약)이고, 위 주석대로 **불변**이라
   비울 쓰기 지점이 존재하지 않는다(다시 계산은 "직접 실행" 버튼이 새 id 를 만든다).
   바뀌지 않는 문서를 1시간마다 다시 그리는 것은 순수한 낭비였다. 새 결과는 애초에
   캐시가 없으므로 첫 요청에서 만들어진다 — 신선도 손해가 원리상 0 이다. */
export const revalidate = 604_800;
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
    .select("id,tool,markdown,structured_summary,created_at,complex_id,source")
    .eq("id", id)
    .maybeSingle();
  return (data as {
    id: string;
    tool: string;
    markdown: string;
    structured_summary: { headline?: string; bullets?: string[]; verdict?: Verdict | null } | null;
    created_at: string;
    complex_id: string | null;
    source?: string | null;
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

  /* [1008 · W] 외부 AI 서술만 "AI 해설"로 보인다. 자체 규칙 본문(internal·stub)은 리스크·타이밍에서 앱 안의
     예시 표(고정값)를 늘어놓아 공유받은 단지와 무관한 숫자가 섞인다 — 결과 요약이 대신 말한다. */
  const external = Boolean(run.source && run.source !== "internal" && run.source !== "stub");

  return (
    <PageShell breadcrumb={`${identity.title} 공유`}>
      <div className="mx-auto flex w-full max-w-[760px] flex-col gap-3">
        <div className="rise-in">
          <div className="t-sub font-bold text-text-3">
            내집나우 AI 분석 결과 공유 · {at} 기준 결과
          </div>
          <h1 className="mt-1 t-title font-extrabold text-ink">
            {dec?.name ? `${dec.name} · ` : ""}
            {identity.title}
          </h1>
          {!run.structured_summary?.verdict && run.structured_summary?.headline && (
            <p className="mt-1 t-body font-bold text-text-1">{run.structured_summary.headline}</p>
          )}
        </div>

        {/* [993] 실행 시점의 결과 요약 — 공유받은 사람도 결과값을 먼저 본다 */}
        {verdict && (
          <div
            className="card tool-scope tool-rail flex flex-col gap-3 rounded-2xl p-4"
            style={personaVars(TOOL_PERSONAS[run.tool as AiAnalysisToolId])}
            data-tool={run.tool}
          >
            {/* [1009 · A] 워크벤치와 같은 ⓘ 설명(누르면 "이렇게 계산했어요") — 공유받은 사람도 숫자의 뜻을 본다 */}
            <VerdictCard
              verdict={verdict}
              metricAside={(() => {
                const c = metricExplain(verdict);
                return c ? <Explain {...c} /> : null;
              })()}
              tileAside={(t) => {
                const c = tileExplain(t);
                return c ? <Explain {...c} size={12} /> : null;
              }}
            />
            {next && (
              <div className="flex flex-col gap-1.5">
                <div className="flex flex-wrap gap-2" aria-label="다음 할 일">
                  <Link href={next.primary.href} className="tool-fill press btn-md no-underline">
                    이 단지 임장노트 쓰기 ›
                  </Link>
                  {next.secondary && (
                    <Link href={next.secondary.href} className="btn-secondary btn-md no-underline">
                      단지 정보 보기
                    </Link>
                  )}
                </div>
                {/* 예전엔 링크의 title= 말풍선(마우스를 올려야만 보임)이었다 — 실제로 하는 일을 글자로 */}
                <p className="t-caption text-text-3">임장노트에는 이 결과의 결론과 핵심 숫자가 메모 초안으로 들어가요.</p>
              </div>
            )}
          </div>
        )}

        {external && run.markdown && (
          <details className="card rounded-2xl p-4" open={!run.structured_summary?.verdict}>
            <summary className="cursor-pointer t-body font-extrabold text-text-2">AI 해설 [AI 서술]</summary>
            {/* [1008 · 리뷰 A-18] 예전 기록의 꼬리 줄(밑줄 기울임·내부 말)을 결과 화면과 같게 걷는다 */}
            <div className="mt-2 whitespace-pre-wrap t-body text-text-1">{cleanAiMarkdown(run.markdown)}</div>
          </details>
        )}

        <div className="rounded-[10px] bg-bg px-4 py-3 t-sub text-text-3">
          이 화면은 실행한 그때의 결과예요 — 지금 자료와 다를 수 있어요. 숫자는 공공데이터를 자동 계산한
          참고값이며 투자 권유가 아닙니다.
        </div>

        <Link href={`/analysis/ai/${run.tool}`} className="btn-primary btn-md self-start no-underline">
          지금 자료로 직접 해 보기 ›
        </Link>
      </div>
    </PageShell>
  );
}
