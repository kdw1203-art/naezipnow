import { PageShell } from "../components/PageShell";
import { Skeleton } from "@/components/Skeleton";
import { TownCategoryNav } from "@/app/town/TownCategoryNav";
import { TownHero } from "@/app/town/TownHero";
import { townBreadcrumb } from "@/lib/town/category-links";

/* 공매·경매 로딩 스켈레톤 (#41) — 소스 탭 + 요약 + 필터 칩 + 섹션 카드 + 물건 목록
   (형제 페이지 /supply 에는 있고 /auctions 에는 없던 로딩 상태 불일치 해소) */
export default function AuctionsLoading() {
  return (
    /* [974] 로딩 스켈레톤의 머리는 **본문과 같은 것**을 쓴다.
   예전엔 여기만 옛 패턴(PageShell title = 제목이 카테고리 줄 위)이었고 브레드크럼
   문구도 달라서, 로딩 중과 로딩 후가 서로 다른 화면처럼 보였다. 소유자가 캡처한
   /qna 화면이 정확히 이 로딩 상태다("홈 › 동네이야기 › 단지 Q&A" + 카테고리 줄 위 제목).
   제목·한 줄·브레드크럼 모두 lib/town/category-links.ts 한 곳에서 온다. */
    <PageShell breadcrumb={townBreadcrumb("/auctions")} wide>
      <TownHero href="/auctions" />
      <TownCategoryNav stick />

      {/* 소스 탭 (공매/경매) */}
      <div className="mb-4 flex gap-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-9 w-24 rounded-full" />
        ))}
      </div>

      <Skeleton className="mb-5 h-4 w-2/3 rounded" />

      {/* 지역·유형 필터 칩 */}
      <div className="mb-5 flex flex-wrap gap-1.5">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-7 w-16 rounded-full" />
        ))}
      </div>

      {/* 요약 섹션 카드 3열 */}
      <div className="mb-6 grid grid-cols-1 gap-3 md:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="card p-[var(--pad-card)]">
            <Skeleton className="h-4 w-24 rounded" />
            <Skeleton className="mt-3 h-8 w-1/2 rounded" />
            <Skeleton className="mt-2 h-3 w-3/4 rounded" />
          </div>
        ))}
      </div>

      {/* 물건 목록 */}
      <div className="card p-[var(--pad-card)]">
        <Skeleton className="h-4 w-28 rounded" />
        <div className="mt-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center justify-between gap-3 border-b border-border py-3 last:border-0"
            >
              <div className="min-w-0 flex-1">
                <Skeleton className="h-3.5 w-1/2 rounded" />
                <Skeleton className="mt-1.5 h-2.5 w-2/3 rounded" />
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1.5">
                <Skeleton className="h-3.5 w-12 rounded" />
                <Skeleton className="h-2.5 w-10 rounded" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </PageShell>
  );
}
