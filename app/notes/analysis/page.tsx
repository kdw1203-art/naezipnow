/* [1110 · AI 분석 2차 통폐합] 임장노트 분석 — AI 분석 허브의 "내 임장노트" 묶음(임장노트 분석 · 후보 단지 비교 · 노트 AI 실행 카드)과
   에이전트가 임장노트 카테고리로 왔다. 소유자 2026-11-07 "이 부분은 임장노트 카테고리에서 끝낼 수 있도록 해주고, AI 분석에서는 제외시켜줘" ·
   "(에이전트) 이 부분도 위 하위 카테고리 통폐합으로 합쳐서 제공해줘".
   구성(허브에 있던 조각 그대로 — 파일은 app/analysis 의 것을 그대로 import): 시작 카드(게스트 = 공개 노트 AI 정리 미리보기 · 로그인 = 내 노트 N건) →
   노트 AI 실행 카드(내 노트 고르고 분석 실행 · 채움 파랑은 이것 하나) → 표(후보 단지 비교 · 에이전트).
   [1007] 과 같은 이유로 ISR 1일 — 서버 렌더에 사용자별 값이 없다(로그인 · 내 노트 수 · 비교 후보 수는 클라이언트가 판정). */
import { PageShell } from "@/app/components/PageShell";
import { PageHead } from "@/app/components/PageHead";
import Link from "@/app/components/IntentLink";
import { AdZone } from "@/app/components/ads/AdZone";
import type { InspectionNote } from "@/lib/inspection/store-db";
import { listPublicNotesWithFallback } from "@/lib/inspection/public-notes-cached";
import { listPublicNotes } from "@/lib/inspection/store-db";
import { buildPageMetadata } from "@/lib/seo/page-metadata";
import { HubBreadcrumbLd } from "@/app/components/seo/HubBreadcrumbLd";
import { HubRecordStart } from "@/app/analysis/hub-record-start";
import { HubNoteAnalysis } from "@/app/analysis/hub-picker";
import { ToolRows } from "@/app/analysis/hub-tool-rows";
import { CompareTrayCount } from "@/app/analysis/tool-cards-client";
import { RECORD_LIVE } from "@/app/analysis/tool-catalog";

export const revalidate = 86_400;

export const metadata = buildPageMetadata({
  title: "임장노트 분석 — 내 노트 점수화 · 후보 단지 비교 · 에이전트",
  description: "내 임장노트를 AI 또는 규칙으로 점수화해 강점 · 약점 · 확인할 것을 정리하고, 담아 둔 후보 단지를 같은 기준의 표로 비교합니다. 에이전트는 내 노트와 실거래를 함께 조회합니다.",
  path: "/notes/analysis",
});

/** 공개 노트에서 AI(또는 규칙) 요약 문구가 있는 첫 건 — 게스트 미리보기용(예전 /analysis 의 것 그대로) */
function pickPublicAiPreview(notes: InspectionNote[]): { id: string; title: string; teaser: string; badge: string } | null {
  for (const n of notes) {
    const ai = n.aiAnalysis;
    if (!ai) continue;
    const teaser = [ai.narrativeSummary, ai.summary, ai.detailedConclusion].find(
      (x): x is string => typeof x === "string" && x.trim().length > 0,
    );
    if (!teaser) continue;
    const engine = typeof ai.engine === "string" ? ai.engine : "";
    const badge = engine.startsWith("rule-based") ? "규칙 기반 분석" : "AI 생성";
    const title = n.aptName && !n.title.includes(n.aptName) ? `${n.aptName} — ${n.title}` : n.title;
    return { id: n.id, title, teaser: teaser.trim().slice(0, 160), badge };
  }
  return null;
}

export default async function NotesAnalysisPage() {
  /* 게스트 미리보기 — 공개 노트의 실제 AI 요약. 모두에게 같은 값이라 ISR 에 실린다. 실패는 null(빈 안내 카드) — 샘플로 채우지 않는다. */
  const publicRows = await listPublicNotesWithFallback(24, (n) => listPublicNotes(n, { withAi: true }))
    .then((r) => r.notes)
    .catch(() => [] as InspectionNote[]);
  const publicPreview = pickPublicAiPreview(publicRows);

  return (
    <PageShell breadcrumb="임장노트 › 노트 분석">
      <HubBreadcrumbLd trail={[{ name: "공개 임장노트", path: "/notes" }, { name: "임장노트 분석", path: "/notes/analysis" }]} />
      <div className="flex flex-col gap-4 max-md:gap-3">
        <PageHead
          icon="notebook-pen"
          title="임장노트 분석"
          sub="내 노트 점수화 · 강점 · 약점 · 확인할 것 · 후보 단지 비교 · 에이전트"
          subOnPhone
        />

        <HubRecordStart
          guest={
            publicPreview ? (
              <div className="card hub-start flex flex-col gap-2.5 rounded-lg p-4">
                <span className="t-section text-ink">공개 노트 AI 정리 미리보기</span>
                <div className="ai-panel flex flex-col gap-1.5 rounded-lg p-3.5">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="t-caption inline-flex items-center rounded border border-line px-1.5 py-px font-semibold text-ai-muted">
                      {publicPreview.badge}
                    </span>
                    <span className="t-sub font-bold text-ai-text">{publicPreview.title}</span>
                  </div>
                  <p className="t-sub text-ai-text">
                    {publicPreview.teaser}
                    {publicPreview.teaser.length >= 160 ? "…" : ""}
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  <Link href={`/notes/${publicPreview.id}`} className="btn-outline btn-md no-underline">
                    전체 AI 요약 보기
                  </Link>
                  <Link href="/notes/new" className="btn-soft btn-md no-underline">
                    내 노트 쓰기
                  </Link>
                </div>
              </div>
            ) : (
              <div className="card hub-start flex flex-wrap items-center justify-between gap-x-4 gap-y-2.5 rounded-2xl p-4">
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="t-section text-ink">공개된 AI 정리 없음</span>
                  <span className="flex flex-wrap items-center gap-x-3 t-sub text-text-3">
                    <Link href="/notes" className="tap-line font-semibold text-text-2 no-underline hover:underline">
                      공개 노트 보기 ›
                    </Link>
                    <Link href="/login" className="tap-line font-semibold text-text-2 no-underline hover:underline">
                      로그인 ›
                    </Link>
                  </span>
                </span>
                <Link href="/notes/new" className="btn-outline btn-md shrink-0 no-underline">
                  임장노트 쓰고 AI 받기
                </Link>
              </div>
            )
          }
        />

        {/* 노트 AI 실행 카드 — 로그인 여부 · ?noteId= 는 카드가 스스로 읽는다. 채움 파랑("분석 실행")은 이 화면에 이것 하나 */}
        <HubNoteAnalysis />

        {/* 후보 단지 비교 · 에이전트 — 단지 분석 표와 같은 꼴(tool-cols). 비교 후보 수는 클라이언트가 붙인다 */}
        <ToolRows tools={RECORD_LIVE} nowLabel="내 기록" extras={{ "/analysis/compare": <CompareTrayCount bare /> }} />
      </div>
      {/* [961] 광고 공간 — 화면 맨 아래 */}
      <AdZone placement="page_bottom" seed={2} plan={null} className="mt-8 max-md:mt-4" />
    </PageShell>
  );
}
