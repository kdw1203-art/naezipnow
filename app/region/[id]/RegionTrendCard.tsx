"use client";

import { useState } from "react";
import { Segmented } from "@/app/components/ui/Segmented";
import { ScrubLineLazy } from "@/app/components/viz/ScrubLineLazy";
import { Explain } from "@/app/components/explain/Explain";
import type { ExplainTerm } from "@/lib/explain/term-index";
import type { ScrubFormat, ScrubRange, ScrubTone } from "@/app/components/viz/ScrubLine";
import type { TrendKey } from "./region-overview";

/* [1009 · H] 지역 시세 흐름 — 지표 탭(시세 지수 · 전세가율 · 거래량) + 손가락으로 훑는 추세선.
 *
 * 왜(2026-09-22 실측): 예전엔 매매가격지수 12칸·거래량 12칸을 CSS 막대로 그리고 칸마다 `title=` 로 값을 달았다 —
 * 마우스를 올려야만 보여서 휴대폰(유입의 대부분)에선 **그 달 값이 존재하지 않았다**. 두 막대는 따로 떨어져 있었고
 * 전세가율 추이는 아예 없었다(부동산원 월간 13개월이 DB 에 있는데도). 한 카드에서 지표를 바꿔 보며(미끄러지는
 * Segmented), 누르고 끌면 그 달 값과 "기간 시작 대비" 등락이 머리에 뜬다(ScrubLine).
 * ScrubLine 은 따로 받는 청크(ScrubLineLazy) — 이 라우트 번들에 얹지 않는다. 거래량은 신고가 끝난 달만 선으로 그리고
 * 신고 중인 달은 아래 줄에 따로 적는다(region-overview.ts countsToTrend). */

export type RegionTrendDataset = {
  key: TrendKey;
  tab: string;
  values: number[];
  labels: string[];
  fullLabels: string[];
  format: Extract<ScrubFormat, "num1" | "pct1" | "int">;
  suffix?: string;
  tone: ScrubTone;
  title: string;
  caption?: string;
  ariaLabel: string;
  footnote: string;
  ranges?: ScrubRange[];
  explain: { term: ExplainTerm; how: string[]; source: string };
};

export function RegionTrendCard({
  heading,
  datasets,
  after,
}: {
  heading: string;
  datasets: RegionTrendDataset[];
  /** 카드 끝(차트 아래) 서버 조각 — 시장 온도 링크 등 */
  after?: React.ReactNode;
}) {
  const [key, setKey] = useState<TrendKey>(datasets[0]?.key ?? "index");
  const cur = datasets.find((d) => d.key === key) ?? datasets[0];
  if (!cur) return null;
  return (
    <section aria-labelledby="region-trend-h" className="card mb-6 p-[var(--pad-card)]">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <div className="flex items-center gap-0.5">
          <h2 id="region-trend-h" className="t-section text-ink">
            {heading}
          </h2>
          <Explain term={cur.explain.term} how={cur.explain.how} source={cur.explain.source} />
        </div>
        {datasets.length > 1 && (
          <Segmented
            options={datasets.map((d) => ({ value: d.key, label: d.tab }))}
            value={cur.key}
            onChange={(k) => setKey(k)}
            ariaLabel="지표"
          />
        )}
      </div>
      <ScrubLineLazy
        key={cur.key}
        className="mt-3"
        values={cur.values}
        labels={cur.labels}
        fullLabels={cur.fullLabels}
        format={cur.format}
        suffix={cur.suffix}
        tone={cur.tone}
        title={cur.title}
        caption={cur.caption}
        ariaLabel={cur.ariaLabel}
        footnote={cur.footnote}
        ranges={cur.ranges}
        defaultRange={cur.ranges ? "all" : undefined}
      />
      {after}
    </section>
  );
}

export default RegionTrendCard;
