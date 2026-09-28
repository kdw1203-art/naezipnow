import { PageShell } from "../components/PageShell";
import { LoadingHint } from "@/app/components/ui/LoadingHint";
import { Skeleton } from "@/components/Skeleton";

/* AI 분석 허브 로딩 스켈레톤 — [958] 실제 배치(네이비 히어로 + 검색 카드 + 계열 3개 ×
   4칸 그리드)와 같은 모양. 예전 스켈레톤은 개편 전 배치(6칸 3열)를 그려서 매 진입마다
   틀린 뼈대가 한 번 번쩍였다. */
export default function AnalysisLoading() {
  return (
    <PageShell>
      <LoadingHint className="mb-3" />
      <div className="flex flex-col gap-6">
        {/* [1021] 흰 머리 한 줄 + 검색 카드 + 한도 캡션 — hub-hero.tsx 와 같은 뼈대 */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <Skeleton className="h-10 w-10 rounded-xl" />
            <div className="flex flex-col gap-1.5">
              <Skeleton className="h-5 w-24 rounded" />
              <Skeleton className="h-3 w-72 max-w-full rounded" />
            </div>
          </div>
          <div className="card rounded-2xl p-3.5">
            <Skeleton className="h-11 w-full rounded-xl" />
          </div>
          <Skeleton className="h-3 w-64 max-w-full rounded" />
        </div>

        {Array.from({ length: 3 }).map((_, t) => (
          <div key={t} className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <Skeleton className="h-8 w-8 rounded-lg" />
              <Skeleton className="h-5 w-56 rounded" />
            </div>
            <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="card flex flex-col gap-2 rounded-lg p-3.5">
                  <Skeleton className="h-12 w-12 rounded-lg" />
                  <Skeleton className="h-4 w-28 rounded" />
                  <Skeleton className="h-3 w-full rounded" />
                  <Skeleton className="h-3 w-2/3 rounded" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </PageShell>
  );
}
