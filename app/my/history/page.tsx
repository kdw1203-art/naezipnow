import Link from "@/app/components/IntentLink";
import { redirect } from "next/navigation";
import { PageShell } from "@/app/components/PageShell";
import { safeAuth } from "@/lib/safe-auth";
import { listNotes, inspectionAverageScore } from "@/lib/inspection/store-db";
import { decisionFromMetadata, decisionLabel } from "@/lib/inspection/decision";
import { listRuns } from "@/lib/ai/presets-store";
import { TOOL_IDENTITIES } from "@/lib/ai/tool-identity";
import { isAiAnalysisToolId, type AiAnalysisToolId } from "@/lib/ai/ai-tools";
import { buildHistory, historyPoints, historySummary, kstYmd, type HistoryNoteIn, type HistoryRunIn } from "@/lib/me/history-timeline";
import { logger } from "@/lib/log";
import { Suspense } from "react";
import { visitedComplexes } from "@/lib/me/visit-changes";
import { HistoryMap } from "./HistoryMap";
import { VisitedChanges } from "./VisitedChanges";

/* [1162 · 내 임장 이력] 다녀온 곳(임장노트 방문일)과 돌려 본 분석(AI 분석 기록)을 날짜 줄 하나로. 좌표가 있는 노트는 위 지도에 점으로.
   개인 화면 — 색인하지 않는다. 한쪽을 못 읽으면 읽은 쪽만 보이고 실패한 쪽을 한 줄로 말한다. */
export const dynamic = "force-dynamic";
export const metadata = { title: "내 임장 이력 | 내집나우", robots: { index: false, follow: false } };

