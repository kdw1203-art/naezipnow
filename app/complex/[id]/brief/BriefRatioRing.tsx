/* [1025c · 브리핑] 전세가율 링 — 64×64 · r 26 · 굵기 6(시안 ringPct). 회색 궤도 위에 파란 호(전세가율 %), 가운데 숫자.
   값이 없으면 궤도만 + "—"(빈 상태의 회색 견본 그림). 서버 조각 · 색은 토큰 변수뿐. /pro 견본 SVG 안에도 x·y 로 앉힌다. */
import { ringGeometry } from "@/lib/brief/model";

export function BriefRatioRing({ pct, x, y, size = 64, className }: { pct: number | null; x?: number; y?: number; size?: number; className?: string }) {
  const g = ringGeometry(pct);
  const label = g.value == null ? "—" : `${pct}%`;
  return (
    <svg viewBox="0 0 64 64" x={x} y={y} width={size} height={size} role="img" aria-label={`전세가율 ${label}`} className={className}>
      <circle cx="32" cy="32" r={g.r} fill="none" stroke="var(--divider)" strokeWidth="6" />
      {g.dash > 0 && (
        <circle
          cx="32"
          cy="32"
          r={g.r}
          fill="none"
          stroke="var(--primary)"
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={`${g.dash} ${g.c}`}
          transform="rotate(-90 32 32)"
        />
      )}
      <text x="32" y="32" textAnchor="middle" dominantBaseline="central" fontSize="12" fontWeight="700" fill={g.value == null ? "var(--text-3)" : "var(--ink)"} className="tabular-nums">
        {label}
      </text>
    </svg>
  );
}

export default BriefRatioRing;
