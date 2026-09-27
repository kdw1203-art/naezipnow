import { PageShell } from "../components/PageShell";
import { LoadingHint } from "@/app/components/ui/LoadingHint";
import { Skeleton } from "@/components/Skeleton";

/* [966] 월간 리포트 목록 로딩 스켈레톤.
   [v4] 실제 페이지와 같은 자리 — 760px 한 줄 · 제목 + 사실 한 줄 · 연도 소제목 · 구분선 행(오른쪽 건수) */
export default function ReportsLoading() {
  return (
    <PageShell breadcrumb="월간 실거래 리포트">
      <div className="mx-auto flex max-w-[760px] flex-col gap-8">
        <div>
          <LoadingHint className="mb-3" />
          <Skeleton className="h-6 w-64 max-w-full rounded" />
          <Skeleton className="mt-2 h-3.5 w-56 max-w-full rounded" />
        </div>
        <div>
          <Skeleton className="mb-2 h-4 w-20 rounded" />
          <div className="card flex flex-col divide-y divide-line rounded-lg px-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex min-h-14 items-center justify-between gap-3 py-3">
                <div className="flex flex-col gap-1.5">
                  <Skeleton className="h-3.5 w-28 rounded" />
                  <Skeleton className="h-3 w-16 rounded" />
                </div>
                <Skeleton className="h-3.5 w-16 rounded" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </PageShell>
  );
}