export default async function MyHistoryPage() {
  const session = await safeAuth();
  const email = session?.user?.email;
  if (!email) redirect("/login?callbackUrl=/my/history");

  const [notesR, runsR] = await Promise.allSettled([listNotes(email), listRuns(email, 60)]);
  if (notesR.status === "rejected") logger.error("[my/history] 노트 조회 실패", notesR.reason);
  if (runsR.status === "rejected") logger.error("[my/history] 분석 기록 조회 실패", runsR.reason);

  const notes: HistoryNoteIn[] =
    notesR.status === "fulfilled"
      ? notesR.value.map((n) => {
          const d = decisionFromMetadata(n.metadata);
          const score = Math.round(inspectionAverageScore(n.scores) * 20);
          return { id: n.id, title: n.title, aptName: n.aptName, region: n.region, visitDate: n.visitDate, createdAt: n.createdAt, score: score > 0 ? score : null, decisionLabel: d ? decisionLabel(d.choice) : null, lat: n.metadata?.lat, lng: n.metadata?.lng };
        })
      : [];
  const runs: HistoryRunIn[] =
    runsR.status === "fulfilled"
      ? runsR.value.map((r) => ({
          id: r.id,
          toolTitle: isAiAnalysisToolId(r.tool) ? TOOL_IDENTITIES[r.tool as AiAnalysisToolId].title : String(r.tool),
          createdAt: r.createdAt,
          headline: r.structuredSummary?.headline ?? null,
        }))
      : [];

  /* [1163] 다녀온 단지(단지 id 가 있는 노트) — 최근 방문 5곳의 방문 뒤 변동 */
  const visited =
    notesR.status === "fulfilled"
      ? visitedComplexes(notesR.value.map((n) => ({ id: n.id, complexId: n.metadata?.complexId, name: n.aptName?.trim() || n.title, visitYmd: n.visitDate })), 5)
      : [];
  const months = buildHistory(notes, runs);
  /* [1164] 맨 위 숫자 세 칸 */
  const sum = historySummary(notes, kstYmd(new Date().toISOString()));
  const points = historyPoints(notes);
  const bothFailed = notesR.status === "rejected" && runsR.status === "rejected";
  const partFailed = !bothFailed && (notesR.status === "rejected" || runsR.status === "rejected");

  return (
    <PageShell breadcrumb="내 임장 이력">
      <div className="mx-auto flex w-full max-w-[760px] flex-col gap-3">
        <div className="rise-in flex items-baseline justify-between gap-2">
          <h1 className="m-0 t-title text-ink">내 임장 이력</h1>
          {!bothFailed && !partFailed && (
            <span className="t-sub text-text-3 t-num">
              노트 {notes.length.toLocaleString("ko-KR")} · 분석 {runs.length.toLocaleString("ko-KR")}
            </span>
          )}
        </div>

        {partFailed && (
          <p className="card m-0 rounded-2xl px-4 py-3 t-sub text-text-3">
            {notesR.status === "rejected" ? "임장노트 불러오기 실패 · 잠시 후 다시" : "분석 기록 불러오기 실패 · 잠시 후 다시"}
          </p>
        )}

        {bothFailed ? (
          <p className="card m-0 rounded-2xl px-5 py-8 text-center t-body font-bold text-text-3">임장 이력 불러오기 실패 · 잠시 후 다시</p>
        ) : months.length === 0 ? (
          <div className="card flex flex-col items-center gap-3 rounded-2xl px-5 py-8 text-center">
            <p className="m-0 t-body font-bold text-text-2">임장 이력 없음</p>
            <Link href="/notes/new" className="btn-primary btn-md no-underline">
              임장노트 쓰기
            </Link>
          </div>
        ) : (
          <>
            {notes.length > 0 && (
              <dl className="m-0 grid grid-cols-3 gap-2">
                {(
                  [
                    ["이번 달 임장", `${sum.monthVisits.toLocaleString("ko-KR")}회`],
                    ["평균 점수", sum.avgScore != null ? `${sum.avgScore}점` : "—"],
                    ["다녀온 단지", `${sum.places.toLocaleString("ko-KR")}곳`],
                  ] as const
                ).map(([k, v]) => (
                  <div key={k} className="card rounded-2xl px-3 py-3">
                    <dt className="t-caption text-text-3">{k}</dt>
                    <dd className="m-0 t-title text-ink t-num">{v}</dd>
                  </div>
                ))}
              </dl>
            )}
            {points.length > 0 && <HistoryMap points={points} />}
            {visited.length > 0 && (
              <Suspense fallback={<p className="card m-0 rounded-2xl px-4 py-3 t-sub text-text-3">다녀온 단지 변동 불러오는 중</p>}>
                <VisitedChanges visited={visited} />
              </Suspense>
            )}
            {months.map((m) => (
              <section key={m.ym} aria-label={m.label} className="flex flex-col gap-2">
                <h2 className="m-0 px-1 t-section text-ink">{m.label}</h2>
                <ol className="m-0 flex list-none flex-col gap-2 p-0">
                  {m.days.map((d) => (
                    <li key={d.date} className="grid grid-cols-[48px_minmax(0,1fr)] gap-2">
                      <div className="pt-3 text-right t-body font-bold text-ink t-num">{d.day}</div>
                      <ul className="m-0 flex list-none flex-col gap-2 p-0">
                        {d.items.map((it) => (
                          <li key={it.key}>
                            <Link href={it.href} className="card press flex min-h-12 items-center justify-between gap-3 rounded-2xl px-4 py-3 no-underline">
                              <span className="min-w-0">
                                <span className="block truncate t-body font-bold text-ink">{it.title}</span>
                                <span className="block truncate t-sub text-text-3">{it.sub}</span>
                              </span>
                              {it.score != null ? (
                                <span className="shrink-0 t-section text-ink t-num">{it.score}점</span>
                              ) : (
                                <span aria-hidden="true" className="shrink-0 t-body font-bold text-primary">
                                  ›
                                </span>
                              )}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </li>
                  ))}
                </ol>
              </section>
            ))}
          </>
        )}
      </div>
    </PageShell>
  );
}
