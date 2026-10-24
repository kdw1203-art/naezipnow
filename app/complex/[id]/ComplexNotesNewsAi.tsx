/* [1012 · 규칙 8] font-bold(800) → font-bold(700) — 굵기 3단(400·500·700). 이 파일의 모든 자리에 적용. */
import Link from "@/app/components/IntentLink";
import { seedGradient } from "@/lib/town/shared";
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

   [1015 · 규칙 H·I] 노트 행에 40px 정사각 썸네일(noteCoverUrl — 홈·피드와 같은 함수, 없으면 단색 칸)을 왼쪽에,
   목록 껍데기는 리퀴드 판(lq-panel · 노트 = hanji · 기사 = blue). 이 자리의 커버 칸은 **정사각**(40px)이다.
   AI 분석 버튼은 채움 파랑에서 outline 으로(화면당 채움 파랑 1개 — 히어로 아래 "임장노트 쓰기").
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
    <section className="cv-auto mt-6 grid gap-4 max-md:mt-3 max-md:gap-3 lg:grid-cols-2">
      {/* ── 이 단지 임장노트 ─────────────────────────────────────────────── */}
      <div className="card rounded-2xl p-5 max-md:p-3.5">
        <div className="flex items-baseline justify-between">
          <h2 className="t-section text-ink">이 단지 임장노트</h2>
          {notes.length > 0 && (
            <span className="t-sub text-text-3">{notes.length}건</span>
          )}
        </div>

        {notesFailed ? (
          <p className="mt-3 t-sub text-text-3">
노트 불러오기 실패 · 잠시 후 다시
          </p>
        ) : notes.length === 0 ? (
          /* [1012 · 규칙 6] 권유("남겨 주세요") → 어디서(단지명) 사실만 — 쓰기 입구는 위 행동 줄이 맡는다 */
          <p className="mt-3 t-sub text-text-3">
{name}에 공개된 임장노트 없음
          </p>
        ) : (
          <ul className="lq-panel mt-3 flex list-none flex-col divide-y p-0" data-tone="hanji">
            {notes.map((n) => (
              <li key={n.id}>
                <Link
                  href={`/notes/${encodeURIComponent(n.id)}`}
                  className="press flex min-h-12 items-center gap-3 py-2 no-underline"
                >
                  {/* 40px 정사각 썸네일 — 고른 템플릿 → 첫 사진 → 단색 칸 */}
                  <span
                    className="h-10 w-10 shrink-0 overflow-hidden rounded-lg bg-divider"
                    style={n.cover ? undefined : { background: seedGradient(n.region || n.id) }}
                    aria-hidden="true"
                  >
                    {n.cover && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={n.cover} alt="" width={40} height={40} loading="lazy" className="h-10 w-10 object-cover" />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    {/* [1084] 3단 중 한 칸(250px)에 한 줄 말줄임이라 "[내집나우 Lab] AI …"만 보였다(운영 실측) — 두 줄까지 */}
                    <span className="line-clamp-2 break-words t-body font-bold text-ink">{n.title}</span>
                    <span className="mt-0.5 block truncate t-sub text-text-3">
                      {[n.visitDate, n.region].filter(Boolean).join(" · ") || "방문일 미기재"}
                    </span>
                  </span>
                  <span aria-hidden="true" className="t-body text-text-3">
                    ›
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}

        <Link
          href={noteHref}
          className="btn-secondary mt-3 block rounded-xl p-2.5 text-center t-sub font-bold"
        >
          이 단지 임장노트 쓰기
        </Link>

        {/* ── AI 분석 ── [1084 · D-047] 단추 하나뿐인 칸이 3단 높이를 관련 기사에 맞춰 늘려 아래 200px 이 비었다 →
            임장노트 칸 아래로 합쳐 2단. [1011] 재료 목록은 걷은 그대로 — 결과 화면에 출처 표기(check:ai-compliance) */}
        <div className="mt-4 border-t border-divider pt-3">
          <h2 className="t-section text-ink">AI 분석</h2>
          <Link
            href={analysisHref}
            className="btn-outline mt-2 block rounded-xl p-2.5 text-center t-sub font-bold"
          >
            이 단지 AI 분석 받기
          </Link>
        </div>
      </div>

      {/* ── 관련 기사 ────────────────────────────────────────────────────── */}
      <div className="card rounded-2xl p-5 max-md:p-3.5">
        <h2 className="t-section text-ink">관련 기사</h2>
        {news.length === 0 ? (
          <p className="mt-3 t-sub text-text-3">
            이 단지·지역 관련 기사 없음
          </p>
        ) : (
          <ul className="lq-panel mt-3 flex list-none flex-col divide-y p-0" data-tone="blue">
            {news.map((n) => (
              <li key={n.id}>
                <Link href={n.href} className="press flex min-h-12 items-center gap-3 py-2 no-underline">
                  <span className="min-w-0 flex-1">
                    <span className="line-clamp-2 t-body font-bold text-ink">{n.title}</span>
                    <span className="mt-0.5 block t-sub text-text-3">
                      {[n.source, n.when].filter(Boolean).join(" · ") || "출처 미상"}
                    </span>
                  </span>
                  <span aria-hidden="true" className="t-body text-text-3">
                    ›
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        <Link
          href={`/town/news?region=${encodeURIComponent(region)}`}
          className="btn-secondary mt-3 block rounded-xl p-2.5 text-center t-sub font-bold"
        >
          {/* [1012 · 규칙 5] "더 보기" → 구체 대상(지역명) */}
          {region} 뉴스 보기
        </Link>
      </div>
    </section>
  );
}
