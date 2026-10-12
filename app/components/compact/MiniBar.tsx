/* [1062 · 글 줄이기] 작은 비율 막대 — "A 가 B 보다 많다"를 문장으로 쓰던 자리를 눈으로 본다.
 *
 * 왜: 소유자 지시 "표나 그래프, 요약, 키워드 형식으로"(10-12). 수치 비교는 글보다 길이가 빠르다.
 * 규칙: 값은 호출부가 센 실측만(꾸민 수 금지) · 라벨·수를 함께 적는다(막대만 두면 읽을 수 없다) ·
 * 색은 강조색 하나와 흐린 바탕뿐(여러 색 금지 — 색이 뜻을 가지면 범례가 또 필요해진다). JS 없음.
 */
export type MiniBarRow = { label: string; value: number; note?: string };

export function MiniBar({
  rows,
  unit = "",
  className = "",
  label = "비율",
  max,
}: {
  rows: MiniBarRow[];
  /** 값 뒤에 붙는 단위("건" · "%" 등) */
  unit?: string;
  className?: string;
  label?: string;
  /** 기준 최댓값 — 생략하면 줄 중 가장 큰 값 */
  max?: number;
}) {
  const valid = rows.filter((r) => Number.isFinite(r.value) && r.value >= 0);
  if (valid.length === 0) return null;
  const top = Math.max(1, max ?? Math.max(...valid.map((r) => r.value)));
  return (
    <ul className={`m-0 flex list-none flex-col gap-2 p-0 ${className}`} aria-label={label}>
      {valid.map((r) => (
        <li key={r.label} className="flex flex-col gap-1">
          <div className="flex items-baseline justify-between gap-3">
            <span className="min-w-0 truncate t-sub text-text-1">{r.label}</span>
            <span className="t-num shrink-0 t-sub font-bold text-ink">
              {r.value.toLocaleString("ko-KR")}
              {unit}
              {r.note ? <span className="ml-1 font-medium text-text-3">{r.note}</span> : null}
            </span>
          </div>
          <span className="block h-1.5 w-full overflow-hidden rounded-full bg-line" aria-hidden="true">
            <span
              className="block h-full rounded-full bg-primary"
              style={{ width: `${Math.max(2, Math.round((r.value / top) * 100))}%` }}
            />
          </span>
        </li>
      ))}
    </ul>
  );
}
