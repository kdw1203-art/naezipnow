import { PageShell } from "@/app/components/PageShell";
import { LoadingHint } from "@/app/components/ui/LoadingHint";
import { Skeleton } from "@/components/Skeleton";
import { NewsHead } from "./NewsHead";

/* [992 · A7] 뉴스 목록 로딩 — 뉴스룸 화면의 순서(머리 + 주제 칩 + 행 목록) 그대로.
   실제 화면이 행 목록인데 스켈레톤이 격자 카드면 로딩이 끝나는 순간 리듬이 통째로 바뀐다. */
export default function TownNewsLoading() {
  return (
    <PageShell wide>
      {/* [1044] 로딩 중에도 실제 화면과 같은 머리(NewsHead) — 예전 스켈레톤은 1006 의 마스트헤드 상자라
          로딩이 끝나면 머리 모양이 통째로 바뀌었다(1043 에서 머리를 PageHead 로 바꾸고 스켈레톤은 그대로였다). */}
      <NewsHead />
      <LoadingHint className="mb-3" />
      {/* 주제 칩 줄 */}
      <div className="mb-3 flex gap-1.5 overflow-hidden pb-1">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-16 shrink-0 rounded-full" />
        ))}
      </div>
      <div className="news-list">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="news-row">
            <div className="flex flex-col gap-2">
              <Skeleton className="h-2.5 w-40 rounded" />
              <Skeleton className={`h-4 rounded ${i === 0 ? "w-4/5" : "w-3/5"}`} />
              <Skeleton className="h-3 w-full rounded" />
            </div>
            <Skeleton className="h-8 w-8 rounded-lg" />
          </div>
        ))}
      </div>
    </PageShell>
  );
}
