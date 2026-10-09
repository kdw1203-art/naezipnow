import Link from "next/link";

/* [1049 · 그래프] 양방향 막대 — 0 을 가운데 두고 오름(오른쪽 · 등락색 up) / 내림(왼쪽 · down).
   전월 대비처럼 부호가 뜻을 가진 값을 25줄씩 늘어놓을 때 표보다 순서·크기·방향이 먼저 읽힌다.
   국내 시세 화면 관례(상승 빨강 · 하락 파랑) — 색은 토큰(--up/--down) 그대로.
   서버·클라이언트 공용 표시 조각(상태 없음 · 첫 로드 JS 0). */

export interface DivergingRow {
  key: string;
  label: string;
  /** 부호 있는 값(예: 전월 대비 %) */
  value: number;
  href?: string;
}

export function DivergingBars({
  rows,
  suffix = "%",
  digits = 2,
  max: maxOverride,
  className,
  ariaLabel,
}: {
  rows: readonly DivergingRow[];
  suffix?: string;
  digits?: number;
  /** 막대 끝(절댓값) — 없으면 rows 의 최대 절댓값 */
  max?: number;
  className?: string;
  ariaLabel?: string;
}) {
  if (rows.length === 0) return null;
  const peak = maxOverride ?? Math.max(...rows.map((r) => Math.abs(r.value)), 0);
  const scale = peak > 0 ? peak : 1;
  return (
    <ul className={`m-0 flex list-none flex-col gap-1 p-0 ${className ?? ""}`} aria-label={ariaLabel}>
      {rows.map((r) => {
        const w = Math.min(50, (Math.abs(r.value) / scale) * 50);
        const up = r.value > 0;
        const down = r.value < 0;
        const tone = up ? "text-up" : down ? "text-down" : "text-text-3";
        const sign = up ? "+" : down ? "−" : "";
        const body = (
          <>
            <span className="w-[4.5rem] shrink-0 truncate t-sub font-bold text-ink">{r.label}</span>
            <span className="relative h-2.5 min-w-0 flex-1 rounded-full bg-bg" aria-hidden="true">
              <span className="absolute inset-y-[-2px] left-1/2 w-px bg-line-strong" />
              {w > 0.4 && (
                <span
                  className={`absolute inset-y-0 rounded-full ${up ? "bg-up" : "bg-down"}`}
                  style={up ? { left: "50%", width: `${w}%` } : { right: "50%", width: `${w}%` }}
                />
              )}
            </span>
            <span className={`w-[4.25rem] shrink-0 text-right t-sub font-bold tabular-nums ${tone}`}>
              {sign}
              {Math.abs(r.value).toFixed(digits)}
              {suffix}
            </span>
          </>
        );
        return (
          <li key={r.key}>
            {r.href ? (
              <Link href={r.href} className="press flex min-h-8 items-center gap-2.5 rounded-md no-underline">
                {body}
              </Link>
            ) : (
              <span className="flex min-h-8 items-center gap-2.5">{body}</span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

export default DivergingBars;
