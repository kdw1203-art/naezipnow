/* [1012] 규칙 8 — 굵기 800 이상 금지: 이 파일의 font-extrabold/black 2곳을 font-bold(700)로 바꿨다. */
import Link from "next/link";
import { redirect } from "next/navigation";
import { PageShell } from "@/app/components/PageShell";
import { safeAuth } from "@/lib/safe-auth";
import { listRuns } from "@/lib/ai/presets-store";
import { TOOL_IDENTITIES } from "@/lib/ai/tool-identity";
import { isAiAnalysisToolId, type AiAnalysisToolId } from "@/lib/ai/ai-tools";

/* [AI-34] 내 분석 기록 — 저장만 되고 보이지 않던 히스토리의 표면화.
   재실행은 같은 도구 페이지로 보낸다(입력은 새 데이터로 다시 로드 — AI-02 원칙:
   과거 스냅샷 열람은 공유 페이지가, 재실행은 현재 데이터가 담당). */

export const dynamic = "force-dynamic";
/* [970 · C-25] 접미 없던 제목에 `| 내집나우` */
export const metadata = { title: "내 AI 분석 기록 | 내집나우", robots: { index: false } };

export default async function MyAnalysesPage() {
  const session = await safeAuth();
  const email = session?.user?.email;
  if (!email) redirect("/login?callbackUrl=/my/analyses");

  let runs: Awaited<ReturnType<typeof listRuns>> = [];
  let failed = false;
  try {
    runs = await listRuns(email, 40);
  } catch {
    failed = true;
  }

  /* [v4 · 한 화면 한 가지] 제목 + 사실 한 줄 → 1px 선 목록 행(도구 · 시각/결과 한 줄 · 오른쪽 ›). 카드 쌓기·가운데 정렬 빈 카드 없음.
     행 전체 = 결과 스냅샷 링크, "같은 도구 다시 실행"은 행 아래 글자 링크로 그대로 */
  return (
    <PageShell>
      <div className="mx-auto flex w-full max-w-[760px] flex-col gap-4">
        <header className="rise-in flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-0.5">
            <h1 className="t-title text-ink">내 AI 분석 기록</h1>
            {!failed && <p className="t-sub text-text-3">최근 {runs.length}건</p>}
          </div>
          <Link href="/analysis" className="inline-flex min-h-10 shrink-0 items-center t-sub font-bold text-primary no-underline">
            분석 도구 허브 ›
          </Link>
        </header>

        {failed ? (
          <p className="border-y border-line py-3 t-body font-bold text-text-2">기록 조회 실패 · 없는 게 아니라 조회가 실패 · 잠시 후 다시</p>
        ) : runs.length === 0 ? (
          <div className="flex flex-col items-start gap-2 border-y border-line py-3">
            {/* [1012] 규칙 6 — 누가 */}
            <p className="t-body font-bold text-text-2">내가 실행한 AI 분석 없음</p>
            <Link href="/analysis" className="btn-primary btn-md no-underline">
              AI 분석 도구 목록 보기 ›
            </Link>
          </div>
        ) : (
          <ul data-tone="blue" className="rise-in-1 divide-y divide-line">
            {runs.map((r) => {
              const tid = isAiAnalysisToolId(r.tool) ? (r.tool as AiAnalysisToolId) : null;
              const title = tid ? TOOL_IDENTITIES[tid].title : r.tool;
              const meta = [
                new Date(r.createdAt).toLocaleString("ko-KR"),
                r.source ? (r.source === "internal" || r.source === "stub" ? "규칙" : "AI 서술") : null,
                r.structuredSummary?.headline ?? null,
              ]
                .filter(Boolean)
                .join(" · ");
              return (
                <li key={r.id} className="py-1">
                  <Link href={`/analysis/ai/r/${r.id}`} className="press flex min-h-12 items-center justify-between gap-3 py-2 no-underline">
                    <span className="min-w-0 flex-1">
                      <span className="block t-body font-bold text-ink">{title}</span>
                      <span className="mt-0.5 block truncate t-sub text-text-3">{meta}</span>
                    </span>
                    <span aria-hidden="true" className="shrink-0 t-body text-text-3">
                      ›
                    </span>
                  </Link>
                  {tid && (
                    <Link href={`/analysis/ai/${tid}`} className="inline-flex min-h-[24px] items-center pb-1 t-sub font-bold text-text-3 no-underline">
                      같은 도구 다시 실행 ›
                    </Link>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </PageShell>
  );
}
