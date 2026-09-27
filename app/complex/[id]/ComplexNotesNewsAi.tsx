/* [1012 · 규칙 8] font-extrabold(800) → font-bold(700) — 굵기 3단(400·500·700). 이 파일의 모든 자리에 적용. */
import Link from "next/link";
import {
  loadHubInspectionNotes,
  loadRelatedNews,
  withSectionBudget,
  type HubInspectionNoteRow,
  type HubNewsRow,
} from "./section-loaders";

/* ============================================================================
   단지 홈 — 이 단지 임장노트 · 관련 기사
   ----------------------------------------------------------------------------
   "이 단지를 직접 보고 온 사람이 뭘 적었나"와 "이 동네에 무슨 일이 있었나". **실제로 있는 것만** 그린다.

   [v4 · 한 화면 한 가지] 페이지 맨 아래 카드 세 장(임장노트 · AI 분석 · 관련 기사, 각자 버튼)을 걷고 **이야기 탭**
   안의 구분선 목록 두 개로 옮겼다(page.tsx storyExtras — 탭이 닫혀 있어도 HTML 에는 있다).
     · "AI 분석" 카드(채움 파랑 "이 단지 AI 분석 받기")는 뺐다 — 같은 입구가 요약 목록 "AI 종합 진단 ›" 행과
       모바일 하단 바 "AI 분석"에 있다(채움 파랑은 화면에 1개).
     · 임장노트 "이 단지 임장노트 쓰기" 버튼은 뺐다 — 머리의 채움 버튼과 같은 행동이다.
     · 0건이면 그 목록을 그리지 않는다(빈 상태 문장을 여러 번 늘어놓지 않는다). 조회 실패만 한 줄로 말한다.
   ========================================================================== */

type NoteRow = HubInspectionNoteRow;
type NewsRow = HubNewsRow;

export async function ComplexNotesNewsAi({
  complexId,
  name,
  region,
}: {
  complexId: string;
  name: string;
  region: string;
}) {
  /* [968 · 1] 공유 예산(3초) — 넘기면 노트는 "못 읽음"(0건으로 그리지 않는다), 기사는 생략.
     두 로더는 내부에서 실패를 이미 삼키므로 여기서 거절되는 건 예산 초과뿐이다. */
  const [{ notes, failed: notesFailed }, news] = await Promise.all([
    withSectionBudget(loadHubInspectionNotes(complexId, name)).catch(
      (): { notes: NoteRow[]; failed: boolean } => ({ notes: [], failed: true }),
    ),
    withSectionBudget(loadRelatedNews(name, region)).catch((): NewsRow[] => []),
  ]);

  if (!notesFailed && notes.length === 0 && news.length === 0) return null;

  return (
    <>
      {(notesFailed || notes.length > 0) && (
        <section aria-labelledby="hub-notes-title">
          <h2 id="hub-notes-title" className="t-section text-ink">
            이 단지 임장노트
            {notes.length > 0 && <span className="ml-1 t-sub font-medium text-text-3">{notes.length}건</span>}
          </h2>
          {notesFailed ? (
            <p className="mt-2 t-sub text-text-3">임장노트를 지금 불러오지 못했어요 — 노트가 없다는 뜻이 아니에요</p>
          ) : (
            <ul data-tone="hanji" className="mt-1 divide-y divide-line">
              {notes.map((n) => (
                <li key={n.id}>
                  <Link
                    href={`/notes/${encodeURIComponent(n.id)}`}
                    className="press flex min-h-14 items-center justify-between gap-3 py-3 no-underline"
                  >
                    <span className="min-w-0">
                      <span className="block truncate t-body font-bold text-ink">{n.title}</span>
                      <span className="mt-0.5 block truncate t-sub text-text-3">
                        {[n.visitDate, n.region].filter(Boolean).join(" · ") || "방문일 미기재"}
                      </span>
                    </span>
                    <span aria-hidden="true" className="shrink-0 t-body text-text-3">
                      ›
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {news.length > 0 && (
        <section aria-labelledby="hub-news-title">
          <h2 id="hub-news-title" className="t-section text-ink">
            관련 기사 <span className="t-sub font-medium text-text-3">{news.length}건</span>
          </h2>
          <ul data-tone="blue" className="mt-1 divide-y divide-line">
            {news.map((n) => (
              <li key={n.id}>
                <Link href={n.href} className="press block py-3 no-underline">
                  <span className="line-clamp-2 block t-body font-bold text-ink">{n.title}</span>
                  <span className="mt-0.5 block t-sub text-text-3">
                    {[n.source, n.when].filter(Boolean).join(" · ") || "출처 미상"}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          {/* [1012 · 규칙 5] "더 보기" → 구체 대상(지역명) */}
          <Link
            href={`/town/news?region=${encodeURIComponent(region)}`}
            className="mt-1 inline-flex min-h-10 items-center t-sub font-bold text-primary"
          >
            {region} 뉴스 보기 ›
          </Link>
        </section>
      )}
    </>
  );
}
