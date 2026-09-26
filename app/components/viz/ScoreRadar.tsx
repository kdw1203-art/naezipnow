/* [1008 · W] 종합 진단 5항목 레이더 — 잰 항목만 모양을 만든다.
 *
 * app/components/viz/Radar.tsx 는 후보 비교용(값이 전부 있는 전제)이라 빈 항목을 0 으로 그리면
 * "0점"처럼 보인다 — 자료가 없는 항목은 꼭짓점을 찍지 않고 이름 옆에 "자료 없음"을 적는다.
 * 고정 크기(글자 10px 그대로) · 토큰 색 · 역할 img + aria-label. 계산 없음(점수는 서버가 준다). */

export type RadarItem = { key: string; label: string; score: number | null };

/* 가로 300 · 세로 214 — 좌우 항목 이름(두 줄)이 390px 화면 카드 안에 들어오는 크기 */
const W = 300;
const H = 214;
const CX = 150;
const CY = 106;
const R = 72;

function pt(i: number, n: number, ratio: number) {
  const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
  return { x: CX + Math.cos(a) * R * ratio, y: CY + Math.sin(a) * R * ratio };
}

/* [1009 · A] 축 글자 — 모바일 캡션 하한(--fs-caption: 390px 에서 11px)을 같이 탄다(속성 10px 만으로는 모바일도 10px) */
const SVG_CAPTION = { fontSize: "var(--fs-caption, 10px)" } as const;

export function ScoreRadar({ items }: { items: readonly RadarItem[] }) {
  const n = items.length;
  if (n < 3) return null;
  const measured = items.map((it, i) => ({ ...it, i })).filter((it) => typeof it.score === "number");
  const poly = measured.map((it) => pt(it.i, n, Math.max(0.04, (it.score as number) / 100)));
  const aria = items.map((it) => `${it.label} ${it.score != null ? `${it.score}점` : "자료 없음"}`).join(", ");
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`5가지 항목 점수 — ${aria}`} className="mx-auto block max-w-full">
      {[0.25, 0.5, 0.75, 1].map((t) => (
        <polygon
          key={t}
          points={items.map((_, i) => { const p = pt(i, n, t); return `${p.x},${p.y}`; }).join(" ")}
          fill="none"
          className="stroke-divider"
          strokeWidth={1}
        />
      ))}
      {items.map((it, i) => {
        const p = pt(i, n, 1);
        return <line key={it.key} x1={CX} y1={CY} x2={p.x} y2={p.y} className="stroke-divider" strokeWidth={1} />;
      })}
      {poly.length >= 3 && (
        <polygon
          points={poly.map((p) => `${p.x},${p.y}`).join(" ")}
          className="fill-primary stroke-primary"
          fillOpacity={0.16}
          strokeWidth={2}
          strokeLinejoin="round"
        />
      )}
      {poly.length === 2 && (
        <line x1={poly[0].x} y1={poly[0].y} x2={poly[1].x} y2={poly[1].y} className="stroke-primary" strokeWidth={2} />
      )}
      {measured.map((it, k) => (
        <circle key={it.key} cx={poly[k].x} cy={poly[k].y} r={3.2} className="fill-primary stroke-surface" strokeWidth={1.2} />
      ))}
      {items.map((it, i) => {
        const p = pt(i, n, 1.22);
        const anchor = p.x > CX + 6 ? "start" : p.x < CX - 6 ? "end" : "middle";
        /* 이름 아래 점수 — 두 줄로 좁게(위 꼭짓점도 캔버스 안에 들어온다: 첫 줄 윗변 ≈ 6px) */
        const y0 = p.y - 2;
        return (
          <text key={it.key} x={p.x} y={y0} textAnchor={anchor} fontSize={10} style={SVG_CAPTION} fontWeight={800} className={it.score == null ? "fill-text-3" : "fill-text-1"}>
            {it.label}
            <tspan x={p.x} dy={13} fontWeight={700} className={it.score == null ? "fill-text-3" : "fill-primary"}>
              {it.score != null ? `${it.score}점` : "자료 없음"}
            </tspan>
          </text>
        );
      })}
    </svg>
  );
}
