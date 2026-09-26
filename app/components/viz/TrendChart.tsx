import { lineGeometry, smoothPath } from "@/lib/viz/geometry";

/* 추세 차트 — 기능 페이지의 주인공 그림.
 *
 * 왜 필요했나: /analysis/timing·price·temperature·gap 은 2026-08-25 실측 기준
 * SVG 가 **0개**였다. 지수·거래량을 전부 표로만 보여 주니 "지금 오르는 중인가"를
 * 읽으려면 숫자를 눈으로 미분해야 했다(체류 3.2초 · 즉시 이탈).
 *
 * 서버 컴포넌트 · 순수 SVG(클라이언트 JS 0). 선은 currentColor 라 부모가 계열
 * 색을 정한다. 격자·축 라벨은 토큰 색(--divider·--text-3)을 직접 쓴다.
 *
 * [1009] 글자·끝점을 SVG 밖(HTML)으로 뺐다. 뷰박스(600폭)를 컨테이너에 늘리는
 * preserveAspectRatio="none" 때문에 390px 화면에서 축 글자가 가로 58% 로 찌그러지고
 * 끝점 원이 세로로 긴 타원이 됐다(실측). 선·면·격자는 늘어나도 괜찮으니 SVG 에 두고
 * (선 굵기는 non-scaling-stroke), 모양이 망가지면 안 되는 글자와 점만 % 위치의 HTML 로 얹는다.
 * 손가락으로 값을 읽어야 하는 자리(월별 가격 등)는 viz/ScrubLine 을 쓴다.
 */
export function TrendChart({
  values,
  labels,
  height = 148,
  smooth = true,
  valueSuffix = "",
  bands = 4,
  className,
  ariaLabel,
}: {
  values: readonly number[];
  /** x축 라벨 — 값과 같은 길이면 처음·중간·끝 3개만 그린다 */
  labels?: readonly string[];
  height?: number;
  smooth?: boolean;
  valueSuffix?: string;
  bands?: number;
  className?: string;
  ariaLabel?: string;
}) {
  const W = 600; // 뷰박스 폭 — preserveAspectRatio=none 으로 컨테이너에 늘린다
  const padT = 10;
  const padB = labels?.length ? 20 : 8;
  const plotH = height - padT - padB;
  const g = lineGeometry(values, W, plotH, 6);
  if (!g) return null;

  const d = smooth ? smoothPath(g.points) : g.line;
  const last = g.points[g.points.length - 1];
  const fmt = (n: number) =>
    `${Math.abs(n) >= 100 ? Math.round(n).toLocaleString("ko-KR") : (Math.round(n * 10) / 10).toLocaleString("ko-KR")}${valueSuffix}`;

  const tickIdx = labels?.length
    ? [0, Math.floor((labels.length - 1) / 2), labels.length - 1].filter(
        (v, i, a) => a.indexOf(v) === i,
      )
    : [];
  const pct = (x: number) => `${(x / W) * 100}%`;

  return (
    <div className={`relative w-full ${className ?? ""}`} style={{ height }}>
      <svg
        viewBox={`0 0 ${W} ${height}`}
        role="img"
        aria-label={ariaLabel ?? `추세 차트 — 최저 ${fmt(g.min)}, 최고 ${fmt(g.max)}, 현재 ${fmt(g.last)}`}
        preserveAspectRatio="none"
        className="absolute inset-0 block"
        style={{ width: "100%", height }}
      >
        {/* 격자 — 값을 읽을 수 있게 하는 최소한. 선을 세면 눈금이 된다 */}
        <g stroke="var(--divider)" strokeWidth="1" vectorEffect="non-scaling-stroke">
          {Array.from({ length: bands + 1 }, (_, i) => {
            const y = padT + (plotH / bands) * i;
            return <line key={i} x1="0" y1={y} x2={W} y2={y} vectorEffect="non-scaling-stroke" />;
          })}
        </g>
        <g transform={`translate(0 ${padT})`}>
          <path d={`${d} L${W} ${plotH} L0 ${plotH} Z`} fill="currentColor" fillOpacity="0.1" />
          <path
            d={d}
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        </g>
      </svg>
      {/* 끝점 — "지금 값"의 위치. HTML 이라 늘어나도 원이다 */}
      <span
        aria-hidden="true"
        className="trend-end"
        style={{ left: pct(last.x), top: padT + last.y }}
      />
      {/* 최고·최저를 왼쪽 위/아래에 붙인다 — 축 눈금 대신 범위만 알려 준다 */}
      <span aria-hidden="true" className="trend-lab font-bold" style={{ left: 4, top: padT }}>
        {fmt(g.max)}
      </span>
      <span aria-hidden="true" className="trend-lab font-bold" style={{ left: 4, top: padT + plotH - 16 }}>
        {fmt(g.min)}
      </span>
      {tickIdx.map((i) => {
        const lastTick = i === (labels?.length ?? 1) - 1;
        return (
          <span
            key={i}
            aria-hidden="true"
            className="trend-lab"
            style={
              i === 0
                ? { left: 4, bottom: 2 }
                : lastTick
                  ? { right: 4, bottom: 2 }
                  : { left: "50%", bottom: 2, transform: "translateX(-50%)" }
            }
          >
            {labels?.[i]}
          </span>
        );
      })}
    </div>
  );
}
