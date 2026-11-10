import { buildVisitMonths } from "@/lib/notes/visit-months";

/* [1125 · 내 노트 방문 달력] 내 노트 목록 위 한 줄 — 최근 12개월 방문 건수(달 칸 · 색 진하기 = 그 기간 안 상대 크기).
   월간 리포트 달력(1118)과 같은 꼴. 방문일 없는 노트는 칸에 넣지 않고 아래에 건수로 적는다. */
const MIX = { 0: 0, 1: 14, 2: 30, 3: 85 } as const;

export function MineVisitMonths({ visitDates }: { visitDates: ReadonlyArray<string | undefined | null> }) {
  const { cells, total, undated } = buildVisitMonths(visitDates, new Date());
  if (total === 0) return null;
  return (
    <section aria-label="최근 12개월 방문" className="card rounded-2xl px-3.5 py-3">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="m-0 t-sub font-bold text-text-2">최근 12개월 방문</h2>
        <span className="t-caption text-text-3 tabular-nums">
          {total}건{undated > 0 ? ` · 방문일 없음 ${undated}건` : ""}
        </span>
      </div>
      <ol className="m-0 mt-2 grid list-none grid-cols-6 gap-1 p-0 md:grid-cols-12">
        {cells.map((c) => {
          const dark = c.level === 3;
          return (
            <li
              key={c.ym}
              aria-label={`${c.ym.slice(0, 4)}년 ${c.month}월 ${c.count}건`}
              className={`flex min-h-11 flex-col items-center justify-center rounded-lg ${c.level === 0 ? "border border-dashed border-line" : ""}`}
              style={c.level === 0 ? undefined : { background: `color-mix(in srgb, var(--primary) ${MIX[c.level]}%, var(--surface))` }}
            >
              <span className={`t-caption ${dark ? "text-on-dark" : "text-text-2"}`}>{c.month}월</span>
              <span className={`t-sub t-num font-bold ${dark ? "text-on-dark" : c.count > 0 ? "text-ink" : "text-text-3"}`}>{c.count}</span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

export default MineVisitMonths;
