import { PageShell } from "../../components/PageShell";
import { Skeleton } from "@/components/Skeleton";

/* 고도화 1 — 실거래 구간 지역 랜딩 스켈레톤.
   [v4] 실제 페이지와 같은 자리 — 760px 한 줄 · 제목 + 사실 한 줄 · 면적대/가격대 구분선 행(오른쪽 중앙값) */
export default function TxRegionLoading() {
  return (
    <PageShell>
      <div className="mx-auto flex max-w-[760px] flex-col gap-8">
        <div>
          <Skeleton className="h-3.5 w-44 rounded" />
          <Skeleton className="mt-2 h-6 w-72 max-w-full rounded" />
          <Skeleton className="mt-2 h-3.5 w-56 max-w-full rounded" />
        </div>

        {Array.from({ length: 2 }).map((_, s) => (
          <div key={s}>
            <Skeleton className="mb-2 h-4 w-24 rounded" />
            <div className="card flex flex-col divide-y divide-line rounded-lg px-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex min-h-14 items-center justify-between gap-3 py-3">
                  <div className="flex flex-col gap-1.5">
                    <Skeleton className="h-3.5 w-24 rounded" />
                    <Skeleton className="h-3 w-40 rounded" />
                  </div>
                  <Skeleton className="h-3.5 w-14 rounded" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </PageShell>
  );
}
