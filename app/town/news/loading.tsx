import { PageShell } from "@/app/components/PageShell";
import { LoadingHint } from "@/app/components/ui/LoadingHint";
import { Skeleton } from "@/components/Skeleton";

/* [992 · A7] 뉴스 목록 로딩 — [1006] 뉴스룸 재질(마스트헤드 + 분류 탭 + 행 목록) 그대로.
   실제 화면이 행 목록인데 스켈레톤이 격자 카드면 로딩이 끝나는 순간 리듬이 통째로 바뀐다. */
export default function TownNewsLoading() {
  return (
    <PageShell breadcrumb="뉴스룸" wide>
      <LoadingHint className="mb-3" />
      <div className="newsroom-masthead mb-4 flex flex-col gap-3 px-5 py-5 md:px-6">
        <Skeleton className="h-3 w-56 rounded" />
        <Skeleton className="h-7 w-3/5 rounded-lg" />
        <Skeleton className="h-3.5 w-2/3 rounded" />
      </div>
      <div className="mb-2 flex gap-2 overflow-hidden border-b border-line pb-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-6 w-16 shrink-0 rounded" />
        ))}
      </div>
      <div className="news-list">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="news-row">
            <div className="flex flex-col gap-2">
              <Skeleton className="h-2.5 w-40 rounded" />
              <Skeleton className={`h-4 rounded ${i === 0 ? "w-4/5" : "w-3/5"}`} />
              <Skeleton className="h-3 w-full rounded" />
            </div>
            <Skeleton className="h-8 w-8 rounded-lg" />
          </div>
        ))}
      </div>
    </PageShell>
  );
}
