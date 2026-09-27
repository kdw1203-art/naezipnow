import { PageShell } from "../components/PageShell";
import { Skeleton } from "@/components/Skeleton";
import { TownCategoryNav } from "@/app/town/TownCategoryNav";
import { TownHero } from "@/app/town/TownHero";
import { townBreadcrumb } from "@/lib/town/category-links";

/* 정비사업 지도 로딩 스켈레톤 (#41) — 사업종류·진행단계 필터 + 지도 캔버스 + 사업장 목록 */
export default function RedevelopmentLoading() {
  return (
    /* [974] 로딩 스켈레톤의 머리는 **본문과 같은 것**을 쓴다.
   예전엔 여기만 옛 패턴(PageShell title = 제목이 카테고리 줄 위)이었고 브레드크럼
   문구도 달라서, 로딩 중과 로딩 후가 서로 다른 화면처럼 보였다. 소유자가 캡처한
   /qna 화면이 정확히 이 로딩 상태다("홈 › 동네이야기 › 단지 Q&A" + 카테고리 줄 위 제목).
   제목·한 줄·브레드크럼 모두 lib/town/category-links.ts 한 곳에서 온다. */
    <PageShell breadcrumb={townBreadcrumb("/redevelopment")} wide>
      <TownHero href="/redevelopment" />
      <TownCategoryNav stick />

      <div className="mx-auto flex w-full max-w-[1080px] flex-col gap-6">
        {/* 사업종류 필터 칩 */}
        <div className="flex flex-wrap gap-1.5">
          {Array.from({ length: 12 }).map((_, i) => (
            <Skeleton key={i} className="h-7 w-20 rounded-full" />
          ))}
        </div>

        {/* 지도 캔버스 */}
        <Skeleton className="h-[420px] w-full rounded-2xl" />

        {/* 사업장 목록 */}
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="card p-[var(--pad-card)]">
              <div className="flex items-center gap-2">
                <Skeleton className="h-4 w-4 rounded-full" />
                <Skeleton className="h-4 w-32 rounded" />
              </div>
              <Skeleton className="mt-3 h-3 w-2/3 rounded" />
              <Skeleton className="mt-1.5 h-3 w-1/2 rounded" />
            </div>
          ))}
        </div>
      </div>
    </PageShell>
  );
}
