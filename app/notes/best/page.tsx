import type { Metadata } from "next";
import Link from "next/link";
import { PageShell } from "@/app/components/PageShell";
import { SummaryRow } from "@/app/complex/[id]/SummaryRow";
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

  /* [v4 · 한 화면 한 가지] 머리(제목 + 사실 한 줄) → 주인공(달 목록, 구분선 행) → 현장 인증 순위(행) →
     맨 끝 "선정 기준" 접힘 하나. 지운 것: 소개 문단("운영자가 마음에 드는 노트를 고르는 방식이 아니라…") ·
     선정 기준 카드(→ 맨 끝 접힘) · 달 카드(→ 행) · 가운데 정렬 빈/실패 카드(→ 한 줄) */
  const headFact = loadFailed
    ? `계산식 ${MAX_SCORE}점`
    : [months.length > 0 ? `선정 ${months.length}개월` : "", `계산식 ${MAX_SCORE}점 · 사람이 고르지 않음`]
        .filter(Boolean)
        .join(" · ");

  return (
    <PageShell breadcrumb="이달의 공개 임장노트">
      <div className="mx-auto flex w-full max-w-[760px] flex-col gap-8">
        <header className="flex flex-col gap-0.5">
          <h1 className="t-title text-ink">이달의 공개 임장노트</h1>
          <p className="t-sub text-text-3">{headFact}</p>
        </header>

        {loadFailed ? (
          /* 조회 실패와 "없음"을 가른다 — 못 읽은 것을 없다고 단정하지 않는다 */
          <p className="t-body text-text-2">
            <strong className="text-ink">{LOAD_FAILED_LINE}</strong> · 노트가 없다는 뜻 아님
          </p>
        ) : months.length > 0 ? (
          <ul data-tone="hanji" className="divide-y divide-line border-y border-line">
            {months.map((m) => (
              <SummaryRow
                key={m.ym}
                label={`${formatYmKo(m.ym)} 이달의 임장노트`}
                sub={`후보 ${m.qualifiedCount}편`}
                value={`${m.picks.length}편`}
                href={`/notes/best/${m.ym}`}
              />
            ))}
          </ul>
        ) : (
          <p className="t-body text-text-2">
            기준을 채운 달 없음 · {MIN_SCORE}점 이상 {MIN_NOTES_PER_MONTH}편이 모이면 자동 생성 ·{" "}
            {/* [1012] 규칙 5 — 동사 + 대상 */}
            <Link href="/notes/new" className="tap-line font-bold text-primary no-underline">
              이달의 첫 후보 노트 쓰기 ›
            </Link>
          </p>
        )}

        {/* [#124] 이달의 현장 인증 리더보드 — 위치 확인(#71) 통과 노트의 월간 랭킹 */}
        <FieldVerifiedLeaderboard />

        {/* 선정 기준 — 문서 N13 의 "선정 기준 공개". [v4 · 규칙 3] 맨 끝 접힘 하나(HTML 에는 늘 있다) */}
        <div className="flex flex-col gap-2">
          <Link href="/notes" className="tap-line w-fit t-sub font-bold text-primary no-underline">
            공개 임장노트 목록 보기 ›
          </Link>
          <details className="group border-t border-line pt-1">
            <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-2 t-body font-bold text-ink [&::-webkit-details-marker]:hidden">
              선정 기준 {MAX_SCORE}점
              <span aria-hidden="true" className="t-body text-text-3 transition-transform group-open:rotate-90">
                ›
              </span>
            </summary>
            <div className="flex flex-col gap-3 pb-3">
              <dl data-tone="blue" className="divide-y divide-line">
                {SCORE_AXES.map((a) => (
                  <div key={a.key} className="flex items-baseline gap-3 py-2">
                    <dt className="w-24 shrink-0 t-sub font-bold text-text-2">
                      {a.label} <span className="t-num text-ink">{a.max}</span>
                    </dt>
                    <dd className="min-w-0 t-sub text-text-3">{a.how}</dd>
                  </div>
                ))}
              </dl>
              <ul className="flex list-none flex-col gap-0.5 p-0 t-caption text-text-3">
                <li>
                  {MIN_SCORE}점 미만은 후보 아님 · 자격 노트 {MIN_NOTES_PER_MONTH}편 미만인 달은 만들지 않음
                </li>
                <li>
                  한 달 최대 {MAX_NOTES_PER_MONTH}편 · 같은 작성자 최대 {MAX_PER_AUTHOR}편
                </li>
                <li>기록 충실도만 측정 · 단지의 좋고 나쁨·값과 무관 · 노트 속 입지·학군 점수 가산 없음</li>
              </ul>
            </div>
          </details>
        </div>
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
  /* [1012] 규칙 4·9 — 🥇🥈🥉 이모지 → "1위 2위 3위" 글자. [v4 · 규칙 5·6] 한지 배지 · 카드 → 구분선 행(순위는 이름 앞 글자) */
  return (
    <section aria-labelledby="field-verified-h" className="flex flex-col gap-1">
      <h2 id="field-verified-h" className="t-section text-ink">
        이달의 현장 인증 <span className="t-sub font-medium text-text-3">단지 반경 2km 위치 확인 통과</span>
      </h2>
      <ul data-tone="mint" className="divide-y divide-line border-y border-line">
        {rows.map((r, i) => (
          <li key={r.label} className="flex min-h-12 items-center justify-between gap-3 py-2.5">
            <span className="min-w-0 truncate t-body font-bold text-ink">
              <span className="mr-2 t-num text-text-3">{i + 1}위</span>
              {r.label}
            </span>
            <span className="shrink-0 t-body t-num text-ink">{r.count}편</span>
          </li>
        ))}
      </ul>
      <p className="t-caption text-text-3">매월 1일 초기화 · 인증은 작성 시 선택 · 위치 좌표 비저장</p>
    </section>
  );
}
