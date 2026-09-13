import { PageShell } from "@/app/components/PageShell";
import { LoadingHint } from "@/app/components/ui/LoadingHint";
import { Skeleton } from "@/components/Skeleton";

/* [992 · A7] 노트 상세 로딩 — 30일 실측에서 한 건당 40초를 읽는 화면인데 로딩 경계가 없어
   흰 화면 뒤에 통째로 나타났다. 실제 배치(제목·메타 → 커버 → 점수 5칸 → 본문 → lg 사이드바)
   에 맞춰 자리를 잡는다. */
export default function NoteDetailLoading() {
  return (
    <PageShell breadcrumb="임장노트">
      <LoadingHint className="mb-3" />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_400px]">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Skeleton className="h-7 w-2/3 rounded-lg" />
            <Skeleton className="h-3.5 w-48 rounded" />
          </div>
          <Skeleton className="h-52 w-full rounded-[18px]" />
          <div className="grid grid-cols-5 gap-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-14 rounded-xl" />
            ))}
          </div>
          <div className="card flex flex-col gap-2 rounded-[18px] p-4">
            {Array.from({ length: 6 }).map((_, i) => (
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
