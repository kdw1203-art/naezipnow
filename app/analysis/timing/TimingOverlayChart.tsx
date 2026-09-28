"use client";

import { useEffect, useMemo, useState } from "react";
import { layoutOverlay, nearestSlot, type OverlayIndexPoint, type OverlayVolumeRow } from "./overlay-geometry";

/* [1021 · 지역 시세 price·timing] 지수(선, --brand-red) + 월 거래량(막대, --primary soft · 최다 달 채움) 한 그림.
   지시: 시안 mock8/timing — 두 차트를 한 SVG 로. 값은 TimingClient 의 trend.points·volume 그대로(dataviz 규칙: 색은 토큰만).
   폭은 재서 픽셀로 그린다(ScrubLine 과 같은 이유 — 늘어나는 뷰박스는 폰에서 글자·점이 찌그러진다).
   훑기: 마우스는 올리기만 해도, 손가락은 누르고 끌면 그 달 지수·거래 건수를 머리 한 줄로 읽는다(세로 스크롤은 막지 않는다). */

const PAD = { padL: 8, padR: 8, padT: 10, padB: 22 };

function fmtIdx(v: number): string {
  return `${(Math.round(v * 10) / 10).toLocaleString("ko-KR")}pt`;
}

function periodLong(period: string, weekly: boolean): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(period);
  if (!m) return period;
  return weekly ? `${m[1]}년 ${Number(m[2])}월 ${Number(m[3])}일 주` : `${m[1]}년 ${Number(m[2])}월`;
}

function ymLong(ym: string): string {
  return `${ym.slice(0, 4)}년 ${Number(ym.slice(4, 6))}월`;
}

