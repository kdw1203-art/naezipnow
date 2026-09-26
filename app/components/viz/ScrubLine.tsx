"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { formatByKey, type NumFormatKey } from "@/lib/format/by-key";
import {
  DELTA_ARROW,
  DELTA_CLASS,
  DELTA_WORD,
  absManwonText,
  absPctText,
  deltaDir,
  diffDir,
  pctChange,
} from "@/lib/format/delta";
import { layoutScrub, nearestValued, rangeStart, rangeUsable, stepValued, yForValue } from "@/lib/viz/scrub-geometry";
import { Segmented } from "@/app/components/ui/Segmented";

/* [1009] 손가락으로 훑는 추세선 — 토스증권의 "누르고 끌면 그 시점 값" + 네이버 부동산의 기간 탭.
 *
 * 왜(2026-09-22 실측): 사이트의 차트 11종 어디에도 포인터 반응이 없었다(onPointerMove 0곳).
 * 월별 값을 알려면 표를 따로 찾아 읽어야 했고, TrendChart 는 viewBox 를 늘려(preserveAspectRatio="none")
 * 모바일에서 축 글자가 58% 폭으로 찌그러졌다. 이 차트는
 *   · 폭을 재서 **픽셀 좌표**로 그린다(점은 원, 글자는 HTML — 늘어나지 않는다),
 *   · 누르고 좌우로 끌면(마우스는 올리기만 해도) 세로선·점·말풍선이 따라오고, 머리의 큰 숫자가
 *     그 달 값과 "기간 시작 대비" 등락으로 바뀐다. 손을 떼면 최신 값으로 돌아간다,
 *   · 세로 스크롤은 막지 않는다(touch-action: pan-y — 가로로 끌 때만 훑기),
 *   · 키보드: 차트에 포커스 → ←/→ 로 한 칸씩, Home/End, Esc. 바뀐 값은 스크린리더가 읽는다,
 *   · 적은 표본(fewBelow)·빈 달은 속 빈 점과 점선(지어내지 않는다 — lib/viz/scrub-geometry.ts),
 *   · 처음 화면에 들어올 때 선이 한 번 그려진다(모션 최소화 설정이면 생략).
 * 서버 컴포넌트에서 그대로 쓴다 — props 는 전부 직렬화 가능한 값(포맷은 이름으로 고른다).
 */

export type ScrubFormat = Extract<NumFormatKey, "eok1" | "eokman" | "pct1" | "num1" | "int">;
export type ScrubRange = { key: string; label: string; /** 뒤에서 몇 칸 — 0 = 전체 */ last: number };
export type ScrubTone = "primary" | "up" | "down" | "ink" | "auto";

const fmtValue = (v: number, format: ScrubFormat, suffix: string) => formatByKey(v, format, suffix);

/** 머리 등락 — 금액이면 "▲ 1,200만원 (3.2%)", %값이면 "▲ 1.2%p", 지수·건수면 "▲ 3.2%" */
function changeParts(curr: number, base: number, format: ScrubFormat) {
  if (format === "pct1") {
    const d = curr - base;
    const dir = diffDir(d, 0.05);
    return dir ? { dir, text: dir === "flat" ? "보합" : `${absPctText(d)}p` } : null;
  }
  const pct = pctChange(curr, base);
  const dir = deltaDir(pct);
  if (pct === null || !dir) return null;
  if (dir === "flat") return { dir, text: "보합" };
  if (format === "eok1" || format === "eokman") {
    return { dir, text: `${absManwonText(curr - base)} (${absPctText(pct)})` };
  }
  return { dir, text: absPctText(pct) };
}

const PAD = { padL: 8, padR: 8, padT: 26, padB: 22 };

