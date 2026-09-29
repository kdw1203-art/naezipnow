/* [1025c · 브리핑] 타입별 최근 12개월 미니 차트 — 점 = 실거래 한 건(속 빈 원 · 24건 넘으면 작은 반투명 점 — 겹치면 진해진다) ·
   채운 점 = 가장 최근 계약 ·
   선 = 월 중앙값(점 3개 미만이면 없음) · 아래 막대 = 창 안 건수(셋 중 최대 대비). 시안 mock1025c/_build.mjs miniType 기하.
   서버 조각(JS 없음) · 색은 currentColor(부모 text-primary)와 토큰 변수뿐. 안에 글자는 없다(값·날짜는 카드가 적는다).
   /pro 견본 SVG 안에도 x·y 로 앉힌다(중첩 svg). */
import { miniChartGeometry, type MiniSeries } from "@/lib/brief/model";

export function BriefMiniChart({
  series,
  maxCount,
  x,
  y,
  width,
  height,
  className,
}: {
  series: Pick<MiniSeries, "points" | "line" | "count">;
  maxCount: number;
  x?: number;
  y?: number;
  width?: number | string;
  height?: number | string;
  className?: string;
}) {
  const g = miniChartGeometry(series, maxCount);
  return (
    <svg
      viewBox={`0 0 ${g.w} ${g.h}`}
      x={x}
      y={y}
      width={width}
      height={height}
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      <line x1={g.baseline.x1} y1={g.baseline.y1} x2={g.baseline.x2} y2={g.baseline.y2} stroke="var(--border)" strokeWidth="1" />
      {g.polyline && <polyline points={g.polyline} fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" strokeOpacity="0.7" />}
      {g.dots.map((d, i) =>
        d.latest ? (
          <circle key={i} cx={d.cx} cy={d.cy} r="3.5" fill="currentColor" stroke="var(--surface)" strokeWidth="1" />
        ) : g.dense ? (
          <circle key={i} cx={d.cx} cy={d.cy} r="1.6" fill="currentColor" fillOpacity="0.28" />
        ) : (
          <circle key={i} cx={d.cx} cy={d.cy} r="2.5" fill="var(--surface)" stroke="currentColor" strokeWidth="1.5" strokeOpacity="0.6" />
        ),
      )}
      <rect x={g.bar.x} y={g.bar.y} width={g.bar.width} height={g.bar.height} rx="1" fill="var(--primary-soft)" stroke="currentColor" strokeWidth="1" />
    </svg>
  );
}

export default BriefMiniChart;
