import { ExplainLazy as Explain } from "./ExplainLazy";
import { formatKrwManwon } from "@/lib/format/krw";
import { formatEokMan } from "@/lib/format/eok-man";
import type { AreaBandRow } from "@/lib/complex/complex-store";
import { loadAreaBands, logSectionFailure, withSectionBudget } from "./section-loaders";
import { AreaTextLazy as AreaText } from "./AreaTextLazy";

/* D5 — 면적대별 시세표 허브 승격. market_transactions 실거래 면적 구간별 최근가·평균가.
   실거래 없으면 렌더 생략(사실 우선).

   단, "실거래가 없다"와 "지금 못 불러왔다"는 다른 사실이다. 예전엔 조회가 실패해도
   .catch(() => []) 로 빈 배열이 되어 섹션이 통째로 사라졌고, 사용자에게는 이 단지에
   신고된 거래가 없는 것처럼 보였다. 실패는 실패라고 적는다.

   [1009 · C] 표기 표준 — "최근"·"최저~최고"는 **한 건의 실거래**라 반올림 없이("29억 6,750만", formatEokMan),
   "평균"만 짧은 표기("28.4억", eok1)로 "평균"이라고 적는다(예전엔 셋 다 "8.4억"이라 12억 4,500만과 12억 5,000만이
   같아 보였다). 390px 에서 4열 표가 가로로 밀리던 것(min-w 420 + 스크롤)을 면적대 한 줄 = 한 칸 목록으로 바꿨다.
   면적은 사용자 단위(㎡/평 — 붙은 뒤 쿠키로), "시세" 낱말은 실거래만 있는 곳이라 "실거래가"로. 용어 링크는
   화면을 떠나지 않는 ⓘ 설명으로. 보기(AreaBandsView)는 데이터만 받는다(하네스·테스트). */

/** 평균 — 짧은 표기(eok1) */
function avg(m: number): string {
  return formatKrwManwon(m, { style: "eok1" });
}

function ymLabel(s: string): string {
  return s.length === 6 ? `${s.slice(0, 4)}.${s.slice(4)}` : s;
}

export function AreaBandsView({ bands, compact = false }: { bands: readonly AreaBandRow[]; compact?: boolean }) {
  const wrap = compact ? "rise-in-1" : "rise-in-5 mt-6";
  if (bands.length === 0) return null;
  /* 항목 17 — 평균은 표본 기간 전체 거래의 평균이다. 기준 기간을 명기한다. */
  const firstYm = bands.reduce((min, b) => (b.firstYm < min ? b.firstYm : min), bands[0].firstYm);
  const latestYm = bands.reduce((max, b) => (b.latestYm > max ? b.latestYm : max), bands[0].latestYm);
  const totalCount = bands.reduce((s, b) => s + b.count, 0);
  const period = firstYm === latestYm ? ymLabel(latestYm) : `${ymLabel(firstYm)}~${ymLabel(latestYm)}`;

  return (
    <section className={wrap}>
      <h2 className="mb-1.5 px-0.5 t-section text-ink">
        면적대별 실거래가{" "}
        <span className="t-sub font-medium text-text-3">{bands.length}구간 · 국토부</span>
      </h2>
      <ul className="card flex flex-col divide-y divide-divider rounded-2xl px-4">
        {bands.map((b) => (
          <li key={b.label} className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-3 py-2.5">
            <div className="min-w-0">
              <div className="t-body font-bold text-ink">
                <AreaText band={b.label} />
              </div>
              <div className="t-caption text-text-3 tabular-nums">
                {b.count.toLocaleString("ko-KR")}건 · 평균 {avg(b.avgManwon)}
              </div>
            </div>
            <div className="text-right">
              <div className="t-body font-extrabold text-ink tabular-nums">{formatEokMan(b.latestManwon)}</div>
              <div className="t-caption text-text-3 tabular-nums">최근 거래 · {ymLabel(b.latestYm)}</div>
            </div>
            {/* 구간 안 분포 — 최저~최고가 같으면(거래 1건 등) 반복 표기 생략 */}
            {b.minManwon !== b.maxManwon && (
              <div className="col-span-2 mt-0.5 t-caption text-text-3 tabular-nums">
                최저 {formatEokMan(b.minManwon)} ~ 최고 {formatEokMan(b.maxManwon)}
              </div>
            )}
          </li>
        ))}
      </ul>
      <p className="mt-1.5 flex flex-wrap items-center gap-x-1 px-1 t-caption text-text-3">
        <span className="inline-flex items-center">
          전용면적
          <Explain term="jeonyongmyeonjeok" />
        </span>
        구간 · {period} 계약분 {totalCount.toLocaleString("ko-KR")}건 기준 ·
        <span className="inline-flex items-center">
          해제 신고
          <Explain term="haejegeorae" how="해제 신고된 거래는 이 표의 건수·평균·최저·최고에서 모두 빼요." />
        </span>
        제외 · 평균은 표본 기간 전체 거래의 산술평균
      </p>
    </section>
  );
}

export async function ComplexAreaBands({
  complexId,
  compact = false,
}: {
  complexId: string;
  /** 상단 배치 시 여백·패딩을 줄여 밀도 확보 */
  compact?: boolean;
}) {
  /* [968 · 1] 공유 예산 3초 — 넘기면 아래 실패 갈래("불러오지 못했어요")로 간다 */
  const bands = await withSectionBudget(loadAreaBands(complexId)).then(
    (data) => ({ ok: true as const, data }),
    (e: unknown) => {
      logSectionFailure("면적대별 시세", e);
      return { ok: false as const };
    },
  );
  const wrap = compact ? "rise-in-1" : "rise-in-5 mt-6";
  if (!bands.ok) {
    return (
      <section className={wrap}>
        <h2 className="mb-1.5 px-0.5 t-section text-ink">면적대별 실거래가</h2>
        <p className="card rounded-2xl px-4 py-3.5 t-body text-text-3">
          지금은 면적대별 실거래가를 불러오지 못했어요. 거래가 없는 게 아니라 조회에 실패한
          것이라, 잠시 후 새로고침하면 보일 수 있어요.
        </p>
      </section>
    );
  }
  return <AreaBandsView bands={bands.data} compact={compact} />;
}
