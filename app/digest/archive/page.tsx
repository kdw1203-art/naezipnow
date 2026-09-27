import type { Metadata } from "next";
import Link from "next/link";
import { cache } from "react";
import { PageShell } from "@/app/components/PageShell";
import { SummaryRow } from "@/app/complex/[id]/SummaryRow";
import {
  listDigestWeeks,
  ARCHIVE_WEEKS,
  MIN_ITEMS,
  type DigestWeekSummary,
} from "@/lib/digest/archive";
import { buildPageMetadata } from "@/lib/seo/page-metadata";
import {
  LOAD_FAILED_LINE,
  loadWithinPrerenderBudget,
} from "@/lib/data/prerender-budget";

/* ============================================================
   N23 — 주간 다이제스트 웹 아카이브(목록).

   /digest 는 "지금부터 최근 7일" 이라 매일 내용이 바뀐다. 여기 실린 주소는
   주가 고정돼 있어 언제 열어도 같은 주를 말한다 — 그래서 인용할 수 있고
   색인 자산이 된다.

   조회 실패와 "아직 실을 주가 없다" 를 화면에서 구분한다.

   ── 조회에 상한을 두는 이유 (배포 #263) ────────────────────────
   이 라우트는 revalidate 만 있고 동적 파라미터가 없어 `next build` 가 빌드
   타임에 프리렌더한다. Next 는 페이지 하나당 정적 생성 60초 상한을 두고,
   넘기면 **빌드를 실패시킨다** — 배포 #263 이 그렇게 죽었다. DB 가 밀린 몇 분
   동안 이 페이지를 포함한 다섯 페이지가 각자 60초를 다 태워 릴리스가 통째로
   나가지 못했다. 느린 DB 는 페이지 내용을 떨어뜨릴 수는 있어도 배포를
   막아서는 안 된다. 그래서 20초에 접고, 못 읽었으면 못 읽었다고 적는다.
   ============================================================ */

/* [1010] 크롤러 재방문(≈2.2일)보다 짧은 TTL 은 크롤 1회 = 재렌더 1회다. 이 화면을 바꾸는
   적재(SOURCE_MAP)가 이제 경로를 직접 비우므로 시간 TTL 은 안전망으로만 둔다. */
export const revalidate = 86_400;

/** loadFailed: 조회가 실패했거나 상한 안에 끝나지 않았다. "실을 주가 없다"와 다른 사건이다. */
type IndexData = { weeks: DigestWeekSummary[]; loadFailed: boolean };

const load = cache(async (): Promise<IndexData> => {
  const run = await loadWithinPrerenderBudget("[/digest/archive] 주간 아카이브", () =>
    listDigestWeeks(),
  );
  /* 실패를 빈 목록으로 흘려보내면 "아직 아카이브에 실을 주가 없습니다" 가 뜬다 —
     지난 주들이 멀쩡히 쌓여 있어도 없다고 단정하는 셈이라 반드시 갈라 놓는다. */
  return run.ok ? { weeks: run.data, loadFailed: false } : { weeks: [], loadFailed: true };
});

export async function generateMetadata(): Promise<Metadata> {
  const { loadFailed } = await load();
  const base = buildPageMetadata({
    title: "주간 다이제스트 아카이브",
    description:
      "주 단위로 고정된 부동산 주간 요약 기록입니다. 그 주에 실제로 수집된 뉴스와 이웃 글, 시장 온도만 싣습니다.",
    path: "/digest/archive",
  });
  return loadFailed ? { ...base, robots: { index: false, follow: true } } : base;
}

export default async function DigestArchivePage() {
  const { weeks, loadFailed } = await load();

  return (
    /* [v4] "한 화면 한 가지" — 가운데 한 줄(760px): 제목 한 줄 + 사실 한 줄 → 주 목록(1px 선 행: 몇째 주 + 기간 / 뉴스·이웃 글 수)
       → 이번 주 링크 · 규칙 캡션 한 줄. 설명 문단 두 개(주소가 고정인 이유 · 넣지 않는 주)를 캡션 한 줄로 줄이고,
       주 카드 · 빈 상자 카드를 뺐다. */
    <PageShell>
      <div className="mx-auto flex w-full max-w-[760px] flex-col gap-6">
        <header>
          <h1 className="t-title text-ink">주간 다이제스트 아카이브</h1>
          {!loadFailed && weeks.length > 0 && (
            <p className="mt-0.5 t-sub text-text-3">
              {weeks.length}주 · 최근 {ARCHIVE_WEEKS}주 보관
            </p>
          )}
        </header>

        {loadFailed ? (
          <p className="py-6 t-body text-text-2">
            <strong className="text-ink">{LOAD_FAILED_LINE}</strong> — 기록이 없다는 뜻이 아니라 조회가 제때 끝나지 않았거나 실패
          </p>
        ) : weeks.length > 0 ? (
          <ul className="divide-y divide-line">
            {weeks.map((w) => (
              <SummaryRow
                key={w.slug}
                label={w.ordinalLabel}
                sub={w.rangeLabel}
                value={
                  <span className="t-sub text-text-3">
                    뉴스 {w.newsCount} · 이웃 글 {w.communityCount}
                  </span>
                }
                href={`/digest/${w.slug}`}
              />
            ))}
          </ul>
        ) : (
          <p className="py-6 t-body text-text-3">
            아카이브에 실을 주 아직 없음 — 한 주에 {MIN_ITEMS}건 이상 쌓이면 그 주가 끝난 뒤 자동 생성
          </p>
        )}

        <div className="flex flex-col gap-1">
          <Link href="/digest" className="tap-line self-start t-sub font-bold text-primary no-underline">
            이번 주 다이제스트 보기 ›
          </Link>
          <p className="t-caption text-text-3">
            주 = 한국시간 월~일 · 주소 = 그 주 월요일 날짜(고정 — 인용 가능) · 진행 중인 주와 {MIN_ITEMS}건 미만인 주는 만들지 않음
          </p>
        </div>
      </div>
    </PageShell>
  );
}
