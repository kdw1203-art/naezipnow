/* [1012 · 규칙 8] font-extrabold(800) → font-bold(700) — 굵기 3단(400·500·700). 이 파일의 모든 자리에 적용. */
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

/* [v4 · 규칙 5] 표(5열 · 가로 스크롤 520px · 셀 막대 · "평단가 최고" 배지) → 구분선 목록 행.
   행 = 왼쪽 면적대(굵게) + 보조 한 줄(거래 · 중앙값 · 지역 분위) / 오른쪽 평단가 평균(t-num).
   ⓘ 두 개(평단가 · 지역 분위)는 머리 줄과 캡션으로 옮겼다(설명 팝업 기능 유지). */
export function BandTable({
  cells,
  topByBand,
}: {
  cells: readonly BandCell[];
  /** 면적대별 지역 분위(상위 %) — 표본 8곳 미만이면 null */
  topByBand: Record<string, number | null>;
}) {
  return (
    <section className="flex flex-col gap-2" data-reveal="">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="flex items-baseline gap-1.5 t-section text-ink">
          면적대별 <span className="t-num text-text-3">{cells.length}</span>
        </h2>
        <span className="inline-flex items-center gap-0.5 t-caption text-text-3">
          평단가 평균
          <Explain term="pyeongdanga" how={PYEONG_HOW} source="국토교통부 실거래가" size={12} />
        </span>
      </div>
      <ul data-tone="blue" className="card flex flex-col divide-y divide-line rounded-lg px-4">
        {cells.map((c) => {
          const top = topByBand[c.bandSlug] ?? null;
          return (
            <li key={c.bandSlug} className="flex min-h-14 items-center justify-between gap-3 py-3">
              <span className="min-w-0 flex-1">
                <span className="block t-body font-bold text-ink">{c.bandLabel}</span>
                <span className="mt-0.5 block truncate t-sub tabular-nums text-text-3">
                  {c.txCount.toLocaleString("ko-KR")}건 · 중앙값 {eok(c.medianKrw)}
                  {top !== null ? ` · 상위 ${top}%` : ""}
                </span>
              </span>
              <span className="shrink-0 t-body t-num text-ink">{manPerPyeong(c.avgPerPyeongKrw)}</span>
            </li>
          );
        })}
      </ul>
      {/* [v4 · 규칙 3] 출처 캡션 한 줄 */}
      <p className="flex flex-wrap items-center gap-0.5 t-caption text-text-3">
        국토교통부 실거래 신고(매매) · 상위 % = 수록 지역 중 같은 면적대 평단가 순위
        <Explain title="지역 분위" how={RANK_HOW} size={12} />
      </p>
    </section>
  );
}
