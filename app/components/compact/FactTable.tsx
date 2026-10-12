/* [1062 · 글 줄이기] 사실 표 — "항목 | 사실" 두 칸. 문장으로 길게 풀어 쓰던 고지·조건·규정을 줄 단위로.
 * 값은 호출부가 적는 사실 그대로(수치·규정 문구를 바꾸지 않는다). JS 없음. 폰에서는 한 줄에 항목 위·사실 아래. */
import type { ReactNode } from "react";

export type FactRow = { label: string; value: ReactNode };

export function FactTable({
  title,
  rows,
  className = "",
  dense = false,
}: {
  title?: string;
  rows: FactRow[];
  className?: string;
  /** 카드 없이 표만(이미 카드 안에 넣을 때) */
  dense?: boolean;
}) {
  if (rows.length === 0) return null;
  const table = (
    <dl className="m-0 grid grid-cols-1 gap-x-4 sm:grid-cols-[minmax(96px,160px)_1fr]">
      {rows.map((r, i) => (
        <div key={`${r.label}-${i}`} className="contents">
          <dt className={`t-caption font-bold text-text-3 ${i > 0 ? "border-t border-line pt-2.5 sm:pt-2.5" : ""} sm:pb-2.5`}>
            {r.label}
          </dt>
          <dd className={`m-0 pb-2.5 t-sub leading-[1.6] text-text-1 ${i > 0 ? "sm:border-t sm:border-line sm:pt-2.5" : ""}`}>
            {r.value}
          </dd>
        </div>
      ))}
    </dl>
  );
  if (dense) return <div className={className}>{table}</div>;
  return (
    <section className={`card p-[var(--pad-card)] ${className}`} aria-label={title ?? "사실 표"}>
      {title && <h2 className="mb-2 t-section font-bold text-ink">{title}</h2>}
      {table}
    </section>
  );
}
