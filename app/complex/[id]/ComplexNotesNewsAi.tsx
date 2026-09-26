import Link from "next/link";
import {
  loadHubInspectionNotes,
  loadRelatedNews,
  withSectionBudget,
  type HubInspectionNoteRow,
  type HubNewsRow,
} from "./section-loaders";

/* ============================================================================
   단지 홈 하단 — 이 단지 임장노트 · 관련 기사 · AI 분석 진입
   ----------------------------------------------------------------------------
   단지 홈에는 시세·면적대·지역대비·정비사업·입주물량이 있었지만, 정작 "이 단지를
   직접 보고 온 사람이 뭘 적었나"와 "이 동네에 무슨 일이 있었나"는 없었다. 지도
   팝업에서 넘어온 사람이 더 알고 싶은 건 대체로 그 둘이다.

   세 블록 모두 **실제로 있는 것만** 그린다.
     · 임장노트  inspection_notes 공개 노트. 없으면 "아직 없다"고 적고 쓰기로 안내.
     · 관련 기사 뉴스 피드에서 단지명 또는 지역명이 걸리는 글. 없으면 섹션 생략.
     · AI 분석   여기서 분석을 지어내지 않는다. 무엇을 재료로 쓰는지 밝히고
                 분석 화면으로 넘긴다 — 요약을 미리 적어 두면 그건 데이터가
                 아니라 문구가 된다.

   조회가 실패하면 섹션을 생략한다. "노트 0건"과 "조회 실패"는 다른 말이라,
   실패를 0건처럼 그리지 않는다.
   ========================================================================== */

/* [968 · 1] loadNotes·loadNews 는 section-loaders.ts(loadHubInspectionNotes·loadRelatedNews)로
   옮겼다 — 본문이 대표행을 받는 순간 미리 띄우고 여기서는 같은 인자로 받기만 한다
   (예전엔 이 컴포넌트가 본문 파도 뒤에 조회를 시작해 세 번째 파도였다). */
type NoteRow = HubInspectionNoteRow;
type NewsRow = HubNewsRow;

/* [1011] priceTrend · tradeCount · tradeMonths · tradeRange 네 prop 을 뺐다 —
   "AI 가 읽는 재료" 목록을 걷으면서 쓰는 곳이 사라졌다. 같은 수치는 이 화면 위쪽
   KPI 칸(거래 건수·계약월 범위)과 실거래가 추이 그래프가 이미 보여 준다. */
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

  const noteHref = `/notes/new?${new URLSearchParams({
    apt: name,
    region,
    complexId,
  }).toString()}`;
  const analysisHref = `/analysis?complexId=${encodeURIComponent(complexId)}`;

  return (
    /* [968 · 7] cv-auto — 뷰포트 밖이면 레이아웃·페인트를 미룬다(page.tsx 주석 참고) */
    <section className="cv-auto mt-6 grid gap-4 lg:grid-cols-3">
      {/* ── 이 단지 임장노트 ─────────────────────────────────────────────── */}
      <div className="card rounded-2xl p-5">
        <div className="flex items-baseline justify-between">
          <h2 className="t-section text-ink">이 단지 임장노트</h2>
          {notes.length > 0 && (
            <span className="t-sub text-text-3">{notes.length}건</span>
          )}
        </div>

        {notesFailed ? (
          <p className="mt-3 t-sub text-text-3">
            노트를 지금 불러오지 못했어요. 노트가 없는 게 아니라 조회가 실패했습니다 —
            잠시 후 새로고침해 주세요.
          </p>
        ) : notes.length === 0 ? (
          <p className="mt-3 t-sub text-text-3">
            아직 이 단지의 공개 임장노트가 없어요. 직접 다녀오셨다면 첫 기록을 남겨
            주세요 — 다음 사람이 그 기록을 보고 옵니다.
          </p>
        ) : (
          <ul className="mt-3 flex flex-col gap-2">
            {notes.map((n) => (
              <li key={n.id}>
                <Link
                  href={`/notes/${encodeURIComponent(n.id)}`}
                  className="block rounded-xl border border-line bg-surface px-3.5 py-2.5 transition-colors hover:border-primary"
                >
                  <span className="block truncate t-body font-bold text-ink">
                    {n.title}
                  </span>
                  <span className="mt-0.5 block t-sub text-text-3">
                    {[n.visitDate, n.region].filter(Boolean).join(" · ") || "방문일 미기재"}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}

        <Link
          href={noteHref}
          className="btn-secondary mt-3 block rounded-xl p-2.5 text-center t-sub font-extrabold"
        >
          이 단지 임장노트 쓰기
        </Link>
      </div>

      {/* ── AI 분석 ──────────────────────────────────────────────────────── */}
      <div className="card rounded-2xl p-5">
        <h2 className="t-section text-ink">AI 분석</h2>
        {/* [1011] "AI 가 읽는 재료는 아래와 같습니다" 문단과 그 아래 소스 목록(실거래 N건 ·
            추이 · 이웃 노트 N건 · 지역 뉴스 N건)을 걷었다(소유자 지시 — 같은 종류를 AI 도구
            화면에서도 걷었다). 무엇을 재료로 삼는지는 만드는 쪽의 사정이고, 쓰는 사람에게는
            "이 단지를 분석해 준다"는 사실과 버튼 하나면 충분하다. 결과 화면에는 출처 표기가
            그대로 붙는다(check:ai-compliance 가 강제한다). */}
        <Link
          href={analysisHref}
          className="btn-primary btn-cta mt-3 block rounded-xl p-2.5 text-center t-sub font-extrabold text-white"
        >
          이 단지 AI 분석 받기
        </Link>
      </div>

      {/* ── 관련 기사 ────────────────────────────────────────────────────── */}
      <div className="card rounded-2xl p-5">
        <h2 className="t-section text-ink">관련 기사</h2>
        {news.length === 0 ? (
          <p className="mt-3 t-sub text-text-3">
            이 단지·지역을 다룬 기사가 아직 모이지 않았어요.
          </p>
        ) : (
          <ul className="mt-3 flex flex-col gap-2">
            {news.map((n) => (
              <li key={n.id}>
                <Link
                  href={n.href}
                  className="block rounded-xl border border-line bg-surface px-3.5 py-2.5 transition-colors hover:border-primary"
                >
                  <span className="line-clamp-2 block t-body font-bold text-ink">
                    {n.title}
                  </span>
                  <span className="mt-0.5 block t-sub text-text-3">
                    {[n.source, n.when].filter(Boolean).join(" · ") || "출처 미상"}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        <Link
          href={`/town/news?region=${encodeURIComponent(region)}`}
          className="btn-secondary mt-3 block rounded-xl p-2.5 text-center t-sub font-extrabold"
        >
          이 지역 뉴스 더 보기
        </Link>
      </div>
    </section>
  );
}
