/* [1049 → 1050 · 홈] 서울 25개 구 매매가격지수 전월 대비 — "지역 동향" 칸 안의 접힘 하나.

   1049: 지역 동향 아래 따로 한 칸(막대 25줄)이었다.
   1050: 소유자 "홈에서는 중복되지 않을까? 다시 검토" — 같은 숫자를 세 곳이 말하고 있었다
     · AI 브리핑 한 줄("서울 25개 구 중 23곳 상승, 평균 ▲1.2%") · 지역 동향 카드(서울 구의 지수 전월 대비) · 이 칸.
   → 따로 칸을 없애고 지역 동향 카드 아래 **접힘 한 줄**로. 접힌 줄은 브리핑의 "몇 곳 상승 · 평균"을 다시 말하지 않고
     브리핑에 없는 것(가장 많이 오른 구 · 가장 많이 내린 구)만 — 펼치면 구별 막대 25줄.
   같은 행 · 같은 기준월 · 같은 계산(lib/newui/home-briefing districtMovesFromIndexRows) — 새 조회 0. 서버 조각(JS 0 · details). */
import { DivergingBars, type DivergingRow } from "@/app/components/viz/DivergingBars";

export function HomeSeoulMoves({ data }: { data: { period: string; rows: { id: string; name: string; pct: number }[] } | null }) {
  if (!data || data.rows.length === 0) return null;
  const rows: DivergingRow[] = data.rows.map((r) => ({ key: r.id, label: r.name, value: r.pct, href: `/region/${r.id}` }));
  const peak = Math.max(...rows.map((r) => Math.abs(r.value)));
  /* rows 는 상승 폭 큰 순(home-data seoulMovesFromCardSeries) — 맨 앞 = 가장 많이 오른 구 · 맨 뒤 = 가장 많이 내린(덜 오른) 구 */
  const top = rows[0];
  const bottom = rows[rows.length - 1];
  const pct = (v: number) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(2)}%`;
  const tone = (v: number) => (v > 0.05 ? "text-up" : v < -0.05 ? "text-down" : "text-ink");
  const ym = /^\d{6}$/.test(data.period) ? `${data.period.slice(0, 4)}.${data.period.slice(4, 6)}` : data.period;
  const half = Math.ceil(rows.length / 2);
  return (
    <details id="seoul-moves" className="group card rounded-2xl">
      <summary className="flex min-h-11 cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 max-md:px-3.5">
        <span className="t-sub font-bold text-ink">서울 {rows.length}개 구 막대</span>
        {top && (
          <span className="t-sub text-text-2">
            최고 {top.label} <b className={`tabular-nums ${tone(top.value)}`}>{pct(top.value)}</b>
          </span>
        )}
        {bottom && bottom !== top && (
          <span className="t-sub text-text-2">
            최저 {bottom.label} <b className={`tabular-nums ${tone(bottom.value)}`}>{pct(bottom.value)}</b>
          </span>
        )}
        <span className="ml-auto t-caption text-text-3">
          {/* dead-control-ok: <summary> 안 — 줄 전체가 펼침 단추(details) */}
          {ym} 지수 전월 대비 · <span className="font-bold text-primary group-open:hidden">펼치기 ▾</span>
          <span className="hidden font-bold text-primary group-open:inline">접기 ▴</span>
        </span>
      </summary>
      <div className="border-t border-line px-4 pb-3 pt-2.5 max-md:px-3.5">
        {/* 데스크톱 두 열 · 폰 한 열 — 같은 눈금. 구 이름 = 지역 화면 */}
        <div className="hidden gap-x-8 md:grid md:grid-cols-2">
          <DivergingBars rows={rows.slice(0, half)} max={peak} ariaLabel={`상승 폭 큰 순 1~${half}위`} />
          <DivergingBars rows={rows.slice(half)} max={peak} ariaLabel={`상승 폭 큰 순 ${half + 1}~${rows.length}위`} />
        </div>
        <DivergingBars className="md:hidden" rows={rows} max={peak} ariaLabel="상승 폭 큰 순" />
        <p className="m-0 mt-2 t-caption text-text-3">한국부동산원 월간 매매가격지수 · 구별 전월비 · 위 AI 브리핑과 같은 기준</p>
      </div>
    </details>
  );
}

export default HomeSeoulMoves;
