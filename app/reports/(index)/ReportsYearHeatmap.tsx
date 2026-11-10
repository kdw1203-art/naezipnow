import Link from "@/app/components/IntentLink";
import type { HeatCell, HeatYear } from "@/lib/reports/year-heat";

/* [1118 · 월간 리포트 달력] 연도별 30줄 목록 → 해마다 1~12월 칸(GitHub 기여 달력 · 아실 월별 거래량 · 증권 앱 히트맵 꼴).
   칸 = 그 달 리포트 링크 · 큰 글자 = 거래 건수(만 단위) · 작은 글자 = 집계 지역 수. 색 진하기 = 그 해 안 상대 크기(lib/reports/year-heat).
   신고 기한 전 달은 점선 칸 + "신고 중"(색을 매기지 않는다) · 리포트가 없는 달은 빈 칸. 서버 조각(JS 0). */

/* 단계별 파랑 섞음(%) — 3·4단만 흰 글자(대비 4.5:1 이상이 되는 진하기), 0~2단은 짙은 글자 */
const LEVEL_MIX = { 0: 6, 1: 15, 2: 28, 3: 75, 4: 92 } as const;

function countLabel(n: number): string {
  return n >= 10_000 ? `${(n / 10_000).toFixed(1)}만` : n.toLocaleString("ko-KR");
}

function Cell({ c, month }: { c: HeatCell | null; month: number }) {
  if (!c) {
    return (
      <span className="flex min-h-[68px] flex-col justify-between rounded-xl border border-dashed border-line p-2 t-caption text-text-3" aria-hidden="true">
        {month}월
      </span>
    );
  }
  const open = c.level === -1;
  const mix = open ? 0 : LEVEL_MIX[c.level as 0 | 1 | 2 | 3 | 4];
  const dark = mix >= 70;
  return (
    <Link
      href={`/reports/${c.ym}`}
      prefetch={false}
      aria-label={`${c.ym.slice(0, 4)}년 ${c.month}월 실거래 리포트 · ${c.txCount.toLocaleString("ko-KR")}건 · ${c.regionCount}개 지역${open ? " · 신고 중" : ""}`}
      className={`press flex min-h-[68px] flex-col justify-between rounded-xl p-2 no-underline transition-transform hover:-translate-y-px ${
        open ? "border border-dashed border-primary/40 bg-surface" : ""
      }`}
      style={open ? undefined : { background: `color-mix(in srgb, var(--primary) ${mix}%, var(--surface))` }}
    >
      <span className={`flex flex-wrap items-center justify-between gap-x-1 t-caption font-bold ${dark ? "text-on-dark" : "text-text-2"}`}>
        {c.month}월
        {open && <span className="whitespace-nowrap rounded bg-primary-soft px-1 text-primary">신고 중</span>}
      </span>
      <span className={`t-section t-num ${dark ? "text-on-dark" : "text-ink"}`}>{countLabel(c.txCount)}</span>
      <span className={`t-caption t-num ${dark ? "text-on-dark" : "text-text-3"}`}>{c.regionCount}곳</span>
    </Link>
  );
}

export function ReportsYearHeatmap({ years }: { years: HeatYear[] }) {
  return (
    <div className="flex flex-col gap-4">
      {years.map((y, yi) => {
        /* 가장 오래된 해는 집계가 시작된 달부터(앞의 빈 칸 줄을 그리지 않는다) */
        const start = yi === years.length - 1 ? Math.max(0, y.cells.findIndex((c) => c !== null)) : 0;
        return (
        <section key={y.year} id={`y${y.year}`} aria-labelledby={`y${y.year}-h`} className="card scroll-mt-24 rounded-2xl p-[var(--pad-card)]">
          <div className="mb-2.5 flex items-baseline justify-between gap-2">
            <h2 id={`y${y.year}-h`} className="t-section text-ink">
              {y.year}년 <span className="t-sub font-medium text-text-3">{y.months}개월</span>
            </h2>
            <span className="t-sub t-num text-text-3">합계 {y.total.toLocaleString("ko-KR")}건</span>
          </div>
          <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-6">
            {y.cells.slice(start).map((c, i) => (
              <Cell key={i + start} c={c} month={i + start + 1} />
            ))}
          </div>
        </section>
        );
      })}
      <p className="m-0 px-1 t-caption text-text-3">
        칸 = 그 달 리포트 · 큰 글자 = 아파트 매매 신고 건수 · 작은 글자 = 집계 지역 수 · 색 진하기 = 그 해 안에서 견준 크기(해마다 집계 범위가 달라 해끼리는 견주지 않는다)
        · 점선 = 신고 기한(계약 후 30일) 전 달
      </p>
    </div>
  );
}
