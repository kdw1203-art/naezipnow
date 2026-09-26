import type { BandCell } from "@/lib/market/tx-bands";
import { formatKrwWon } from "@/lib/format/krw";
import { formatEokMan } from "@/lib/format/eok-man";
import { Explain } from "@/app/components/explain/Explain";

/* [1009 · A] 면적대별 평단가·중앙값·거래량 표 — 페이지에서 떼어 냈다(임시 하네스가 실데이터 모양으로 그려 확인하려고).
   바뀐 것: 평단가 1억 이상의 억 미전환("12,000만/평") → 표준 표기, 머리 ⓘ(평단가·지역 분위 — 이 화면 계산과 같은 말).
   타입만 가져온다(lib/market/tx-bands 는 server-only — 이 부품은 서버 화면에서만 쓴다). */

/** ⓘ — 계산은 tx_band_landing/complex 뷰(국토교통부 실거래)와 페이지의 topPercentOf 그대로 */
export const PYEONG_HOW = ["면적대마다 실거래 금액 ÷ 전용면적 평(3.3㎡)의 평균이에요 — 평균이라 한 건의 값과는 달라요."];
const RANK_HOW = ["내집나우에 수록된 지역들 중 같은 면적대 평단가를 줄 세운 순위예요(수록 지역 8곳 이상일 때만)."];

/** [970 · B-31] 원 → "8.5억"(0.1 단위) — 같은 화면의 지역 카드가 "short"(28.8억). 중앙값(요약)에 쓴다 */
function eok(won: number): string {
  return formatKrwWon(won, { style: "short" });
}

/** 원/평 → "3,500만/평" · "1억 2,000만/평" (없으면 "—").
    [1009 · A] 예전엔 1억 이상도 "12,000만/평"(억 미전환) — 표기 표준(formatEokMan)으로. 1억 미만 출력은 그대로다. */
export function manPerPyeong(won: number | null): string {
  if (!won || won <= 0) return "—";
  return `${formatEokMan(won / 10_000)}/평`;
}

export function BandTable({
  cells,
  hiBandSlug,
  topByBand,
}: {
  cells: readonly BandCell[];
  /** 평단가 최고 면적대(프리미엄 표시) — 없으면 null */
  hiBandSlug: string | null;
  /** 면적대별 지역 분위(상위 %) — 표본 8곳 미만이면 null */
  topByBand: Record<string, number | null>;
}) {
  const maxPer = Math.max(...cells.map((c) => c.avgPerPyeongKrw ?? 0), 1);
  return (
    <div className="card overflow-hidden rounded-[14px]" data-reveal="">
      <div className="t-section border-b border-line px-5 py-3.5 text-ink">면적대별 평단가 · 중앙값 · 거래량</div>
      <div className="relative overflow-x-auto">
        <table className="t-body w-full min-w-[520px]">
          <thead>
            <tr className="t-sub border-b border-line text-left text-text-3">
              <th className="px-5 py-2 font-semibold">면적대</th>
              <th className="px-2 py-2 text-right font-semibold">거래</th>
              <th className="px-2 py-2 text-right font-semibold">중앙값</th>
              <th className="px-2 py-2 text-right font-semibold">
                <span className="inline-flex items-center gap-0.5">
                  평단가 평균
                  <Explain term="pyeongdanga" how={PYEONG_HOW} source="국토교통부 실거래가" size={12} />
                </span>
              </th>
              <th className="px-5 py-2 text-right font-semibold">
                <span className="inline-flex items-center gap-0.5">
                  지역 분위
                  <Explain title="지역 분위" how={RANK_HOW} size={12} />
                </span>
              </th>
            </tr>
          </thead>
          <tbody>
            {cells.map((c) => {
              const top = topByBand[c.bandSlug] ?? null;
              return (
                <tr key={c.bandSlug} className="row-hl border-b border-divider last:border-0">
                  <td className="px-5 py-2.5">
                    <span className="font-bold text-ink">{c.bandLabel}</span>
                    {hiBandSlug === c.bandSlug && (
                      <span className="t-caption ml-1.5 rounded bg-primary-soft px-1.5 py-px font-extrabold text-primary">
                        평단가 최고
                      </span>
                    )}
                  </td>
                  <td className="px-2 py-2.5 text-right tabular-nums text-text-2">{c.txCount.toLocaleString("ko-KR")}</td>
                  <td className="px-2 py-2.5 text-right tabular-nums font-semibold text-ink">{eok(c.medianKrw)}</td>
                  <td
                    className="cell-bar px-2 py-2.5 text-right font-extrabold tabular-nums text-success"
                    style={{ ["--w" as string]: `${Math.round(((c.avgPerPyeongKrw ?? 0) / maxPer) * 100)}%` }}
                  >
                    {manPerPyeong(c.avgPerPyeongKrw)}
                  </td>
                  <td className="t-sub px-5 py-2.5 text-right text-text-2">{top !== null ? `상위 ${top}%` : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="t-caption px-5 py-2.5 text-text-3">
        평단가 = 전용면적 평(3.3㎡)당 평균 매매가. 지역 분위는 내집나우에 수록된 지역들 중 같은 면적대 평단가 순위예요(표본
        8곳 이상일 때만 표시).
      </div>
    </div>
  );
}
