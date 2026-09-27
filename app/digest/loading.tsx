import { PageShell } from "../components/PageShell";
import { Skeleton } from "@/components/Skeleton";

/* 주간 다이제스트 로딩 스켈레톤 (#41).
   [v4] 본문과 같은 순서: 제목 한 줄 + 사실 한 줄 → 섹션 셋(제목 + 1px 선 행). 카드·썸네일 칸 없음, 가운데 한 줄 760px. */
export default function DigestLoading() {
  return (
    <PageShell>
      <div className="mx-auto flex w-full max-w-[760px] flex-col gap-8">
        <div>
          <Skeleton className="h-6 w-40 rounded" />
          <Skeleton className="mt-1.5 h-3.5 w-56 max-w-full rounded" />
        </div>

        {/* 섹션 셋 (뉴스·시세·이웃 글) */}
        {Array.from({ length: 3 }).map((_, s) => (
          <div key={s}>
            <Skeleton className="h-4 w-24 rounded" />
            <ul className="mt-1 divide-y divide-line">
              {Array.from({ length: 3 }).map((_, i) => (
                <li key={i} className="flex flex-col gap-1.5 py-3">
                  <Skeleton className="h-3.5 w-4/5 rounded" />
                  <Skeleton className="h-3 w-1/3 rounded" />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </PageShell>
  );
}
