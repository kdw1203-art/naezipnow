import { PageShell } from "@/app/components/PageShell";
import { LoadingHint } from "@/app/components/ui/LoadingHint";
import { Skeleton } from "@/components/Skeleton";

/* [992 · A7] 노트 상세 로딩 — 30일 실측에서 한 건당 40초를 읽는 화면인데 로딩 경계가 없어
   흰 화면 뒤에 통째로 나타났다.
   [1005 · A4] 실제 배치에 맞춰 다시 잡는다: 상단 액션 줄 → 판단 히어로(유리판: 띠·결론·
   사실 3칸·행동 1개) → 다음 행동 알약 줄 → 본문 카드(칩·제목·항목 평가·본문) → lg 사이드바. */
export default function NoteDetailLoading() {
  return (
    <PageShell breadcrumb="임장노트">
      <LoadingHint className="mb-3" />
      {/* 상단 액션 줄 */}
      <div className="mb-4 flex flex-wrap items-center justify-end gap-2">
        <Skeleton className="h-10 w-28 rounded-[10px]" />
        <Skeleton className="h-10 w-20 rounded-[10px]" />
        <Skeleton className="h-10 w-28 rounded-[10px]" />
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex flex-col gap-4">
          {/* 판단 히어로 — 유리판 */}
          <div className="lg-glass flex flex-col gap-3 p-5">
            <div className="flex items-center gap-2">
              <Skeleton className="h-5 w-24 rounded-md" />
              <Skeleton className="h-3 w-40 rounded" />
            </div>
            <Skeleton className="h-5 w-11/12 rounded" />
            <Skeleton className="h-5 w-2/3 rounded" />
            <div className="grid grid-cols-3 gap-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-16 rounded-[12px]" />
              ))}
            </div>
            <Skeleton className="h-10 w-56 rounded-[12px]" />
          </div>
          {/* 다음 행동 알약 줄 */}
          <div className="lg-glass flex flex-col gap-2.5 p-4">
            <Skeleton className="h-3.5 w-3/4 rounded" />
            <div className="lg-capsule">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-8 w-20 rounded-full" />
              ))}
            </div>
          </div>
          {/* 본문 카드 */}
          <div className="card flex flex-col gap-3 rounded-[18px] p-6">
            <div className="flex gap-1.5">
              <Skeleton className="h-6 w-16 rounded-full" />
              <Skeleton className="h-6 w-24 rounded-full" />
            </div>
            <Skeleton className="h-6 w-2/3 rounded-lg" />
            <Skeleton className="h-3.5 w-48 rounded" />
            <div className="grid grid-cols-2 gap-1.5 md:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-9 rounded-lg" />
              ))}
            </div>
            <Skeleton className="h-44 w-full rounded-[14px]" />
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className={`h-3.5 rounded ${i % 3 === 2 ? "w-2/3" : "w-full"}`} />
            ))}
          </div>
        </div>
        <aside className="hidden flex-col gap-3 lg:flex">
          <Skeleton className="h-40 w-full rounded-[18px]" />
          <Skeleton className="h-28 w-full rounded-[18px]" />
        </aside>
      </div>
    </PageShell>
  );
}
