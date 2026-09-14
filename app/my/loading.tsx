import { PageShell } from "../components/PageShell";
import { Skeleton } from "@/components/Skeleton";

/* 마이 로딩 스켈레톤 — [1000] 실제 화면과 같은 뼈대: 유리 히어로(아바타·이름·포인트) →
   바로가기 알약 → 노트/관심 2열 → 섹션 카드. 제목(h1)은 PageShell 이 그린다. */
export default function MyLoading() {
  return (
    <PageShell title="마이">
      <div className="mx-auto flex max-w-[860px] flex-col gap-4">
        {/* 프로필 히어로 */}
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
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div className="min-w-0 flex-1">
              <Skeleton className="h-3 w-24 rounded" />
              <Skeleton className="mt-2 h-7 w-28 rounded" />
            </div>
            <Skeleton className="h-10 w-full rounded-[10px] sm:w-[220px]" />
          </div>
        </div>

        {/* 바로가기 알약 */}
        <Skeleton className="h-10 w-72 max-w-full rounded-full" />

        {/* 노트 · 관심 2열 */}
        <div className="grid gap-4 md:grid-cols-2">
          {Array.from({ length: 2 }).map((_, col) => (
            <div key={col} className="flex flex-col gap-2.5">
              <Skeleton className="h-4 w-24 rounded" />
              {Array.from({ length: 3 }).map((__, i) => (
                <div key={i} className="card flex items-center justify-between rounded-[14px] px-4 py-3.5">
                  <div className="min-w-0 flex-1">
                    <Skeleton className="h-3.5 w-1/2 rounded" />
                    <Skeleton className="mt-1.5 h-2.5 w-2/3 rounded" />
                  </div>
                  <Skeleton className="h-3.5 w-10 shrink-0 rounded" />
                </div>
              ))}
            </div>
          ))}
        </div>

        {/* 섹션 카드 */}
        <div className="card rounded-2xl p-5">
          <Skeleton className="h-4 w-28 rounded" />
          <Skeleton className="mt-3 h-3.5 w-3/4 rounded" />
          <Skeleton className="mt-2 h-3.5 w-1/2 rounded" />
        </div>
      </div>
    </PageShell>
  );
}
