/* [1012] 규칙 1·2 — 본문 카드 반경 12px→8px(rounded-3xl→rounded-lg 1곳). */
import { PageShell } from "../components/PageShell";
import { LoadingHint } from "@/app/components/ui/LoadingHint";
import { Skeleton } from "@/components/Skeleton";

/* 공개 임장노트 로딩 스켈레톤 (#41) — 실제 NotesFeedClient 배치에 맞춰 헤더 점프를 막는다.
   [1012 · 인스타 배치] 제목 → 숫자 3칸 → 지역 원 줄(64px) → 격자/피드 탭 → 3열 정사각 격자(모바일 끝까지, 간격 2px). */
export default function NotesLoading() {
  return (
    <PageShell>
      <LoadingHint className="mb-3" />
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 px-1">
          <Skeleton className="h-6 w-36 rounded-sm" />
          <div className="grid grid-cols-3 gap-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex flex-col gap-1">
                <Skeleton className="h-5 w-10 rounded-sm" />
                <Skeleton className="h-3 w-14 rounded-sm" />
              </div>
            ))}
          </div>
        </div>

        <div className="-mx-3.5 flex gap-3 overflow-hidden px-3.5 md:mx-0 md:px-0">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex w-[72px] shrink-0 flex-col items-center gap-1.5">
              <Skeleton className="h-[64px] w-[64px] rounded-full" />
              <Skeleton className="h-3 w-12 rounded-sm" />
            </div>
          ))}
        </div>

        <div className="grid grid-cols-2 border-t border-line">
          <Skeleton className="mx-auto mt-3 h-5 w-5 rounded-sm" />
          <Skeleton className="mx-auto mt-3 h-5 w-5 rounded-sm" />
        </div>

        <div className="-mx-3.5 grid grid-cols-3 gap-0.5 md:mx-auto md:w-full md:max-w-[935px] md:gap-1">
          {Array.from({ length: 12 }).map((_, i) => (
            <Skeleton key={i} className="aspect-square w-full rounded-none" />
          ))}
        </div>
      </div>
    </PageShell>
  );
}
