/* [1026 · 지역 시세] 전세가율·갭 스크리너 — 폰(<md) 결과는 10열 표 대신 **카드 목록**(전 캡처: 폰에서 표가 가로로 잘려 지수 열이
   화면 밖이었다). 한 장 = 지역(→ 기존 /region/[id] "단지 보기") · 전세가율 막대(최고 대비 · 표와 같은 식) · 평균 매매 · 갭(실측/추정 배지 그대로) ·
   지수 변화(Delta 표준). 값은 표와 같은 행 그대로 — 새 계산 없음. 몇 장을 그릴지는 GapScreener 가 정한다(20장 + 더 보기).
   데스크톱(md+)은 RankTable 그대로. */
import Link from "next/link";
import { formatKrwShort } from "@/lib/market/format";
import { Delta } from "@/app/components/num/Delta";
import { effectiveGap } from "./screener-model";
import type { Row } from "./RankTable";

export function RankCards({ rows, maxRatio }: { rows: readonly Row[]; maxRatio: number }) {
  return (
    <ol className="lq-panel m-0 list-none divide-y p-0" data-tone="plain" aria-label="결과 지역">
      {rows.map((r) => {
        const gap = effectiveGap(r);
        const w = maxRatio > 0 ? Math.min(100, Math.round((r.ratio / maxRatio) * 100)) : 0;
        return (
          <li key={r.regionId}>
            <Link href={`/region/${r.regionId}`} className="flex min-h-10 flex-col gap-1 py-2.5 no-underline">
              <span className="flex items-baseline justify-between gap-2">
                <b className="min-w-0 truncate t-body text-ink">{r.name}</b>
                <span className="shrink-0 t-sub tabular-nums">
                  <span className="t-caption text-text-3">지수 </span>
                  <Delta pct={r.saleChange ?? null} digits={2} srContext="지난달보다" />
                </span>
              </span>
              <span className="flex items-center gap-2">
                <span className="block h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-line" aria-hidden="true">
                  <i className="block h-full rounded-full bg-success" style={{ width: `${w}%` }} />
                </span>
                <b className="shrink-0 t-num t-sub text-ink">전세가율 {r.ratio.toFixed(1)}%</b>
              </span>
              <span className="flex flex-wrap items-center gap-x-2 t-sub text-text-2">
                <span>평균 매매 {r.avgSale && r.avgSale > 0 ? formatKrwShort(r.avgSale) : "—"}</span>
                <span aria-hidden="true" className="text-text-3">
                  ·
                </span>
                <span className="inline-flex items-center gap-1">
                  갭 <b className="tabular-nums text-primary">{gap !== null ? formatKrwShort(gap) : "—"}</b>
                  {gap !== null &&
                    (r.measuredGap !== undefined ? (
                      <span className="t-caption rounded bg-success-soft px-1 py-px font-bold text-success">실측</span>
                    ) : (
                      <span className="t-caption rounded bg-bg px-1 py-px font-bold text-text-3">추정</span>
                    ))}
                </span>
              </span>
            </Link>
          </li>
        );
      })}
    </ol>
  );
}
