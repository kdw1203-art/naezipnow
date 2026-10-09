/* [1048 · 다요인 분석] 시장 신호 판 — 단지 화면 · 임장노트 결과 · (다음) AI 분석 결과가 같은 판을 쓴다.
   소유자 지시(2026-10-09): "심리지수 · 부동산뉴스 · 관심도 · 거래량 · 추이 · 추세 · 매물수 등을 고려한 AI 분석 툴 ·
   임장노트 결과에도 범용으로".

   표시 규칙
   · 위: 종합 점수(0~100, 50 중립) · 구간 낱말 · 끌어올림/누름 요인 · (있으면) 현장 점수 — 현장은 시장 점수에 섞지 않는다.
   · 아래: 요인 8줄 — 가운데 기준선에서 오름 쪽(빨강 · 오른쪽) / 내림 쪽(파랑 · 왼쪽) 막대 + 사실 한 줄 + 출처·기준.
     국내 시세 화면 관례(상승 빨강 · 하락 파랑)와 같은 등락색 토큰(--up/--down).
   · 값이 없거나 못 읽은 요인은 막대 대신 상태 낱말("자료 없음" · "불러오기 실패" · "표본 적음").
   · 서버·클라이언트 어디서나 그려지는 순수 표시 조각(데이터 읽기 없음 · 상태 없음 · 첫 로드 JS 0).

   [1052] 이름 — 정해진 규칙으로 계산하는 판이라 "AI" 를 붙이지 않는다("다요인 분석 · 규칙 계산 · 공식 v2").
   · 점수 없는 줄 세 가지를 글과 모양으로 가른다: 불러오기 실패(점선 경고 테) · 표본 적음(기준선만) · 자료 없음(빈 줄).
     "반영 n/8"은 점수가 있는 요인만 세고, 빠진 까닭을 개수로 붙인다.
   · 요인 이름은 계산 방법의 그 요인 칸(/methodology#signal-<key>)으로 간다. 줄마다 출처 · 기준 시점.
   · 최신 자료 시점은 꼴이 섞인 asOf("2026.09" · "2026-08" · "202608" · "2026-10-05")를 숫자 키로 맞춰 고른다. */
import Link from "next/link";
import { coverageBreakdown, factorStateWord, latestAsOf, scoreLean, unscoredReason, ymLabel } from "@/lib/signals/display";
import type { SignalReport, SignalFactor } from "@/lib/signals/engine";

function Bar({ factor }: { factor: SignalFactor }) {
  const score = factor.score;
  if (score === null) {
    const why = unscoredReason(factor);
    if (why === "불러오기 실패") {
      return <div className="relative h-2 w-full rounded-full border border-dashed border-warning-border" aria-hidden="true" />;
    }
    if (why === "표본 적음") {
      return (
        <div className="relative h-2 w-full rounded-full bg-bg" aria-hidden="true">
          <span className="absolute inset-y-[-3px] left-1/2 w-px bg-line-strong" />
        </div>
      );
    }
    return <div className="relative h-2 w-full rounded-full bg-bg" aria-hidden="true" />;
  }
  const w = Math.min(50, (Math.abs(score) / 2) * 50);
  const up = score > 0;
  return (
    <div className="relative h-2 w-full rounded-full bg-bg" aria-hidden="true">
      <span className="absolute inset-y-[-3px] left-1/2 w-px bg-line-strong" />
      {w > 0.5 && (
        <span
          className={`absolute inset-y-0 rounded-full ${up ? "bg-up" : "bg-down"}`}
          style={up ? { left: "50%", width: `${w}%` } : { right: "50%", width: `${w}%` }}
        />
      )}
    </div>
  );
}

function wordTone(f: SignalFactor): string {
  const why = unscoredReason(f);
  if (why === "불러오기 실패") return "text-warning";
  if (why === "표본 적음") return "text-text-2";
  if (why === "자료 없음") return "text-text-3";
  const lean = scoreLean(f.score);
  return lean > 0 ? "text-up" : lean < 0 ? "text-down" : "text-text-2";
}

