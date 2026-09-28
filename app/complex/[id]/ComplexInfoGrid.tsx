/* [1015 · 규칙 J] 단지 정보 — 네이버 부동산 "단지 정보" 표의 항목 순서(세대수 → 준공 → 주차 → 동 수 → 시공사 → 난방)를
   SummaryRow 행(이름 / 값)으로. 1009 의 격자(라벨 위 · 값 아래)에서 행 목록으로 바꾼 것 말고는 같다:
   **데이터에 실제로 있는 항목만** 행이 된다(없는 행·"—" 나열 금지). 빠진 항목과 이유·출처는 페이지 맨 끝
   "데이터 출처"(ComplexFactsCard)가 말한다. 전세가율(단지 6개월 중앙값)은 같은 목록의 한 행 — 예전엔 따로 카드였다.
   서버 조각 — JS 없음. */

import type { ComplexFacts } from "@/lib/complex/complex-facts";
import { complexInfoCells, type ComplexInfoFacts } from "@/lib/complex/info-cells";
import { formatKrwWon } from "@/lib/format/krw";
import { ExplainLazy as Explain } from "./ExplainLazy";
import { SummaryRow } from "./SummaryRow";

export type { ComplexInfoFacts } from "@/lib/complex/info-cells";

/* 네이버 단지 정보 표 순서 — 세대수·준공·주차가 먼저, 나머지는 그 뒤 */
const ORDER = ["세대수", "준공", "주차", "동 수", "시공사", "난방"];

function eok(krw: number): string {
  return formatKrwWon(krw, { style: "eok1" });
}

function ymLabel(ym: string): string {
  return /^\d{6}$/.test(ym) ? `${ym.slice(0, 4)}.${ym.slice(4)}` : ym;
}

export function ComplexInfoGrid({
  facts,
  nowYear,
  jeonse = null,
}: {
  facts: ComplexInfoFacts;
  nowYear: number;
  /** 단지 전세가율(complex-facts) — 계산됐을 때만 행. 못 낸 이유는 "데이터 출처"에 */
  jeonse?: ComplexFacts["jeonseRatio"] | null;
}) {
  const cells = [...complexInfoCells(facts, nowYear)].sort(
    (a, b) => (ORDER.indexOf(a.label) + 1 || 99) - (ORDER.indexOf(b.label) + 1 || 99),
  );
  const addr = facts.roadAddress?.trim() || facts.address?.trim() || null;
  if (cells.length === 0 && !addr && !jeonse) return null;
  return (
    <section aria-labelledby="complex-info-title" className="rise-in-1 mt-3">
      <h2 id="complex-info-title" className="mb-1.5 px-0.5 t-section text-ink">
        단지 정보
      </h2>
      <ul className="lq-panel flex list-none flex-col divide-y p-0" data-tone="hanji">
        {cells.map((c) => (
          <SummaryRow key={c.label} label={c.label} value={c.sub ? `${c.value} · ${c.sub}` : c.value} />
        ))}
        {jeonse && (
          <SummaryRow
            label={
              <span className="inline-flex items-center gap-0.5">
                전세가율
                <Explain
                  term="jeonse-garyul"
                  how={[
                    `최근 ${jeonse.windowMonths}개월 전세 보증금 중앙값 ÷ 같은 기간 매매 거래가 중앙값 × 100.`,
                    "전세·매매 각각 3건 이상일 때만 계산. 면적 미가중이라 평형 구성이 다르면 실제와 차이가 날 수 있다.",
                  ]}
                  source={`국토교통부 매매·전월세 실거래 신고 · ${ymLabel(jeonse.fromYm)}~${ymLabel(jeonse.toYm)}`}
                />
              </span>
            }
            sub={`전세 중앙 ${eok(jeonse.jeonseMedianKrw)}(${jeonse.jeonseCount}건) ÷ 매매 중앙 ${eok(jeonse.tradeMedianKrw)}(${jeonse.tradeCount}건)`}
            value={`${jeonse.pct}%`}
          />
        )}
        {addr && <SummaryRow label="주소" value={addr} />}
      </ul>
    </section>
  );
}

export default ComplexInfoGrid;
