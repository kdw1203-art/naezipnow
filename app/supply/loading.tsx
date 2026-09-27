import { PageShell } from "../components/PageShell";
import { Skeleton } from "@/components/Skeleton";
import { TownCategoryNav } from "@/app/town/TownCategoryNav";
import { TownHero } from "@/app/town/TownHero";

/* 입주 예정 물량 로딩 스켈레톤 (#17).
   [974] 로딩 스켈레톤의 머리는 **본문과 같은 것**을 쓴다 — 제목은 lib/town/category-links.ts 한 곳에서 온다.
   [v4] 본문과 같은 순서: 흰 머리 → 카테고리 밑줄 탭 → 지역 칩 한 줄 → 월별 막대 → 단지 행(1px 선). 가운데 한 줄 760px. */
export default function SupplyLoading() {
  return (
    <PageShell>
      <div className="mx-auto w-full max-w-[760px]">
        <TownHero href="/supply" />
        <TownCategoryNav stick />

        {/* 지역 필터 칩 한 줄 */}
        <div className="mb-8 flex gap-1.5 overflow-hidden">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-16 shrink-0 rounded-full" />
          ))}
        </div>

        {/* 월별 물량 막대 */}
        <div className="mb-8">
          <Skeleton className="h-4 w-32 rounded" />
          <div className="mt-3 flex h-[110px] items-end gap-[3px]">
            {Array.from({ length: 24 }).map((_, i) => (
              <Skeleton
                key={i}
                className="min-w-[8px] flex-1 rounded-t-sm"
                style={{ height: `${20 + ((i * 37) % 80)}px` }}
              />
            ))}
          </div>
          <Skeleton className="mt-2 h-3 w-2/3 rounded" />
        </div>

        {/* 입주 예정 단지 */}
        <Skeleton className="h-4 w-28 rounded" />
        <ul className="mt-1 divide-y divide-line">
          {Array.from({ length: 6 }).map((_, i) => (
            <li key={i} className="flex items-center justify-between gap-3 py-3">
              <div className="min-w-0 flex-1">
                <Skeleton className="h-3.5 w-1/2 rounded" />
                <Skeleton className="mt-1.5 h-2.5 w-2/3 rounded" />
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1.5">
                <Skeleton className="h-3.5 w-12 rounded" />
                <Skeleton className="h-2.5 w-10 rounded" />
              </div>
            </li>
          ))}
        </ul>
      </div>
    </PageShell>
  );
}