export function SignalBoard({
  report,
  title = "다요인 분석",
  idPrefix,
  methodHref = "/methodology#signals",
  className = "",
}: {
  report: SignalReport;
  title?: string;
  /** 한 화면에 판이 둘일 때 제목 id 충돌 방지 */
  idPrefix: string;
  /** 계산 방법 링크 — null 이면 아래 링크 · 요인 이름 링크를 모두 그리지 않는다 */
  methodHref?: string | null;
  className?: string;
}) {
  const titleId = `${idPrefix}-signals-title`;
  /* 모서리는 놓이는 화면의 카드와 맞춘다(노트 3xl · 단지 2xl) — 호출부가 rounded-* 를 주면 그것만 */
  const radius = /(^|\s)rounded-/.test(className) ? "" : "rounded-2xl";
  const latest = latestAsOf(report.factors.map((f) => f.asOf));
  const cov = coverageBreakdown(report.factors);
  const missingBits = [
    cov.thin > 0 ? `표본 적음 ${cov.thin}` : null,
    cov.failed > 0 ? `불러오기 실패 ${cov.failed}` : null,
    cov.none > 0 ? `자료 없음 ${cov.none}` : null,
  ].filter(Boolean);
  const factorHref = (key: SignalFactor["key"]) => (methodHref ? `/methodology#signal-${key}` : null);
  return (
    <section aria-labelledby={titleId} className={`@container card ${radius} p-4 max-md:p-3.5 ${className}`} data-signal-board={report.scope}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
        <h2 id={titleId} className="t-section text-ink">
          {title}
        </h2>
        <span className="shrink-0 t-caption text-text-3" data-signal-kind="rule">
          규칙 계산 · {cov.total}개 요인 · 공식 v{report.version}
        </span>
      </div>

      {/* 종합 — 점수 · 구간 · 요인 한 줄 · 현장 */}
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl bg-bg px-3 py-2.5">
        <div className="flex items-baseline gap-1">
          <span className="t-display t-num text-ink">{report.index ?? "—"}</span>
          <span className="t-caption text-text-3">/100 시장 신호</span>
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span
            className={`t-body font-bold ${
              report.index === null ? "text-text-3" : report.index >= 55 ? "text-up" : report.index < 45 ? "text-down" : "text-ink"
            }`}
          >
            {report.band ?? `자료 부족 · ${cov.used}/${cov.total}개 확인`}
          </span>
          <span className="t-caption text-text-2">
            {report.drivers.up.length > 0 && <>끌어올림 {report.drivers.up.slice(0, 3).join("·")}</>}
            {report.drivers.up.length > 0 && report.drivers.down.length > 0 && " · "}
            {report.drivers.down.length > 0 && <>누름 {report.drivers.down.slice(0, 3).join("·")}</>}
            {report.drivers.up.length === 0 && report.drivers.down.length === 0 && "두드러진 요인 없음"}
            {` · 반영 ${cov.used}/${cov.total}`}
            {missingBits.length > 0 ? <span className="text-text-3">{`(미반영 ${missingBits.join(" · ")})`}</span> : null}
          </span>
        </div>
        {report.field && (
          /* 넓은 판은 오른쪽 칸(세로선) · 좁은 판(폰 · 임장노트 오른쪽 칸 340px)은 아래 한 줄(가로선) — 화면 폭이 아니라
             판 폭(컨테이너 질의)으로 가른다. 데스크톱 노트 칸에서 요인 줄이 낱말마다 접히던 것 */
          <div className="flex shrink-0 flex-col items-end gap-0.5 border-l border-line pl-3 @max-md:w-full @max-md:flex-row-reverse @max-md:items-baseline @max-md:justify-between @max-md:border-l-0 @max-md:border-t @max-md:pl-0 @max-md:pt-2">
            <span className="t-section t-num text-ink">{Math.round(report.field.score100)}점</span>
            <span className="t-caption text-text-3">
              현장 · {report.field.label}
              {report.field.count ? ` ${report.field.count}건` : ""}
            </span>
          </div>
        )}
      </div>

      {/* 요인 8줄 */}
      <ul className="mt-2 flex list-none flex-col divide-y p-0" data-tone="plain">
        {report.factors.map((f) => {
          const href = factorHref(f.key);
          const asOf = ymLabel(f.asOf);
          const why = unscoredReason(f);
          return (
            <li key={f.key} className="flex flex-col gap-1 py-2" data-factor={f.key} data-factor-state={why ?? "scored"}>
              <div className="grid grid-cols-[4.5rem_minmax(0,1fr)_5.5rem] items-center gap-2.5">
                {href ? (
                  /* 보이는 줄 높이는 그대로(음수 마진) · 눌리는 범위만 폰 40px · 데스크톱 24px */
                  <Link
                    href={href}
                    aria-label={`${f.label} 계산 방법`}
                    className="-my-2.5 inline-flex min-h-[40px] min-w-[40px] items-center self-center t-sub font-bold text-ink underline decoration-line-strong decoration-dotted underline-offset-4 hover:text-primary md:-my-0.5 md:min-h-6 md:min-w-6"
                  >
                    {f.label}
                  </Link>
                ) : (
                  <span className="t-sub font-bold text-ink">{f.label}</span>
                )}
                <Bar factor={f} />
                <span className={`text-right t-caption font-bold ${wordTone(f)}`}>{factorStateWord(f)}</span>
              </div>
              <p className="t-caption text-text-2">
                {f.value}
                {f.note ? <span className="text-text-3"> · {f.note}</span> : null}
              </p>
              <p className="t-caption text-text-3">
                출처 {f.source}
                {asOf ? ` · 기준 ${asOf}` : ""}
              </p>
            </li>
          );
        })}
      </ul>

      <p className="mt-1.5 t-caption text-text-3">
        요인 점수 −2~+2 가중 평균 → 0~100(50 중립) · 점수 없는 요인 제외 · 매수·매도 권유 아님
        {latest ? ` · 최신 자료 ${latest}` : ""}
        {methodHref ? (
          <>
            {" · "}
            <Link href={methodHref} className="inline-block py-[5px] font-semibold text-primary no-underline">
              계산 방법 ›
            </Link>
          </>
        ) : null}
      </p>
    </section>
  );
}

export default SignalBoard;
