import Link from "@/app/components/IntentLink";
import { Delta } from "@/app/components/num/Delta";
import { RollingPanel } from "@/app/components/home/RollingPanel";
import { formatKrwShort } from "@/lib/market/format";
import type { TickerCard, TickerPage } from "@/lib/region/region-ticker";

/* [1115 · 지역 시세 시세판] 소유자 2026-11-09 "서울 주요 구, 인기 구 식으로 그래프를 4x4 형식(주식처럼) · 자동으로 넘어가는 액션".
   서버 조각 — 칸(이름 · 지수 · 전월 대비 · 13개월 선)은 서버 HTML, 쪽 넘김만 RollingPanel(홈 회전판과 같은 멈춤 · 동작 줄이기 규칙).
   PC 4×4 = 16칸 · 폰은 2열 앞 8칸(나머지는 PC 에서만). 선 색 = 그 선의 기간 등락(상승 빨강 · 하락 파랑 · 보합 회색).
   쪽 고르기는 lib/region/region-ticker(데이터로만 — 평균 매매가 순 · 전월 대비 순). 못 읽었으면 한 줄, 쪽이 없으면 아무것도 그리지 않는다. */

function Spark({ values }: { values: number[] }) {
  if (values.length < 2) return null;
  const w = 120;
  const h = 32;
  const pad = 2;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const step = (w - pad * 2) / (values.length - 1);
  const pts = values.map((v, i) => `${(pad + i * step).toFixed(1)},${(pad + (h - pad * 2) * (1 - (v - min) / span)).toFixed(1)}`).join(" ");
  const first = values[0];
  const last = values[values.length - 1];
  const tone = last > first * 1.0005 ? "text-up" : last < first * 0.9995 ? "text-down" : "text-text-3";
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className={`mt-1.5 block h-8 w-full ${tone}`} aria-hidden="true">
      <polygon points={`${pad},${h - pad} ${pts} ${(pad + (values.length - 1) * step).toFixed(1)},${h - pad}`} fill="currentColor" opacity={0.08} />
      <polyline points={pts} fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function Card({ c, i }: { c: TickerCard; i: number }) {
  return (
    <Link
      href={c.href}
      className={`press flex min-w-0 flex-col rounded-xl bg-bg px-3 py-2.5 no-underline hover:bg-divider ${i >= 8 ? "max-md:hidden" : ""}`}
    >
      <span className="flex items-baseline justify-between gap-1">
        <span className="truncate t-sub font-bold text-ink">{c.name}</span>
        <span className="shrink-0 t-caption text-text-3">{c.sido}</span>
      </span>
      <span className="mt-0.5 flex items-baseline gap-1.5">
        <span className="t-section t-num text-ink">{c.index.toFixed(1)}</span>
        {c.momPct !== null ? <Delta pct={c.momPct} srContext="전월보다" /> : null}
      </span>
      <span className="truncate t-caption text-text-3">{c.avgSaleKrw !== null ? `평균 ${formatKrwShort(c.avgSaleKrw)}` : `${c.ym} 지수`}</span>
      <Spark values={c.spark} />
    </Link>
  );
}

export function RegionTickerBoard({ pages, failed }: { pages: TickerPage[]; failed: boolean }) {
  if (pages.length === 0) {
    return failed ? <p className="card m-0 rounded-2xl px-4 py-3 t-sub text-text-3">지역 시세판 불러오기 실패 · 잠시 후 다시</p> : null;
  }
  const ym = pages[0]?.cards[0]?.ym ?? null;
  return (
    <section aria-labelledby="region-ticker-h" className="card rounded-2xl p-[var(--pad-card)]">
      <h3 id="region-ticker-h" className="sr-only">
        지역 시세판
      </h3>
      <RollingPanel
        label="지역 시세판 쪽"
        intervalMs={6000}
        pages={pages.map((p) => (
          <div key={p.key} className="flex flex-col gap-2.5">
            <p className="m-0 t-sub font-bold text-text-2">{p.title}</p>
            <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
              {p.cards.map((c, i) => (
                <Card key={c.id} c={c} i={i} />
              ))}
            </div>
          </div>
        ))}
      />
      <p className="m-0 mt-1 t-caption text-text-3">
        큰 숫자 = 한국부동산원 월간 아파트 매매가격지수{ym ? `(${ym})` : ""} · 등락 = 전월 대비 · 선 = 최근 13개월 · 평균 = 평균 매매가
      </p>
    </section>
  );
}
