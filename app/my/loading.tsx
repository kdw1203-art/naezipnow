import { PageShell } from "../components/PageShell";
import { Skeleton } from "@/components/Skeleton";

/* 마이 로딩 스켈레톤 — [1006] 실제 화면과 같은 뼈대: 유리 히어로(아바타·이름·활동 요약 5칸·출석)
   → 다음 할 일 카드 → 2열(좌 최근 본 단지·노트·관심 / 우 구독·포인트·더 보기).
   제목(h1)은 PageShell 이 그린다. */
export default function MyLoading() {
  return (
    <PageShell title="마이">
      <div className="mx-auto flex max-w-[1040px] flex-col gap-4">
        {/* 프로필 히어로 + 활동 요약 */}
        <div className="lg-glass flex flex-col gap-4 rounded-lg p-5">
          <div className="flex items-center gap-3">
            <Skeleton className="h-12 w-12 shrink-0 rounded-full" />
            <div className="min-w-0 flex-1">
              <Skeleton className="h-5 w-32 rounded" />
              <Skeleton className="mt-2 h-3.5 w-40 max-w-full rounded" />
            </div>
            <Skeleton className="h-10 w-10 shrink-0 rounded-[11px]" />
          </div>
          <div className="lg-hairline" />
          <div className="grid grid-cols-5 gap-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex flex-col items-center gap-1.5 py-2">
                <Skeleton className="h-5 w-8 rounded" />
                <Skeleton className="h-3 w-10 rounded" />
              </div>
            ))}
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <Skeleton className="h-4 w-24 rounded" />
            <Skeleton className="h-10 w-full rounded-[10px] sm:w-[220px]" />
          </div>
        </div>

        {/* 다음 할 일 */}
        <div className="card flex items-center justify-between gap-3 rounded-2xl p-4">
          <div className="min-w-0 flex-1">
            <Skeleton className="h-3 w-20 rounded" />
            <Skeleton className="mt-2 h-4 w-2/3 rounded" />
          </div>
          <Skeleton className="h-10 w-28 shrink-0 rounded-[11px]" />
        </div>

        {/* 2열 */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_336px]">
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2.5">
              <Skeleton className="h-4 w-24 rounded" />
              <div className="flex gap-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-14 w-[150px] shrink-0 rounded-[14px]" />
                ))}
              </div>
            </div>
            <div className="flex flex-col gap-2.5">
              <Skeleton className="h-4 w-24 rounded" />
              <Skeleton className="h-40 w-full rounded-[14px]" />
            </div>
            <div className="flex flex-col gap-2.5">
              <Skeleton className="h-4 w-16 rounded" />
              <Skeleton className="h-36 w-full rounded-2xl" />
            </div>
          </div>
          <div className="flex flex-col gap-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex flex-col gap-2.5">
                <Skeleton className="h-4 w-20 rounded" />
                <Skeleton className="h-28 w-full rounded-2xl" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </PageShell>
  );
}
