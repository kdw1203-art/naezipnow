import { PageShell } from "../../components/PageShell";
import { Skeleton } from "@/components/Skeleton";

/* 고도화 1 — 단지 상세 스켈레톤. 곁다리 조회가 도는 동안 흰 화면 대신 실제 레이아웃을
   미리 그린다. 스켈레톤은 "로딩 중"이라는 사실만 말한다 — 가짜 수치를 그리지 않는다.

   [968 · 5] 실제 page.tsx 의 블록 순서·간격을 그대로 따르고 높이를 고정해 교체 시점의 이동을 줄인다.
   [v4 · 한 화면 한 가지] 새 순서(가운데 한 줄 · 최대 760px): 브레드크럼 한 줄(24) → 이름(t-title) + 관심 40px →
   사실 한 줄 → 대표가(t-display) + 사실 한 줄 → 채움 버튼 48 + 보조 두 개 44 → 밑줄 탭(44) → 요약 행(56)들.
   네이비 히어로·지표 6칸·단지 정보 격자·데스크탑 사이드 카드 자리는 화면에서 없어져 같이 뺐다.
   이 파일은 클라이언트 전환(RSC 왕복) 때 보인다 — ISR 미스 첫 요청은 정적 생성이라
   스트리밍되지 않는다(page.tsx [968 · 1] 주석). */

export default function ComplexDetailLoading() {
  return (
    <PageShell>
      <div className="mx-auto flex w-full max-w-[760px] flex-col gap-8" aria-busy="true">
        <div>
          {/* 브레드크럼 한 줄 */}
          <Skeleton className="h-6 w-32 rounded" />
          {/* 이름 + 관심(40px) */}
          <div className="mt-1.5 flex items-start justify-between gap-3">
            <Skeleton className="h-[23px] w-2/3 max-w-[260px] rounded" />
            <Skeleton className="h-10 w-10 rounded-lg" />
          </div>
          {/* 사실 한 줄 */}
          <Skeleton className="mt-1 h-[18px] w-4/5 max-w-[420px] rounded" />
          {/* 대표가 + 사실 한 줄 */}
          <Skeleton className="mt-6 h-[28px] w-44 rounded md:h-9" />
          <Skeleton className="mt-1.5 h-[18px] w-56 max-w-full rounded" />
          {/* 행동 — 채움 1 + 보조 2 */}
          <Skeleton className="mt-6 h-12 w-full rounded-lg" />
          <div className="mt-2 grid grid-cols-2 gap-2">
            <Skeleton className="h-11 rounded-lg" />
            <Skeleton className="h-11 rounded-lg" />
          </div>
        </div>

        {/* 밑줄 탭 5개 + 요약 행 */}
        <div className="flex flex-col gap-4">
          <div className="flex gap-2 border-b border-line pb-2.5 pt-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-5 flex-1 rounded" />
            ))}
          </div>
          <div className="divide-y divide-line">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex h-14 items-center justify-between gap-3">
                <div className="flex flex-col gap-1.5">
                  <Skeleton className="h-4 w-24 rounded" />
                  <Skeleton className="h-3 w-40 rounded" />
                </div>
                <Skeleton className="h-4 w-14 rounded" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </PageShell>
  );
}
