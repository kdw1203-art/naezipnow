import { polygonPoints, radarPoints } from "@/lib/viz/geometry";

export interface RadarAxis {
  key: string;
  label: string;
  /** 0~1 로 정규화된 값 */
  ratio: number;
  /** [1009 · A] 이 축의 실제 값 글자("8.45억"·"12건") — 초점 계열이면 축 이름 아래에 적는다 */
  display?: string;
}

/* [1009 · A] 축 글자 — 모바일 캡션 하한(--fs-caption: 390px 에서 11px)을 같이 탄다 */
const SVG_CAPTION = { fontSize: "var(--fs-caption, 10px)" } as const;

/* 레이더 — 후보 단지 비교의 "모양" 차이. 표는 항목별 우열은 보여 주지만
   전체 성격(어디가 뾰족한 단지인가)은 안 보여 준다.

   [1009 · A] 모양만 있고 값이 없어 "바깥이 좋은 건가, 큰 건가"를 읽을 수 없었다(비교 화면 실측 — 축 글자 9.5px ·
   값 0개). 초점 계열(focus)을 받으면 그 단지 선만 진하게, 나머지는 옅게 그리고 축 이름 아래에 그 단지의 실제
   값을 적는다(값은 부르는 쪽이 표와 같은 표기로 만든다). 축 글자는 램프(10px)로. */
export function Radar({
  series,
  size = 190,
  focus = null,
  className,
}: {
  /** 최대 3개 — 그 이상은 겹쳐서 못 읽는다 */
  series: ReadonlyArray<{ name: string; axes: readonly RadarAxis[]; toneClass: string }>;
  size?: number;
  /** 진하게 그리고 값을 적을 계열 번호 — null 이면 모두 같은 굵기(예전 그대로) */
  focus?: number | null;
  className?: string;
}) {
  const first = series[0];
  if (!first || first.axes.length < 3) return null;
  const cx = size / 2;
  const cy = size / 2;
  const withValues = focus != null && series[focus]?.axes.some((a) => a.display);
  /* 값 줄이 붙으면 축 글자가 두 줄 — 가장자리 여백을 늘려 잘리지 않게 */
  const r = size / 2 - (withValues ? 40 : 26);
  const n = first.axes.length;
  const f = focus != null ? series[focus] : null;

  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      width={size}
      height={size}
      className={className}
      role="img"
      aria-label={`비교 레이더 — ${series.map((s) => s.name).join(", ")}${
        f ? ` · ${f.name}: ${f.axes.map((a) => `${a.label} ${a.display ?? ""}`.trim()).join(", ")}` : ""
      }`}
    >
      {/* 배경 링 4겹 — 값의 대략적 크기를 읽는 눈금 */}
      {[0.25, 0.5, 0.75, 1].map((t) => (
        <polygon
          key={t}
          points={polygonPoints(radarPoints(first.axes.map(() => t), r, cx, cy))}
          fill="none"
          stroke="var(--divider)"
          strokeWidth="1"
        />
      ))}
      {first.axes.map((a, i) => {
        const p = radarPoints(
          first.axes.map((_, j) => (j === i ? 1 : 0)),
          r,
          cx,
          cy,
        )[i];
        return <line key={a.key} x1={cx} y1={cy} x2={p.x} y2={p.y} stroke="var(--divider)" strokeWidth="1" />;
      })}
      {series.slice(0, 3).map((s, k) => {
        const dim = focus != null && k !== focus;
        return (
          <polygon
            key={s.name}
            className={s.toneClass}
            points={polygonPoints(radarPoints(s.axes.map((a) => a.ratio), r, cx, cy))}
            fill="currentColor"
            fillOpacity={dim ? 0.05 : 0.16}
            stroke="currentColor"
            strokeOpacity={dim ? 0.35 : 1}
            strokeWidth={dim ? 1.2 : 2}
            strokeLinejoin="round"
          />
        );
      })}
      {first.axes.map((a, i) => {
        const p = radarPoints(
          first.axes.map((_, j) => (j === i ? 1.2 : 0)),
          r,
          cx,
          cy,
        )[i];
        const anchor = p.x > cx + 4 ? "start" : p.x < cx - 4 ? "end" : "middle";
        const value = f?.axes[i]?.display;
        /* 위쪽 축은 두 줄이 위로, 아래쪽 축은 아래로 자란다 */
        const up = p.y < cy - 4;
        const y0 = value && up ? p.y - 13 : p.y;
        return (
          <text
            key={a.key}
            x={p.x}
            y={y0}
            textAnchor={anchor}
            dominantBaseline={p.y > cy + 4 ? "hanging" : p.y < cy - 4 ? "auto" : "middle"}
            fill="var(--text-3)"
            fontSize="10"
            style={SVG_CAPTION}
            fontWeight="700"
          >
            {a.label}
            {value && (
              <tspan x={p.x} dy={13} fill="var(--ink)" fontWeight="800">
                {value}
              </tspan>
            )}
          </text>
        );
      })}
    </svg>
  );
}
