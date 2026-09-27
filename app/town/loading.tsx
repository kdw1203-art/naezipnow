import { PageShell } from "../components/PageShell";
import { LoadingHint } from "@/app/components/ui/LoadingHint";
import { Skeleton } from "@/components/Skeleton";

/* 동네이야기 로딩 스켈레톤 (#17).
   [v4] 실제 화면과 같은 뼈대 — 가운데 한 줄(최대 760px): 제목 + 작은 글쓰기 · 뉴스 한 행 · 지역 칩 줄 ·
   유형 탭 줄 · 1px 선 행 목록(72px 정사각 썸네일 + 제목 2줄 + 메타 한 줄). 예전 뼈대(카테고리 타일
   아홉 장 + 매소너리 카드)는 목록이 붙는 순간 리듬이 통째로 바뀌었다. */
export default function TownLoading() {
  return (
    <PageShell>
      <div className="mx-auto w-full max-w-[760px]">
        <LoadingHint className="mb-3" />
        <div className="flex items-center justify-between pb-3">
          <Skeleton className="h-6 w-28 rounded-lg" />
          <Skeleton className="h-8 w-16 rounded-lg" />
        </div>
        <div className="flex flex-col gap-1.5 border-y border-line py-3">
          <Skeleton className="h-4 w-24 rounded-sm" />
          <Skeleton className="h-3 w-3/4 rounded-sm" />
        </div>
        <div className="flex gap-2 overflow-hidden py-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-16 shrink-0 rounded-full" />
          ))}
        </div>
        <div className="flex gap-4 border-b border-line pb-2.5 pt-2">
          <Skeleton className="h-4 w-12 rounded-sm" />
          <Skeleton className="h-4 w-16 rounded-sm" />
          <Skeleton className="h-4 w-12 rounded-sm" />
        </div>
        <div className="divide-y divide-line">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex items-start gap-3 py-3">
              <Skeleton className="h-[72px] w-[72px] shrink-0 rounded-lg" />
              <div className="flex min-w-0 flex-1 flex-col gap-2 pt-1">
                <Skeleton className="h-3.5 w-full rounded-sm" />
                <Skeleton className="h-3.5 w-2/3 rounded-sm" />
                <Skeleton className="mt-1 h-3 w-1/2 rounded-sm" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </PageShell>
  );
}
