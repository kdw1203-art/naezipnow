"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { formatKrwManwon, formatKrwWon } from "@/lib/format/krw";
import { pctChange } from "@/lib/format/delta";
import { Won } from "@/app/components/num/Won";
import { Delta } from "@/app/components/num/Delta";
import {
  FEW_TRADES,
  baseSlot,
  idleSlot,
  layoutPriceChart,
  monthSlots,
  nearestSlot,
  scrubSlots,
  slotText,
  stepSlot,
  ymLabel,
  ymLong,
  type ChartMonth,
  type ChartScenarioPoint,
} from "./price-chart-geometry";

/* [1008 · W] 단지 실거래 흐름 — 월평균(대표 평형 — 가장 많이 거래된 전용면적) 선 + 월 거래 건수 막대 + (시세 예측) 시나리오 부채꼴.
 *
 * 소유자: "데이터가 숫자나 그래프로 보여지지도 않아서 처음 보는 사람이 뭘 봐야 하는지 모르겠다".
 * 원칙
 *  · 컨테이너 폭을 재서 **픽셀 그대로** 그린다 — viewBox 를 늘이면 글자(램프 10·12px)가 같이 늘어난다.
 *  · 색은 토큰 클래스만(stroke-primary 는 도구 색 — .tool-scope 가 --primary 를 도구 액센트로 바꾼다).
 *  · 대표 평형 거래가 있는 달이 3개 미만이면 선을 잇지 않고 점만 — "거래가 적어 추이를 그리기 어려워요".
 *  · 스크린리더에는 같은 숫자를 표로 준다(sr-only).
 * 계산은 price-chart-geometry.ts(단위테스트) — 여기는 그리기만 한다.
 *
 * [1009 · A] 훑기 — 1008 그래프는 그렸지만 "그 달이 얼마였나"를 읽을 길이 없었다(포인터 반응 0, 1009 인벤토리).
 *  · 머리(큰 숫자): 훑기 전엔 거래 3건 이상인 마지막 달 월평균과 "첫 달 대비" 등락(▲ 빨강·▼ 파랑),
 *    훑는 동안엔 그 달 값 — 토스증권 관례. 비교 기준은 거래 3건 이상인 첫 달(한두 건 값을 기준으로 삼지 않는다).
 *  · 누르고 좌우로 끌기(터치 — 세로 스크롤은 그대로: touch-action pan-y) · 마우스는 올리기만 해도 ·
 *    키보드 ←/→/Home/End/Esc. 세로선·점·말풍선(그 달 월평균·거래 n건·같은 평형 m건·참고용).
 *  · 시나리오 구간(미래)은 말풍선·머리가 "시나리오(가정)"를 먼저 말하고 짧은 억 표기로 적는다 — 예측을
 *    실거래처럼 정밀하게 보이지 않게(1008 · 리뷰 A-8 과 같은 원칙).
 *  · 모양은 ScrubLine 과 같은 CSS(.scrub-plot · .scrub-cross · .scrub-halo · .scrub-knob)를 쓴다 — 새 CSS 없음. */

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

const SCEN_LABEL = { opt: "낙관", base: "기본", pess: "비관" } as const;

const SCEN_STROKE = { opt: "stroke-success", base: "stroke-primary", pess: "stroke-danger" } as const;
const SCEN_FILL = { opt: "fill-success", base: "fill-primary", pess: "fill-danger" } as const;

/* [1009 · A] 차트 안 글자(SVG) — 모바일 캡션 하한(globals [989]: 390px 에서 --fs-caption 11px)을 같이 탄다.
   fontSize 속성(10)만 두면 CSS 토큰이 안 닿아 모바일에서도 10px 로 남았다(모바일 조작 검사 "글자 10px"). */
const SVG_CAPTION = { fontSize: "var(--fs-caption, 10px)" } as const;

