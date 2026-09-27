import { PageShell } from "../components/PageShell";
import { Skeleton } from "@/components/Skeleton";
import { TownCategoryNav } from "@/app/town/TownCategoryNav";
import { TownHero } from "@/app/town/TownHero";
import { townBreadcrumb } from "@/lib/town/category-links";

/* 청약 센터 로딩 스켈레톤 — 4개 카테고리 페이지 중 유일하게 없었다(2026-08-22).
   초기 렌더가 청약홈 업스트림 조회를 기다리는, 형제 중 가장 느린 페이지인데
   그동안 빈 화면이 나갔다. 실제 레이아웃(탭·검색·지역 칩·표)을 그대로 흉내낸다. */
export default function ApplyLoading() {
  return (
    /* [974] 로딩 스켈레톤의 머리는 **본문과 같은 것**을 쓴다.
   예전엔 여기만 옛 패턴(PageShell title = 제목이 카테고리 줄 위)이었고 브레드크럼
   문구도 달라서, 로딩 중과 로딩 후가 서로 다른 화면처럼 보였다. 소유자가 캡처한
   /qna 화면이 정확히 이 로딩 상태다("홈 › 동네이야기 › 단지 Q&A" + 카테고리 줄 위 제목).
   제목·한 줄·브레드크럼 모두 lib/town/category-links.ts 한 곳에서 온다. */
    <PageShell breadcrumb={townBreadcrumb("/apply")} wide>
      <TownHero href="/apply" />
      <TownCategoryNav stick />

      {/* 탭 + 검색 행 */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Skeleton className="h-9 w-20 rounded-full" />
        <Skeleton className="h-9 w-24 rounded-full" />
        <Skeleton className="h-9 min-w-[160px] flex-1 rounded-xl" />
        <Skeleton className="h-9 w-16 rounded-xl" />
      </div>

      {/* 지역 필터 칩 */}
      <div className="mb-3 flex gap-1.5 overflow-hidden">
        {Array.from({ length: 9 }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-14 shrink-0 rounded-full" />
        ))}
      </div>

      {/* 요약 타일 */}
      <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-[72px] rounded-2xl" />
        ))}
      </div>

      {/* 결과 표 */}
      <div className="card rounded-2xl px-[18px] py-3">
        <Skeleton className="h-3 w-full rounded" />
        <div className="mt-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center justify-between gap-3 border-b border-divider py-3 last:border-0"
            >
              <div className="min-w-0 flex-1">
                <Skeleton className="h-3.5 w-2/3 rounded" />
              </div>
              <Skeleton className="h-3.5 w-10 shrink-0 rounded" />
              <Skeleton className="h-3.5 w-10 shrink-0 rounded" />
              <Skeleton className="h-3.5 w-12 shrink-0 rounded" />
            </div>
          ))}
        </div>
      </div>
    </PageShell>
  );
}
