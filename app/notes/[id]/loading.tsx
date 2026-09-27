import { PageShell } from "@/app/components/PageShell";
import { LoadingHint } from "@/app/components/ui/LoadingHint";
import { Skeleton } from "@/components/Skeleton";

/* [992 · A7] 노트 상세 로딩 — 30일 실측에서 한 건당 40초를 읽는 화면인데 로딩 경계가 없어
   흰 화면 뒤에 통째로 나타났다.
   [v4] 실제 배치에 맞춰 다시 잡는다(가운데 한 줄, 최대 760px — 사이드바 없음):
   제목 · 사실 한 줄 · 글자 버튼 줄 → 사진 → 판단(큰 숫자 · 행 2개 · 버튼 1개) → 현장 기록 행. */
export default function NoteDetailLoading() {
  return (
    <PageShell breadcrumb="임장노트">
      <LoadingHint className="mb-3" />
      <div className="mx-auto flex w-full max-w-[760px] flex-col gap-8">
        {/* 머리 + 사진 */}
        <div className="flex flex-col gap-3">
          <Skeleton className="h-7 w-2/3 rounded" />
          <Skeleton className="h-3.5 w-1/2 rounded" />
          <div className="flex gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-4 w-12 rounded" />
            ))}
          </div>
          <Skeleton className="h-[248px] w-full rounded-lg sm:h-[340px] lg:h-[400px]" />
        </div>
        {/* 판단 한 덩어리 */}
        <div className="flex flex-col gap-3">
          <Skeleton className="h-3.5 w-24 rounded" />
          <Skeleton className="h-9 w-28 rounded" />
          <Skeleton className="h-3.5 w-2/3 rounded" />
          <div className="divide-y divide-line border-y border-line">
            {Array.from({ length: 2 }).map((_, i) => (
              <div key={i} className="flex items-center justify-between py-4">
                <Skeleton className="h-4 w-32 rounded" />
                <Skeleton className="h-4 w-14 rounded" />
              </div>
            ))}
          </div>
          <Skeleton className="h-12 w-full rounded-lg" />
        </div>
        {/* 현장 기록 */}
        <div className="flex flex-col gap-2">
          <Skeleton className="h-5 w-20 rounded" />
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className={`h-3.5 rounded ${i === 2 ? "w-2/3" : "w-full"}`} />
          ))}
        </div>
      </div>
    </PageShell>
  );
}
