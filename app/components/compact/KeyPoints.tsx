/* [1062 · 글 줄이기] 핵심 요약 — 긴 설명 위에 두는 2~4줄. 각 줄은 "낱말 라벨 — 한 문장 사실".
 * 긴 글은 지우지 않고 아래(또는 접기) 그대로 둔다. 숫자·규정은 본문과 같은 값만 적는다. */
export type KeyPoint = { k: string; v: string };

export function KeyPoints({ points, className = "", label = "핵심" }: { points: KeyPoint[]; className?: string; label?: string }) {
  if (points.length === 0) return null;
  return (
    <ul className={`m-0 flex list-none flex-col gap-1.5 rounded-xl border border-line bg-bg px-3.5 py-3 ${className}`} aria-label={label}>
      {points.slice(0, 4).map((p) => (
        <li key={p.k} className="flex items-start gap-2">
          <span className="mt-[2px] shrink-0 rounded-md bg-primary-soft px-1.5 py-0.5 t-caption font-bold text-primary">{p.k}</span>
          <span className="min-w-0 t-sub leading-[1.6] text-text-1">{p.v}</span>
        </li>
      ))}
    </ul>
  );
}
