"use client";
/* [1024 · 단지 상세] 타입 탭(폰 sticky) → 매매|전세|월세 → 기간 칩 → 추이 그래프(월 중앙값 선 + 거래량 막대 + 신고가▲·신저가▼).
 *
 * 재료는 서버(page.tsx)가 complex-v2-model.buildTxTrendData 로 만든 직렬화 값 하나(TxTrendData) — 이 부품은 고르고 그리기만
 * 한다(추가 요청 0). TxTrendLazy 가 따로 받는 청크라 라우트 번들(478/480KB)에는 얇은 래퍼만 잡힌다.
 *
 * 정직성 규칙
 *   · 기간 칩: 1년은 언제나, 3년·5년·전체는 데이터 개월 수로 켜고 끈다(꺼진 칩은 disabled + "YYYY-MM 부터" 캡션).
 *   · 전세·월세는 **전 타입** 값이다 — 전월세 원표본(complex-rent)에 면적이 없다. 캡션에 그렇게 적는다.
 *   · 신고가·신저가는 기간 안 최고·최저 실거래 그 자체(tx-extremes). 한 건뿐인 타입은 표시하지 않는다.
 *   · 값이 없는 달은 비운다(선을 잇지 않는다 — price-chart-geometry 규칙). */
import { Fineprint } from "@/app/components/Fineprint";
import { useDeferredValue, useMemo, useState } from "react";
import { formatEokMan } from "@/lib/format/eok-man";
import { TxTrendChart, type TxTrendMark } from "@/app/components/viz/TxTrendChart";
import type { ChartMonth } from "@/app/components/viz/price-chart-geometry";
import { dealDateLabel, floorLabel } from "@/lib/complex/deal-format";
import { belowHighPct, periodStart, ymDash, type ExtremePoint, type TxTrendData } from "./complex-v2-model";
import { Delta } from "@/app/components/num/Delta";
import { useAreaUnit, unitAreaLabel } from "./AreaText";

type Mode = "trade" | "jeonse" | "wolse";
const MODES: { value: Mode; label: string }[] = [
  { value: "trade", label: "매매" },
  { value: "jeonse", label: "전세" },
  { value: "wolse", label: "월세" },
];

/* [1028] 직거래면 날짜·층 뒤에 적는다 — 당사자끼리 맺은 계약이라 값이 주변 거래와 다를 수 있다 */
function pointSub(p: ExtremePoint): string {
  return [dealDateLabel(p.ym, p.day), p.floor != null ? floorLabel(p.floor) : null, p.direct ? "직거래" : null]
    .filter(Boolean)
    .join(" · ");
}

