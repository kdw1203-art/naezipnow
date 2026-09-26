import { barGeometry } from "@/lib/viz/geometry";

/* 세로 막대 — 거래량·건수처럼 "몇 개인가"를 세는 값.
   최댓값 막대만 진하게 둔다(어디가 정점인지 한 번에 읽히게).
   [1009] 축 글자를 SVG 밖(HTML)으로 — 늘어나는 뷰박스 안의 글자는 모바일에서 찌그러졌다(TrendChart 와 같은 이유). */
export function Bars({
  values,
  labels,
  height = 96,
  valueSuffix = "",
  className,
  ariaLabel,
}: {
  values: readonly number[];
  labels?: readonly string[];
  height?: number;
  valueSuffix?: string;
  className?: string;
  ariaLabel?: string;
}) {
  const W = 600;
  const padB = labels?.length ? 16 : 0;
  const plotH = height - padB;
  const g = barGeometry(values, W, plotH);
  if (!g) return null;
  const tickIdx = labels?.length
    ? [0, Math.floor((labels.length - 1) / 2), labels.length - 1].filter(
        (v, i, a) => a.indexOf(v) === i,
      )
    : [];
  return (
    <div className={`relative w-full ${className ?? ""}`} style={{ height }}>
      <svg
        viewBox={`0 0 ${W} ${height}`}
        role="img"
        aria-label={ariaLabel ?? `막대 차트 — 최대 ${g.max}${valueSuffix}`}
        preserveAspectRatio="none"
        className="absolute inset-0 block"
        style={{ width: "100%", height }}
      >
        {g.bars.map((b) => (
          <rect
            key={b.index}
            x={b.x}
            y={b.y}
            width={b.w}
            height={b.h}
            rx="2"
            fill="currentColor"
            fillOpacity={b.index === g.maxIndex ? 0.95 : 0.34}
          />
        ))}
      </svg>
      {tickIdx.map((i) => {
        const lastTick = i === (labels?.length ?? 1) - 1;
        return (
          <span
            key={i}
            aria-hidden="true"
            className="trend-lab"
            style={
              i === 0
                ? { left: 2, bottom: 0 }
                : lastTick
                  ? { right: 2, bottom: 0 }
                  : { left: "50%", bottom: 0, transform: "translateX(-50%)" }
            }
          >
            {labels?.[i]}
          </span>
        );
      })}
    </div>
  );
}
