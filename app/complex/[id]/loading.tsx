import { PageShell } from "../../components/PageShell";
import { Skeleton } from "@/components/Skeleton";

/* 고도화 1 — 단지 상세 스켈레톤. 곁다리 조회가 도는 동안 흰 화면 대신 실제 레이아웃을
   미리 그린다. 스켈레톤은 "로딩 중"이라는 사실만 말한다 — 가짜 수치를 그리지 않는다.

   [968 · 5] 예전 모양(2열 KPI 4칸 + 표)은 실제 화면(브레드크럼 → 네이비 히어로 → 행동
   알약 → 3열 KPI 6칸 → 스펙 시트 → 탭 칩 → 요약 카드)과 달라 전환 순간 화면이 통째로
   재배치됐다. 실제 page.tsx 의 블록 순서·간격(mt-3/mt-4)·모서리·열 수를 그대로 따르고,
   높이를 고정해 교체 시점의 이동을 줄인다. 높이 근거(모바일, 타입 램프 기준):
   히어로 ≈ 168px(py-4 + 제목 26 + 부제 20 + 캡션 15 + 시세 22 + 칩 한 줄 26 + 간격),
   KPI 칸 ≈ 77px(py-2.5 + 캡션 15 + t-section 21 + 캡션 15), 알약·탭 ≈ 38px.
   이 파일은 클라이언트 전환(RSC 왕복) 때 보인다 — ISR 미스 첫 요청은 정적 생성이라
   스트리밍되지 않는다(page.tsx [968 · 1] 주석). */

/** 네이비 면 위의 스켈레톤 막대 — 라이트 토큰(--divider)은 남색 위에서 안 보여 한지 틴트를 쓴다
 *  (.brand-photo-chip 과 같은 rgba(246,241,231,.14)). */
function DarkBar({ className }: { className: string }) {
  return (
    <div
      aria-hidden
      className={`rounded-md ${className}`}
      style={{ background: "rgba(246, 241, 231, 0.14)" }}
    />
  );
}

export default function ComplexDetailLoading() {
  return (
    <PageShell>
      {/* 브레드크럼 칩 3개(‹ 지도 · 동 · 단지명) */}
      <div className="flex flex-wrap gap-1.5">
        <Skeleton className="h-[26px] w-14 rounded-full" />
        <Skeleton className="h-[26px] w-20 rounded-full" />
        <Skeleton className="h-[26px] w-28 rounded-full" />
      </div>

      {/* 네이비 히어로 — 단지명·지역·팔로우·최근 실거래 평균·스펙 칩 */}
      <div
        aria-hidden
        className="brand-navy-card mt-3 h-[168px] rounded-[18px] px-4 py-4 sm:px-5 md:h-[176px]"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <DarkBar className="h-[26px] w-2/3 max-w-[260px]" />
            <DarkBar className="mt-1.5 h-[18px] w-24" />
          </div>
          <DarkBar className="h-[26px] w-[92px] rounded-full" />
        </div>
        <div className="mt-3">
          <DarkBar className="h-[15px] w-[88px]" />
          <DarkBar className="mt-1 h-[22px] w-40" />
        </div>
        <div className="mt-3 flex gap-1">
          <DarkBar className="h-[26px] w-[88px] rounded-full" />
          <DarkBar className="h-[26px] w-16 rounded-full" />
          <DarkBar className="h-[26px] w-14 rounded-full" />
        </div>
      </div>

      {/* 행동 알약 3개(노트 쓰기 · 시장 보기 · 공유) */}
      <div className="mt-3 flex flex-wrap gap-2">
        <Skeleton className="h-[38px] w-40 rounded-full" />
        <Skeleton className="h-[38px] w-28 rounded-full" />
        <Skeleton className="h-[38px] w-20 rounded-full" />
      </div>

      {/* 지표 6칸 — 3열(md 6열), 실제와 같은 gap-1.5·둥근 모서리 */}
      <div className="mt-3 grid grid-cols-3 gap-1.5 md:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="card flex h-[77px] flex-col items-center justify-center gap-1.5 rounded-xl px-2.5">
            <Skeleton className="h-[10px] w-8 rounded" />
            <Skeleton className="h-[18px] w-14 rounded" />
            <Skeleton className="h-[10px] w-12 rounded" />
          </div>
        ))}
      </div>

      {/* 스펙 시트 — 제목 줄 + 항목 8줄(모바일 1열·sm 2열·lg 3열) */}
      <div className="card mt-3 rounded-2xl px-4 py-3">
        <div className="mb-1 flex items-baseline justify-between">
          <Skeleton className="h-[18px] w-20 rounded" />
          <Skeleton className="h-[12px] w-10 rounded" />
        </div>
        <div className="grid grid-cols-1 gap-x-5 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="flex h-[31px] items-center justify-between gap-3 border-b border-divider last:border-b-0"
            >
              <Skeleton className="h-[12px] w-12 rounded" />
              <Skeleton className="h-[12px] w-28 rounded" />
            </div>
          ))}
        </div>
      </div>

      {/* 본문 — 탭 칩 5개 + 요약 카드(AI 요약·차트 자리) */}
      <div className="mt-4 grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-1.5">
            {[56, 56, 56, 56, 72].map((w, i) => (
              <Skeleton key={i} className="h-[38px] rounded-full" style={{ width: w }} />
            ))}
          </div>
          <div className="card rounded-[14px] px-[15px] py-3.5">
            <Skeleton className="h-[18px] w-36 rounded" />
            <Skeleton className="mt-2.5 h-3.5 w-full rounded" />
            <Skeleton className="mt-2 h-3.5 w-5/6 rounded" />
            <Skeleton className="mt-2 h-3.5 w-2/3 rounded" />
          </div>
          <div className="card h-[212px] rounded-[14px] px-[15px] py-3.5">
            <Skeleton className="h-[12px] w-32 rounded" />
            <Skeleton className="mt-2 h-[26px] w-24 rounded" />
            <Skeleton className="mt-3 h-[132px] w-full rounded-lg" />
          </div>
        </div>
        {/* 데스크탑 우측 — 한눈에 보기 카드 */}
        <div className="hidden flex-col gap-3 lg:flex">
          <div className="card rounded-[18px] px-4 py-4">
            <Skeleton className="h-[18px] w-24 rounded" />
            <div className="mt-2 grid grid-cols-2 gap-1.5">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-[54px] rounded-xl" />
              ))}
            </div>
          </div>
        </div>
      </div>
    </PageShell>
  );
}