export function ScrubLine({
  values,
  labels,
  fullLabels,
  counts,
  countLabel = "거래",
  countUnit = "건",
  fewBelow = 0,
  format,
  suffix = "",
  height = 176,
  tone = "primary",
  ranges,
  defaultRange,
  title,
  caption,
  ariaLabel,
  footnote,
  showDots,
  yDomain,
  refLine,
  className,
}: {
  /** 시간 순(과거 → 최신) 값. 빈 달은 null */
  values: readonly (number | null)[];
  /** 축·말풍선 짧은 라벨("25.03") — values 와 같은 길이 */
  labels: readonly string[];
  /** 머리에 쓸 긴 라벨("2025년 3월") — 없으면 labels */
  fullLabels?: readonly string[];
  /** 칸마다 건수(거래 수 등) — 말풍선 "거래 3건", fewBelow 판단 */
  counts?: readonly (number | null)[];
  countLabel?: string;
  countUnit?: string;
  /** 이 건수 미만인 칸은 적은 표본(속 빈 점·점선). 0 이면 끔 */
  fewBelow?: number;
  format: ScrubFormat;
  /** num1·int 뒤에 붙일 단위("pt"·"건") */
  suffix?: string;
  /** 차트 영역 높이(px, 머리 제외) */
  height?: number;
  /** 선 색 — auto 면 기간 등락(상승 빨강·하락 파랑, 토스 관례) */
  tone?: ScrubTone;
  /** 기간 탭 — 쓸 수 있는(값 2개 이상) 탭만 보인다. 하나뿐이면 탭을 숨긴다 */
  ranges?: readonly ScrubRange[];
  defaultRange?: string;
  /** 머리 제목 — 주면 큰 숫자 머리(최신 값·기간 등락, 훑는 동안 그 달 값)를 그린다 */
  title?: string;
  /** 머리 제목 옆 작은 설명 — "월평균 · 84㎡" */
  caption?: string;
  ariaLabel: string;
  /** 차트 아래 출처 한 줄 */
  footnote?: string;
  /** 점 표시(기본: 24칸 이하일 때) */
  showDots?: boolean;
  /** 고정 세로축 — 점수(0~100)처럼 범위가 정해진 값. 없으면 데이터 범위에 맞춰 늘린다 */
  yDomain?: readonly [number, number];
  /** 가로 기준선(점선) + 오른쪽 라벨 — 예 { value: 50, label: "중립 50" }. 주면 "기간 시작" 기준선 대신 그린다 */
  refLine?: { value: number; label: string };
  className?: string;
}) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const wrapRef = useRef<HTMLDivElement | null>(null);
  /* [1009 · 리뷰 RA] 콜백 ref — 첫 렌더에 값이 모자라 차트가 없었다가 나중에 생겨도 폭 재기·선 그리기가 붙는다
     (예전 effect 는 [] 라 처음 한 번만 봤고, 그때 요소가 없으면 폭이 320px 에 묶였다) */
  const [plotEl, setPlotEl] = useState<HTMLDivElement | null>(null);
  const setPlotRef = useCallback((n: HTMLDivElement | null) => {
    wrapRef.current = n;
    setPlotEl(n);
  }, []);
  const [width, setWidth] = useState(320);
  const [active, setActive] = useState<number | null>(null);
  const [announce, setAnnounce] = useState("");
  const [draw, setDraw] = useState<"idle" | "armed" | "run">("idle");
  const drawDecided = useRef(false);

  const usableRanges = useMemo(
    () => (ranges ?? []).filter((r) => rangeUsable(values, r.last)),
    [ranges, values],
  );
  const [rangeKey, setRangeKey] = useState<string | null>(() => {
    const pick = (ranges ?? []).find((r) => r.key === defaultRange && rangeUsable(values, r.last));
    return pick?.key ?? null;
  });
  const range = usableRanges.find((r) => r.key === rangeKey) ?? usableRanges[usableRanges.length - 1] ?? null;
  const start = range ? rangeStart(values.length, range.last) : 0;

  const vis = useMemo(() => values.slice(start), [values, start]);
  const visLabels = labels.slice(start);
  const visFull = (fullLabels ?? labels).slice(start);
  const visCounts = counts?.slice(start);

  /* 폭 재기 — 첫 그림은 320 가정(서버 렌더), 붙은 뒤 실제 폭으로 다시 그린다 */
  useEffect(() => {
    const el = plotEl;
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
  }, [plotEl]);

  /* 선 그리기 — **나중에** 화면에 들어올 때 한 번. [1009 · 리뷰 RA] 붙는 순간 이미 화면 안에 있으면 그리지 않는다:
     서버가 그린 선이 하이드레이션 때 사라졌다 다시 그려지는 깜빡임(실측 1.2초 뒤 숨김 → 다시 그림)이 있었다.
     모션 최소화면 건너뛴다. */
  useEffect(() => {
    const el = plotEl;
    if (!el || drawDecided.current) return;
    drawDecided.current = true;
    let reduce = false;
    try {
      reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    } catch {
      reduce = false;
    }
    if (reduce || typeof IntersectionObserver === "undefined") return;
    const r = el.getBoundingClientRect();
    const vh = window.innerHeight || document.documentElement.clientHeight || 0;
    if (r.bottom > 0 && r.top < vh) return;
    setDraw("armed");
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setDraw("run");
          io.disconnect();
        }
      },
      { threshold: 0.2 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [plotEl]);

  const box = { width, height, ...PAD };
  const layout = useMemo(
    () => layoutScrub({ values: vis, counts: visCounts, fewBelow, box, domain: yDomain }),
    // box 는 width·height 에서만 달라진다
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [vis, visCounts, fewBelow, width, height, yDomain?.[0], yDomain?.[1]],
  );

  /* 기간이 바뀌면 훑던 자리를 놓는다(인덱스가 다른 달을 가리키게 된다) */
  useEffect(() => setActive(null), [start]);

  if (!layout) return null;

  /* 값이 바뀌어 칸 수가 줄었는데 누르던 자리가 남아 있으면 버린다(없는 칸을 읽다 죽지 않게) */
  const act = active !== null && active < layout.pts.length && layout.pts[active].y !== null ? active : null;

  const valuedIdx = layout.pts.filter((p) => p.y !== null).map((p) => p.i);
  const firstI = valuedIdx[0];
  const lastI = valuedIdx[valuedIdx.length - 1];
  /* [1009 · 리뷰 C·RA] 머리(손 떼었을 때)의 "지금 값"과 "기준 값"은 **표본이 충분한 칸**(fewBelow 이상)에서.
     충분한 칸이 2개 미만이면 **비교하지 않는다** — 1~2건짜리 달끼리의 등락이 큰 숫자 옆에 ▲18.5% 로 나오던 것
     (풍림아이원 84㎡ [3,0,1,1,2,0,1] 실측)을 막는다. 그때 큰 숫자는 가장 최근 값이고 "참고용"을 붙인다. */
  const solidIdx = valuedIdx.filter((i) => !layout.pts[i].few);
  const canCompare = solidIdx.length >= 2;
  const baseI = canCompare ? solidIdx[0] : firstI;
  const idleI = canCompare ? solidIdx[solidIdx.length - 1] : solidIdx.length === 1 ? solidIdx[0] : lastI;
  const shownI = act ?? idleI;
  const shown = layout.pts[shownI];
  const base = layout.pts[baseI].v as number;
  const change = canCompare && shown.v !== null && shownI !== baseI ? changeParts(shown.v, base, format) : null;
  const periodDir = canCompare ? (changeParts(layout.pts[idleI].v as number, base, format)?.dir ?? "flat") : "flat";
  const toneCls =
    tone === "auto"
      ? periodDir === "up"
        ? "text-up"
        : periodDir === "down"
          ? "text-down"
          : "text-text-2"
      : tone === "up"
        ? "text-up"
        : tone === "down"
          ? "text-down"
          : tone === "ink"
            ? "text-ink"
            : "text-primary";
  const dots = showDots ?? vis.length <= 24;
  const plotW = width;
  const baseLineY = refLine ? yForValue(layout, refLine.value) : canCompare ? layout.pts[baseI].y : null;

  const setFromClientX = (clientX: number) => {
    const el = wrapRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setActive(nearestValued(layout, clientX - r.left));
  };

  const describe = (i: number) => {
    const p = layout.pts[i];
    if (p.v === null) return "";
    const c = visCounts?.[i];
    const parts = [`${visFull[i] ?? visLabels[i]} ${fmtValue(p.v, format, suffix)}`];
    if (c !== undefined && c !== null) parts.push(`${countLabel} ${c.toLocaleString("ko-KR")}${countUnit}`);
    if (p.few) parts.push("표본 적음 · 참고용");
    const ch = canCompare && i !== baseI ? changeParts(p.v, base, format) : null;
    if (ch) parts.push(`${visLabels[baseI]} 대비 ${ch.dir === "flat" ? "보합" : `${DELTA_WORD[ch.dir]} ${ch.text}`}`);
    return parts.join(", ");
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    let next: number | null | undefined;
    /* 처음 누른 ←/→ 는 지금 머리에 보이는 칸(idleI)을 잡는다 — 예전엔 첫 ← 가 마지막 칸을 건너뛰었다 */
    if (e.key === "ArrowRight") next = act === null ? idleI : stepValued(layout, act, 1);
    else if (e.key === "ArrowLeft") next = act === null ? idleI : stepValued(layout, act, -1);
    else if (e.key === "Home") next = firstI;
    else if (e.key === "End") next = lastI;
    else if (e.key === "Escape") {
      setActive(null);
      return;
    } else return;
    e.preventDefault();
    if (next !== null && next !== undefined) {
      setActive(next);
      setAnnounce(describe(next));
    }
  };

  const maxP = layout.maxAt !== null ? layout.pts[layout.maxAt] : null;
  const minP = layout.minAt !== null ? layout.pts[layout.minAt] : null;
  const edge = (x: number) => (x < 44 ? "0%" : x > plotW - 44 ? "-100%" : "-50%");
  const activeCount = act !== null ? visCounts?.[act] : undefined;
  const tipText =
    act !== null
      ? [
          visLabels[act],
          title ? null : shown.v !== null ? fmtValue(shown.v, format, suffix) : null,
          activeCount !== undefined && activeCount !== null
            ? `${countLabel} ${activeCount.toLocaleString("ko-KR")}${countUnit}`
            : null,
          layout.pts[act].few ? "표본 적음" : null,
        ]
          .filter(Boolean)
          .join(" · ")
      : "";

  return (
    <div className={`scrub ${className ?? ""}`}>
      {(title || usableRanges.length > 1) && (
        <div className="scrub-head">
          {title && (
            <div className="min-w-0">
              <div className="t-caption text-text-3 break-words">
                {act !== null ? (visFull[act] ?? visLabels[act]) : title}
                {act === null && caption ? <span className="ml-1">· {caption}</span> : null}
                {act === null && idleI !== lastI ? <span className="ml-1">· {visLabels[idleI]} 기준</span> : null}
                {act !== null && shown.few ? <span className="ml-1">· 거래가 적어 참고용</span> : null}
              </div>
              <div className="flex flex-wrap items-baseline gap-x-2">
                <span className="t-title t-num text-ink">
                  {shown.v !== null ? fmtValue(shown.v, format, suffix) : "—"}
                </span>
                {change ? (
                  <span className={`t-sub t-num ${DELTA_CLASS[change.dir]}`}>
                    {change.dir !== "flat" && (
                      <>
                        <span aria-hidden="true">{DELTA_ARROW[change.dir]} </span>
                        <span className="sr-only">{DELTA_WORD[change.dir]} </span>
                      </>
                    )}
                    {change.text}
                  </span>
                ) : null}
                <span className="t-caption text-text-3">
                  {!canCompare
                    ? "거래가 적어 비교하지 않아요 · 참고용"
                    : shownI !== baseI
                      ? `${visLabels[baseI]} 대비`
                      : "기간 시작"}
                </span>
              </div>
            </div>
          )}
          {usableRanges.length > 1 && range && (
            <Segmented
              options={usableRanges.map((r) => ({ value: r.key, label: r.label }))}
              value={range.key}
              onChange={(k) => setRangeKey(k)}
              ariaLabel="기간"
              className="scrub-ranges shrink-0"
            />
          )}
        </div>
      )}
      <div
        ref={setPlotRef}
        className={`scrub-plot ${toneCls}`}
        style={{ height }}
        role="group"
        aria-label={`${ariaLabel} — 좌우 화살표 키로 칸마다 값을 볼 수 있어요`}
        tabIndex={0}
        data-draw={draw}
        onKeyDown={onKeyDown}
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
        <svg
          width={plotW}
          height={height}
          viewBox={`0 0 ${plotW} ${height}`}
          className="block"
          role="img"
          aria-label={`${ariaLabel}. ${visLabels[firstI]}부터 ${visLabels[lastI]}까지, 최근 ${fmtValue(layout.pts[lastI].v as number, format, suffix)}${maxP?.v != null ? `, 최고 ${fmtValue(maxP.v, format, suffix)}` : ""}${minP?.v != null ? `, 최저 ${fmtValue(minP.v, format, suffix)}` : ""}${refLine ? `, 기준선 ${refLine.label}` : ""}`}
        >
          <defs>
            <linearGradient id={`sg-${uid}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="currentColor" stopOpacity="0.18" />
              <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
            </linearGradient>
            <clipPath id={`sc-${uid}`}>
              <rect x="0" y="0" width={act !== null ? layout.pts[act].x : plotW} height={height} />
            </clipPath>
          </defs>
          <line x1={PAD.padL} x2={plotW - PAD.padR} y1={layout.plotBottom} y2={layout.plotBottom} className="scrub-axis" />
          {baseLineY !== null && (
            <line x1={PAD.padL} x2={plotW - PAD.padR} y1={baseLineY} y2={baseLineY} className="scrub-base" />
          )}
          <g className={act !== null ? "scrub-dim" : undefined}>
            {layout.areas.map((d, k) => (
              <path key={`a${k}`} d={d} fill={`url(#sg-${uid})`} className="scrub-area" />
            ))}
            {layout.dashed.map((d, k) => (
              <path key={`d${k}`} d={d} className="scrub-dash" />
            ))}
            {layout.solid.map((d, k) => (
              <path key={`s${k}`} d={d} pathLength={1} className="scrub-line scrub-draw" />
            ))}
          </g>
          {act !== null && (
            <g clipPath={`url(#sc-${uid})`}>
              {layout.solid.map((d, k) => (
                <path key={`c${k}`} d={d} className="scrub-line scrub-line-on" />
              ))}
            </g>
          )}
          {layout.pts.map((p) =>
            p.y === null ? null : p.few ? (
              <circle key={p.i} cx={p.x} cy={p.y} r={3} className="scrub-dot-few" />
            ) : dots || p.i === lastI ? (
              <circle key={p.i} cx={p.x} cy={p.y} r={p.i === lastI ? 3.5 : 2} fill="currentColor" />
            ) : null,
          )}
          {act !== null && shown.y !== null && (
            <>
              <line x1={shown.x} x2={shown.x} y1={PAD.padT - 6} y2={layout.plotBottom} className="scrub-cross" />
              <circle cx={shown.x} cy={shown.y} r={7} className="scrub-halo" />
              <circle cx={shown.x} cy={shown.y} r={4} fill="currentColor" className="scrub-knob" />
            </>
          )}
        </svg>
        {refLine && baseLineY !== null && (
          <span className="scrub-ref" style={{ right: PAD.padR, top: Math.max(0, baseLineY - 16) }}>
            {refLine.label}
          </span>
        )}
        {/* 최고·최저 — 훑는 동안엔 말풍선과 겹치지 않게 숨긴다 */}
        {act === null && maxP?.v != null && maxP.y !== null && (
          <span className="scrub-mark" style={{ left: maxP.x, top: Math.max(0, maxP.y - 20), transform: `translateX(${edge(maxP.x)})` }}>
            최고 {fmtValue(maxP.v, format, suffix)}
          </span>
        )}
        {/* 최저 — 점 아래에 자리가 있으면 아래, 없으면(바닥 근처) 점 **옆**에 둔다. 예전엔 바닥에서 위로 밀어 올려
            선 위에 글자가 얹혔다(1009 · A 실측: 온도 주간 기록). 최저점 양옆의 선은 늘 점보다 위라 옆자리는 비어 있다.
            최고·최저가 거의 같은 높이(24px 미만)면 최고만 적는다. */}
        {act === null && minP?.v != null && minP.y !== null && (maxP?.y == null || Math.abs(minP.y - maxP.y) >= 24) && (
          <span
            className="scrub-mark"
            style={
              minP.y + 22 <= layout.plotBottom
                ? { left: minP.x, top: minP.y + 6, transform: `translateX(${edge(minP.x)})` }
                : minP.x > plotW - 96
                  ? { left: minP.x - 8, top: minP.y - 7, transform: "translateX(-100%)" }
                  : { left: minP.x + 8, top: minP.y - 7 }
            }
          >
            최저 {fmtValue(minP.v, format, suffix)}
          </span>
        )}
        {act !== null && tipText && (
          <span className="scrub-tip" style={{ left: shown.x, transform: `translateX(${edge(shown.x)})` }}>
            {tipText}
          </span>
        )}
        <span className="scrub-x" style={{ left: PAD.padL }}>
          {visLabels[0]}
        </span>
        <span className="scrub-x" style={{ right: PAD.padR }}>
          {visLabels[visLabels.length - 1]}
        </span>
      </div>
      <p className="sr-only" aria-live="polite">
        {announce}
      </p>
      {footnote && <p className="scrub-foot t-caption text-text-3 break-words">{footnote}</p>}
    </div>
  );
}

export default ScrubLine;
