/* [1025c · 결정·비서] 결정 카드 대표 그림 — 겹친 레이더 · 원형 게이지 · 기준별 순위 막대 · 회색 견본(빈 상태).
   기하는 lib/decide/radar-geometry · rank-bars(순수 · 테스트). 색은 토큰만 — 후보 순서대로 primary · ink · brand-red
   (시안 mock1025c: 파랑 · 네이비 · 주홍. 네이비는 다크에서 안 보여 ink 로 — 같은 자리·같은 뜻).
   서버·클라이언트 겸용(상태 없음). 300px 뷰박스라 폰 320px 카드 안에 가로 스크롤 없이 들어간다. */

import type { ReactNode } from "react";
import {
  RADAR_CX,
  RADAR_CY,
  RADAR_H,
  RADAR_RINGS,
  RADAR_W,
  RING_R,
  RING_SIZE,
  RING_STROKE,
  polygonPoints,
  radarLabel,
  radarPoint,
  radarRing,
  radarSeriesPoints,
  ringDash,
  type DecideRadar,
} from "@/lib/decide/radar-geometry";
import type { RankBarGroup } from "@/lib/decide/rank-bars";

/** 후보 순서 → 토큰 색(채움·선·글자·막대) */
export const SERIES_TONE = [
  { fill: "fill-primary", stroke: "stroke-primary", text: "text-primary", bg: "bg-primary" },
  { fill: "fill-ink", stroke: "stroke-ink", text: "text-ink", bg: "bg-ink" },
  { fill: "fill-brand-red", stroke: "stroke-brand-red", text: "text-brand-red", bg: "bg-brand-red" },
] as const;

export function seriesTone(i: number) {
  return SERIES_TONE[Math.min(SERIES_TONE.length - 1, Math.max(0, i))];
}

const SVG_CAPTION = { fontSize: "var(--fs-caption, 10px)" } as const;

/* ── 겹친 레이더 ──────────────────────────────────────────────────────── */

export function DecideRadarSvg({ radar, label }: { radar: DecideRadar; label: string }) {
  const n = radar.axes.length;
  return (
    <svg viewBox={`0 0 ${RADAR_W} ${RADAR_H}`} role="img" aria-label={label} className="mx-auto block w-full max-w-[300px]">
      {RADAR_RINGS.map((t) => (
        <polygon key={t} points={radarRing(n, t)} fill="none" className="stroke-line-strong" strokeWidth={1} />
      ))}
      {radar.axes.map((a, i) => {
        const p = radarPoint(i, n, 1);
        return <line key={a.key} x1={RADAR_CX} y1={RADAR_CY} x2={p.x} y2={p.y} className="stroke-line-strong" strokeWidth={1} />;
      })}
      {/* 뒤 후보부터 그려 1번 후보가 맨 위에 */}
      {[...radar.series].map((s, i) => ({ s, i })).reverse().map(({ s, i }) => {
        const tone = seriesTone(i);
        const pts = radarSeriesPoints(s.values);
        return (
          <g key={s.id}>
            <polygon points={polygonPoints(pts)} className={`${tone.fill} ${tone.stroke}`} fillOpacity={i === 0 ? 0.18 : 0.1} strokeWidth={2} strokeLinejoin="round" />
            {pts.map((p, k) => (
              <circle key={radar.axes[k].key} cx={p.x} cy={p.y} r={3} className={tone.fill} />
            ))}
          </g>
        );
      })}
      {radar.axes.map((a, i) => {
        const l = radarLabel(i, n);
        return (
          <text key={a.key} x={l.x} y={l.y + 4} textAnchor={l.anchor} fontSize={10} style={SVG_CAPTION} fontWeight={700} className={a.scored ? "fill-text-1" : "fill-text-3"}>
            {a.label}
          </text>
        );
      })}
    </svg>
  );
}

