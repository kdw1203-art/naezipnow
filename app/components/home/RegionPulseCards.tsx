"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { HomeRegionCard } from "@/lib/newui/home-data";
import { COUNTUP_MS } from "@/app/components/motion/CountUp";
import { Delta } from "@/app/components/num/Delta";
import { deltaDir, deltaText, pctChange } from "@/lib/format/delta";

/**
 * 지역 시세 카드 4열 — 정적 숫자 카드를 "살아 있는 계기판"으로.
 *
 *  - 카드 전체가 지도 딥링크(/map?region=…) — 눌러 볼 이유를 만든다.
 *  - 스파크라인: KB 주간 매매가격지수 최근 16주 **실데이터**(market_region_series).
 *    데이터가 없으면 그리지 않는다 — 장식용 가짜 곡선 금지(사실 우선 원칙).
 *  - 가격 숫자는 첫 노출에 카운트업. prefers-reduced-motion 이면 즉시 표시.
 *  - 서버가 만든 문자열(price)을 최종 상태로 그대로 쓴다 — 애니메이션이 끝나면
 *    반올림 차이 없이 서버 값으로 수렴한다.
 *
 * [1009 · H] 표기 표준(토스뱅크·네이버 부동산 관례):
 *  - 무엇의 평균인지 적는다 — "평균 매매가"(부동산원) / "실거래 평균"(국토부 신고 월 집계). 예전 카드는 라벨 없이
 *    "30.2억"만 있어 한 건 값처럼 읽혔다.
 *  - 등락은 <Delta>(▲ 빨강 · ▼ 파랑 · 보합 · 변동 미상) + 비교 기준("지수 전월 대비"/"평당가 전월 대비"). 예전엔 기준이 없었고,
 *    0.04% 가 회색 "▲ 0.0%"로 보였다(보합 문턱 표준 0.05%).
 *  - 스파크라인은 **그 선 자신의** 기간 등락으로 칠한다(상승 --up · 하락 --down · 보합 회색). 예전엔 카드의 월간 등락
 *    톤으로 칠해, 16주 지수가 오르는 선이 파랗게(하락색) 그려지는 일이 있었다 — 게다가 SVG 에 박은 raw hex 3색이라
 *    다크 모드에서도 그대로였다. 이제 currentColor + 토큰(text-up/text-down).
 *  - 카드 눌림은 .tile(마우스 기기 들림 · 모든 기기 눌림) — 예전 hover:-translate/raw rgba 그림자 대신.
 */

/** "202607" → "7월" · 아니면 null */
function monthOf(ym: string | null | undefined): string | null {
  return ym && /^\d{6}$/.test(ym) ? `${Number(ym.slice(4, 6))}월` : null;
}

/** 스파크라인 색 — 그 선의 첫 점 대비 마지막 점 등락(보합 문턱은 사이트 표준) */
const SPARK_TONE = { up: "text-up", down: "text-down", flat: "text-text-3" } as const;

function Sparkline({
  values,
  animate,
}: {
  values: number[];
  /** 뷰포트 진입 후 true — 그리기 애니메이션 트리거(페인트만 바뀌고 레이아웃은 불변) */
  animate: boolean;
}) {
  if (values.length < 4) return null;
  const w = 120;
  const h = 34;
  const pad = 3;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const step = (w - pad * 2) / (values.length - 1);
  const pts = values.map((v, i) => {
    const x = pad + i * step;
    const y = pad + (h - pad * 2) * (1 - (v - min) / span);
    return [x, y] as const;
  });
  const line = pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `${pad},${h - pad} ${line} ${(pad + (values.length - 1) * step).toFixed(1)},${h - pad}`;
  const [ex, ey] = pts[pts.length - 1];
  const dir = deltaDir(pctChange(values[values.length - 1], values[0])) ?? "flat";
  /* [1009 · H] 끝점은 SVG 밖 HTML 점으로 — 폭에 맞춰 늘어나는 viewBox(preserveAspectRatio="none") 안의 원은 데스크톱
     카드(약 270px)에서 가로로 2배 넘게 늘어난 타원이 됐다(TrendChart 를 고친 것과 같은 이유). */
  const dot = { left: `${(ex / w) * 100}%`, top: `${(ey / h) * 100}%` };
  return (
    <span className={`relative mt-2 block h-[30px] w-full ${SPARK_TONE[dir]}`} aria-hidden>
      <svg viewBox={`0 0 ${w} ${h}`} className="block h-full w-full" preserveAspectRatio="none">
        <polygon points={area} fill="currentColor" opacity={0.08} />
        <polyline
          points={line}
          fill="none"
          stroke="currentColor"
          strokeWidth={1.6}
          strokeLinecap="round"
          strokeLinejoin="round"
          pathLength={1}
          className={animate ? "rp-spark-line" : "rp-spark-wait"}
        />
      </svg>
      <span
        className="absolute h-[5px] w-[5px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-current transition-opacity"
        style={{ ...dot, opacity: animate ? 1 : 0 }}
      />
      {animate && (
        <span
          className="rp-spark-pulse absolute h-[5px] w-[5px] rounded-full bg-current"
          style={{ ...dot, marginLeft: -2.5, marginTop: -2.5 }}
        />
      )}
    </span>
  );
}

