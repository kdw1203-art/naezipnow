/* [1024 · 원룸·오피스텔] /rent/[region] 스켈레톤 — 머리 · 탭 · 요약 3칸 · 분포 · 표 자리(실제 배치와 같은 순서). */
import { PageShell } from "@/app/components/PageShell";
import { Skeleton } from "@/components/Skeleton";

export default function RentRegionLoading() {
  return (
    <PageShell wide>
      <div className="flex gap-1.5">
        <Skeleton className="h-10 w-14 rounded-full" />
        <Skeleton className="h-10 w-28 rounded-full" />
      </div>
      <div className="mt-3 flex items-center gap-3">
        <Skeleton className="h-10 w-10 rounded-xl" />
        <div>
          <Skeleton className="h-6 w-64 rounded" />
          <Skeleton className="mt-1.5 h-3.5 w-80 rounded max-md:hidden" />
        </div>
      </div>
      <Skeleton className="mt-2 h-3 w-72 rounded" />
      <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-5">
        <div>
          <Skeleton className="h-10 w-full rounded" />
          <div className="mt-2 flex gap-1.5">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-24 rounded-full" />
            ))}
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2 md:gap-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="card p-[var(--pad-card)]">
                <Skeleton className="h-3 w-16 rounded" />
                <Skeleton className="mt-2 h-5 w-20 rounded" />
              </div>
            ))}
          </div>
          <div className="card mt-3 p-[var(--pad-card)]">
            <Skeleton className="h-4 w-32 rounded" />
            <Skeleton className="mt-3 h-44 w-full rounded" />
          </div>
          <div className="card mt-3 p-[var(--pad-card)]">
            <Skeleton className="h-4 w-24 rounded" />
            <div className="mt-3 flex flex-col gap-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-8 w-full rounded" />
              ))}
            </div>
          </div>
        </div>
        <div className="hidden lg:block">
          <div className="card p-[var(--pad-card)]">
            <Skeleton className="h-24 w-full rounded" />
          </div>
        </div>
      </div>
    </PageShell>
  );
}
