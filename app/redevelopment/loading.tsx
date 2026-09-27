import { PageShell } from "../components/PageShell";
import { Skeleton } from "@/components/Skeleton";
import { TownCategoryNav } from "@/app/town/TownCategoryNav";
import { TownHero } from "@/app/town/TownHero";

/* 정비사업 지도 로딩 스켈레톤 (#41).
   [974] 로딩 스켈레톤의 머리는 **본문과 같은 것**을 쓴다 — 제목은 lib/town/category-links.ts 한 곳에서 온다.
   [v4] 본문과 같은 순서: 흰 머리 → 카테고리 밑줄 탭 → 검색 줄 · 칩 두 줄 → 보기 밑줄 탭 → 지도 캔버스.
   폭은 본문과 같은 최대 1080px(지도 화면 예외). 예전 사업장 카드 격자는 본문에서 목록 보기(행)로 옮겨 뺐다. */
export default function RedevelopmentLoading() {
  return (
    <PageShell wide>
      <div className="mx-auto flex w-full max-w-[1080px] flex-col">
        <TownHero href="/redevelopment" />
        <TownCategoryNav stick />

        <div className="flex flex-col gap-3">
          <div className="flex gap-2">
            <Skeleton className="h-10 min-w-[160px] flex-1 rounded-lg" />
            <Skeleton className="h-10 w-24 rounded-full" />
          </div>
          {Array.from({ length: 2 }).map((_, r) => (
            <div key={r} className="flex gap-1.5 overflow-hidden">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-8 w-20 shrink-0 rounded-full" />
              ))}
            </div>
          ))}
          <div className="flex gap-4 border-b border-line pb-2.5">
            <Skeleton className="h-5 w-10 rounded" />
            <Skeleton className="h-5 w-10 rounded" />
            <Skeleton className="h-5 w-10 rounded" />
          </div>

          {/* 지도 캔버스 */}
          <Skeleton className="h-[440px] w-full rounded-lg md:h-[560px]" />
        </div>
      </div>
    </PageShell>
  );
}
