/* [1024 · 단지 상세] 개요 스트립 8칸(세대·동·준공·주차/세대·승강기·난방·건설사·관리) — K-apt 값. 시안 mock1024/complex-d.
   서버 조각(JS 없음). 칸은 고정 8개, 값이 없으면 "—"(overviewStripCells). 폰 4×2 · md 이상 8×1 — 칸 사이 선은
   globals.css `.cx-strip`(nth-child 규칙은 유틸로 못 적는다). */
import { overviewStripCells, type OverviewStripSource } from "./complex-v2-model";

export function ComplexOverviewStrip({ row }: { row: OverviewStripSource }) {
  const cells = overviewStripCells(row);
  return (
    <dl className="cx-strip card rise-in-1 mt-3 grid grid-cols-4 rounded-2xl md:grid-cols-8" aria-label="단지 개요">
      {cells.map((c) => (
        <div key={c.key} className="flex min-w-0 flex-col gap-0.5 px-2.5 py-2">
          <dt className="t-caption text-text-3">{c.label}</dt>
          <dd className={`m-0 truncate t-section text-ink ${c.num ? "tabular-nums" : ""}`}>{c.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export default ComplexOverviewStrip;
