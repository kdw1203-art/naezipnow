import { PageShell } from "../components/PageShell";
import { LoadingHint } from "@/app/components/ui/LoadingHint";
import { Skeleton } from "@/components/Skeleton";

/* AI 분석 허브 로딩 스켈레톤 — 실제 배치와 같은 모양이어야 진입마다 틀린 뼈대가 번쩍이지 않는다.
   [v4] 네이비 히어로 + 4칸 카드 격자 → 흰 바탕 제목 + 검색 한 줄 + 구분선 목록 3벌(가운데 한 줄, 최대 760px). */
export default function AnalysisLoading() {
  return (
    <PageShell>
      <LoadingHint className="mb-3" />
      <div className="mx-auto flex w-full max-w-[760px] flex-col gap-8">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Skeleton className="h-6 w-24 rounded" />
            <Skeleton className="h-3 w-56 max-w-full rounded" />
          </div>
          <div className="flex gap-2">
            <Skeleton className="h-[52px] flex-1 rounded-lg" />
            <Skeleton className="h-[52px] w-20 rounded-lg" />
          </div>
          <Skeleton className="h-3 w-28 rounded" />
        </div>

        {[5, 4, 2].map((n, t) => (
          <div key={t} className="flex flex-col gap-2">
            <Skeleton className="h-4 w-24 rounded" />
            <div className="card flex flex-col divide-y divide-line rounded-lg px-4">
              {Array.from({ length: n }).map((_, i) => (
                <div key={i} className="flex min-h-14 flex-col justify-center gap-1.5 py-3">
                  <Skeleton className="h-4 w-36 rounded" />
                  <Skeleton className="h-3 w-52 max-w-full rounded" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </PageShell>
  );
}