export function PriceHistoryChart({
  months,
  label,
  basis = "unit",
  scenario,
  height = 236,
}: {
  months: readonly ChartMonth[];
  /** 선의 대상 — "전용 37㎡"(평형) · "60~85㎡"(면적대) */
  label: string | null;
  /** 평형 하나(unit) 또는 면적대(band) — 막대 범례 말이 달라진다 */
  basis?: "unit" | "band";
  /** 시세 예측만 — 출발 가격(원)과 0~N년 점 */
  scenario?: { startKrw: number; years: number; path: readonly ChartScenarioPoint[] } | null;
  height?: number;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [active, setActive] = useState<number | null>(null);
  const [announce, setAnnounce] = useState("");
  const padR = scenario ? 76 : 14;
  const layout = useMemo(
    () =>
      width
        ? layoutPriceChart({
            months,
            scenario: scenario ?? null,
            box: { width, height, padL: 44, padR, padT: 12, padB: 22, barH: 44 },
          })
        : null,
    [months, scenario, width, height, padR],
  );
  const slots = useMemo(() => (layout ? scrubSlots(layout) : []), [layout]);
  /* 머리는 폭과 무관 — 폭을 재기 전에도 달 칸으로 같은 값을 보인다(첫 프레임 "거래 없음" 깜빡임 방지) */
  const headSlots = useMemo(() => (slots.length ? slots : monthSlots(months)), [slots, months]);
  const idle = idleSlot(headSlots);
  const base = baseSlot(headSlots);
  /* 폭이 바뀌면(회전·창 크기) 칸 위치가 달라진다 — 잡고 있던 칸을 놓는다 */
  useEffect(() => setActive(null), [width]);

  const first = months[0]?.ym ?? "";
  const last = months[months.length - 1]?.ym ?? "";
  const priced = months.filter((m) => m.avgMan != null);
  const hasFew = priced.some((m) => m.n < FEW_TRADES);
  const what = label ?? "대표 평형";
  const summary = priced.length
    ? `${what} 월평균 실거래가 ${ymLabel(first)}~${ymLabel(last)}: 최저 ${formatKrwManwon(Math.min(...priced.map((m) => m.avgMan as number)), { style: "short" })}, 최고 ${formatKrwManwon(Math.max(...priced.map((m) => m.avgMan as number)), { style: "short" })}`
    : `이 기간 ${what} 거래 없음`;

  const shownI = active ?? idle;
  const shown = shownI != null ? (headSlots[shownI] ?? null) : null;
  const act = active != null ? (slots[active] ?? null) : null;
  const baseM = base != null ? headSlots[base] : null;
  const baseAvg = baseM && baseM.kind === "month" ? baseM.avgMan : null;

  const setFromClientX = (clientX: number) => {
    const el = ref.current;
    if (!el || slots.length === 0) return;
    const r = el.getBoundingClientRect();
    setActive(nearestSlot(slots, clientX - r.left));
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
      setAnnounce(slotText(slots[next], { label, basis }).sr);
    }
  };

  /* 말풍선 가로 자리 — 점 가운데에 두되 그래프 폭 안으로 민다. 폭은 그린 뒤에 재서 바로 옮긴다
     (390px 에서 시나리오 말풍선 "기본 5.3억 · 낙관 5.4억 · 비관 5.1억"이 오른쪽으로 19px 잘렸다 — 실측) */
  const placeTip = (x: number) => (el: HTMLSpanElement | null) => {
    if (!el) return;
    const w = el.offsetWidth;
    el.style.left = `${Math.round(Math.max(0, Math.min(width - w, x - w / 2)))}px`;
  };
  /* 세로 자리 — 점이 위쪽에 있으면 말풍선을 선 영역 아래쪽으로 내려 점을 가리지 않는다 */
  const tipTop = (y: number | null) => (layout && y != null && y < layout.plotTop + 44 ? Math.max(0, layout.lineBottom - 34) : 0);

  return (
    <figure className="m-0 flex flex-col gap-2">
      {/* ── 머리: 큰 숫자 + 비교 기준이 적힌 등락 — 훑는 동안 그 달 값 ── */}
      <div className="flex min-h-[62px] min-w-0 flex-col gap-0.5">
        {!shown ? (
          <>
            <span className="t-caption text-text-3">월평균 실거래가 · {what}</span>
            <span className="t-title text-text-3">이 기간 거래 없음</span>
          </>
        ) : shown.kind === "year" && scenario ? (
          <>
            <span className="t-caption break-words text-text-3">
              {shown.year}년 뒤 · 기본 시나리오 <b className="font-extrabold text-text-2">(가정 — 예측 아님)</b>
            </span>
            <span className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <span className="t-title t-num text-ink">{formatKrwWon(shown.base, { style: "short" })}</span>
              <Delta pct={pctChange(shown.base, scenario.startKrw)} srContext="기준 가격보다" className="t-sub" />
              <span className="t-caption text-text-3">기준 가격 {formatKrwWon(scenario.startKrw, { style: "short" })} 대비</span>
            </span>
            <span className="t-caption t-num text-text-3">
              낙관 {formatKrwWon(shown.opt, { style: "short" })} · 비관 {formatKrwWon(shown.pess, { style: "short" })}
            </span>
          </>
        ) : shown.kind === "month" && shown.avgMan != null ? (
          <>
            <span className="t-caption break-words text-text-3">
              {ymLong(shown.ym)} 월평균 · {what}
            </span>
            <span className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <Won manwon={shown.avgMan} className="t-title text-ink" />
              {baseAvg != null && shownI !== base ? (
                <>
                  <Delta
                    pct={pctChange(shown.avgMan, baseAvg)}
                    diffManwon={shown.avgMan - baseAvg}
                    srContext={`${ymLong(baseM!.kind === "month" ? baseM!.ym : "")}보다`}
                    className="t-sub"
                  />
                  <span className="t-caption text-text-3">{ymLabel(baseM!.kind === "month" ? baseM!.ym : "", true)} 대비</span>
                </>
              ) : baseAvg != null ? (
                <span className="t-caption text-text-3">비교 기준 달(첫 달)</span>
              ) : null}
            </span>
            <span className="t-caption text-text-3">
              {shown.nAll > shown.n
                ? `거래 ${shown.nAll.toLocaleString("ko-KR")}건 · ${basis === "band" ? "같은 면적대" : "같은 평형"} ${shown.n.toLocaleString("ko-KR")}건`
                : `거래 ${shown.n.toLocaleString("ko-KR")}건`}
              {shown.few && (
                <span className="ml-1.5 rounded bg-warning-soft px-1.5 py-px font-extrabold text-warning">거래 적음 · 참고용</span>
              )}
            </span>
          </>
        ) : shown.kind === "month" ? (
          <>
            <span className="t-caption text-text-3">
              {ymLong(shown.ym)} · {what}
            </span>
            <span className="t-title text-text-3">거래 없음</span>
            {shown.nAll > 0 && (
              <span className="t-caption text-text-3">
                {basis === "band" ? "다른 면적대" : "다른 평형"} {shown.nAll.toLocaleString("ko-KR")}건
              </span>
            )}
          </>
        ) : null}
      </div>

      <div
        ref={ref}
        className="scrub-plot relative w-full text-primary"
        style={{ height }}
        role="group"
        tabIndex={0}
        aria-label={`${what} 월평균 실거래가 그래프 — 좌우 화살표 키로 달마다 값을 볼 수 있어요`}
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
          <svg
            width={width}
            height={height}
            viewBox={`0 0 ${width} ${height}`}
            role="img"
            aria-label={`${summary}${scenario ? ` · 시나리오 ${scenario.years}년(가정)` : ""}`}
            className="block overflow-visible"
          >
            {/* 가로 눈금 — 값 읽는 최소한 */}
            {layout.ticks.map((t) => (
              <g key={t.valueMan}>
                <line x1={44} x2={width - padR} y1={t.y} y2={t.y} className="stroke-divider" strokeWidth={1} />
                <text x={38} y={t.y + 3.5} textAnchor="end" fontSize={10} style={SVG_CAPTION} fontWeight={700} className="fill-text-3">
                  {formatKrwManwon(t.valueMan, { style: "short" })}
                </text>
              </g>
            ))}
            {/* 월 거래 막대 — 전체(옅게) 위에 선과 같은 평형 몫(진하게). 훑는 달은 진하게 */}
            {layout.bars.map((b, i) => {
              const on = act?.kind === "month" && active === i;
              return (
                <g key={months[i].ym}>
                  {b.hAll > 0 && <rect x={b.x} y={b.yAll} width={b.w} height={b.hAll} rx={2} className="fill-text-3" fillOpacity={on ? 0.34 : 0.18} />}
                  {b.hBand > 0 && <rect x={b.x} y={b.yBand} width={b.w} height={b.hBand} rx={2} className="fill-primary" fillOpacity={on ? 0.85 : 0.45} />}
                </g>
              );
            })}
            <line x1={44} x2={width - padR} y1={layout.plotBottom} y2={layout.plotBottom} className="stroke-divider" strokeWidth={1} />
            {/* 시나리오 부채꼴 — 사이 음영 + 점선 3개 */}
            {layout.fan && (
              <g>
                <line x1={layout.lastX} x2={layout.lastX} y1={layout.plotTop} y2={layout.plotBottom} className="stroke-text-3" strokeWidth={1} strokeDasharray="2 3" />
                <path d={layout.fan.area} className="fill-primary" fillOpacity={0.1} />
                {(["opt", "pess", "base"] as const).map((k) => (
                  <path
                    key={k}
                    d={layout.fan![k]}
                    fill="none"
                    className={SCEN_STROKE[k]}
                    strokeWidth={k === "base" ? 2.4 : 1.8}
                    strokeDasharray="5 4"
                    strokeLinecap="round"
                  />
                ))}
                {layout.fan.ends.map((e) => (
                  <g key={e.key}>
                    <circle cx={e.x} cy={e.y} r={3} className={SCEN_FILL[e.key]} />
                    <text x={e.x + 6} y={e.labelY + 4} fontSize={10} style={SVG_CAPTION} fontWeight={800} className={e.key === "base" ? "fill-primary" : e.key === "opt" ? "fill-success" : "fill-danger"}>
                      {SCEN_LABEL[e.key]} {formatKrwWon(e.valueKrw, { style: "short" })}
                    </text>
                  </g>
                ))}
                <circle cx={layout.fan.startX} cy={layout.fan.startY} r={4.5} className="fill-surface stroke-primary" strokeWidth={2} />
              </g>
            )}
            {/* 과거 월평균 — 실선(거래 3건 이상인 달끼리) + 사이를 잇는 점선(빈 달·1~2건 달을 건너뜀) + 점 */}
            {layout.connectors.map((d, i) => (
              <path key={`c${i}`} d={d} fill="none" className="stroke-primary" strokeWidth={1.4} strokeDasharray="3 4" strokeOpacity={0.55} strokeLinecap="round" />
            ))}
            {layout.segments.map((d, i) => (
              <path key={i} d={d} fill="none" className="stroke-primary" strokeWidth={2.2} strokeLinejoin="round" strokeLinecap="round" />
            ))}
            {/* 거래 1~2건인 달은 속 빈 점 — 한 건 값이 선을 끌어내린 달을 추세로 읽지 않게 */}
            {layout.points.map((p) =>
              p.y == null ? null : p.n < FEW_TRADES ? (
                <circle key={p.ym} cx={p.x} cy={p.y} r={3.6} className="fill-surface stroke-primary" strokeWidth={1.8} />
              ) : (
                <circle key={p.ym} cx={p.x} cy={p.y} r={layout.sparse ? 4 : 3} className="fill-primary stroke-surface" strokeWidth={1.5} />
              ),
            )}
            {/* 출발 가격 라벨 — 과거 선보다 뒤에 그려 선 위에 오게, 바탕색 테두리(halo)로 겹쳐도 읽히게 */}
            {layout.fan && (
              <text
                x={layout.fan.startX - 7}
                y={layout.fan.startY - 8}
                textAnchor="end"
                fontSize={10} style={SVG_CAPTION}
                fontWeight={800}
                className="fill-text-1 stroke-surface"
                strokeWidth={3}
                strokeLinejoin="round"
                paintOrder="stroke"
              >
                기준 {formatKrwWon(scenario!.startKrw, { style: "short" })}
              </text>
            )}
            {/* 훑는 자리 — 세로선 + 점(시나리오면 세 점) */}
            {act && (
              <g aria-hidden="true">
                <line x1={act.x} x2={act.x} y1={layout.plotTop - 4} y2={layout.plotBottom} className="scrub-cross" />
                {act.kind === "month" && act.y != null && (
                  <>
                    <circle cx={act.x} cy={act.y} r={7} className="scrub-halo" />
                    <circle cx={act.x} cy={act.y} r={4} fill="currentColor" className="scrub-knob" />
                  </>
                )}
                {act.kind === "year" && (
                  <>
                    <circle cx={act.x} cy={act.yOpt} r={3.6} className="fill-success stroke-surface" strokeWidth={1.5} />
                    <circle cx={act.x} cy={act.yPess} r={3.6} className="fill-danger stroke-surface" strokeWidth={1.5} />
                    <circle cx={act.x} cy={act.y} r={7} className="scrub-halo" />
                    <circle cx={act.x} cy={act.y} r={4} fill="currentColor" className="scrub-knob" />
                  </>
                )}
              </g>
            )}
            {/* x 라벨 — 첫 달 · 최근 달 · 시나리오 연차 */}
            {(layout.firstLabel || months.length === 1) && (
              <text x={layout.points[0].x} y={height - 6} fontSize={10} style={SVG_CAPTION} className="fill-text-3" textAnchor="start">
                {ymLabel(first, true)}
              </text>
            )}
            {months.length > 1 && (
              <text x={layout.lastX} y={height - 6} fontSize={10} style={SVG_CAPTION} fontWeight={700} className="fill-text-2" textAnchor={layout.fan ? "middle" : "end"}>
                {ymLabel(last, true)}
              </text>
            )}
            {layout.fan?.yearTicks.map((t) => (
              <text key={t.year} x={t.x} y={height - 6} fontSize={10} style={SVG_CAPTION} className="fill-text-3" textAnchor="middle">
                {t.year}년 뒤
              </text>
            ))}
          </svg>
        )}
        {/* 말풍선 — 그 달 월평균·거래 n건·같은 평형 m건·참고용 / 시나리오(가정) */}
        {act && layout && (
          <span
            ref={placeTip(act.x)}
            aria-hidden="true"
            className="pointer-events-none absolute z-10 flex flex-col rounded-[10px] bg-ink px-2 py-1 t-caption font-bold whitespace-nowrap text-surface shadow-sm tabular-nums"
            style={{ left: Math.max(0, act.x - 90), top: tipTop(act.y) }}
          >
            {slotText(act, { label, basis }).tip.map((line, i) => (
              <span key={i} className={i === 0 ? "" : "font-semibold opacity-80"}>
                {line}
              </span>
            ))}
          </span>
        )}
      </div>
      <p className="sr-only" aria-live="polite">
        {announce}
      </p>
      <figcaption className="flex flex-wrap items-center gap-x-3 gap-y-1 t-caption text-text-3">
        <span className="inline-flex items-center gap-1">
          <span aria-hidden="true" className="inline-block h-[3px] w-4 rounded bg-primary" />
          월평균{label ? `(${label})` : ""}
        </span>
        <span className="inline-flex items-center gap-1">
          <span aria-hidden="true" className="inline-block h-2.5 w-2.5 rounded-sm bg-primary opacity-50" />
          {basis === "band" ? "월 거래(같은 면적대)" : "월 거래(같은 평형)"}
        </span>
        <span className="inline-flex items-center gap-1">
          <span aria-hidden="true" className="inline-block h-2.5 w-2.5 rounded-sm bg-text-3 opacity-25" />
          {basis === "band" ? "다른 면적대" : "다른 평형"}
        </span>
        {hasFew && (
          <span className="inline-flex items-center gap-1">
            <span aria-hidden="true" className="inline-block h-2 w-2 rounded-full border-[1.5px] border-primary bg-surface" />
            거래 1~2건(선에서 뺌)
          </span>
        )}
        {layout && layout.connectors.length > 0 && (
          <span className="inline-flex items-center gap-1">
            <span aria-hidden="true" className="inline-block w-4 border-t border-dotted border-primary opacity-70" />
            건너뛴 달
          </span>
        )}
        {scenario && (
          <span className="inline-flex items-center gap-1">
            <span aria-hidden="true" className="inline-block w-4 border-t-2 border-dashed border-primary" />
            시나리오(가정)
          </span>
        )}
      </figcaption>
      {/* sr-only 는 표(table) 상자에 걸면 폭 1px 가 먹지 않아 모바일에서 가로로 넘친다(390px 에서 +102px 실측) — 블록으로 감싼다 */}
      <div className="sr-only">
        <table>
          <caption>월별 실거래 요약</caption>
          <thead>
            <tr>
              <th scope="col">월</th>
              <th scope="col">{what} 월평균</th>
              <th scope="col">{what} 거래</th>
              <th scope="col">전체 거래</th>
            </tr>
          </thead>
          <tbody>
            {months.map((m) => (
              <tr key={m.ym}>
                <td>{ymLabel(m.ym)}</td>
                <td>{m.avgMan != null ? formatKrwManwon(m.avgMan, { style: "short" }) : "거래 없음"}</td>
                <td>{m.n}건</td>
                <td>{m.nAll}건</td>
              </tr>
            ))}
            {scenario?.path.slice(1).map((p) => (
              <tr key={`y${p.year}`}>
                <td>{p.year}년 뒤(가정)</td>
                <td>
                  기본 {formatKrwWon(p.base, { style: "short" })} · 낙관 {formatKrwWon(p.opt, { style: "short" })} · 비관{" "}
                  {formatKrwWon(p.pess, { style: "short" })}
                </td>
                <td>—</td>
                <td>—</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  );
}
