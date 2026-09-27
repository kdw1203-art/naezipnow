/* [1012 · 규칙 8] font-extrabold(800) → font-bold(700) — 굵기 3단(400·500·700). 이 파일의 모든 자리에 적용. */
import Link from "next/link";
import { PageShell } from "@/app/components/PageShell";
import { buildPageMetadata } from "@/lib/seo/page-metadata";
import { runPredictionBacktest, BACKTEST } from "@/lib/ai/backtest";
import { formatEokMan } from "@/lib/format/eok-man";

/* [AI-20] 예측 적중률 공개 — 점 예측 대신 구간, 그리고 성적표 공개.
   "예측이 얼마나 맞았는지 스스로 공개하는 서비스"가 이 페이지의 존재 이유다.
   좋게 보이도록 지역·기간을 고르지 않는다 — 표본 조건(월 30건+)만 걸고 전부 계산. */

/* [1010] 1h → 1일. 이 화면의 원천은 하루 1회 적재되는 국토부 실거래·집계이고,
   적재 직후 lib/cache/invalidate.ts SOURCE_MAP.molit(+reb)이 이 경로를 이미 비운다 —
   시간 TTL 은 안전망일 뿐이다. 실측(2026-09-20~22) 이 축의 분석 화면은 하루 수천 회
   렌더되는데 사람 방문은 7일 합계 ~120건이고, 크롤러 재방문 간격은 ≈2.2일이라
   1시간 눈금은 방문마다 재렌더를 뜻했다. */
export const revalidate = 86_400;

export const metadata = buildPageMetadata({
  title: "시세 예측 적중률 — 우리 성적표 공개",
  description:
    "내집나우 시세 예측(3개월 모멘텀 외삽)의 과거 적중률을 공개합니다. 예측 ±5% 안에 실제 평당가가 들어온 비율과 평균 오차 — 실측 그대로.",
  path: "/analysis/accuracy",
});

export default async function AccuracyPage() {
  const bt = await runPredictionBacktest();

  return (
    <PageShell breadcrumb="예측 적중률">
      {/* [v4 · 한 화면 한 가지] 제목 + 사실 한 줄 → 주인공(적중률 t-display) + 나머지 두 숫자 한 줄 → 지역·월 구분선 행 →
          면책·링크 한 줄. 지운 것: 방법 문단(→ 사실 줄), 숫자 카드 3장(→ 주인공 + 한 줄), 6열 표(→ 행), 판정 알약 배지(→ 글자),
          회색 상자 안내(→ 캡션). */}
      <div className="mx-auto flex w-full max-w-[760px] flex-col gap-8">
        <div className="flex flex-col gap-4">
          <header className="rise-in flex flex-col gap-0.5">
            <h1 className="t-title text-ink">시세 예측, 얼마나 맞았나</h1>
            <p className="t-sub text-text-3">
              직전 3개월 모멘텀 외삽 · 과거 {BACKTEST.lookbackMonths}개월 · 월 거래 {BACKTEST.minMonthlyTx}건 이상 전부 · 골라내지 않음
            </p>
          </header>
          {bt.total > 0 && (
            <section aria-label="적중률" className="flex flex-col gap-0.5">
              <p className="m-0 t-caption text-text-3">실제 평당가 ±{BACKTEST.hitBandPct}% 안 적중률</p>
              <p className="m-0 t-display t-num text-ink">{bt.hitRatePct}%</p>
              <p className="m-0 t-sub text-text-2">
                {bt.hits}/{bt.total} 지역·월 · 평균 절대 오차 <b className="t-num text-ink">{bt.meanAbsErrorPct}%</b> · 검증{" "}
                {bt.monthsCovered.length}개월({bt.monthsCovered[0]?.slice(0, 4)}.{bt.monthsCovered[0]?.slice(4)}~)
              </p>
            </section>
          )}
        </div>

        {bt.total === 0 ? (
          <p className="py-6 text-center t-body text-text-3">계산 가능한 표본 없음 · 데이터가 쌓이면 공개</p>
        ) : (
          <section className="flex flex-col gap-2">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="flex items-baseline gap-1.5 t-section text-ink">
                지역·월 <span className="t-num text-text-3">{Math.min(60, bt.cells.length)}</span>
              </h2>
              <span className="t-caption text-text-3">오차</span>
            </div>
            {/* [v4 · 규칙 5] 6열 표 → 구분선 행: 왼쪽 지역 + 보조 한 줄(월 · 예측 → 실제) / 오른쪽 오차 + 판정 */}
            <ul data-tone="blue" className="card flex flex-col divide-y divide-line rounded-lg px-4">
              {bt.cells.slice(0, 60).map((c) => (
                <li key={`${c.regionName}-${c.month}`} className="flex min-h-14 items-center justify-between gap-3 py-3">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate t-body font-bold text-ink">{c.regionName}</span>
                    {/* [1009 · A] 평당가 1억 이상이 "12,017만"(억 미전환)으로 찍혔다 — 표기 표준(formatEokMan) */}
                    <span className="mt-0.5 block truncate t-sub tabular-nums text-text-3">
                      {c.month.slice(0, 4)}.{c.month.slice(4)} · 예측 {formatEokMan(c.predictedPerPyeong / 10000)} → 실제{" "}
                      {formatEokMan(c.actualPerPyeong / 10000)}
                    </span>
                  </span>
                  <span className="flex shrink-0 flex-col items-end">
                    <span
                      className={`t-body t-num ${Math.abs(c.errorPct) <= BACKTEST.hitBandPct ? "text-success" : "text-danger"}`}
                    >
                      {c.errorPct > 0 ? "+" : ""}
                      {c.errorPct}%
                    </span>
                    <span className={`t-caption font-medium ${c.hit ? "text-success" : "text-text-3"}`}>
                      {c.hit ? "적중" : "벗어남"}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
            {bt.cells.length > 60 && (
              <p className="t-caption text-text-3">최근 60행 · 전체 {bt.total}건은 위 요약 수치에 모두 반영</p>
            )}
          </section>
        )}

        {/* 면책 — 늘 보이게 한 줄 + 도구 링크 */}
        <p className="t-caption text-text-3">
          조회 시점 실거래 집계로 재계산 · 과거 적중률은 미래 수익을 보장하지 않습니다 ·{" "}
          <Link href="/analysis/ai/ai-prediction" className="tap-line font-bold text-primary no-underline">
            시세 예측 실행 ›
          </Link>
        </p>
      </div>
    </PageShell>
  );
}
