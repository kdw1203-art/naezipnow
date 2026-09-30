/* [1026b · AI 분석 8종] 나머지 8종도 1026 빈 상태(카드 하나 + 회색 견본 + 한 문장 + 검색) — 견본 틀 셋을 더했다:
   목록(리스크 점검 위험 신호·계약 확인·체크리스트·대출 계산 줄) · 표(다른 단지와 비교) · 막대(관심 단지 구성·갭). 글자·숫자 없음(정직 원칙). */
/* [1026 · 단지 분석 4종] 1025 빈 상태 — 카드 하나 + 회색 견본(이 빈 틀을 카드 안에 제자리로 · 바닥에 흐리게 깔던 것을 걷었다) + 한 문장
   (page.tsx EMPTY_LINE → header.emptyLine — 서버가 넘겨 첫 로드 번들에 싣지 않는다) + 단지 검색 + 최근 거래 많은 단지 칩. 틀 자체는 그대로(글자·숫자 없음). */
/* [1021 · 단지 분석 /analysis/ai] 단지를 고르기 **전** 화면 — 도구의 대표 그림 **빈 틀**(값 없음: 레이더 축만 · 부채꼴 축만 ·
   지도 격자만 · 신호등 3개 회색)을 흐리게 깔고 그 위에 단지 고르기를 얹는다("이렇게 써요 ①②" 카드는 걷었다).
   숫자·라벨은 하나도 없다 — 빈 틀은 데이터처럼 읽히면 안 된다(정직 원칙). 순수 SVG, 클라이언트 JS 0. 색은 토큰만. */

import type { AiAnalysisToolId } from "@/lib/ai/ai-tools";

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

/** [1026b] 목록 틀 — 앞머리(점·네모 칸·없음) + 막대 두 개씩 줄 */
function ListFrame({ lead }: { lead: "dot" | "box" | "none" }) {
  return (
    <svg viewBox="0 0 300 190" className="cxw-frame-svg" aria-hidden="true">
      {[0, 1, 2, 3, 4].map((i) => {
        const y = 21 + i * 37;
        return (
          <g key={i}>
            {lead === "dot" && <circle cx={24} cy={y} r={9} className="fill-line" />}
            {lead === "box" && <rect x={15} y={y - 9} width={18} height={18} rx={4} fill="none" className="stroke-line" strokeWidth={2} />}
            <rect x={lead === "none" ? 16 : 46} y={y - 5} width={150 - (i % 3) * 32} height={10} rx={5} className="fill-line" />
            <rect x={236} y={y - 5} width={48} height={10} rx={5} className="fill-line" />
          </g>
        );
      })}
    </svg>
  );
}

/** [1026b] 표 틀 — 항목 열 + 단지 3열 */
function TableFrame() {
  return (
    <svg viewBox="0 0 300 190" className="cxw-frame-svg" aria-hidden="true">
      {[0, 1, 2, 3, 4].map((r) => (
        <g key={r}>
          {r > 0 && <line x1={10} x2={290} y1={r * 36 + 4} y2={r * 36 + 4} className="stroke-line" strokeWidth={1} />}
          {[0, 1, 2, 3].map((c) => (
            <rect key={c} x={14 + c * 70} y={r * 36 + 14} width={c === 0 ? 44 : 52} height={10} rx={5} className="fill-line" />
          ))}
        </g>
      ))}
    </svg>
  );
}

/** [1026b] 막대 틀 — 가로 막대 넷(길이만 다르다) */
function BarsFrame() {
  return (
    <svg viewBox="0 0 300 170" className="cxw-frame-svg" aria-hidden="true">
      {[250, 180, 120, 70].map((w, i) => (
        <g key={i}>
          <rect x={14} y={24 + i * 38} width={46} height={10} rx={5} className="fill-line" />
          <rect x={72} y={20 + i * 38} width={w - 40} height={18} rx={9} className="fill-line" />
        </g>
      ))}
    </svg>
  );
}

/** 대표 그림의 빈 틀 — 도구마다 다르다 */
export function EmptyFrame({ tool }: { tool: AiAnalysisToolId }) {
  if (tool === "ai-diagnosis") return <RadarFrame />;
  if (tool === "ai-prediction") return <FanFrame />;
  if (tool === "ai-inspection") return <MapFrame />;
  if (tool === "ai-timing") return <LightsFrame />;
  if (tool === "ai-risk" || tool === "contract-risk") return <ListFrame lead="dot" />;
  if (tool === "my-checklist") return <ListFrame lead="box" />;
  if (tool === "ai-simulator") return <ListFrame lead="none" />;
  if (tool === "ai-compare") return <TableFrame />;
  return <BarsFrame />;
}
