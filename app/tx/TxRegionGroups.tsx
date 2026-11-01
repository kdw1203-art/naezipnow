"use client";

/* [1092 · 비용 · 화면] 지역별 실거래 구간 허브의 지역 칸(249곳 · 시/도별 details) — 서버는 압축 행만 넘기고 칸은 여기서 그린다.
   왜: 서버 컴포넌트로 그린 칸 249개가 HTML 147KB + RSC 그 이상으로 실려 허브 한 장이 498KB 였다(운영 실측 · 폰 첫 화면이 가장
   느린 허브). 클라이언트 컴포넌트는 RSC 에 props(지역당 40B 안팎)만 실린다. 첫 화면 HTML(SSR) · 링크 · details 접힘은 그대로 —
   크롤러 · JS 없는 환경이 보는 것은 같다(동 화면 DongComplexTable 과 같은 방식). */
import Link from "@/app/components/IntentLink";

/** [슬러그, 이름, 거래 건수, 구간 수] */
export type TxRegionWire = [string, string, number, number];
/** [시/도, 지역들] */
export type TxSidoGroupWire = [string, TxRegionWire[]];

export function TxRegionGroups({ groups, maxTx }: { groups: TxSidoGroupWire[]; maxTx: number }) {
  return (
    <div className="mt-3 flex flex-col gap-2 max-md:mt-2">
      {groups.map(([sido, items], gi) => {
        const groupTx = items.reduce((sum, r) => sum + r[2], 0);
        return (
          <details key={sido} open={gi === 0} className="group rounded-lg border border-border bg-surface">
            <summary className="flex cursor-pointer list-none items-baseline justify-between gap-3 px-3 py-2.5 [&::-webkit-details-marker]:hidden">
              <span className="t-body font-bold text-ink">
                {sido} <span className="t-sub font-medium text-text-3">{items.length}개 지역</span>
              </span>
              <span className="shrink-0 t-sub text-text-3">
                {groupTx.toLocaleString("ko-KR")}건{" "}
                {/* dead-control-ok: 네이티브 details 의 펼침 표식(회전) — 1074 그대로 */}
                <span aria-hidden className="ml-1 inline-block transition-transform group-open:rotate-180">
                  ▾
                </span>
              </span>
            </summary>
            <div className="grid grid-cols-1 gap-2 px-3 pb-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {items.map(([slug, name, txCount, cells]) => (
                <Link
                  key={slug}
                  prefetch={false}
                  href={`/tx/${encodeURIComponent(slug)}`}
                  className="tile flex flex-col gap-1.5 rounded-lg border border-border px-3 py-2.5 t-body"
                >
                  {/* [1074] 여러 칸 줄(sm+)에서는 이름 한 줄 · 그 아래 건수 한 줄로 쌓아 모든 칸이 같은 높이. 폰(한 칸 줄)은 한 줄 */}
                  <span className="flex min-w-0 items-baseline justify-between gap-3 sm:flex-col sm:items-start sm:justify-start sm:gap-0.5">
                    <span className="font-bold text-ink">{name}</span>
                    <span className="shrink-0 t-sub tabular-nums text-text-3">
                      {txCount.toLocaleString("ko-KR")}건 · 구간 {cells}
                    </span>
                  </span>
                  {maxTx > 0 && (
                    <span aria-hidden className="block h-[3px] overflow-hidden rounded-full bg-bg">
                      <span
                        className="block h-full rounded-full bg-primary/45"
                        style={{ width: `${Math.max(3, Math.round((txCount / maxTx) * 100))}%` }}
                      />
                    </span>
                  )}
                </Link>
              ))}
            </div>
          </details>
        );
      })}
    </div>
  );
}
