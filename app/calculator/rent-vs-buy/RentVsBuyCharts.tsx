/* [1025c · 담당 S] 살까·빌릴까 대표 그림 — 누적 막대(StackedBarsSvg) · 손익분기 선(BreakEvenSvg). 좌표는 전부
   lib/calc/rent-vs-buy-chart(순수 · 단위검증) 가 주고, 여기서는 그리기만 한다. 색은 토큰(navy · primary · primary-soft ·
   brand-red · success) · viewBox 320 고정이라 폰 320px 안에서 가로 스크롤 없음. 글자는 SVG 안(눈금·합계)이라 뷰박스와 같이
   커진다(카드 폭 320~380px 에서 10→12px 사이). */

import type { BreakEvenLayout, StackKey, StackedBarsLayout } from "@/lib/calc/rent-vs-buy-chart";
import { manwonText } from "@/lib/finance/money";

/* 조각 색 — 범례(HTML)와 막대(SVG)가 같은 표를 쓴다 */
export const STACK_FILL: Record<StackKey, { svg: string; html: string }> = {
  interest: { svg: "fill-brand-navy", html: "bg-brand-navy" },
  taxbroker: { svg: "fill-primary", html: "bg-primary" },
  opp: { svg: "fill-primary-soft stroke-primary", html: "border border-primary bg-primary-soft" },
  rent: { svg: "fill-text-2", html: "bg-text-2" },
  gain: { svg: "fill-brand-red", html: "bg-brand-red" },
};

export function StackedBarsSvg({ layout, years, empty = false }: { layout: StackedBarsLayout; years: number; empty?: boolean }) {
  const aria = empty
    ? "매매·전세·월세 총비용 누적 막대 — 입력 전"
    : layout.bars.map((b) => `${b.label} ${b.total === null ? "입력 전" : manwonText(b.total)}`).join(", ");
  return (
    <svg viewBox={`0 0 ${layout.width} ${layout.height}`} role="img" aria-label={`${years}년 총비용 누적 막대 — ${aria}`} className="block h-auto w-full">
      <line x1={0} y1={layout.baseY} x2={layout.width} y2={layout.baseY} className="stroke-line-strong" strokeWidth={1} />
      {layout.bars.map((b) => {
        if (b.total === null) {
          return (
            <g key={b.key}>
              <rect x={b.x} y={layout.top} width={b.w} height={layout.baseY - layout.top} rx={4} fill="none" className="stroke-line-strong" strokeDasharray="4 3" />
              <text x={b.x + b.w / 2} y={b.labelY + 4} textAnchor="middle" fontSize={11} className="fill-text-3">
                입력 전
              </text>
              <text x={b.x + b.w / 2} y={layout.baseY + 16} textAnchor="middle" fontSize={12} fontWeight={600} className="fill-text-3">
                {b.label}
              </text>
            </g>
          );
        }
        return (
          <g key={b.key}>
            {b.segments.map((s) => (
              <rect
                key={s.key}
                x={s.x}
                y={s.y}
                width={s.w}
                height={s.h}
                className={STACK_FILL[s.key].svg}
                strokeWidth={s.kind === "soft" ? 1.5 : 0}
                fillOpacity={s.kind === "offset" ? 0.85 : 1}
              />
            ))}
            {b.netY !== b.grossY && (
              <line x1={b.x - 4} y1={b.netY} x2={b.x + b.w + 4} y2={b.netY} className="stroke-ink" strokeWidth={2} />
            )}
            <text x={b.x + b.w / 2} y={b.labelY} textAnchor="middle" fontSize={12} fontWeight={700} className={b.best ? "fill-success" : "fill-ink"}>
              {manwonText(b.total, "만")}
            </text>
            <text x={b.x + b.w / 2} y={layout.baseY + 16} textAnchor="middle" fontSize={12} fontWeight={600} className="fill-ink">
              {b.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export function BreakEvenSvg({ layout }: { layout: BreakEvenLayout }) {
  const rent = layout.rentLine;
  const crossText = layout.cross ? `손익분기 약 ${layout.cross.g.toFixed(1)}%` : "0~8% 안에 손익분기 없음";
  /* 교차점 글자가 오른쪽 끝을 넘지 않게 — 6% 넘으면 점 왼쪽에 적는다 */
  const crossRight = layout.cross ? layout.cross.x < layout.plot.r - 100 : true;
  return (
    <svg
      viewBox={`0 0 ${layout.width} ${layout.height}`}
      role="img"
      aria-label={`상승률별 매매 총비용 곡선 — ${rent ? `${rent.label} ${manwonText(rent.total)} 수평선` : ""} · ${crossText}`}
      className="block h-auto w-full"
    >
      {layout.yTicks.map((t) => (
        <g key={t.v}>
          <line
            x1={layout.plot.l}
            y1={t.y}
            x2={layout.plot.r}
            y2={t.y}
            className={t.v === 0 ? "stroke-line-strong" : "stroke-line"}
            strokeDasharray={t.v === 0 ? undefined : "2 3"}
          />
          <text x={layout.plot.l - 6} y={t.y + 4} textAnchor="end" fontSize={10} className="fill-text-3">
            {t.label}
          </text>
        </g>
      ))}
      {layout.xTicks.map((t) => (
        <text key={t.g} x={t.x} y={layout.height - 8} textAnchor="middle" fontSize={10} className="fill-text-3">
          {t.g}%
        </text>
      ))}
      {rent && (
        <>
          <line x1={layout.plot.l} y1={rent.y} x2={layout.plot.r} y2={rent.y} className="stroke-success" strokeWidth={2} />
          <text x={layout.plot.r} y={rent.y - 6} textAnchor="end" fontSize={10} fontWeight={700} className="fill-success">
            {rent.label} {manwonText(rent.total, "만")}
          </text>
        </>
      )}
      <polyline points={layout.path} fill="none" className="stroke-primary" strokeWidth={2.5} strokeLinejoin="round" />
      <text x={layout.curveLabel.x} y={layout.curveLabel.y} fontSize={10} fontWeight={700} className="fill-primary">
        매매 총비용
      </text>
      {layout.now && (
        <>
          <line x1={layout.now.x} y1={layout.plot.t} x2={layout.now.x} y2={layout.plot.b} className="stroke-brand-red" strokeDasharray="3 3" />
          <text
            x={layout.now.x + (layout.now.x > layout.plot.r - 60 ? -4 : 4)}
            y={layout.plot.b - 4}
            textAnchor={layout.now.x > layout.plot.r - 60 ? "end" : "start"}
            fontSize={10}
            fontWeight={700}
            className="fill-brand-red"
          >
            지금 {layout.now.g < 0 ? `−${Math.abs(layout.now.g)}` : layout.now.g}%
          </text>
        </>
      )}
      {layout.cross && (
        <>
          <circle cx={layout.cross.x} cy={layout.cross.y} r={5} className="fill-surface stroke-ink" strokeWidth={2.5} />
          <text
            x={layout.cross.x + (crossRight ? 10 : -10)}
            y={layout.cross.y - 10}
            textAnchor={crossRight ? "start" : "end"}
            fontSize={11}
            fontWeight={700}
            className="fill-ink"
          >
            {crossText}
          </text>
        </>
      )}
    </svg>
  );
}
