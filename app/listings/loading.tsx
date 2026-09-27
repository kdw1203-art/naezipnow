import { PageShell } from "../components/PageShell";
import { Skeleton } from "@/components/Skeleton";

/* 실매물 로딩 스켈레톤 (#41) — [v4] 실제 화면과 같은 뼈대: 가운데 한 줄(760px) · 제목·사실 줄 + 필터 칩 +
   썸네일 행(72px 정사각 + 세 줄). 행 높이가 실물과 같아 로드 순간 목록이 밀리지 않는다. */
export default function ListingsLoading() {
  return (
    <PageShell>
      <div className="mx-auto w-full max-w-[760px]">
        <Skeleton className="h-7 w-32 rounded-lg" />
        <Skeleton className="mt-2 h-3.5 w-72 max-w-full rounded" />

        {/* 필터 칩 */}
        <div className="my-5 flex flex-wrap gap-1.5">
          {Array.from({ length: 7 }).map((_, i) => (
            <Skeleton key={i} className="h-7 w-16 rounded-full" />
          ))}
        </div>

        {/* 썸네일 행 */}
        <div className="flex flex-col divide-y divide-line">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-start gap-3 py-3">
              <Skeleton className="h-[72px] w-[72px] shrink-0 rounded-lg" />
              <div className="flex min-w-0 flex-1 flex-col gap-2 pt-1">
                <Skeleton className="h-4 w-1/2 rounded" />
                <Skeleton className="h-4 w-1/3 rounded" />
                <Skeleton className="h-3 w-2/3 rounded" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </PageShell>
  );
}
