import { PageShell } from "../components/PageShell";
import { LoadingHint } from "@/app/components/ui/LoadingHint";
import { Skeleton } from "@/components/Skeleton";

/* [966] 임장 가이드 인덱스 로딩 스켈레톤 — 실제 페이지(제목 · 사실 한 줄 · 지역 칩 행 · 체크포인트 행 목록)와
   같은 자리를 먼저 잡는다. [1015] 체크포인트 2열 카드 → 행 목록 모양으로. */
export default function ImjangLoading() {
  return (
    <PageShell breadcrumb="홈 › 임장 가이드" title="임장 가이드">
      <LoadingHint className="mb-3" />
      <div className="mb-4 max-w-[720px]">
        <Skeleton className="h-3.5 w-2/3 rounded" />
      </div>

      {/* 지역 칩 행 */}
      <section className="mb-7">
        <Skeleton className="mb-2 h-4 w-32 rounded" />
        <div className="flex flex-wrap gap-2">
          {Array.from({ length: 12 }).map((_, i) => (
            <Skeleton
              key={i}
              className={`h-9 rounded-full ${["w-24", "w-28", "w-20", "w-32"][i % 4]}`}
            />
          ))}
        </div>
      </section>

      {/* 체크포인트 행 목록 */}
      <section className="mb-6">
        <Skeleton className="mb-2 h-4 w-56 rounded" />
        <div className="card flex flex-col divide-y divide-divider rounded-2xl px-3.5">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="py-2.5">
              <Skeleton className="h-3.5 w-1/2 rounded" />
              <Skeleton className="mt-1.5 h-3 w-4/5 rounded" />
            </div>
          ))}
        </div>
      </section>
    </PageShell>
  );
}
