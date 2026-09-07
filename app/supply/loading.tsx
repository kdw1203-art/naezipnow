import { PageShell } from "../components/PageShell";
import { Skeleton } from "@/components/Skeleton";
import { TownCategoryNav } from "@/app/town/TownCategoryNav";
import { TownPageHead } from "@/app/town/TownPageHead";
import { townBreadcrumb } from "@/lib/town/category-links";

/* 입주 예정 물량 로딩 스켈레톤 (#17) — 요약 문구 + 지역 필터 + 월별 차트 + 단지 목록 */
export default function SupplyLoading() {
  return (
/* [974] 로딩 스켈레톤의 머리는 **본문과 같은 것**을 쓴다.
   예전엔 여기만 옛 패턴(PageShell title = 제목이 카테고리 줄 위)이었고 브레드크럼
   문구도 달라서, 로딩 중과 로딩 후가 서로 다른 화면처럼 보였다. 소유자가 캡처한
   /qna 화면이 정확히 이 로딩 상태다("홈 › 동네이야기 › 단지 Q&A" + 카테고리 줄 위 제목).
   제목·한 줄·브레드크럼 모두 lib/town/category-links.ts 한 곳에서 온다. */
    <PageShell breadcrumb={townBreadcrumb("/supply")} wide>
      <TownCategoryNav stick />
      <TownPageHead href="/supply" />
      <Skeleton className="mb-5 h-4 w-3/4 rounded" />

      {/* 지역 필터 칩 */}
      <div className="mb-5 flex flex-wrap gap-1.5">
        {Array.from({ length: 10 }).map((_, i) => (
          <Skeleton key={i} className="h-7 w-16 rounded-full" />
        ))}
      </div>

      {/* 월별 물량 차트 */}
      <div className="card mb-6 p-[var(--pad-card)]">
        <Skeleton className="h-4 w-32 rounded" />
        <div className="mt-4 flex h-[120px] items-end gap-[3px]">
          {Array.from({ length: 24 }).map((_, i) => (
            <Skeleton
              key={i}
              className="min-w-[10px] flex-1 rounded-t-[3px]"
              style={{ height: `${20 + ((i * 37) % 80)}px` }}
            />
          ))}
        </div>
      </div>

      {/* 입주 예정 단지 목록 */}
      <div className="card mb-6 p-[var(--pad-card)]">
        <Skeleton className="h-4 w-28 rounded" />
        <div className="mt-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center justify-between gap-3 border-b border-border py-3 last:border-0"
            >
              <div className="min-w-0 flex-1">
                <Skeleton className="h-3.5 w-1/2 rounded" />
                <Skeleton className="mt-1.5 h-2.5 w-2/3 rounded" />
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1.5">
                <Skeleton className="h-3.5 w-12 rounded" />
                <Skeleton className="h-2.5 w-10 rounded" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </PageShell>
  );
}
