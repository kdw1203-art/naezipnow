import { PageShell } from "../components/PageShell";
import { LoadingHint } from "@/app/components/ui/LoadingHint";
import { Skeleton } from "@/components/Skeleton";

/* [966] 월간 리포트 목록 로딩 스켈레톤 — 실제 페이지(제목 · 사실 한 줄 · 연도 소제목 · 리퀴드 행 목록)와 같은 자리를 먼저 잡는다.
   [1015] 카드 타일 → 판 하나 안의 행(divide-y) 모양으로. */
export default function ReportsLoading() {
  return (
    <PageShell breadcrumb="월간 실거래 리포트">
      <div className="mx-auto max-w-[1100px]">
        <LoadingHint className="mb-3" />
        <Skeleton className="h-7 w-64 max-w-full rounded-lg" />
        <Skeleton className="mt-2 h-3.5 w-3/4 rounded" />

        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-5">
          <div>
            <Skeleton className="mb-2 h-4 w-24 rounded" />
            <div className="card flex flex-col divide-y divide-divider rounded-2xl px-3.5">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex min-h-[48px] items-center justify-between py-2.5">
                  <Skeleton className="h-4 w-44 max-w-[60%] rounded" />
                  <Skeleton className="h-3 w-24 rounded" />
                </div>
              ))}
            </div>
          </div>
          <div className="hidden lg:block">
            <Skeleton className="h-24 w-full rounded-2xl" />
          </div>
        </div>
      </div>
    </PageShell>
  );
}
