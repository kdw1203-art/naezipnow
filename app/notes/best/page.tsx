/* [1026c · 폰 배율 1] 문장 속 링크 24px 하한(py-[5px]) — 전 경로 폰 조작 검사에서 지적된 자리. */
/* [1022 · 정렬·글씨·테마] 지시 4 — 머리 한 모양(PageHead) · 램프 글자 · 흰 카드 테마 · 사실 문장. 자세한 사유는 본문의 [1022 · 정렬·글씨·테마] 주석. */
import type { Metadata } from "next";
import Link from "next/link";
import { PageShell } from "@/app/components/PageShell";
import { PageHead } from "@/app/components/PageHead";
import { Explain } from "@/app/components/explain/Explain";
import {
  listBestNoteMonths,
  formatYmKo,
  SCORE_AXES,
  MAX_SCORE,
  MIN_SCORE,
  MIN_NOTES_PER_MONTH,
  MAX_NOTES_PER_MONTH,
  MAX_PER_AUTHOR,
  type BestNotesMonth,
} from "@/lib/inspection/best-notes";
import { buildPageMetadata } from "@/lib/seo/page-metadata";
import {
  LOAD_FAILED_LINE,
  loadWithinPrerenderBudget,
} from "@/lib/data/prerender-budget";
import { cache } from "react";

/* ============================================================
   N13 — 이달의 공개 임장노트 (목록 + 선정 기준 공개).

   사람이 고르지 않는다. 다섯 축을 상한을 둔 점수로 재서 합산하고,
   그 계산식을 이 페이지에 그대로 적는다. 점수가 재는 것은 "기록이 얼마나
   자세한가" 이지 "그 단지가 좋은가" 가 아니다 — 노트 안의 항목 점수가
   높다고 가산점을 주면 후하게 쓸 유인이 생기므로 그건 보지 않는다.

   조회 실패와 "아직 뽑힌 달이 없다" 를 화면에서 구분한다.

   ── 조회에 상한을 두는 이유 (배포 #263) ────────────────────────
   이 라우트는 revalidate 만 있고 동적 파라미터가 없어 `next build` 가 빌드
   타임에 프리렌더한다. 그런데 Next 는 페이지 하나당 정적 생성 60초 상한을 두고,
   넘기면 **빌드를 실패시킨다**. 배포 #263 이 실제로 그렇게 죽었다 — DB 가 밀린
   몇 분 동안 이 페이지가 60초를 다 태워 릴리스가 통째로 나가지 못했다.
   느린 DB 는 페이지 내용을 떨어뜨릴 수는 있어도 배포를 막아서는 안 된다.
   그래서 조회를 20초에 접고, 못 읽었으면 못 읽었다고 적은 채로 페이지를 낸다.
   ============================================================ */

/* [1010] 1800초 → 1일. 선정 결과는 공개 노트 전량 집계라 공개 노트가 바뀔 때만 바뀐다 —
   그 지점(생성·공개 전환·수정·삭제)이 invalidatePublicNoteRoutes() 로 이 경로를 비운다.
   30분 눈금은 크롤 1회당 오리진 1회였고, 이 페이지는 공개 노트 전량(≤500행) 집계라 렌더가 비싸다. */
export const revalidate = 86_400;

/** loadFailed: 조회가 실패했거나 상한 안에 끝나지 않았다. "노트가 없다"와 다른 사건이다. */
type IndexData = { months: BestNotesMonth[]; loadFailed: boolean };

const load = cache(async (): Promise<IndexData> => {
  const run = await loadWithinPrerenderBudget("[/notes/best] 공개 임장노트", () =>
    listBestNoteMonths(),
  );
  /* 실패를 `months: []` 로만 흘려보내면 아래 빈 상태 문구("아직 기준을 채운 달이
     없습니다")가 뜬다 — 못 읽은 것을 없다고 단정하는 셈이라 반드시 갈라 놓는다. */
  return run.ok
    ? { months: run.data, loadFailed: false }
    : { months: [], loadFailed: true };
});

export async function generateMetadata(): Promise<Metadata> {
  const { loadFailed } = await load();
  const base = buildPageMetadata({
    title: "이달의 공개 임장노트",
    description:
      "직접 다녀와 기록한 공개 임장노트 중 기록이 충실한 노트를 매달 정리합니다. 사람이 고르지 않고 공개된 계산식으로 뽑습니다.",
    path: "/notes/best",
  });
  return loadFailed ? { ...base, robots: { index: false, follow: true } } : base;
}

