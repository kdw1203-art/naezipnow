import { PageShell } from "../components/PageShell";
import { Skeleton } from "@/components/Skeleton";

/* 알림 센터 로딩 스켈레톤 (#17) — [v4] 실제 화면과 같은 뼈대: 가운데 한 줄(760px) · 타이틀 → 밑줄 탭 → 1px 선 행 */
export default function NotificationsLoading() {
  return (
    <PageShell>
      <div className="mx-auto w-full max-w-[760px]">
        {/* 타이틀 + 우측 액션 */}
        <div className="flex items-center justify-between">
          <Skeleton className="h-7 w-20 rounded-lg" />
          <Skeleton className="h-4 w-16 rounded" />
        </div>

        {/* 밑줄 탭 */}
        <div className="mt-3 flex gap-5 overflow-hidden border-b border-line pb-2.5 pt-2.5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-4 w-12 shrink-0 rounded" />
          ))}
        </div>

        {/* 알림 행 — 제목 · 본문 · 메타 세 줄 */}
        <div className="mt-2 flex flex-col divide-y divide-line">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="py-3">
              <Skeleton className="h-[13px] w-3/4 rounded" />
              <Skeleton className="mt-[6px] h-[11px] w-full rounded" />
              <Skeleton className="mt-[7px] h-[9px] w-2/5 rounded" />
            </div>
          ))}
        </div>
      </div>
    </PageShell>
  );
}
