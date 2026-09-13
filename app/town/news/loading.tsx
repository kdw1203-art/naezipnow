import { PageShell } from "@/app/components/PageShell";
import { LoadingHint } from "@/app/components/ui/LoadingHint";
import { Skeleton } from "@/components/Skeleton";

/* [992 · A7] 뉴스 목록 로딩 — 태그 칩 행 + 기사 카드 목록 자리 */
export default function TownNewsLoading() {
  return (
    <PageShell breadcrumb="뉴스" wide>
      <LoadingHint className="mb-3" />
      <div className="flex flex-col gap-4">
        <Skeleton className="h-7 w-40 rounded-lg" />
        <div className="flex gap-2 overflow-hidden">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-9 w-20 shrink-0 rounded-full" />
          ))}
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="card flex flex-col gap-2 rounded-[18px] p-4">
              <Skeleton className="h-4 w-3/4 rounded" />
              <Skeleton className="h-3 w-full rounded" />
              <Skeleton className="h-3 w-1/2 rounded" />
            </div>
          ))}
        </div>
      </div>
    </PageShell>
  );
}
