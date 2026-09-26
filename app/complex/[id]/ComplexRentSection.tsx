import { loadRentHistory, withSectionBudget } from "./section-loaders";
import type { ComplexRentHistory } from "@/lib/market/complex-rent";
import { formatKrwWon } from "@/lib/format/krw";
import { hubRanges, ymLongKo, ymShortDot } from "@/lib/complex/hub-price";
import { ScrubLineLazy } from "@/app/components/viz/ScrubLineLazy";
import { ExplainLazy as Explain } from "./ExplainLazy";

/* [#94 잔여] 단지 전월세 이력 — 지역 페이지 전월세 탭(1회차)의 단지 버전.
   market_transactions(rent) 를 (region_name, complex_name) 등치로 읽어
   월별 전세 보증금 중앙값 · 월세(보증금/월세) 중앙값 · 건수를 표로 보여 준다.
   0건이면 섹션 미표시, 조회 실패도 미표시(없음을 지어내지 않고, 실패 문구로
   페이지를 채우지도 않는다 — 곁다리 섹션의 관례: UpcomingSupply 와 동일).

   [1009 · C] 표기 표준 — 파일 안의 지역 포맷터(fmtEok·fmtManwon)를 걷고 공용 포맷터(lib/format/krw)를 바로 쓴다.
   여기 숫자는 전부 **중앙값(요약)**이라 짧은 표기("11.3억"·"260만")가 표준이고, 열 이름에 "중앙값"을 적는다.
   표 위에 전세 보증금 중앙값 추이(ScrubLine — 누르고 끌면 그 달 값·건수, 1~2건 달은 속 빈 점)를 얹었다: 12줄 표를
   위아래로 읽어야 보이던 흐름을 한 번에 본다. 차트 청크는 허브 가격 추이와 같은 것을 나눠 쓴다(라우트 번들 밖). */

/** 원 → "11.3억" · "9,800만" — 중앙값(요약)이라 짧은 표기 */
const eok1 = (krw: number | null) => formatKrwWon(krw, { style: "eok1" });

