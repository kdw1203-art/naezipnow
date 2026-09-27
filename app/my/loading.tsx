import { PageShell } from "../components/PageShell";
import { Skeleton } from "@/components/Skeleton";

/* 마이 로딩 스켈레톤 — 실제 화면과 같은 뼈대.
   [v4 · 한 화면 한 가지] 유리 히어로·5칸 타일·2열 → 가운데 한 줄(760px): 머리(이름 + 사실 한 줄 · 설정)
   → "내 활동" 1px 선 행 7개(오른쪽 개수) → 최근 본 단지 행 3개. 제목(h1)은 실제 화면이 이 줄 안에서 그린다. */
function Rows({ n }: { n: number }) {
  return (
    <div className="divide-y divide-line">
      {Array.from({ length: n }).map((_, i) => (
        <div key={i} className="flex min-h-14 items-center justify-between gap-3 py-3">
          <div className="min-w-0 flex-1">
            <Skeleton className="h-4 w-28 rounded" />
            <Skeleton className="mt-1.5 h-3 w-40 max-w-full rounded" />
          </div>
          <Skeleton className="h-4 w-10 shrink-0 rounded" />
        </div>
      ))}
    </div>
  );
}

export default function MyLoading() {
  return (
    <PageShell>
      <div className="mx-auto flex w-full max-w-[760px] flex-col gap-8">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <Skeleton className="h-6 w-32 rounded" />
            <Skeleton className="mt-1.5 h-3.5 w-40 max-w-full rounded" />
          </div>
          <Skeleton className="h-10 w-10 shrink-0 rounded-lg" />
        </div>
        <div className="flex flex-col">
          <Skeleton className="h-4 w-16 rounded" />
          <Rows n={7} />
        </div>
        <div className="flex flex-col">
          <Skeleton className="h-4 w-24 rounded" />
          <Rows n={3} />
        </div>
      </div>
    </PageShell>
  );
}
