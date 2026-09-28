import { PageShell } from "../../components/PageShell";
import { Skeleton } from "@/components/Skeleton";

/* 고도화 1 — 실거래 구간 지역 랜딩 스켈레톤. [1015] 면적대·가격대 표(행 5줄) + 데스크톱 레일 자리 */
export default function TxRegionLoading() {
  return (
    <PageShell>
      <div className="flex flex-col gap-4">
        <div>
          <Skeleton className="h-3.5 w-44 rounded" />
          <Skeleton className="mt-2 h-7 w-72 max-w-full rounded-lg" />
          <Skeleton className="mt-2 h-3.5 w-56 max-w-full rounded" />
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-5">
          <div className="flex flex-col gap-4">
            {Array.from({ length: 2 }).map((_, s) => (
              <div key={s} className="card rounded-2xl p-5">
                <Skeleton className="h-5 w-40 rounded" />
                <div className="mt-3 flex flex-col divide-y divide-divider">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="flex items-center justify-between py-2.5">
                      <Skeleton className="h-3.5 w-28 rounded" />
                      <Skeleton className="h-3.5 w-40 rounded" />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div className="hidden lg:block">
            <Skeleton className="h-28 w-full rounded-2xl" />
          </div>
        </div>
      </div>
    </PageShell>
  );
}
