import { PageShell } from "@/app/components/PageShell";
import { LoadingHint } from "@/app/components/ui/LoadingHint";
import { Skeleton } from "@/components/Skeleton";
import { TownHero } from "../TownHero";
import { TownCategoryNav } from "../TownCategoryNav";

/* [992 · A7] 뉴스 목록 로딩 — 실제 화면과 같은 리듬.
   [v4] 한지 마스트헤드 → 본문과 같은 흰 머리(TownHero: 제목 한 줄) + 카테고리 밑줄 탭 + 다이제스트 한 행 +
   분류 탭 + 기사 행(제목 한 줄 + 메타 한 줄 · 1px 선). 가운데 한 줄 760px. */
export default function TownNewsLoading() {
  return (
    <PageShell>
      <div className="mx-auto w-full max-w-[760px]">
        <TownHero href="/town/news" />
        <TownCategoryNav stick />
        <LoadingHint className="mb-3" />
        <div className="mb-3 flex flex-col gap-2 border-y border-line py-3">
          <Skeleton className="h-3.5 w-40 rounded" />
          <Skeleton className="h-3 w-3/5 rounded" />
        </div>
        <div className="flex gap-2 overflow-hidden border-b border-line pb-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-6 w-16 shrink-0 rounded" />
          ))}
        </div>
        <ul className="mt-1 divide-y divide-line">
          {Array.from({ length: 8 }).map((_, i) => (
            <li key={i} className="flex items-center gap-3 py-3">
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <Skeleton className={`h-4 rounded ${i % 2 === 0 ? "w-4/5" : "w-3/5"}`} />
                <Skeleton className="h-3 w-40 rounded" />
              </div>
              <Skeleton className="h-8 w-8 shrink-0 rounded-lg" />
            </li>
          ))}
        </ul>
      </div>
    </PageShell>
  );
}