export default async function BestNotesIndexPage() {
  const { months, loadFailed } = await load();

  return (
    <PageShell breadcrumb="이달의 공개 임장노트">
      <div className="mx-auto max-w-[760px]">
        {/* [1015 · 규칙 B·D] 설명 문단 세 문장 → 사실 한 줄. [1022 · 정렬·글씨·테마] 공용 PageHead(아이콘 칩 40 · h1 · 사실 한 줄) */}
        <PageHead
          icon="trophy"
          title="이달의 공개 임장노트"
          sub={`공개 임장노트 중 기록 충실도 상위 · 매달 아래 계산식(${MAX_SCORE}점 만점)`}
          subOnPhone
        />

        {/* 선정 기준 — 문서 N13 의 "선정 기준 공개".
            [1015 · 규칙 B] 다섯 축(계산식)은 이 페이지의 본체라 그대로. 그 아래 규칙 세 문장은 ⓘ 로 접었다. */}
        <section className="rise-in-2 card mt-6 p-[var(--pad-card)] max-md:mt-4 max-md:p-3.5">
          <h2 className="flex items-center gap-1 t-section text-ink">
            선정 기준 (총 {MAX_SCORE}점)
            <Explain
              title="선정 규칙"
              body={[
                `${MIN_SCORE}점 미만은 후보로 세지 않습니다. 자격 노트가 ${MIN_NOTES_PER_MONTH}편 미만인 달은 만들지 않습니다.`,
                `한 달 최대 ${MAX_NOTES_PER_MONTH}편, 같은 작성자 최대 ${MAX_PER_AUTHOR}편.`,
                "점수는 기록의 충실도만 잽니다. 단지의 좋고 나쁨, 값의 적정성과 무관하며, 노트에 적힌 입지·학군 점수가 높아도 가산점은 없습니다.",
              ]}
              source="아래 계산식 · 사람이 고르지 않음"
              size={12}
            />
          </h2>
          <div className="mt-3 flex flex-col gap-3">
            {SCORE_AXES.map((a) => (
              <div key={a.key} className="border-b border-border pb-3 last:border-b-0 last:pb-0">
                <p className="t-body font-bold text-ink">
                  {a.label} <span className="text-primary">{a.max}점</span>
                </p>
                <p className="mt-0.5 t-sub text-text-3">{a.how}</p>
              </div>
            ))}
          </div>
        </section>

        {loadFailed ? (
          <div className="mt-6 card rounded-2xl px-5 py-8 text-center t-body text-text-3">
            <strong className="text-ink">{LOAD_FAILED_LINE}</strong>
          </div>
        ) : months.length > 0 ? (
          <div className="mt-6 flex flex-col gap-3 max-md:mt-4 max-md:gap-2">
            {months.map((m) => (
              <Link
                key={m.ym}
                href={`/notes/best/${m.ym}`}
                className="card tile flex items-center justify-between rounded-2xl px-5 py-4 no-underline max-md:px-3.5 max-md:py-3"
              >
                <span className="t-section text-ink">
                  {formatYmKo(m.ym)} 이달의 임장노트
                </span>
                <span className="t-sub font-semibold text-text-3">
                  {m.picks.length}편 수록 · 후보 {m.qualifiedCount}편 ›
                </span>
              </Link>
            ))}
          </div>
        ) : (
          <div className="mt-6 card rounded-2xl px-5 py-8 text-center t-body text-text-3">
            아직 기준을 채운 달이 없습니다. 한 달에 {MIN_SCORE}점 이상 노트가{" "}
            {MIN_NOTES_PER_MONTH}편 모이면 만들어집니다.
            <br />
            <Link href="/notes/new" className="mt-2 inline-flex min-h-[24px] items-center font-bold text-primary underline">
              임장노트 쓰기
            </Link>
          </div>
        )}

        {/* [#124] 이달의 현장 인증 리더보드 — 위치 확인(#71) 통과 노트의 월간 랭킹 */}
        <FieldVerifiedLeaderboard />

        <p className="mb-8 mt-5 t-sub text-text-3">
          <Link href="/notes" className="inline-block py-[5px] font-bold text-primary underline">
            공개 임장노트 전체 보기
          </Link>
        </p>
      </div>
    </PageShell>
  );
}

/* [#124] 월간 현장 인증 랭킹 — metadata.visitVerified 가 있는 공개 노트를
   작성자 표시명 기준으로 집계. 0명이면 섹션을 그리지 않는다(빈 리더보드 금지). */
async function FieldVerifiedLeaderboard() {
  const { getServiceSupabase } = await import("@/lib/supabase/service");
  const { maskNoteAuthor } = await import("@/app/town/shared");
  const sb = getServiceSupabase();
  if (!sb) return null;
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  let rows: Array<{ label: string; count: number }> = [];
  try {
    const { data, error } = await sb
      .from("inspection_notes")
      .select("author_label, author_email")
      .eq("is_public", true)
      .not("metadata->visitVerified", "is", null)
      .gte("created_at", monthStart.toISOString())
      .limit(500);
    if (error || !data) return null;
    const freq = new Map<string, number>();
    for (const r of data as Array<{ author_label: string | null; author_email: string | null }>) {
      const label = maskNoteAuthor(r.author_label, r.author_email ?? "");
      freq.set(label, (freq.get(label) ?? 0) + 1);
    }
    rows = [...freq.entries()]
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  } catch {
    return null;
  }
  if (rows.length === 0) return null;
  /* [1015 · 규칙 C·B] 제목 옆 부연("단지 반경 2km 위치 확인을 통과한 기록")과 아래 각주는 ⓘ 하나로.
     [1015 · 규칙 I] 순위 행 묶음 = 리퀴드 판(점수·통계 = blue), 오른쪽 값은 .t-num */
  return (
    <section className="mt-8 max-md:mt-5">
      <h2 className="flex items-center gap-1 t-section text-ink">
        이달의 현장 인증
        <Explain
          title="현장 인증 순위"
          body="이번 달 공개 노트 중 단지 반경 2km 위치 확인을 통과한 노트를 작성자별로 센 수. 매월 1일 리셋."
          how="인증은 노트를 쓸 때 선택이며 위치 좌표는 저장되지 않습니다(50m 단위 거리만)."
          size={12}
        />
      </h2>
      <div className="card mt-2 rounded-2xl px-4 py-1">
        <div className="flex flex-col divide-y" data-tone="blue">
          {rows.map((r, i) => (
            <div key={r.label} className="flex items-center justify-between py-2.5 t-body">
              <span className="font-bold text-ink">
                <span className="mr-2">{i + 1}위</span>
                {r.label}
              </span>
              <span className="t-num">{r.count}편</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
