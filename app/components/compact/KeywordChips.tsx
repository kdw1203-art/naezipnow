/* [1062 · 글 줄이기] 낱말 칩 — 문단 대신 핵심 낱말을 늘어놓는다. 눌리는 것이 아니라 읽는 것(단추 아님). */
export function KeywordChips({ items, className = "", label = "핵심 낱말" }: { items: string[]; className?: string; label?: string }) {
  const list = items.filter((s) => s.trim().length > 0);
  if (list.length === 0) return null;
  return (
    <ul className={`m-0 flex list-none flex-wrap gap-1.5 p-0 ${className}`} aria-label={label}>
      {list.map((s) => (
        <li key={s} className="rounded-full border border-line bg-bg px-2.5 py-1 t-caption font-medium text-text-2">
          {s}
        </li>
      ))}
    </ul>
  );
}
