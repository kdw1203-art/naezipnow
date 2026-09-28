/* [1022 · 정렬·글씨·테마] 지시 4 — 머리 한 모양(PageHead) · 램프 글자 · 흰 카드 테마 · 사실 문장. 자세한 사유는 본문의 [1022 · 정렬·글씨·테마] 주석. */
import { PageShell } from "../components/PageShell";
import { LoadingHint } from "@/app/components/ui/LoadingHint";
import { Skeleton } from "@/components/Skeleton";

/* 공개 임장노트 로딩 스켈레톤 (#41) — 헤더 + 필터 칩 + 노트 카드 그리드
   실제 NotesFeedClient 레이아웃(제목·설명 + 필터 3종 + 3열 카드)에 맞춰 헤더 점프 방지 */
export default function NotesLoading() {
  return (
    <PageShell>
      <LoadingHint className="mb-3" />
      <div className="flex flex-col gap-4">
        {/* [1022 · 정렬·글씨·테마] 머리 스켈레톤 = PageHead 모양(아이콘 칩 40 + 제목 + 한 줄 | 오른쪽 칩) */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-1">
          <div className="flex items-center gap-3">
            <Skeleton className="h-10 w-10 rounded-xl" />
            <div>
              <Skeleton className="h-6 w-32 rounded-lg" />
              <Skeleton className="mt-1.5 hidden h-3.5 w-64 max-w-full rounded md:block" />
            </div>
          </div>
          <div className="flex gap-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-9 w-16 rounded-full" />
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="card overflow-hidden rounded-3xl">
              <Skeleton className="h-44 w-full" />
              <div className="flex flex-col gap-2 p-4">
                <Skeleton className="h-4 w-3/4 rounded" />
                <Skeleton className="h-3 w-full rounded" />
                <Skeleton className="h-3 w-2/3 rounded" />
                <div className="mt-2 flex items-center gap-2">
                  <Skeleton className="h-6 w-6 rounded-full" />
                  <Skeleton className="h-3 w-20 rounded" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </PageShell>
  );
}