/** 달력으로 이은 달(과거 → 최신) — 신고 없는 달은 비운다(지어내지 않는다) */
function calendarMonths(first: string, last: string): string[] {
  const out: string[] = [];
  let y = Number(first.slice(0, 4));
  let m = Number(first.slice(4, 6));
  const endY = Number(last.slice(0, 4));
  const endM = Number(last.slice(4, 6));
  while ((y < endY || (y === endY && m <= endM)) && out.length < 60) {
    out.push(`${y}${String(m).padStart(2, "0")}`);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}

export function RentView({ hist, name }: { hist: ComplexRentHistory; name: string }) {
  if (hist.months.length === 0) return null;
  const shown = hist.months.slice(0, 12);
  const jeonseTotal = hist.months.reduce((s, m) => s + m.jeonseCount, 0);
  const wolseTotal = hist.months.reduce((s, m) => s + m.wolseCount, 0);

  /* 전세 보증금 중앙값 추이 — months 는 최신 먼저라 뒤집어 달력으로 잇는다 */
  const byYm = new Map(hist.months.map((m) => [m.month, m]));
  const sortedYm = [...byYm.keys()].sort();
  const yms = sortedYm.length ? calendarMonths(sortedYm[0], sortedYm[sortedYm.length - 1]) : [];
  const jeonseValues = yms.map((ym) => {
    const m = byYm.get(ym);
    return m && m.jeonseCount > 0 && m.jeonseMedianDepositKrw != null ? Math.round(m.jeonseMedianDepositKrw / 10_000) : null;
  });
  const jeonseCounts = yms.map((ym) => byYm.get(ym)?.jeonseCount ?? 0);
  const valued = jeonseValues.filter((v) => v != null).length;

  return (
    /* [968 · 7] cv-auto — 뷰포트 밖이면 레이아웃·페인트를 미룬다(page.tsx 주석 참고) */
    <section className="cv-auto rise-in-5 mt-6">
      <h2 className="mb-2 flex flex-wrap items-center gap-x-1 px-1 t-section text-ink">
        전월세 실거래
        <Explain
          title="전월세 실거래"
          how={[
            "월세가 0원인 신고는 전세, 그 밖은 월세로 나눠 그 달 보증금·월세의 중앙값(가운데 값)을 적어요 — 한두 건의 특이 거래에 평균보다 덜 끌려가요.",
            "면적을 가중하지 않아요(평형 구성이 다른 달끼리는 차이가 날 수 있어요).",
            "신고분에는 갱신·신규 계약이 섞여 있고, 최근 1~2개월은 신고 지연으로 적게 잡힐 수 있어요.",
          ]}
          source={`국토교통부 전월세 실거래 신고 · ${hist.periodLabel}`}
        />
        <span className="t-sub font-medium text-text-3">
          {hist.periodLabel} · 전세 {jeonseTotal.toLocaleString("ko-KR")}건 · 월세{" "}
          {wolseTotal.toLocaleString("ko-KR")}건
          {/* [970 · B-41] 건수는 기간 전체 합인데 표는 12개월만 — 그 차이를 적는다 */}
          {hist.months.length > shown.length ? ` · 표는 최근 ${shown.length}개월` : ""}
          {hist.truncated ? " · 표본 상한 도달" : ""}
        </span>
      </h2>

      {valued >= 2 && (
        <div className="card mb-2 rounded-2xl px-4 py-3.5">
          <ScrubLineLazy
            values={jeonseValues}
            labels={yms.map(ymShortDot)}
            fullLabels={yms.map(ymLongKo)}
            counts={jeonseCounts}
            countLabel="전세"
            fewBelow={3}
            format="eok1"
            tone="primary"
            title="전세 보증금 중앙값"
            caption="면적 혼합"
            ranges={hubRanges(yms.length)}
            defaultRange="all"
            ariaLabel={`${name} 월별 전세 보증금 중앙값 추이`}
            footnote="국토교통부 전월세 신고 · 월별 중앙값(면적 혼합) · 속 빈 점은 그 달 전세 1~2건"
          />
        </div>
      )}

      {/* [968 · 6] 767px 이하 — 월별 2행 카드. md+ 는 아래 표. */}
      <ul className="card flex flex-col divide-y divide-divider rounded-2xl px-4 md:hidden">
        {shown.map((m) => (
          <li key={m.month} className="flex flex-col gap-1 py-2.5">
            <div className="flex items-baseline justify-between gap-2">
              <span className="t-sub font-bold text-ink tabular-nums">{ymDot(m.month)}</span>
              <span className="t-caption text-text-3">중앙값 · 건수</span>
            </div>
            <div className="flex items-baseline justify-between gap-3 t-body">
              <span className="shrink-0 text-text-3">전세 보증금</span>
              <span className="flex min-w-0 items-baseline gap-2">
                <span className="font-extrabold text-ink tabular-nums">{eok1(m.jeonseMedianDepositKrw)}</span>
                <span className="t-sub text-text-2 tabular-nums">{m.jeonseCount > 0 ? `${m.jeonseCount}건` : "—"}</span>
              </span>
            </div>
            <div className="flex items-baseline justify-between gap-3 t-body">
              <span className="shrink-0 text-text-3">월세 (보증금/월세)</span>
              <span className="flex min-w-0 items-baseline gap-2">
                <span className="font-bold text-ink tabular-nums">
                  {m.wolseCount > 0
                    ? `${eok1(m.wolseMedianDepositKrw)} / ${formatKrwWon(m.wolseMedianMonthlyKrw)}`
                    : "—"}
                </span>
                <span className="t-sub text-text-2 tabular-nums">{m.wolseCount > 0 ? `${m.wolseCount}건` : "—"}</span>
              </span>
            </div>
          </li>
        ))}
      </ul>
      <div className="card hidden overflow-x-auto rounded-2xl px-4 py-2 md:block">
        <table className="w-full min-w-[520px] t-body">
          <thead>
            <tr className="border-b border-line text-left t-sub text-text-3">
              <th className="py-2 pr-3 font-semibold">계약월</th>
              <th className="py-2 pr-3 text-right font-semibold">전세 보증금 중앙값</th>
              <th className="py-2 pr-3 text-right font-semibold">전세 건수</th>
              <th className="py-2 pr-3 text-right font-semibold">월세 중앙값 (보증금/월세)</th>
              <th className="py-2 text-right font-semibold">월세 건수</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((m) => (
              <tr key={m.month} className="border-b border-divider last:border-0">
                <td className="py-2.5 pr-3 font-bold text-ink tabular-nums">{ymDot(m.month)}</td>
                <td className="py-2.5 pr-3 text-right font-extrabold text-ink tabular-nums">
                  {eok1(m.jeonseMedianDepositKrw)}
                </td>
                <td className="py-2.5 pr-3 text-right text-text-2 tabular-nums">
                  {m.jeonseCount > 0 ? m.jeonseCount : "—"}
                </td>
                <td className="py-2.5 pr-3 text-right font-bold text-ink tabular-nums">
                  {m.wolseCount > 0
                    ? `${eok1(m.wolseMedianDepositKrw)} / ${formatKrwWon(m.wolseMedianMonthlyKrw)}`
                    : "—"}
                </td>
                <td className="py-2.5 text-right text-text-2 tabular-nums">{m.wolseCount > 0 ? m.wolseCount : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="t-caption mt-1.5 px-1 text-text-3">
        국토교통부 전월세 신고 기준. 최근 1~2개월은 신고 지연으로 실제보다 적게 잡힐 수
        있고, 신고분에는 갱신·신규 계약이 섞여 있어 체감 시세와 다를 수 있습니다. 중앙값은
        면적을 가중하지 않은 값입니다.
      </p>
    </section>
  );
}

function ymDot(ym: string): string {
  return ym.length === 6 ? `${ym.slice(0, 4)}.${ym.slice(4)}` : ym;
}

export async function ComplexRentSection({
  region,
  name,
}: {
  region: string;
  name: string;
}) {
  let hist: ComplexRentHistory | null = null;
  try {
    // [949] 본문이 미리 띄운 같은 인자의 조회를 그대로 받는다(section-loaders)
    // [968 · 1] 공유 예산 3초 — 넘기면 아래 catch 로 접힌다(실패와 같은 취급)
    hist = await withSectionBudget(loadRentHistory(region, name));
  } catch {
    return null; // 곁다리 섹션 — 못 읽으면 접는다 (본문 실거래와 달리 페이지 정체성이 아님)
  }
  if (!hist || hist.months.length === 0) return null;
  return <RentView hist={hist} name={name} />;
}
