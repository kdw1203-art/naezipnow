import { PageShell } from "../components/PageShell";
import { Skeleton } from "@/components/Skeleton";
import { TownCategoryNav } from "@/app/town/TownCategoryNav";
import { TownHero } from "@/app/town/TownHero";

/* 청약 센터 로딩 스켈레톤 — 4개 카테고리 페이지 중 유일하게 없었다(2026-08-22).
   초기 렌더가 청약홈 업스트림 조회를 기다리는, 형제 중 가장 느린 페이지인데
   그동안 빈 화면이 나갔다. 실제 레이아웃을 그대로 흉내낸다.
   [974] 로딩 스켈레톤의 머리는 **본문과 같은 것**을 쓴다 — 제목은 lib/town/category-links.ts 한 곳에서 온다.
   [v4] 본문과 같은 순서: 흰 머리(TownHero) → 카테고리 밑줄 탭 → 앞으로 7일 접수 행 → 밑줄 탭 + 검색 + 지역 칩 한 줄 → 표.
   브레드크럼·요약 타일 3칸·카드 테두리는 본문에서 빠졌으므로 여기서도 뺐다. 가운데 한 줄 760px. */
export default function ApplyLoading() {
  return (
    <PageShell>
      <div className="mx-auto w-full max-w-[760px]">
        <TownHero href="/apply" />
        <TownCategoryNav stick />

        <div className="flex flex-col gap-8">
          {/* 앞으로 7일 접수 */}
          <div>
            <Skeleton className="h-4 w-28 rounded" />
            <ul className="mt-1 divide-y divide-line">
              {Array.from({ length: 3 }).map((_, i) => (
                <li key={i} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <Skeleton className="h-3.5 w-1/2 rounded" />
                    <Skeleton className="mt-1.5 h-3 w-1/4 rounded" />
                  </div>
                  <Skeleton className="h-3.5 w-16 shrink-0 rounded" />
                </li>
              ))}
            </ul>
          </div>

          {/* 경쟁률 · 특별공급 */}
          <div className="flex flex-col gap-3">
            <Skeleton className="h-4 w-32 rounded" />
            <div className="flex gap-4 border-b border-line pb-2.5">
              <Skeleton className="h-5 w-14 rounded" />
              <Skeleton className="h-5 w-16 rounded" />
            </div>
            <div className="flex gap-1.5">
              <Skeleton className="h-10 min-w-[160px] flex-1 rounded-lg" />
              <Skeleton className="h-10 w-20 rounded-lg" />
            </div>
            <div className="flex gap-1.5 overflow-hidden">
              {Array.from({ length: 9 }).map((_, i) => (
                <Skeleton key={i} className="h-8 w-14 shrink-0 rounded-full" />
              ))}
            </div>
            <div>
              <Skeleton className="h-3 w-full rounded" />
              {Array.from({ length: 8 }).map((_, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between gap-3 border-b border-divider py-3 last:border-0"
                >
                  <div className="min-w-0 flex-1">
                    <Skeleton className="h-3.5 w-2/3 rounded" />
                  </div>
                  <Skeleton className="h-3.5 w-10 shrink-0 rounded" />
                  <Skeleton className="h-3.5 w-10 shrink-0 rounded" />
                  <Skeleton className="h-3.5 w-12 shrink-0 rounded" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </PageShell>
  );
}
