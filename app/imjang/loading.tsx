import { PageShell } from "../components/PageShell";
import { LoadingHint } from "@/app/components/ui/LoadingHint";
import { Skeleton } from "@/components/Skeleton";

/* [966] 임장 가이드 인덱스 로딩 스켈레톤.
   [v4] 실제 페이지와 같은 자리 — 760px 한 줄 · 제목 + 사실 한 줄 · 지역 2열 격자 행 · 체크포인트 구분선 행 */
export default function ImjangLoading() {
  return (
    <PageShell breadcrumb="홈 › 임장 가이드">
      <div className="mx-auto flex max-w-[760px] flex-col gap-8">
        <div>
          <LoadingHint className="mb-3" />
          <Skeleton className="h-6 w-32 rounded" />
          <Skeleton className="mt-2 h-3.5 w-64 max-w-full rounded" />
        </div>
        <section>
          <Skeleton className="mb-2 h-4 w-32 rounded" />
          <div className="card grid grid-cols-2 gap-x-4 rounded-lg px-4">
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className="flex min-h-12 items-center justify-between gap-2 border-b border-line">
                <Skeleton className="h-3.5 w-24 rounded" />
                <Skeleton className="h-3 w-12 rounded" />
              </div>
            ))}
          </div>
        </section>
        <section>
          <Skeleton className="mb-2 h-4 w-40 rounded" />
          <div className="card flex flex-col divide-y divide-line rounded-lg px-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex min-h-14 flex-col justify-center gap-1.5 py-3">
                <Skeleton className="h-3.5 w-1/2 rounded" />
                <Skeleton className="h-3 w-4/5 rounded" />
              </div>
            ))}
          </div>
        </section>
      </div>
    </PageShell>
  );
}
