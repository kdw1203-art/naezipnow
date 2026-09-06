import { loadRentHistory, withSectionBudget } from "./section-loaders";
import {
  type ComplexRentHistory,
} from "@/lib/market/complex-rent";
import { formatKrwWon } from "@/lib/format/krw";

/* [#94 잔여] 단지 전월세 이력 — 지역 페이지 전월세 탭(1회차)의 단지 버전.
   market_transactions(rent) 를 (region_name, complex_name) 등치로 읽어
   월별 전세 보증금 중앙값 · 월세(보증금/월세) 중앙값 · 건수를 표로 보여 준다.
   0건이면 섹션 미표시, 조회 실패도 미표시(없음을 지어내지 않고, 실패 문구로
   페이지를 채우지도 않는다 — 곁다리 섹션의 관례: UpcomingSupply 와 동일). */

function fmtYm(ym: string): string {
  return ym.length === 6 ? `${ym.slice(0, 4)}.${ym.slice(4)}` : ym;
}

/** [967 · 31] 원 → "8.4억"/"9,800만"/"—" — lib/format/krw.ts "eok1"(허브 시세 표와 같은 얼굴) */
function fmtEok(krw: number | null): string {
  return formatKrwWon(krw, { style: "eok1" });
}

function fmtManwon(krw: number | null): string {
  if (krw === null || !Number.isFinite(krw) || krw <= 0) return "—";
  return `${Math.round(krw / 10_000).toLocaleString("ko-KR")}만`;
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

  const shown = hist.months.slice(0, 12);
  const jeonseTotal = hist.months.reduce((s, m) => s + m.jeonseCount, 0);
  const wolseTotal = hist.months.reduce((s, m) => s + m.wolseCount, 0);

  return (
    /* [968 · 7] cv-auto — 뷰포트 밖이면 레이아웃·페인트를 미룬다(page.tsx 주석 참고) */
    <section className="cv-auto rise-in-5 mt-6">
      <h2 className="mb-2 px-1 t-section text-ink">
        전월세 실거래 이력{" "}
        <span className="t-sub font-medium text-text-3">
          {hist.periodLabel} · 전세 {jeonseTotal.toLocaleString("ko-KR")}건 · 월세{" "}
          {wolseTotal.toLocaleString("ko-KR")}건
          {hist.truncated ? " · 표본 상한 도달" : ""}
        </span>
      </h2>
      {/* [968 · 6] 767px 이하 — 월별 2행 카드. 예전엔 5열 표(min-w 520px)만 있어 360px
          화면에서 가로 스크롤이 필요했고 페이드·고정 열도 없었다. 같은 값을 월 단위로
          접어 보여 준다: 1행 전세 중앙값·건수, 2행 월세(보증금/월세)·건수. md+ 는 아래 표. */}
      <ul className="card flex flex-col divide-y divide-divider rounded-2xl px-4 md:hidden">
        {shown.map((m) => (
          <li key={m.month} className="flex flex-col gap-1 py-2.5">
            <div className="flex items-baseline justify-between gap-2">
              <span className="t-sub font-bold text-ink tabular-nums">{fmtYm(m.month)}</span>
              <span className="t-caption text-text-3">전세 · 월세</span>
            </div>
            <div className="flex items-baseline justify-between gap-3 t-body">
              <span className="shrink-0 text-text-3">전세 중앙값</span>
              <span className="flex min-w-0 items-baseline gap-2">
                <span className="font-extrabold text-ink tabular-nums">
                  {fmtEok(m.jeonseMedianDepositKrw)}
                </span>
                <span className="t-sub text-text-2 tabular-nums">
                  {m.jeonseCount > 0 ? `${m.jeonseCount}건` : "—"}
                </span>
              </span>
            </div>
            <div className="flex items-baseline justify-between gap-3 t-body">
              <span className="shrink-0 text-text-3">월세 (보증금/월세)</span>
              <span className="flex min-w-0 items-baseline gap-2">
                <span className="font-bold text-ink tabular-nums">
                  {m.wolseCount > 0
                    ? `${fmtEok(m.wolseMedianDepositKrw)} / ${fmtManwon(m.wolseMedianMonthlyKrw)}`
                    : "—"}
                </span>
                <span className="t-sub text-text-2 tabular-nums">
                  {m.wolseCount > 0 ? `${m.wolseCount}건` : "—"}
                </span>
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
              <th className="py-2 pr-3 text-right font-semibold">전세 중앙값</th>
              <th className="py-2 pr-3 text-right font-semibold">전세 건수</th>
              <th className="py-2 pr-3 text-right font-semibold">월세 (보증금/월세)</th>
              <th className="py-2 text-right font-semibold">월세 건수</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((m) => (
              <tr key={m.month} className="border-b border-divider last:border-0">
                <td className="py-2.5 pr-3 font-bold text-ink tabular-nums">
                  {fmtYm(m.month)}
                </td>
                <td className="py-2.5 pr-3 text-right font-extrabold text-ink tabular-nums">
                  {fmtEok(m.jeonseMedianDepositKrw)}
                </td>
                <td className="py-2.5 pr-3 text-right text-text-2 tabular-nums">
                  {m.jeonseCount > 0 ? m.jeonseCount : "—"}
                </td>
                <td className="py-2.5 pr-3 text-right font-bold text-ink tabular-nums">
                  {m.wolseCount > 0
                    ? `${fmtEok(m.wolseMedianDepositKrw)} / ${fmtManwon(m.wolseMedianMonthlyKrw)}`
                    : "—"}
                </td>
                <td className="py-2.5 text-right text-text-2 tabular-nums">
                  {m.wolseCount > 0 ? m.wolseCount : "—"}
                </td>
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
