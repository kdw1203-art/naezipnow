import { PageShell } from "../../components/PageShell";
import { Skeleton } from "@/components/Skeleton";

/* 고도화 1 — 단지 상세 스켈레톤. 곁다리 조회가 도는 동안 흰 화면 대신 실제 레이아웃을
   미리 그린다. 스켈레톤은 "로딩 중"이라는 사실만 말한다 — 가짜 수치를 그리지 않는다.

   [968 · 5] 실제 page.tsx 의 블록 순서·간격·모서리·열 수를 그대로 따르고 높이를 고정해 교체 시점의 이동을 줄인다.
   [1024 · 단지 상세 v2] 시안(mock1024/complex-d)대로 바뀐 순서 — 브레드크럼 → 흰 머리(PageHead: 40px 아이콘 칩 + 제목 +
   한 줄 | 관심·공유) → 개요 스트립 8칸(폰 4×2) → 타입 탭 → 추이 카드(토글·기간 칩·머리·220px 그래프) → 최근 실거래 표.
   네이비 히어로·지표 6칸·단지 정보 격자 스켈레톤은 걷었다(그 블록이 없어졌다).
   이 파일은 클라이언트 전환(RSC 왕복) 때 보인다 — ISR 미스 첫 요청은 정적 생성이라 스트리밍되지 않는다(page.tsx [968 · 1]). */

export default function ComplexDetailLoading() {
  return (
    <PageShell>
      {/* 브레드크럼 칩 2개(시군구 · 읍면동) */}
      <div className="flex flex-wrap gap-1.5">
        <Skeleton className="h-[26px] w-20 rounded-full" />
        <Skeleton className="h-[26px] w-16 rounded-full" />
      </div>

      {/* 머리 — 아이콘 칩 40 + 제목 + 부제(md) | 알약 2개, 아래 캡션 줄 */}
      <div className="mt-3 flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <Skeleton className="h-10 w-10 shrink-0 rounded-xl" />
            <div className="min-w-0">
              <Skeleton className="h-[24px] w-40 rounded" />
              <Skeleton className="mt-1 hidden h-[16px] w-64 rounded md:block" />
            </div>
          </div>
          <div className="flex gap-2">
            <Skeleton className="h-10 w-[92px] rounded-full" />
            <Skeleton className="h-10 w-[72px] rounded-full" />
          </div>
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          <Skeleton className="h-[14px] w-40 rounded" />
          <Skeleton className="h-[14px] w-28 rounded" />
          <Skeleton className="h-[14px] w-32 rounded" />
        </div>
      </div>

      {/* 개요 스트립 8칸 — 폰 4×2 · md 8×1 (실제 cx-strip 과 같은 격자) */}
      <div className="card mt-3 grid grid-cols-4 rounded-2xl md:grid-cols-8">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex flex-col gap-1.5 px-2.5 py-2">
            <Skeleton className="h-[10px] w-8 rounded" />
            <Skeleton className="h-[18px] w-12 rounded" />
          </div>
        ))}
      </div>

      {/* 본문 | 레일 */}
      <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-5">
        <div className="flex flex-col gap-2">
          {/* 타입 탭 3개(40px) */}
          <div className="flex gap-1.5">
            {[76, 76, 76].map((w, i) => (
              <Skeleton key={i} className="h-10 rounded-lg" style={{ width: w }} />
            ))}
          </div>
          {/* 추이 카드 — 토글·기간 칩 · 캡션 · 머리 큰 숫자 · 220px 그래프 · 범례 */}
          <div className="card rounded-2xl px-4 py-3.5 max-md:px-3.5 max-md:py-3">
            <div className="flex items-center justify-between">
              <Skeleton className="h-8 w-40 rounded-full" />
              <Skeleton className="h-8 w-44 rounded-full" />
            </div>
            <Skeleton className="mt-2 h-[12px] w-56 max-w-full rounded" />
            <Skeleton className="mt-3 h-[12px] w-36 rounded" />
            <Skeleton className="mt-1 h-[26px] w-32 rounded" />
            <Skeleton className="mt-2 h-[220px] w-full rounded-lg" />
            <Skeleton className="mt-2 h-[12px] w-48 rounded" />
          </div>
          {/* 최근 실거래 표 — 제목 줄 + 행 8개 */}
          <div className="card mt-1 rounded-2xl px-4 py-3.5 max-md:px-3.5 max-md:py-3">
            <div className="flex items-center justify-between">
              <Skeleton className="h-[18px] w-24 rounded" />
              <Skeleton className="h-[12px] w-36 rounded" />
            </div>
            <div className="mt-2 flex flex-col gap-2.5">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-[18px] w-full rounded" />
              ))}
            </div>
          </div>
        </div>
        {/* 데스크탑 우측 — 요약 4칸 + 행동 3개 */}
        <div className="hidden flex-col gap-3 lg:flex">
          <div className="card rounded-2xl px-4 py-3.5">
            <div className="grid grid-cols-2 gap-x-3 gap-y-2.5">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-[54px] rounded-xl" />
              ))}
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-10 rounded-lg" />
              ))}
            </div>
          </div>
        </div>
      </div>
    </PageShell>
  );
}
