import { LoadingHint } from "@/app/components/ui/LoadingHint";
import { Skeleton } from "@/components/Skeleton";

/* [968 · 21] 임장노트 작성 폼 스켈레톤 — 탭바 가운데 "+" 의 목적지인데 page.tsx 가
   force-dynamic(?tpl 템플릿 조회)이라 탭 뒤 RSC 왕복 동안 빈 화면이었다.
   [1005 · B6] 984 이후의 **실제 모양**으로 다시 그린다 — 예전 스켈레톤은 단계 이전의
   한 화면 3,000px 배치(현장 체크·체크리스트·고려사항이 줄줄이)라 첫 페인트와
   실제 1단계가 달라 레이아웃이 뛰었다. 지금 첫 화면은:
   상단 바(≈60) → 단계 진행 바(4) → 3단계 탭(52) + 단계 제목 줄(≈28) → 안내(43) →
   사진 버튼 2개(44) → 위치 카드(58) → 도우미 칩 줄(40) → 방문 정보 카드(≈236)
   → CTA 블록(고지 + 버튼 ≈ 96). 높이는 실제 카드 기준(모바일 타입 램프)으로 고정한다.
   서버 컴포넌트 — 클라이언트 JS 를 싣지 않는다. 스켈레톤은 "불러오는 중" 만 말한다. */

export default function NoteNewLoading() {
  return (
    <div className="mx-auto flex w-full max-w-[600px] flex-col px-5 pb-10">
      {/* 상단 바 — 닫기 · 제목/단계 문구 · 임시저장 */}
      <div
        aria-hidden
        className="glass sticky top-3.5 z-40 mt-3.5 flex h-[60px] items-center justify-between rounded-2xl px-4"
      >
        <Skeleton className="h-4 w-4 rounded" />
        <div className="flex flex-col items-center gap-1.5">
          <Skeleton className="h-[19px] w-20 rounded" />
          <Skeleton className="h-3 w-28 rounded" />
        </div>
        <div className="flex flex-col items-end gap-1">
          <Skeleton className="h-4 w-12 rounded" />
          <Skeleton className="h-2.5 w-16 rounded" />
        </div>
      </div>

      {/* 단계 진행 바 */}
      <div aria-hidden className="mt-2.5 h-1 rounded-sm bg-bg" />

      {/* 3단계 탭 + 단계 제목 줄 */}
      <div aria-hidden className="mt-3">
        <div className="grid h-[52px] grid-cols-3 gap-1 rounded-[12px] bg-bg p-1">
          <Skeleton className="h-11 rounded-[9px]" />
          <div className="h-11" />
          <div className="h-11" />
        </div>
        <div className="mt-2 flex h-7 items-center justify-between gap-2">
          <Skeleton className="h-4 w-44 rounded" />
          <Skeleton className="h-6 w-24 rounded-full" />
        </div>
      </div>

      <LoadingHint className="mt-3" />

      <div className="mt-3.5 flex flex-col gap-3">
        {/* 로그인 없이 작성 안내 */}
        <Skeleton className="h-[43px] w-full rounded-[14px]" />

        {/* 사진 먼저 담기 · 촬영 */}
        <div aria-hidden className="flex gap-2">
          <Skeleton className="h-11 flex-1 rounded-[10px]" />
          <Skeleton className="h-11 w-24 rounded-[10px]" />
        </div>

        {/* 위치 카드 */}
        <div aria-hidden className="card flex h-[58px] items-center gap-2 rounded-[14px] px-3.5">
          <Skeleton className="h-4 w-4 rounded" />
          <div className="flex flex-1 flex-col gap-1.5">
            <Skeleton className="h-[13px] w-32 rounded" />
            <Skeleton className="h-3 w-44 rounded" />
          </div>
          <Skeleton className="h-4 w-4 rounded" />
        </div>

        {/* 도우미 한 줄 탭 — AI 초안 · 음성 메모 · 현장 브리핑 */}
        <div aria-hidden className="flex h-10 items-center gap-1.5">
          <Skeleton className="h-3 w-9 rounded" />
          <Skeleton className="h-10 w-[74px] rounded-full" />
          <Skeleton className="h-10 w-[82px] rounded-full" />
          <Skeleton className="h-10 w-[90px] rounded-full" />
        </div>

        {/* 방문 정보 — 칩 3줄 + 방문일 + 날씨 */}
        <div aria-hidden className="card flex flex-col gap-2.5 p-4">
          <div className="flex items-center justify-between">
            <Skeleton className="h-4 w-16 rounded" />
            <Skeleton className="h-3 w-14 rounded" />
          </div>
          <Skeleton className="h-[196px] w-full rounded-[10px]" />
        </div>
      </div>

      {/* 하단 CTA — 고지 + 이전 · 여기까지 저장 · 다음 단계 */}
      <div aria-hidden className="mt-4 flex flex-col gap-2">
        <Skeleton className="h-8 w-full rounded" />
        <div className="flex gap-2">
          <Skeleton className="h-10 w-[72px] rounded-xl" />
          <Skeleton className="h-10 flex-1 rounded-xl" />
          <Skeleton className="h-10 flex-1 rounded-xl" />
        </div>
        <Skeleton className="mx-auto h-3 w-52 rounded" />
      </div>
    </div>
  );
}