/** "28.8억" → { num: 28.8, digits: 1, suffix: "억" } — 실패하면 null(카운트업 생략) */
function parsePrice(price: string): { num: number; digits: number; suffix: string } | null {
  const m = /^([0-9]+(?:\.([0-9]+))?)(.*)$/.exec(price.trim());
  if (!m) return null;
  const num = Number(m[1]);
  if (!Number.isFinite(num)) return null;
  return { num, digits: m[2]?.length ?? 0, suffix: m[3] ?? "" };
}

function PriceCountUp({ price, active }: { price: string; active: boolean }) {
  const parsed = parsePrice(price);
  /* [E75] 초기 상태는 **서버가 그린 최종 값**이다.
     예전에는 `0${suffix}` 로 시작했다. 클라이언트 컴포넌트도 첫 렌더는 서버에서
     그려지므로, 그 초깃값이 곧 홈의 서버 HTML 에 들어가는 시세가 된다 —
     지역 카드가 있는 홈이라면 마크업상 전부 "0억"이다. 크롤러와 JS 가 죽은
     환경에서는 그 0억이 우리가 말한 시세다. 애니메이션 편의를 위해 없는 숫자를
     마크업에 남길 이유가 없다.
     (근거는 코드 계약이다 — 이 샌드박스는 지역 시세 조회가 비어 있어
      화면으로는 재현하지 못했다. app/components/motion/CountUp.tsx 의 규칙 ①
      이 같은 이유로 최종 값을 초기 상태로 두고 있다 — 그 계약에 맞춘다.) */
  const [text, setText] = useState(price);
  const doneRef = useRef(false);

  useEffect(() => {
    if (!parsed || doneRef.current) return;
    if (!active) return;
    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      doneRef.current = true;
      setText(price);
      return;
    }
    doneRef.current = true;
    const t0 = performance.now();
    /* 지속 시간은 공용 카운트업과 같은 값을 쓴다 — 예전엔 750ms 로 따로 적혀
       있어 같은 화면 안에서 700ms 와 750ms 두 속도가 돌았다. */
    const dur = COUNTUP_MS;
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      if (p >= 1) {
        setText(price); // 서버 문자열로 수렴
        return;
      }
      setText(`${(parsed.num * eased).toFixed(parsed.digits)}${parsed.suffix}`);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, price]);

  return <>{parsed ? text : price}</>;
}

