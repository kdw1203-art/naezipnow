"use client";

import { useEffect, useRef, useState } from "react";
import Link from "@/app/components/IntentLink";

/* [1114 · 홈 벤토] 순위 배너 — 소유자 2026-11-09 "옅은 파란색 지역 단지별은 배너(아래에서 위로 올라가는, 순위)로".
   한 줄씩 아래에서 위로 넘긴다(.home-roll__page 애니메이션 · RollingPanel 과 같은 멈춤 규칙):
     · 첫 렌더는 1위(서버 HTML 과 같다). 마우스를 올리거나 포커스가 안에 있으면 멈춘다 · 탭이 숨으면 멈춘다.
     · prefers-reduced-motion 이면 자동으로 넘기지 않는다(↑ 단추로만).
     · aria-live 를 쓰지 않는다(몇 초마다 읽어 주면 방해) — 전체 순위는 아래 닫힌 목록(서버 HTML)에 있다. */
export type RankTickerItem = { key: string; label: string; sub: string; value: string; href: string | null };

export function RankTicker({ items, intervalMs = 3200 }: { items: RankTickerItem[]; intervalMs?: number }) {
  const [idx, setIdx] = useState(0);
  const [tick, setTick] = useState(0);
  const [paused, setPaused] = useState(false);
  const [reduce, setReduce] = useState(false);
  const hostRef = useRef<HTMLDivElement | null>(null);
  const n = items.length;

  useEffect(() => {
    try {
      const mql = window.matchMedia("(prefers-reduced-motion: reduce)");
      const sync = () => setReduce(mql.matches);
      sync();
      mql.addEventListener("change", sync);
      return () => mql.removeEventListener("change", sync);
    } catch {
      return undefined;
    }
  }, []);

  useEffect(() => {
    if (n < 2 || reduce || paused) return;
    const t = window.setInterval(() => {
      if (document.visibilityState === "hidden") return;
      setIdx((i) => (i + 1) % n);
      setTick((k) => k + 1);
    }, intervalMs);
    return () => window.clearInterval(t);
  }, [n, reduce, paused, intervalMs]);

  if (n === 0) return null;
  const cur = items[Math.min(idx, n - 1)];
  const row = (
    <>
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary t-sub font-bold text-white tabular-nums">
        {Math.min(idx, n - 1) + 1}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate t-body font-bold text-ink">{cur.label}</span>
        <span className="block truncate t-caption text-text-3 tabular-nums">{cur.sub}</span>
      </span>
      <span className="shrink-0 t-body t-num font-bold text-primary">{cur.value}</span>
    </>
  );
  return (
    <div
      ref={hostRef}
      className="lq-panel flex items-center gap-1 overflow-hidden"
      data-tone="blue"
      onPointerEnter={(e) => {
        if (e.pointerType === "mouse") setPaused(true);
      }}
      onPointerLeave={(e) => {
        if (e.pointerType === "mouse") setPaused(false);
      }}
      onTouchStart={() => setPaused(true)}
      onTouchEnd={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={(e) => {
        if (!hostRef.current?.contains(e.relatedTarget as Node | null)) setPaused(false);
      }}
    >
      <div key={reduce ? "static" : `${idx}-${tick}`} className={`min-w-0 flex-1 ${reduce ? "" : "home-roll__page"}`}>
        {cur.href ? (
          <Link href={cur.href} className="press flex min-h-12 items-center gap-3 no-underline">
            {row}
          </Link>
        ) : (
          <div className="flex min-h-12 items-center gap-3">{row}</div>
        )}
      </div>
      {n > 1 && (
        <button
          type="button"
          onClick={() => {
            setIdx((i) => (i + 1) % n);
            setTick((k) => k + 1);
          }}
          aria-label={`다음 순위 (${Math.min(idx, n - 1) + 1}/${n})`}
          className="press flex h-10 shrink-0 items-center gap-0.5 rounded-lg px-1.5 t-caption text-text-3 tabular-nums"
        >
          {Math.min(idx, n - 1) + 1}/{n}
          <span aria-hidden="true">↑</span>
        </button>
      )}
    </div>
  );
}
