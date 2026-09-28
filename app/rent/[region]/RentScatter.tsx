/* [1024 · 원룸·오피스텔] 보증금 × 월세 분포 — 서버가 그리는 인라인 SVG(클라이언트 코드 0).
   좌표는 퍼센트(lib/rent/scatter.ts) · width 100% · 글자는 램프 클래스(t-caption) · 색은 토큰 변수. 계약 1건 = 점 1개. */
import type { NonAptRentDeal } from "@/lib/market/rent-nonapt-core";
import { formatKrwShort } from "@/lib/market/format";
import { scatterLayout, SCATTER_X_RANGE, SCATTER_Y_RANGE } from "@/lib/rent/scatter";

export function RentScatter({ deals, emptyLabel }: { deals: readonly NonAptRentDeal[]; emptyLabel: string }) {
  const L = scatterLayout(deals);
  const [x0, x1] = SCATTER_X_RANGE;
  const [y0, y1] = SCATTER_Y_RANGE;
  const H = 180;
  const has = L.points.length > 0;
  return (
    <svg
      width="100%"
      height={H}
      role="img"
      aria-label={has ? `보증금 × 월세 분포 · 계약 ${L.points.length}건` : `보증금 × 월세 분포 · ${emptyLabel}`}
      className="block"
    >
      {/* 축 */}
      <line x1={`${x0}%`} x2={`${x1}%`} y1={`${y1}%`} y2={`${y1}%`} stroke="var(--border-strong)" />
      <line x1={`${x0}%`} x2={`${x0}%`} y1={`${y0}%`} y2={`${y1}%`} stroke="var(--border-strong)" />
      {/* 세로 눈금(월세) */}
      {L.yTicks.map((t) => (
        <g key={`y${t.pct}`}>
          <line x1={`${x0}%`} x2={`${x1}%`} y1={`${t.pct}%`} y2={`${t.pct}%`} stroke="var(--border)" />
          {has && (
            <text x={`${x0 - 1}%`} y={`${t.pct}%`} dy="4" textAnchor="end" className="t-caption tabular-nums" fill="var(--text-3)">
              {formatKrwShort(t.value)}
            </text>
          )}
        </g>
      ))}
      {/* 가로 눈금(보증금) */}
      {has &&
        L.xTicks.map((t) => (
          <text key={`x${t.pct}`} x={`${t.pct}%`} y={H - 4} textAnchor="end" className="t-caption tabular-nums" fill="var(--text-3)">
            {formatKrwShort(t.value)}
          </text>
        ))}
      <text x={`${x0 - 1}%`} y={`${y0}%`} dy="4" textAnchor="end" className="t-caption" fill="var(--text-3)">
        월세
      </text>
      <text x={`${x0}%`} y={H - 4} textAnchor="start" className="t-caption" fill="var(--text-3)">
        보증금 →
      </text>
      {has ? (
        L.points.map((p, i) => (
          <circle key={i} cx={`${p.xPct}%`} cy={`${p.yPct}%`} r={3.5} fill="var(--primary)" fillOpacity={0.5}>
            <title>{`보증금 ${formatKrwShort(p.depositKrw)} · 월세 ${formatKrwShort(p.monthlyKrw)}`}</title>
          </circle>
        ))
      ) : (
        <text x={`${(x0 + x1) / 2}%`} y={`${(y0 + y1) / 2}%`} dy="4" textAnchor="middle" className="t-sub" fill="var(--text-3)">
          {emptyLabel}
        </text>
      )}
    </svg>
  );
}
