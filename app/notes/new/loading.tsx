import { LoadingHint } from "@/app/components/ui/LoadingHint";
import { Skeleton } from "@/components/Skeleton";

/* [968 · 21] 임장노트 작성 폼 스켈레톤 — 탭바 가운데 "+" 의 목적지인데 page.tsx 가
   force-dynamic(?tpl 템플릿 조회)이라 탭 뒤 RSC 왕복 동안 빈 화면이었다.
   NoteForm 의 뿌리 구조(max-w-560 · px-5 → 상단 바 → 진행 바 → 안내 → 사진 버튼 →
   위치 카드 → AI 초안 → 음성 메모 → 방문 정보 → 현장 체크 → 체크리스트 → 고려사항 →
   메모+사진)를 같은 순서·간격(gap-3)·모서리로 미리 그린다. 높이는 실제 카드 기준으로
   고정한다(모바일 타입 램프): 상단 바 ≈ 62(py-3 + t-section 21 + t-caption 15 + 간격),
   안내 ≈ 43(py-3 + 12px 한 줄), 사진 버튼 44, 위치 카드 ≈ 58(py-3 + 13/12px 두 줄),
   AI 초안 ≈ 96, 음성 메모 ≈ 60, 방문 정보 ≈ 236(칩 4줄 + 방문일 + 날씨), 현장 체크 ≈ 300
   (9행 × h-9 + 만족도), 체크리스트/고려사항 ≈ 160, 메모 카드 ≈ 190(4줄 textarea + 버튼).
   서버 컴포넌트 — 클라이언트 JS 를 싣지 않는다. 스켈레톤은 "불러오는 중" 만 말한다. */

/** 카드 한 장 — 제목 줄 + 본문 자리(고정 높이) */
function CardSkeleton({ bodyH, titleW = "w-28" }: { bodyH: number; titleW?: string }) {
  return (
    <div aria-hidden className="card flex flex-col gap-2.5 p-4">
      <Skeleton className={`h-4 ${titleW} rounded`} />
      <Skeleton className="w-full rounded-[10px]" style={{ height: bodyH }} />
    </div>
  );
}

export default function NoteNewLoading() {
  return (
    <div className="mx-auto flex w-full max-w-[560px] flex-col px-5 pb-10">
      {/* 상단 바 — 닫기 · 제목/진행 문구 · 임시저장 */}
      <div
        aria-hidden
        className="glass sticky top-3.5 z-40 mt-3.5 flex h-[62px] items-center justify-between rounded-2xl px-4"
      >
        <Skeleton className="h-4 w-4 rounded" />
        <div className="flex flex-col items-center gap-1.5">
          <Skeleton className="h-[19px] w-20 rounded" />
          <Skeleton className="h-3 w-28 rounded" />
        </div>
        <Skeleton className="h-4 w-12 rounded" />
      </div>

      {/* 입력 진행 바 */}
      <div aria-hidden className="mt-2.5 h-1 rounded-sm bg-bg" />

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

        {/* AI 초안 제안 */}
        <Skeleton className="h-24 w-full rounded-2xl" />

        {/* 음성 메모 */}
        <Skeleton className="h-[60px] w-full rounded-[14px]" />

        {/* 방문 정보 — 칩 4줄 + 방문일 + 날씨 */}
        <CardSkeleton bodyH={196} titleW="w-16" />

        {/* 현장 체크 — 9행 + 종합 만족도 */}
        <CardSkeleton bodyH={260} titleW="w-36" />

        {/* 체크리스트 */}
        <CardSkeleton bodyH={120} titleW="w-40" />

        {/* 고려사항 */}
        <CardSkeleton bodyH={120} titleW="w-32" />

        {/* 메모 + 사진 */}
        <div aria-hidden className="card flex flex-col gap-2.5 p-4">
          <Skeleton className="h-4 w-24 rounded" />
          <Skeleton className="h-[96px] w-full rounded-xl" />
          <Skeleton className="h-11 w-full rounded-[10px]" />
        </div>
      </div>
    </div>
  );
}
