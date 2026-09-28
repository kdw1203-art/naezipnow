/* [1021 · 단지 분석 /analysis/ai] 단지를 고르기 **전** 화면 — 도구의 대표 그림 **빈 틀**(값 없음: 레이더 축만 · 부채꼴 축만 ·
   지도 격자만 · 신호등 3개 회색)을 흐리게 깔고 그 위에 단지 고르기를 얹는다("이렇게 써요 ①②" 카드는 걷었다).
   숫자·라벨은 하나도 없다 — 빈 틀은 데이터처럼 읽히면 안 된다(정직 원칙). 순수 SVG, 클라이언트 JS 0. 색은 토큰만. */

import type { FrameToolId } from "./frame-tools";

export { FRAME_TOOLS, isFrameTool, type FrameToolId } from "./frame-tools";

const AXES = 5;
function radarPt(i: number, ratio: number) {
  const a = -Math.PI / 2 + (i * 2 * Math.PI) / AXES;
  return `${(150 + Math.cos(a) * 96 * ratio).toFixed(1)},${(120 + Math.sin(a) * 96 * ratio).toFixed(1)}`;
}

function RadarFrame() {
  return (
    <svg viewBox="0 0 300 240" className="cxw-frame-svg" aria-hidden="true">
      {[0.25, 0.5, 0.75, 1].map((t) => (
        <polygon key={t} points={Array.from({ length: AXES }, (_, i) => radarPt(i, t)).join(" ")} fill="none" className="stroke-line" strokeWidth={1} />
      ))}
      {Array.from({ length: AXES }, (_, i) => {
        const [x, y] = radarPt(i, 1).split(",");
        return <line key={i} x1={150} y1={120} x2={x} y2={y} className="stroke-line" strokeWidth={1} />;
      })}
    </svg>
  );
}

function FanFrame() {
  return (
    <svg viewBox="0 0 640 240" className="cxw-frame-svg" aria-hidden="true" preserveAspectRatio="none">
      {[40, 90, 140, 190].map((y) => (
        <line key={y} x1={40} x2={620} y1={y} y2={y} className="stroke-line" strokeWidth={1} />
      ))}
      <line x1={40} y1={20} x2={40} y2={215} className="stroke-line" strokeWidth={1} />
      <line x1={40} y1={215} x2={620} y2={215} className="stroke-line" strokeWidth={1} />
      <path d="M40 130 L620 50" fill="none" className="stroke-line" strokeWidth={2} strokeDasharray="4 6" />
      <path d="M40 130 L620 110" fill="none" className="stroke-line" strokeWidth={2} strokeDasharray="4 6" />
      <path d="M40 130 L620 180" fill="none" className="stroke-line" strokeWidth={2} strokeDasharray="4 6" />
    </svg>
  );
}

function MapFrame() {
  return (
    <svg viewBox="0 0 700 240" className="cxw-frame-svg" aria-hidden="true" preserveAspectRatio="none">
      <path d="M0 60 H700 M0 170 H700 M120 0 V240 M360 0 V240 M600 0 V240" className="stroke-line" strokeWidth={10} fill="none" />
      <path d="M0 60 H700 M0 170 H700 M120 0 V240 M360 0 V240 M600 0 V240" className="stroke-surface" strokeWidth={7} fill="none" />
    </svg>
  );
}

function LightsFrame() {
  return (
    <svg viewBox="0 0 300 120" className="cxw-frame-svg" aria-hidden="true">
      {[60, 150, 240].map((x) => (
        <g key={x}>
          <rect x={x - 42} y={20} width={84} height={80} rx={12} fill="none" className="stroke-line" strokeWidth={1} />
          <circle cx={x} cy={52} r={13} className="fill-line" />
        </g>
      ))}
    </svg>
  );
}

/** 대표 그림의 빈 틀 — 도구마다 다르다 */
export function EmptyFrame({ tool }: { tool: FrameToolId }) {
  if (tool === "ai-diagnosis") return <RadarFrame />;
  if (tool === "ai-prediction") return <FanFrame />;
  if (tool === "ai-inspection") return <MapFrame />;
  return <LightsFrame />;
}
