import { PageShell } from "../components/PageShell";
import { Skeleton } from "@/components/Skeleton";
import { TownCategoryNav } from "@/app/town/TownCategoryNav";
import { TownPageHead } from "@/app/town/TownPageHead";
import { townBreadcrumb } from "@/lib/town/category-links";

/* 단지 Q&A 로딩 스켈레톤 (#41) — 검색·필터 + 질문 카드 목록 */
export default function QnaLoading() {
  return (
/* [974] 로딩 스켈레톤의 머리는 **본문과 같은 것**을 쓴다.
   예전엔 여기만 옛 패턴(PageShell title = 제목이 카테고리 줄 위)이었고 브레드크럼
   문구도 달라서, 로딩 중과 로딩 후가 서로 다른 화면처럼 보였다. 소유자가 캡처한
   /qna 화면이 정확히 이 로딩 상태다("홈 › 동네이야기 › 단지 Q&A" + 카테고리 줄 위 제목).
   제목·한 줄·브레드크럼 모두 lib/town/category-links.ts 한 곳에서 온다. */
    <PageShell breadcrumb={townBreadcrumb("/qna")} wide>
      <TownCategoryNav stick />
      <TownPageHead href="/qna" />
      {/* 검색 + 정렬 필터 */}
      <div className="mb-5 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <Skeleton className="h-10 w-full rounded-xl md:max-w-[360px]" />
        <div className="flex gap-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-16 rounded-full" />
          ))}
        </div>
      </div>

      {/* 질문 카드 목록 */}
      <div className="flex flex-col gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="card p-[var(--pad-card)]">
            <div className="flex items-start justify-between gap-3">
              <Skeleton className="h-4 w-3/4 rounded" />
              <Skeleton className="h-5 w-10 shrink-0 rounded-full" />
            </div>
            <Skeleton className="mt-3 h-3 w-full rounded" />
            <Skeleton className="mt-1.5 h-3 w-2/3 rounded" />
            <div className="mt-3 flex items-center gap-2">
              <Skeleton className="h-5 w-16 rounded-full" />
              <Skeleton className="h-3 w-20 rounded" />
            </div>
          </div>
        ))}
      </div>
    </PageShell>
  );
}