export function TxTrendSection({ data, complexName }: { data: TxTrendData; complexName: string }) {
  const unit = useAreaUnit();
  const [typeKey, setTypeKey] = useState<string | null>(data.defaultKey);
  /* 매매 신고가 한 건도 없고 전월세만 있으면 전세로 시작한다(빈 매매 그림으로 열지 않는다) */
  const [mode, setMode] = useState<Mode>(() =>
    data.rent && data.types.length === 0 && data.all.values.every((v) => v == null) ? "jeonse" : "trade",
  );
  const [period, setPeriod] = useState<string>("1y");

  /* [1043 · 성능] 타입 탭을 누르면 **단추 표시가 먼저** 바뀌고 그래프·표는 뒤따라 그린다(useDeferredValue).
     실사용 INP(안드로이드): 이 단추에서 320~328ms — 한 번의 누름이 그래프 전체(월 수십 칸 · 표식 · 요약)를 같은 프레임에 다시 그렸다.
     누른 값(typeKey)은 단추가 바로 쓰고, 그래프는 한 박자 늦은 값(shownKey)으로 그린다 — 값이 같아지면 같은 화면이다. */
  const shownKey = useDeferredValue(typeKey);
  const type = data.types.find((t) => t.key === shownKey) ?? data.types[0] ?? null;
  const pressedKey = data.types.some((t) => t.key === typeKey) ? typeKey : (data.types[0]?.key ?? null);
  const chip = data.chips.find((c) => c.key === period && c.enabled) ?? data.chips[0];
  const start = periodStart(data.yms.length, chip.last);
  const yms = data.yms.slice(start);

  /* 고른 모드의 시계열 — 매매는 타입별(없으면 전 타입), 전세·월세는 전 타입 */
  const series = useMemo(() => {
    if (mode === "trade") return type ? { values: type.values, counts: type.counts } : data.all;
    if (!data.rent) return null;
    return mode === "jeonse" ? data.rent.jeonse : data.rent.wolse;
  }, [mode, type, data]);

  const months: ChartMonth[] = useMemo(
    () =>
      series
        ? yms.map((ym, i) => ({
            ym,
            avgMan: series.values[start + i] ?? null,
            n: series.counts[start + i] ?? 0,
            nAll: series.counts[start + i] ?? 0,
          }))
        : [],
    [series, yms, start],
  );
  const marks: TxTrendMark[] = useMemo(() => {
    if (mode !== "trade" || !type) return [];
    const out: TxTrendMark[] = [];
    if (type.high && yms.includes(type.high.ym)) out.push({ ym: type.high.ym, kind: "high", valueMan: type.high.man });
    if (type.low && yms.includes(type.low.ym)) out.push({ ym: type.low.ym, kind: "low", valueMan: type.low.man });
    return out;
  }, [mode, type, yms]);

  const belowPct = mode === "trade" && type ? belowHighPct(type.latest?.man, type.high?.man) : null;
  const typeLabel = type ? unitAreaLabel(type.areaM2, unit) : "전 타입";
  const modeLabel = MODES.find((m) => m.value === mode)?.label ?? "매매";
  const what = mode === "trade" ? `${typeLabel} 매매` : `${modeLabel} · 전 타입(면적 구분 없음)`;
  const valued = months.filter((m) => m.avgMan != null).length;
  /* [1030 · G3] 끝 두 칸이 비면 신고 기한(계약 후 30일) 안의 달 — 범례에 그 사실을 적는다(그래프 안 "거래 없음"도 같은 말로 바뀐다) */
  const pendingTail = (() => {
    const out: string[] = [];
    for (let i = months.length - 1; i >= 0 && i >= months.length - 2; i -= 1) {
      if (months[i].nAll > 0 || months[i].avgMan != null) break;
      out.unshift(months[i].ym);
    }
    return out;
  })();
  const rentOff = !data.rent;

  return (
    <div className="flex flex-col gap-2">
      {data.types.length > 0 && (
        <div
          role="group"
          aria-label="타입"
          className="sticky top-[56px] z-30 -mx-3.5 flex gap-1.5 overflow-x-auto bg-bg px-3.5 pb-1 pt-2 [scrollbar-width:none] md:static md:mx-0 md:px-0 md:pt-0 [&::-webkit-scrollbar]:hidden"
        >
          {data.types.map((t) => {
            const on = pressedKey === t.key;
            return (
              <button
                key={t.key}
                type="button"
                aria-pressed={on}
                onClick={() => setTypeKey(t.key)}
                className={`press flex min-h-10 min-w-[76px] shrink-0 flex-col items-center justify-center rounded-lg border px-3 py-1 leading-tight ${
                  on ? "border-brand-hanji-ink bg-brand-hanji text-brand-hanji-ink" : "border-line bg-surface text-text-2"
                }`}
              >
                <span className="t-body font-bold tabular-nums">{unitAreaLabel(t.areaM2, unit)}</span>
                <span className={`t-caption tabular-nums ${on ? "" : "text-text-3"}`}>거래 {t.count}</span>
              </button>
            );
          })}
        </div>
      )}

      <section aria-label="실거래 추이" className="card flex flex-col gap-2 rounded-2xl px-4 py-3.5 max-md:px-3.5 max-md:py-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="seg" role="group" aria-label="거래 종류">
            {MODES.map((m) => {
              const off = m.value !== "trade" && rentOff;
              return (
                <button
                  key={m.value}
                  type="button"
                  aria-pressed={mode === m.value}
                  disabled={off}
                  title={off ? "전월세 신고 없음" : undefined}
                  onClick={() => setMode(m.value)}
                  className="min-h-8"
                >
                  {m.label}
                </button>
              );
            })}
          </div>
          <div className="flex gap-1" role="group" aria-label="기간">
            {data.chips.map((c) => {
              const on = chip.key === c.key;
              return (
                <button
                  key={c.key}
                  type="button"
                  aria-pressed={on}
                  disabled={!c.enabled}
                  onClick={() => setPeriod(c.key)}
                  className={`chip press min-h-8 px-2.5 t-sub ${
                    on ? "chip-active" : c.enabled ? "border border-line bg-surface text-text-2" : "cx-chip-off"
                  }`}
                >
                  {c.label}
                </button>
              );
            })}
          </div>
        </div>
        <p className="t-caption text-text-3">
          {what}
          {/* [1028] "2025-01 부터 · 12개월 · 5년·전체는 2025-01 부터"처럼 같은 달이 두 번 나오던 줄 — 꺼진 기간이 있으면 그 설명만 */}
          {` · ${yms.length}개월`}
          {data.caption ? ` · ${data.caption}` : data.firstYm ? ` · ${ymDash(data.firstYm)} 부터` : ""}
        </p>

        {mode === "trade" && type && (
          <div className="flex flex-wrap items-end justify-between gap-x-3 gap-y-2">
            {type.latest && (
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="t-caption text-text-3">최근 실거래 · {pointSub(type.latest)}</span>
                <span className="t-title t-num text-ink">{formatEokMan(type.latest.man)}</span>
                {/* [1028] 신고가 대비 — 최근 실거래가 이 타입의 기간 내 신고가보다 낮을 때만 */}
                {belowPct != null && (
                  <span className="flex flex-wrap items-baseline gap-x-1 t-sub">
                    <Delta pct={belowPct} srContext="신고가 대비" />
                    <span className="t-caption text-text-3">신고가 대비</span>
                  </span>
                )}
              </div>
            )}
            {(type.high || type.low) && (
              <div className="flex gap-3">
                {type.high && (
                  <div className="flex flex-col gap-0.5">
                    <span className="t-caption text-text-3">신고가 ▲</span>
                    <span className="t-section t-num text-up">{formatEokMan(type.high.man)}</span>
                    <span className="t-caption text-text-3 tabular-nums">{pointSub(type.high)}</span>
                  </div>
                )}
                {type.low && (
                  <div className="flex flex-col gap-0.5">
                    <span className="t-caption text-text-3">신저가 ▼</span>
                    <span className="t-section t-num text-down">{formatEokMan(type.low.man)}</span>
                    <span className="t-caption text-text-3 tabular-nums">{pointSub(type.low)}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
        {mode === "wolse" && data.rent && (
          <p className="t-caption text-text-3">선은 월세액 중앙값 · 보증금 중앙값은 그 달 값을 훑으면 표에 나온다</p>
        )}

        {series && valued > 0 ? (
          <TxTrendChart
            months={months}
            marks={marks}
            valueLabel={`월 중앙값 · ${what}`}
            countLabel={mode === "trade" ? "거래" : modeLabel}
            ariaLabel={`${complexName} ${what} 월 중앙값 추이`}
          />
        ) : (
          <p className="rounded-lg bg-bg px-3 py-4 text-center t-body text-text-3">이 기간 {what} 신고 없음</p>
        )}

        {/* [1036 · 밀도] 범례·집계 중 안내는 접는다 — 차트 아래 두 줄 글이 숫자를 밀어내던 자리 */}
        <Fineprint label="범례 · 기준">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="inline-flex items-center gap-1">
            <span aria-hidden="true" className="inline-block h-[3px] w-3 rounded bg-primary" />월 중앙값
          </span>
          <span className="inline-flex items-center gap-1">
            <span aria-hidden="true" className="inline-block h-2 w-2 rounded-sm bg-primary opacity-25" />
            거래량
          </span>
          {mode === "trade" && (
            <>
              <span>
                <b className="text-up">▲</b> 신고가
              </span>
              <span>
                <b className="text-down">▼</b> 신저가
              </span>
            </>
          )}
          <span className="inline-flex items-center gap-1">
            <span aria-hidden="true" className="inline-block h-2 w-2 rounded-full border border-primary bg-surface" />
            거래 1~2건 달
          </span>
          {pendingTail.length > 0 && (
            <span>
              {pendingTail.map((ym) => `${ym.slice(2, 4)}.${ym.slice(4)}`).join("·")} 신고 집계 중 · 계약 후 30일 내 신고
            </span>
          )}
        </div>
        </Fineprint>
      </section>
    </div>
  );
}

export default TxTrendSection;
