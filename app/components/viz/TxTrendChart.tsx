"use client";
/* [1024 · 단지 상세] 타입별 실거래 추이 — 월 중앙값 선 + 거래량 막대 + 신고가▲·신저가▼ 표식.
 *
 * 왜 새 부품인가: PriceHistoryChart 는 "월평균 + 시세 예측 부채꼴 + 같은 평형/다른 평형 막대 두 겹"이 한 몸이고 머리
 * 문구가 월평균에 묶여 있다. ScrubLine 은 막대·표식이 없다. 시안(mock1024)은 중앙값 한 선·거래량 막대 한 겹·극값
 * 표식이라 그리기만 새로 하고, **좌표 계산은 price-chart-geometry.layoutPriceChart 를 그대로** 쓴다(marks 만 보탰다 —
 * 같은 눈금·같은 "1~2건 달은 실선에서 뺀다" 규칙). 훑기(누르고 끌기·마우스·키보드)도 같은 헬퍼(scrubSlots·nearestSlot·stepSlot).
 *
 * 서버 HTML 에도 그림이 있다 — 첫 그림은 폭 320 가정(ScrubLine 과 같은 방식), 붙은 뒤 실제 폭으로 다시 그린다.
 * 색은 토큰 클래스만(stroke-primary·fill-primary·text-danger·text-primary). 글자는 SVG 캡션 크기(램프 --fs-caption).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { formatEokMan } from "@/lib/format/eok-man";
import {
  FEW_TRADES,
  idleSlot,
  layoutPriceChart,
  nearestSlot,
  scrubSlots,
  stepSlot,
  ymLabel,
  type ChartMonth,
} from "./price-chart-geometry";

export type TxTrendMark = { ym: string; kind: "high" | "low"; valueMan: number };

const SVG_CAPTION = { fontSize: "var(--fs-caption, 10px)" } as const;
const PAD_L = 44;
const PAD_R = 14;

/** 눈금 "8억"·"4억 550만" — 만원 값의 짧은 표기(만원 정수) */
const tick = (man: number) => formatEokMan(Math.round(man));