export function TimingOverlayChart({
  index,
  weekly,
  volume,
  height = 220,
  ariaLabel,
}: {
  index: readonly OverlayIndexPoint[];
  weekly: boolean;
  volume: readonly OverlayVolumeRow[];
  height?: number;
  ariaLabel: string;
}) {
  const [el, setEl] = useState<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(320);
  const [active, setActive] = useState<number | null>(null);

  useEffect(() => {
    if (!el) return;
    const apply = () => {
      const w = Math.round(el.getBoundingClientRect().width);
      if (w > 0) setWidth(w);
    };
    apply();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => ro.disconnect();
  }, [el]);

  const layout = useMemo(
    () => layoutOverlay({ index, weekly, volume, box: { width, height, ...PAD } }),
    [index, weekly, volume, width, height],
  );
  useEffect(() => setActive(null), [index, volume]);

  if (!layout) return null;

  const setFromClientX = (clientX: number) => {
    if (!el) return;
    const x = clientX - el.getBoundingClientRect().left;
    const n = nearestSlot(layout, x);
    setActive(n ? n.i : null);
  };

  const countByYm = new Map(layout.bars.map((b) => [b.month, b.count]));
  const act =
    active !== null
      ? layout.points.length
        ? active < layout.points.length
          ? { x: layout.points[active].x, label: periodLong(layout.points[active].period, weekly), idx: layout.points[active].value, count: countByYm.get(layout.points[active].ym) ?? null }
          : null
        : active < layout.bars.length
          ? { x: layout.bars[active].x + layout.bars[active].w / 2, label: ymLong(layout.bars[active].month), idx: null, count: layout.bars[active].count }
          : null
      : null;
  const last = layout.points[layout.points.length - 1] ?? null;

  return (
    <div className="flex flex-col gap-1">
      {/* 읽는 줄 — 훑는 동안 그 달, 손을 떼면 최신 값 */}
      <p className="t-caption min-h-[18px] tabular-nums text-text-3" aria-live="polite">
        {act ? (
          <>
            {act.label}
            {act.idx !== null && (
              <>
                {" · "}지수 <b className="text-ink">{fmtIdx(act.idx)}</b>
              </>
            )}
            {act.count !== null && (
              <>
                {" · "}거래 <b className="text-ink">{act.count.toLocaleString("ko-KR")}건</b>
              </>
            )}
          </>
        ) : last ? (
          <>
            {periodLong(last.period, weekly)} · 지수 <b className="text-ink">{fmtIdx(last.value)}</b>
            {countByYm.has(last.ym) && (
              <>
                {" · "}거래 <b className="text-ink">{countByYm.get(last.ym)!.toLocaleString("ko-KR")}건</b>
              </>
            )}
          </>
        ) : null}
      </p>
      <div
        ref={setEl}
        className="tmo-plot"
        style={{ height }}
        role="group"
        aria-label={`${ariaLabel} — 좌우 화살표 키로 칸마다 값을 볼 수 있어요`}
        tabIndex={0}
        onKeyDown={(e) => {
          const n = layout.points.length || layout.bars.length;
          if (n === 0) return;
          if (e.key === "ArrowRight") {
            e.preventDefault();
            setActive((a) => Math.min(n - 1, (a ?? n - 1) + 1));
          } else if (e.key === "ArrowLeft") {
            e.preventDefault();
            setActive((a) => Math.max(0, (a ?? n) - 1));
          } else if (e.key === "Home") {
            e.preventDefault();
            setActive(0);
          } else if (e.key === "End") {
            e.preventDefault();
            setActive(n - 1);
          } else if (e.key === "Escape") {
            setActive(null);
          }
        }}
        onBlur={() => setActive(null)}
        onPointerDown={(e) => {
          if (e.pointerType === "mouse" && e.button !== 0) return;
          setFromClientX(e.clientX);
        }}
        onPointerMove={(e) => {
          if (e.pointerType === "mouse" || e.buttons > 0 || e.pressure > 0) setFromClientX(e.clientX);
        }}
        onPointerLeave={(e) => {
          if (e.pointerType === "mouse") setActive(null);
        }}
        onPointerUp={(e) => {
          if (e.pointerType !== "mouse") setActive(null);
        }}
        onPointerCancel={() => setActive(null)}
      >
        <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="block" role="img" aria-label={ariaLabel}>
          <line x1={PAD.padL} x2={width - PAD.padR} y1={layout.plotBottom} y2={layout.plotBottom} stroke="var(--divider)" />
          {layout.bars.map((b) => (
            <rect
              key={b.month}
              x={b.x}
              y={b.y}
              width={b.w}
              height={Math.max(b.h, 1)}
              rx="3"
              fill="var(--primary)"
              fillOpacity={b.isMax ? 1 : 0.28}
            />
          ))}
          {layout.area && <path d={layout.area} fill="var(--brand-red)" fillOpacity="0.08" />}
          {layout.line && (
            <path d={layout.line} fill="none" stroke="var(--brand-red)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          )}
          {last && <circle cx={last.x} cy={last.y} r="4" fill="var(--brand-red)" />}
          {act && (
            <>
              <line x1={act.x} x2={act.x} y1={PAD.padT} y2={layout.plotBottom} stroke="var(--text-3)" strokeDasharray="3 3" />
              {act.idx !== null && active !== null && layout.points[active] && (
                <circle cx={act.x} cy={layout.points[active].y} r="4.5" fill="var(--surface)" stroke="var(--brand-red)" strokeWidth="2" />
              )}
            </>
          )}
        </svg>
        {layout.points.length >= 2 && (
          <>
            <span aria-hidden="true" className="trend-lab font-bold" style={{ left: 4, top: Math.max(0, layout.idxMaxY - 16) }}>
              {fmtIdx(layout.idxMax)}
            </span>
            <span aria-hidden="true" className="trend-lab font-bold" style={{ left: 4, top: Math.min(height - 34, layout.idxMinY + 2) }}>
              {fmtIdx(layout.idxMin)}
            </span>
          </>
        )}
        {layout.maxBar && (
          <span
            aria-hidden="true"
            className="trend-lab font-bold text-primary"
            style={{
              left: (layout.bars.find((b) => b.isMax)?.x ?? 0) + (layout.bars.find((b) => b.isMax)?.w ?? 0) / 2,
              top: (layout.bars.find((b) => b.isMax)?.y ?? 0) - 15,
              transform: "translateX(-50%)",
            }}
          >
            {layout.maxBar.count.toLocaleString("ko-KR")}건
          </span>
        )}
        {layout.ticks.map((t) => (
          <span key={t.ym} aria-hidden="true" className="trend-lab" style={{ left: t.x, bottom: 2, transform: "translateX(-50%)" }}>
            {t.label}
          </span>
        ))}
      </div>
    </div>
  );
}
