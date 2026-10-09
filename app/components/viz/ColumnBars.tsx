/* [1049 · 그래프] 세로 막대(칸마다 이름 · 값) — 6~12칸짜리 월별 건수처럼 "칸마다 숫자를 읽어야 하는" 작은 묶음.
   Bars(SVG · 눈금 3개)는 긴 시계열용이고, 이쪽은 칸마다 달 이름과 값을 붙인다. HTML 상자라 글자가 찌그러지지 않는다.
   가장 큰 칸만 진하게(어디가 정점인지). 서버·클라이언트 공용 표시 조각(상태 없음). */

export interface ColumnItem {
  key: string;
  /** 칸 아래 이름(예: "9월") */
  label: string;
  value: number;
}

export function ColumnBars({
  items,
  height = 72,
  suffix = "",
  className,
  ariaLabel,
}: {
  items: readonly ColumnItem[];
  /** 막대 영역 높이(px) */
  height?: number;
  suffix?: string;
  className?: string;
  ariaLabel?: string;
}) {
  if (items.length === 0) return null;
  const max = Math.max(...items.map((i) => i.value), 0);
  const peak = items.findIndex((i) => i.value === max && max > 0);
  return (
    <div className={`flex items-end gap-1.5 ${className ?? ""}`} role="img" aria-label={ariaLabel ?? items.map((i) => `${i.label} ${i.value}${suffix}`).join(", ")}>
      {items.map((it, idx) => {
        const h = max > 0 ? Math.max(it.value > 0 ? 4 : 2, Math.round((it.value / max) * height)) : 2;
        return (
          <div key={it.key} className="flex min-w-0 flex-1 flex-col items-center gap-1" aria-hidden="true">
            <span className={`t-caption tabular-nums ${idx === peak ? "font-bold text-ink" : "text-text-3"}`}>
              {it.value.toLocaleString("ko-KR")}
              {suffix}
            </span>
            <span className="flex w-full items-end justify-center" style={{ height }}>
              <span
                className={`block w-full max-w-[28px] rounded-t-md ${idx === peak ? "bg-primary" : it.value > 0 ? "bg-primary/35" : "bg-line"}`}
                style={{ height: h }}
              />
            </span>
            <span className="truncate t-caption text-text-3">{it.label}</span>
          </div>
        );
      })}
    </div>
  );
}

export default ColumnBars;