export function RegionPulseCards({ regions }: { regions: HomeRegionCard[] }) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [seen, setSeen] = useState(false);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el || seen) return;
    if (typeof IntersectionObserver === "undefined") {
      setSeen(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setSeen(true);
          io.disconnect();
        }
      },
      { threshold: 0.3 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [seen]);

  if (regions.length === 0) return null;

  return (
    <div ref={wrapRef} className="rise-in-2 grid grid-cols-2 gap-3 xl:grid-cols-4">
      {regions.map((r) => {
        /* 부동산원 스냅샷이면 "평균 매매가", 국토부 신고 월 집계면 "실거래 평균" — 무엇의 평균인지 적는다.
           [1009 · H 리뷰] 월 집계 카드도 등락은 부동산원 지수(changeBasis "index")라 가격 원천은 stale 로만 가른다 */
        const avgLabel = r.stale ? "실거래 평균" : "평균 매매가";
        /* 등락의 달이 카드 기준월과 다르면 그 달을 적는다. 지수 전월비를 못 구한 월 집계 카드(avg)는 평당가 평균의 전월비다 */
        const changeMonth = monthOf(r.changeYm);
        const at = changeMonth && changeMonth !== r.periodLabel ? `${changeMonth} ` : "";
        const basis =
          r.changeBasis === "index"
            ? `${at}지수 전월 대비`
            : r.changeBasis === "avg"
              ? `${at}평당가 전월 대비`
              : "전월 대비";
        /* [1009 · H 리뷰] 거래 건수는 제 달·원천과 함께 — 예전엔 카드 기준월(8월) 옆에 다른 달(7월) 값을 "거래 N건"으로만 적었다 */
        const tradesMonth = monthOf(r.tradesYm);
        const tradesSrc = r.tradesSource === "reb" ? "부동산원" : r.tradesSource === "molit" ? "국토부" : null;
        const pct = r.changePct ?? null;
        return (
          <Link
            key={r.id}
            href={r.href}
            aria-label={`${r.name} ${r.periodLabel ?? ""} ${avgLabel} ${r.price}, ${basis} ${deltaText(pct)} — 지도에서 실거래로 보기`}
            className="card tile flex flex-col rounded-2xl px-4 pb-3 pt-3.5 no-underline"
          >
            <span className="flex items-baseline justify-between gap-2">
              <span className="min-w-0 t-body font-extrabold text-ink break-words">
                {r.name}
                {r.city ? <span className="ml-1 t-caption font-bold text-text-3">{r.city}</span> : null}
              </span>
              {r.periodLabel ? (
                <span className="shrink-0 t-caption tabular-nums text-text-3">{r.periodLabel}</span>
              ) : null}
            </span>
            <span className="mt-1.5 t-caption text-text-3">{avgLabel}</span>
            <span className="t-title t-num text-ink">
              <PriceCountUp price={r.price} active={seen} />
            </span>
            <span className="mt-0.5 flex flex-wrap items-baseline gap-x-1 t-sub">
              <Delta pct={pct} srContext={basis} />
              {pct !== null ? <span className="t-caption text-text-3">{basis}</span> : null}
            </span>
            {/* CLS 방지 — 스파크라인은 SSR부터 자리를 차지하고(레이아웃 불변),
                뷰포트에 들어오면 그리기 애니메이션만 시작한다(페인트 변화만). */}
            <Sparkline values={r.spark} animate={seen} />
            <span className="mt-1.5 flex flex-wrap items-center justify-between gap-x-2 t-caption text-text-3">
              <span>{r.spark.length >= 4 ? `선 · ${r.spark.length}주 시세 지수` : r.stale ? "국토부 실거래" : "한국부동산원"}</span>
              {typeof r.trades === "number" && r.trades > 0 ? (
                <span className="tabular-nums">
                  {tradesMonth ? `${tradesMonth} ` : ""}거래 {r.trades.toLocaleString("ko-KR")}건
                  {tradesSrc ? ` · ${tradesSrc}` : ""}
                </span>
              ) : null}
            </span>
          </Link>
        );
      })}
      {/* 스파크라인 그리기 애니메이션 — 컴포넌트와 함께 배달되는 지역 스타일 */}
      <style>{`
        .rp-spark-wait {
          stroke-dasharray: 1;
          stroke-dashoffset: 1;
        }
        .rp-spark-line {
          stroke-dasharray: 1;
          stroke-dashoffset: 1;
          animation: rp-draw 900ms ease-out forwards;
        }
        .rp-spark-pulse {
          /* [1009 · H] 투명도는 인라인이 아니라 여기 — 인라인이면 아래 모션 최소화의 opacity:0 을 이긴다 */
          opacity: 0.35;
          animation: rp-pulse 2.4s ease-out 900ms infinite;
          transform-origin: center;
        }
        @keyframes rp-draw {
          to {
            stroke-dashoffset: 0;
          }
        }
        @keyframes rp-pulse {
          0% {
            transform: scale(1);
            opacity: 0.35;
          }
          70% {
            transform: scale(2.6);
            opacity: 0;
          }
          100% {
            transform: scale(2.6);
            opacity: 0;
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .rp-spark-line {
            animation: none;
            stroke-dashoffset: 0;
          }
          .rp-spark-pulse {
            animation: none;
            opacity: 0;
          }
        }
      `}</style>
    </div>
  );
}
