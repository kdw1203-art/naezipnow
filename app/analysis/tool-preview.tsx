/* [1115 · AI 분석 도구 결과 예시] 소유자 2026-11-09 "AI 분석 도구에는 점수와 그래프 결과값을 보여주는 예시 이미지(그래프 등)를 우측에".
   도구 표의 오른쪽 칸 — 그 도구가 내놓는 결과의 **모양**(점수 링 · 세 갈래 선 · 동선 · 신호 셋)을 작은 그림으로. 실제 단지 값이 아니므로
   칸 머리 "결과 예시" + 그림 아래 "예시" 칩 — 점수 링의 72 는 모양을 보이려는 예시 숫자(실제 단지 값 아님 · 칸 머리와 칩이 그렇게 적는다).
   import 0 — hub-tiers(클라이언트 묶음)가 끌어오므로 /analysis 첫 로드 예산을 지킨다. 색은 도구 색(tool-ink = currentColor) · 등락 토큰. */

function Diagnosis() {
  /* 점수 링 + 다섯 축 다각형 */
  const axes = [0, 1, 2, 3, 4].map((i) => {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / 5;
    return [Math.cos(a), Math.sin(a)] as const;
  });
  const val = [0.45, 0.8, 0.95, 0.55, 0.7];
  const cx = 120;
  const cy = 28;
  const r = 22;
  const poly = axes.map(([x, y], i) => `${(cx + x * r * val[i]).toFixed(1)},${(cy + y * r * val[i]).toFixed(1)}`).join(" ");
  const grid = axes.map(([x, y]) => `${(cx + x * r).toFixed(1)},${(cy + y * r).toFixed(1)}`).join(" ");
  return (
    <svg viewBox="0 0 180 56" className="h-14 w-full" aria-hidden="true">
      <circle cx="28" cy="28" r="20" fill="none" className="stroke-divider" strokeWidth="5" />
      <circle cx="28" cy="28" r="20" fill="none" stroke="currentColor" strokeWidth="5" strokeLinecap="round" strokeDasharray={`${0.72 * 125.7} 125.7`} transform="rotate(-90 28 28)" />
      <text x="28" y="33" textAnchor="middle" className="fill-ink" fontSize="14" fontWeight="700">72</text>
      <polygon points={grid} fill="none" className="stroke-line" strokeWidth="1" />
      <polygon points={poly} fill="currentColor" fillOpacity="0.15" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function Prediction() {
  /* 지나온 선 + 낙관 · 기본 · 비관 세 갈래 */
  return (
    <svg viewBox="0 0 180 56" className="h-14 w-full" aria-hidden="true">
      <polyline points="4,38 24,34 44,36 64,30 84,31 100,28" fill="none" className="stroke-text-3" strokeWidth="1.8" strokeLinejoin="round" />
      <line x1="100" y1="6" x2="100" y2="50" className="stroke-line" strokeWidth="1" strokeDasharray="2 3" />
      <polyline points="100,28 176,10" fill="none" className="stroke-up" strokeWidth="1.8" strokeDasharray="4 3" />
      <polyline points="100,28 176,24" fill="none" stroke="currentColor" strokeWidth="2.2" />
      <polyline points="100,28 176,42" fill="none" className="stroke-down" strokeWidth="1.8" strokeDasharray="4 3" />
      <circle cx="176" cy="10" r="2.5" className="fill-up" />
      <circle cx="176" cy="24" r="2.5" fill="currentColor" />
      <circle cx="176" cy="42" r="2.5" className="fill-down" />
    </svg>
  );
}

function Inspection() {
  /* 하루 동선 — 번호 붙은 점 넷을 잇는 선 */
  const pts: Array<[number, number]> = [
    [16, 40],
    [62, 16],
    [112, 36],
    [162, 14],
  ];
  return (
    <svg viewBox="0 0 180 56" className="h-14 w-full" aria-hidden="true">
      <polyline points={pts.map((p) => p.join(",")).join(" ")} fill="none" stroke="currentColor" strokeWidth="1.8" strokeDasharray="5 4" strokeLinecap="round" />
      {pts.map(([x, y], i) => (
        <g key={i}>
          <circle cx={x} cy={y} r="9" fill="currentColor" />
          <text x={x} y={y + 4} textAnchor="middle" fontSize="10" fontWeight="700" className="fill-surface">
            {i + 1}
          </text>
        </g>
      ))}
    </svg>
  );
}

function Timing() {
  /* 신호 셋 — 가격 흐름 · 거래 열기 · 입주 물량, 줄마다 세기 막대(켜짐 빨강 · 보통 회색 · 약함 파랑) */
  const rows: Array<[string, number, string]> = [
    ["가격", 0.78, "fill-up"],
    ["거래", 0.5, "fill-text-3"],
    ["입주", 0.28, "fill-down"],
  ];
  return (
    <svg viewBox="0 0 180 56" className="h-14 w-full" aria-hidden="true">
      {rows.map(([label, v, cls], i) => (
        <g key={label}>
          <text x="4" y={14 + i * 17} fontSize="10" fontWeight="700" className="fill-text-2">
            {label}
          </text>
          <rect x="34" y={6 + i * 17} width="140" height="8" rx="4" className="fill-divider" />
          <rect x="34" y={6 + i * 17} width={140 * v} height="8" rx="4" className={cls} />
        </g>
      ))}
    </svg>
  );
}

const PREVIEW: Record<string, { el: () => React.ReactElement; caption: string }> = {
  "ai-diagnosis": { el: Diagnosis, caption: "점수 링 · 5축 그래프" },
  "ai-prediction": { el: Prediction, caption: "낙관 · 기본 · 비관 세 갈래" },
  "ai-inspection": { el: Inspection, caption: "하루 임장 순서" },
  "ai-timing": { el: Timing, caption: "신호 3개 세기" },
};

export function ToolResultPreview({ id, result }: { id: string; result: string | null }) {
  const p = PREVIEW[id];
  if (!p) return <span className="t-caption text-text-3">{result ?? "—"}</span>;
  const El = p.el;
  return (
    <span className="tool-ink flex flex-col gap-0.5">
      <span className="block rounded-lg bg-bg px-2 py-1">
        <El />
      </span>
      <span className="flex items-baseline justify-between gap-1 t-caption text-text-3">
        <span className="truncate">{result ?? p.caption}</span>
        <span className="shrink-0 rounded bg-divider px-1 font-bold">예시</span>
      </span>
    </span>
  );
}
