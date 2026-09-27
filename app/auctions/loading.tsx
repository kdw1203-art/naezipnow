import { PageShell } from "../components/PageShell";
import { Skeleton } from "@/components/Skeleton";
import { TownCategoryNav } from "@/app/town/TownCategoryNav";
import { TownHero } from "@/app/town/TownHero";

/* 공매·경매 로딩 스켈레톤 (#41) — 형제 페이지 /supply 에는 있고 /auctions 에는 없던 로딩 상태 불일치 해소.
   [974] 로딩 스켈레톤의 머리는 **본문과 같은 것**을 쓴다 — 제목은 lib/town/category-links.ts 한 곳에서 온다.
   [v4] 본문과 같은 순서: 흰 머리 → 카테고리 밑줄 탭 → 용도·지역 칩 한 줄씩 → 물건 행(1px 선). 가운데 한 줄 760px.
   예전 소스 탭(공매/경매 — #23 에서 폐지)·요약 카드 3열은 본문에 없으므로 뺐다. */
export default function AuctionsLoading() {
  return (
    <PageShell>
      <div className="mx-auto w-full max-w-[760px]">
        <TownHero href="/auctions" />
        <TownCategoryNav stick />

        <div className="flex flex-col gap-2">
          {Array.from({ length: 2 }).map((_, r) => (
            <div key={r} className="flex gap-1.5 overflow-hidden">
              {Array.from({ length: 7 }).map((_, i) => (
                <Skeleton key={i} className="h-8 w-16 shrink-0 rounded-full" />
              ))}
            </div>
          ))}
        </div>

        <div className="mt-6">
          <Skeleton className="h-4 w-28 rounded" />
          <ul className="mt-1 divide-y divide-line">
            {Array.from({ length: 8 }).map((_, i) => (
              <li key={i} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <Skeleton className="h-3.5 w-1/2 rounded" />
                  <Skeleton className="mt-1.5 h-3 w-2/3 rounded" />
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1.5">
                  <Skeleton className="h-3.5 w-14 rounded" />
                  <Skeleton className="h-3 w-10 rounded" />
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </PageShell>
  );
}