/** 빈 상태 — 데이터 없는 레이더 윤곽(3축 · 회색) + 한 문장은 호출부가 적는다 */
export function RadarGhost() {
  const n = 3;
  return (
    <svg viewBox={`0 0 ${RADAR_W} ${RADAR_H}`} aria-hidden="true" className="mx-auto block w-full max-w-[240px] text-text-3">
      {RADAR_RINGS.map((t) => (
        <polygon key={t} points={radarRing(n, t)} fill="none" className="stroke-line-strong" strokeWidth={1} strokeDasharray={t === 1 ? undefined : "3 3"} />
      ))}
      {Array.from({ length: n }, (_, i) => {
        const p = radarPoint(i, n, 1);
        return <line key={i} x1={RADAR_CX} y1={RADAR_CY} x2={p.x} y2={p.y} className="stroke-line-strong" strokeWidth={1} />;
      })}
      {["가격", "전세가율", "거래량"].map((t, i) => {
        const l = radarLabel(i, n);
        return (
          <text key={t} x={l.x} y={l.y + 4} textAnchor={l.anchor} fontSize={10} style={SVG_CAPTION} fontWeight={700} className="fill-text-3">
            {t}
          </text>
        );
      })}
    </svg>
  );
}

/* ── 원형 게이지(1순위 점수) ───────────────────────────────────────────── */

export function ScoreRing({ score, label }: { score: number; label: string }) {
  const { dash, circumference } = ringDash(score);
  const c = RING_SIZE / 2;
  return (
    <div className="relative h-[92px] w-[92px] shrink-0" role="img" aria-label={label}>
      <svg viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`} width={RING_SIZE} height={RING_SIZE} className="block" aria-hidden="true">
        <circle cx={c} cy={c} r={RING_R} fill="none" className="stroke-divider" strokeWidth={RING_STROKE} />
        <circle
          cx={c}
          cy={c}
          r={RING_R}
          fill="none"
          className="stroke-primary"
          strokeWidth={RING_STROKE}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circumference}`}
          transform={`rotate(-90 ${c} ${c})`}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center leading-none">
        <span className="t-display t-num font-bold text-ink">{score}</span>
        <span className="mt-0.5 t-caption text-text-3">/ 100</span>
      </div>
    </div>
  );
}

/* ── 기준별 순위 막대 ─────────────────────────────────────────────────── */

export function DecideRankBars({ groups, format }: { groups: readonly RankBarGroup[]; format: (key: RankBarGroup["key"], v: number | null) => string }) {
  return (
    <div className="flex flex-col divide-y" data-tone="plain">
      {groups.map((g) => (
        <div key={g.key} className="py-1.5">
          <div className="t-caption font-bold text-text-3">
            {g.label} · {g.note}
          </div>
          <ol className="m-0 mt-1 flex list-none flex-col gap-1 p-0">
            {g.rows.map((r) => {
              const na = r.value === null;
              const tone = seriesTone(r.index);
              return (
                <li key={r.id} className="grid grid-cols-[20px_minmax(0,1fr)_minmax(0,1.2fr)_auto] items-center gap-2">
                  <span
                    className={`inline-flex h-5 w-5 items-center justify-center rounded-lg t-caption font-bold ${na ? "bg-bg text-text-3" : r.rank === 1 ? "bg-primary-soft text-primary" : "bg-bg text-text-2"}`}
                  >
                    {na ? "—" : r.rank}
                  </span>
                  <span className={`truncate t-sub ${na ? "text-text-3" : "text-text-1"}`}>{r.name}</span>
                  <span className={`rank-track ${tone.text}`} aria-hidden="true">
                    {!na && <span className="rank-fill" style={{ width: `${Math.max(3, Math.round(r.ratio * 100))}%` }} />}
                  </span>
                  <span className={`t-caption t-num whitespace-nowrap ${na ? "text-text-3" : "text-text-2"}`}>{format(g.key, r.value)}</span>
                </li>
              );
            })}
          </ol>
        </div>
      ))}
    </div>
  );
}

/* ── 세로 타임라인(지난 결정) ─────────────────────────────────────────── */

export function TimelineItem({
  tone,
  last,
  children,
}: {
  /** now: 파란 채움 · past: 파란 테두리 · ghost: 회색 점선 */
  tone: "now" | "past" | "ghost";
  last?: boolean;
  children: ReactNode;
}) {
  const dot =
    tone === "now"
      ? "border-primary bg-primary"
      : tone === "past"
        ? "border-primary bg-surface"
        : "border-dashed border-line-strong bg-surface";
  return (
    <li className="relative flex gap-3">
      <span className="flex w-2.5 shrink-0 flex-col items-center">
        <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full border-2 ${dot}`} aria-hidden="true" />
        {!last && <span className="mt-1 w-0.5 flex-1 bg-line-strong" aria-hidden="true" />}
      </span>
      <div className={`min-w-0 flex-1 pb-3 ${tone === "ghost" ? "text-text-3" : ""}`}>{children}</div>
    </li>
  );
}