export function TxTrendChart({
  months,
  marks = [],
  valueLabel,
  countLabel = "거래",
  height = 220,
  ariaLabel,
}: {
  months: readonly ChartMonth[];
  marks?: readonly TxTrendMark[];
  /** 선이 무엇의 값인지 — "월 중앙값 · 50㎡ 매매" */
  valueLabel: string;
  countLabel?: string;
  height?: number;
  ariaLabel: string;
}) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [plotEl, setPlotEl] = useState<HTMLDivElement | null>(null);
  const setPlotRef = useCallback((n: HTMLDivElement | null) => {
    wrapRef.current = n;
    setPlotEl(n);
  }, []);
  const [width, setWidth] = useState(320);
  const [active, setActive] = useState<number | null>(null);
  const [announce, setAnnounce] = useState("");

  useEffect(() => {
    if (!plotEl) return;
    const measure = () => {
      const w = Math.round(plotEl.getBoundingClientRect().width);
      if (w > 0) setWidth(w);
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(plotEl);
    return () => ro.disconnect();
  }, [plotEl]);

  const layout = useMemo(
    () =>
      layoutPriceChart({
        months,
        marks,
        box: { width, height, padL: PAD_L, padR: PAD_R, padT: 14, padB: 22, barH: 36 },
      }),
    [months, marks, width, height],
  );
  const slots = useMemo(() => (layout ? scrubSlots(layout) : []), [layout]);
  const idle = idleSlot(slots);
  useEffect(() => setActive(null), [width, months]);

  const act = active != null ? (slots[active] ?? null) : null;
  const setFromClientX = (clientX: number) => {
    const el = wrapRef.current;
    if (!el || slots.length === 0) return;
    const r = el.getBoundingClientRect();
    setActive(nearestSlot(slots, clientX - r.left));
  };
  /* [1030 · G3] 끝에 붙은 빈 달(최대 2칸) = 신고 기한(계약 후 30일) 안의 달 — "거래 없음"이 아니라 아직 신고가 안 모인 달이다.
     지역 화면의 "9월 958건 = 신고 기한 내 · 그래프 제외"와 같은 구분. 날짜 계산 없이 끝 두 칸만 본다(시리즈는 이번 달까지 온다). */
  const pendingYms = new Set<string>();
  for (let i = months.length - 1; i >= 0 && i >= months.length - 2; i -= 1) {
    if (months[i].nAll > 0 || months[i].avgMan != null) break;
    pendingYms.add(months[i].ym);
  }
  const emptyLabel = (ym: string) => (pendingYms.has(ym) ? "신고 집계 중" : "거래 없음");
  const srText = (i: number) => {
    const s = slots[i];
    if (!s || s.kind !== "month") return "";
    return s.avgMan != null ? `${ymLabel(s.ym)} ${valueLabel} ${tick(s.avgMan)} · ${countLabel} ${s.nAll}건` : `${ymLabel(s.ym)} ${emptyLabel(s.ym)}`;
  };
  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    let next: number | null = null;
    if (e.key === "ArrowRight") next = stepSlot(slots, active, 1, idle);
    else if (e.key === "ArrowLeft") next = stepSlot(slots, active, -1, idle);
    else if (e.key === "Home") next = slots.length ? 0 : null;
    else if (e.key === "End") next = slots.length ? slots.length - 1 : null;
    else if (e.key === "Escape") {
      setActive(null);
      return;
    } else return;
    e.preventDefault();
    if (next !== null) {
      setActive(next);
      setAnnounce(srText(next));
    }
  };

  const priced = months.filter((m) => m.avgMan != null);
  const summary = priced.length
    ? `${valueLabel} ${ymLabel(months[0].ym)}~${ymLabel(months[months.length - 1].ym)}: 최저 ${tick(Math.min(...priced.map((m) => m.avgMan as number)))}, 최고 ${tick(Math.max(...priced.map((m) => m.avgMan as number)))}`
    : `이 기간 ${valueLabel} 거래 없음`;

  /* x 라벨 — 칸 폭에 맞춰 솎는다(40px 간격). 첫 달은 연도 포함("26.01"), 나머지는 같은 규칙 */
  const stepX = layout ? Math.max(1, (layout.points[1]?.x ?? width) - (layout.points[0]?.x ?? 0)) : 1;
  const labelEvery = layout ? Math.max(1, Math.ceil(40 / stepX)) : 1;
  /* [1028] 마지막 달 표시는 늘 그린다(오른쪽 끝 맞춤). 그 바로 앞 표시가 42px 안에 있으면 글자가 겹쳐
     폰에서 "26.09"와 "26.10"이 한 덩어리("262610")로 보였다 — 그때는 앞의 것을 건너뛴다. */
  const lastIdx = layout ? layout.points.length - 1 : 0;
  const showXLabel = (i: number) => i === lastIdx || (i % labelEvery === 0 && (lastIdx - i) * stepX >= 42);

  const placeTip = (x: number) => (el: HTMLSpanElement | null) => {
    if (!el) return;
    const w = el.offsetWidth;
    el.style.left = `${Math.round(Math.max(0, Math.min(width - w, x - w / 2)))}px`;
  };

  return (
    <figure className="m-0 flex flex-col gap-1.5">
      <div
        ref={setPlotRef}
        className="scrub-plot relative w-full text-primary"
        style={{ height }}
        role="group"
        tabIndex={0}
        aria-label={`${ariaLabel} — 좌우 화살표 키로 달마다 값`}
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
        {layout && (
          <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={summary} className="block overflow-visible">
            {layout.ticks.map((t) => (
              <g key={t.valueMan}>
                <line x1={PAD_L} x2={width - PAD_R} y1={t.y} y2={t.y} className="stroke-divider" strokeWidth={1} />
                <text x={PAD_L - 6} y={t.y + 3.5} textAnchor="end" style={SVG_CAPTION} className="fill-text-3">
                  {tick(t.valueMan)}
                </text>
              </g>
            ))}
            {/* 거래량 막대 — 한 겹(그 달 거래 수). 훑는 달은 진하게 */}
            {layout.bars.map((b, i) => {
              const on = act?.kind === "month" && active === i;
              return b.hAll > 0 ? (
                <rect key={months[i].ym} x={b.x} y={b.yAll} width={b.w} height={b.hAll} rx={1.5} className="fill-primary" fillOpacity={on ? 0.5 : 0.18} />
              ) : null;
            })}
            <text x={PAD_L - 6} y={layout.plotBottom} textAnchor="end" style={SVG_CAPTION} className="fill-text-3">
              {layout.barMax}건
            </text>
            <line x1={PAD_L} x2={width - PAD_R} y1={layout.plotBottom} y2={layout.plotBottom} className="stroke-divider" strokeWidth={1} />
            {layout.connectors.map((d, i) => (
              <path key={`c${i}`} d={d} fill="none" className="stroke-primary" strokeWidth={1.4} strokeDasharray="3 4" strokeOpacity={0.55} strokeLinecap="round" />
            ))}
            {layout.segments.map((d, i) => (
              <path key={i} d={d} fill="none" className="stroke-primary" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
            ))}
            {layout.points.map((p) =>
              p.y == null ? null : p.n < FEW_TRADES ? (
                <circle key={p.ym} cx={p.x} cy={p.y} r={3.4} className="fill-surface stroke-primary" strokeWidth={1.8} />
              ) : (
                <circle key={p.ym} cx={p.x} cy={p.y} r={3} className="fill-surface stroke-primary" strokeWidth={2} />
              ),
            )}
            {/* 신고가▲(위) · 신저가▼(아래) — 그 달 x 에 그 거래 금액의 y */}
            {layout.marks.map((m) => {
              const up = m.kind === "high";
              const cls = up ? "text-up" : "text-down";
              const tri = up ? `M${m.x} ${m.y - 12} l5 8 h-10z` : `M${m.x} ${m.y + 12} l5 -8 h-10z`;
              const rightSide = m.x < width / 2;
              return (
                <g key={`${m.kind}-${m.ym}`} className={cls}>
                  <path d={tri} fill="currentColor" />
                  <text
                    x={rightSide ? m.x + 8 : m.x - 8}
                    y={up ? m.y - 15 : m.y + 22}
                    textAnchor={rightSide ? "start" : "end"}
                    style={SVG_CAPTION}
                    fontWeight={700}
                    fill="currentColor"
                    className="stroke-surface"
                    strokeWidth={3}
                    strokeLinejoin="round"
                    paintOrder="stroke"
                  >
                    {up ? "신고가" : "신저가"} {tick(m.valueMan)}
                  </text>
                </g>
              );
            })}
            {act && act.kind === "month" && (
              <g aria-hidden="true">
                <line x1={act.x} x2={act.x} y1={layout.plotTop - 4} y2={layout.plotBottom} className="scrub-cross" />
                {act.y != null && (
                  <>
                    <circle cx={act.x} cy={act.y} r={7} className="scrub-halo" />
                    <circle cx={act.x} cy={act.y} r={4} fill="currentColor" className="scrub-knob" />
                  </>
                )}
              </g>
            )}
            {layout.points.map((p, i) =>
              showXLabel(i) ? (
                <text
                  key={`l${p.ym}`}
                  x={p.x}
                  y={height - 6}
                  style={SVG_CAPTION}
                  className={i === layout.points.length - 1 ? "fill-text-2" : "fill-text-3"}
                  textAnchor={i === 0 ? "start" : i === layout.points.length - 1 ? "end" : "middle"}
                >
                  {ymLabel(p.ym, true)}
                </text>
              ) : null,
            )}
          </svg>
        )}
        {act && act.kind === "month" && layout && (
          <span
            ref={placeTip(act.x)}
            aria-hidden="true"
            className="pointer-events-none absolute z-10 flex flex-col rounded-lg bg-ink px-2 py-1 t-caption font-bold whitespace-nowrap text-surface shadow-sm tabular-nums"
            style={{ left: Math.max(0, act.x - 60), top: act.y != null && act.y < layout.plotTop + 40 ? Math.max(0, layout.lineBottom - 34) : 0 }}
          >
            <span>{ymLabel(act.ym)}</span>
            <span className="font-semibold opacity-80">{act.avgMan != null ? tick(act.avgMan) : emptyLabel(act.ym)}</span>
            <span className="font-semibold opacity-80">
              {countLabel} {act.nAll}건
            </span>
          </span>
        )}
      </div>
      <p className="sr-only" aria-live="polite">
        {announce}
      </p>
      <div className="sr-only">
        <table>
          <caption>{valueLabel} 월별 요약</caption>
          <thead>
            <tr>
              <th scope="col">월</th>
              <th scope="col">{valueLabel}</th>
              <th scope="col">{countLabel}</th>
            </tr>
          </thead>
          <tbody>
            {months.map((m) => (
              <tr key={m.ym}>
                <td>{ymLabel(m.ym)}</td>
                <td>{m.avgMan != null ? tick(m.avgMan) : emptyLabel(m.ym)}</td>
                <td>{m.nAll}건</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  );
}

export default TxTrendChart;
