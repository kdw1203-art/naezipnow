"use client";
/* [1021 · 단지 분석 /analysis/ai] 시세 예측 대표 그림 — 낙관·기본·비관 세 선 + 사이 면 채움 + 끝점 값 라벨.
   시안(mock8/pred): "지금 → N년 뒤" 부채꼴만 크게. 과거 달·막대는 여기 없다(실거래 흐름은 아래 카드가 그린다).
   좌표는 price-chart-geometry.layoutScenarioFan(기존 시나리오 차트 규칙 재사용) — 여기서는 그리기만 한다.
   색은 토큰만: 낙관 success · 기본 primary(도구 색) · 비관 warning(dataviz 규칙). 굵기 3단(700 까지).
   [1022 · 단지 분석 고도화] 지시 3 — ① breakEven: 비용 포함 손익분기 수평선(lib/ai/scenario-breakeven, 재료 없으면 안 그린다)
   ② focus: 시나리오 하나만 강조(선을 누르거나 부르는 쪽의 범례 버튼) — 나머지 두 선은 흐리게. 상태는 부르는 쪽이 든다. */

import { useEffect, useRef, useState } from "react";
import { formatKrwManwon, formatKrwWon } from "@/lib/format/krw";
import { layoutScenarioFan, type ChartScenarioPoint } from "./price-chart-geometry";

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    setW(Math.round(el.getBoundingClientRect().width));
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((entries) => {
      const cw = entries[0]?.contentRect.width;
      if (cw) setW(Math.round(cw));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

const SVG_CAPTION = { fontSize: "var(--fs-caption, 10px)" } as const;
const STROKE = { opt: "stroke-success", base: "stroke-primary", pess: "stroke-warning" } as const;
const FILL = { opt: "fill-success", base: "fill-primary", pess: "fill-warning" } as const;
const WORD = { opt: "낙관", base: "기본", pess: "비관" } as const;
export type FanKey = keyof typeof WORD;

export function ScenarioFanChart({
  startKrw,
  path,
  height = 240,
  focus = null,
  onFocus,
  breakEven = null,
}: {
  startKrw: number;
  path: readonly ChartScenarioPoint[];
  height?: number;
  /** [1022] 강조할 시나리오 — null 이면 셋 다 같은 굵기 */
  focus?: FanKey | null;
  /** [1022] 선을 누르면(같은 선을 다시 누르면 해제) — 없으면 선은 누를 수 없다 */
  onFocus?: ((k: FanKey | null) => void) | null;
  /** [1022] 비용 포함 손익분기 수평선(원) + 짧은 라벨. 없으면 안 그린다 */
  breakEven?: { krw: number; label: string } | null;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const padL = 48;
  const padR = 64;
  const layout =
    width > 0
      ? layoutScenarioFan({ scenario: { startKrw, path }, guides: breakEven ? [breakEven.krw] : null, box: { width, height, padL, padR, padT: 14, padB: 24 } })
      : null;
  const last = path[path.length - 1];
  const guide = layout?.guides[0] ?? null;
  const dim = (k: FanKey) => (focus && focus !== k ? 0.3 : 1);
  return (
    <div ref={ref} className="w-full">
      {layout?.fan && (
        <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="block max-w-full" aria-hidden="true">
          {layout.ticks.map((t) => (
            <g key={t.valueMan}>
              <line x1={padL} x2={width - padR} y1={t.y} y2={t.y} className="stroke-divider" strokeWidth={1} />
              <text x={padL - 6} y={t.y + 3.5} textAnchor="end" fontSize={10} style={SVG_CAPTION} className="fill-text-3">
                {formatKrwManwon(t.valueMan, { style: "short" })}
              </text>
            </g>
          ))}
          <path d={layout.fan.area} className="fill-primary" fillOpacity={focus ? 0.04 : 0.09} />
          {(["opt", "base", "pess"] as const).map((k) => (
            <g key={k} opacity={dim(k)}>
              <path
                d={layout.fan![k]}
                fill="none"
                className={STROKE[k]}
                strokeWidth={focus === k ? 3.4 : 2.4}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
              {onFocus && (
                /* 누르는 영역 — 보이지 않는 굵은 선(폰 손가락). 같은 선을 다시 누르면 해제 */
                <path
                  d={layout.fan![k]}
                  fill="none"
                  stroke="transparent"
                  strokeWidth={22}
                  className="cursor-pointer"
                  style={{ pointerEvents: "stroke" }}
                  onClick={() => onFocus(focus === k ? null : k)}
                />
              )}
            </g>
          ))}
          {layout.fan.ends.map((e) => (
            <g key={e.key} opacity={dim(e.key)}>
              <circle cx={e.x} cy={e.y} r={focus === e.key ? 4.2 : 3.4} className={`${FILL[e.key]} stroke-surface`} strokeWidth={1.5} />
              <text x={e.x + 6} y={e.labelY + 4} fontSize={11} style={SVG_CAPTION} fontWeight={700} className={FILL[e.key]}>
                {formatKrwWon(e.valueKrw, { style: "short" })}
              </text>
            </g>
          ))}
          {guide && breakEven && (
            <g>
              <line x1={padL} x2={width - padR} y1={guide.y} y2={guide.y} className="stroke-text-2" strokeWidth={1.2} strokeDasharray="4 3" />
              <text x={width - padR - 4} y={guide.y - 5} textAnchor="end" fontSize={10} style={SVG_CAPTION} fontWeight={700} className="fill-text-2">
                {breakEven.label}
              </text>
            </g>
          )}
          <circle cx={layout.fan.startX} cy={layout.fan.startY} r={4.5} className="fill-text-1 stroke-surface" strokeWidth={1.5} />
          <text x={layout.fan.startX} y={height - 7} fontSize={10} style={SVG_CAPTION} fontWeight={700} className="fill-text-2" textAnchor="middle">
            지금
          </text>
          {layout.fan.yearTicks.map((t) => (
            <text key={t.year} x={t.x} y={height - 7} fontSize={10} style={SVG_CAPTION} className="fill-text-3" textAnchor="middle">
              {t.year}년 뒤
            </text>
          ))}
        </svg>
      )}
      {/* 같은 숫자를 표로 — 스크린리더·폭을 재기 전 */}
      <table className="sr-only">
        <caption>시나리오 {last?.year ?? 0}년</caption>
        <thead>
          <tr>
            <th>시점</th>
            {(["opt", "base", "pess"] as const).map((k) => (
              <th key={k}>{WORD[k]}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {path.map((p) => (
            <tr key={p.year}>
              <th>{p.year === 0 ? "지금" : `${p.year}년 뒤`}</th>
              <td>{formatKrwWon(p.opt, { style: "short" })}</td>
              <td>{formatKrwWon(p.base, { style: "short" })}</td>
              <td>{formatKrwWon(p.pess, { style: "short" })}</td>
            </tr>
          ))}
          {breakEven && (
            <tr>
              <th>비용 포함 손익분기</th>
              <td colSpan={3}>{formatKrwWon(breakEven.krw, { style: "short" })}</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
