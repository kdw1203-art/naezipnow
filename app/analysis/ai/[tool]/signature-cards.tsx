"use client";
/* [1022 · 단지 분석 고도화] 지시 3 "종합진단·시세예측·매수타이밍은 좀 더 고도화" — 있는 데이터로만 깊이를 더한다.
   · 셋 다: 카드 맨 위 한 줄 요약 세 토막(SummaryLine — verdict.headline · bandReason · 기준 시점) 같은 자리·같은 글자.
   · 종합 진단: 축별 행에 "이어서 볼 도구 ›"(lib/ai/next-action-routing radarAxisFollowUp — 50점 미만일 때만) ·
     이전 실행 점수 한 줄(history-store → lib/ai/history-compare, 있을 때만). 지역 평균 겹치기는 지역 축 데이터가 없어 없음.
   · 시세 예측: 부채꼴 위 비용 포함 손익분기 선(lib/ai/scenario-breakeven — 내 조건에 대출 비율·금리가 있을 때만) ·
     범례를 눌러 시나리오 하나만 강조(해마다 표의 그 열도 강조) · "지금 대비" 옆 연평균(scenario.annual.base).
   · 매수 타이밍: 신호마다 흐름선을 카드 폭으로 더 길게(result-series 있을 때, 12개월이 있으면 최근 12개월) + 마지막 값 라벨 ·
     종합 결론에 신호 조합 이력 한 줄(같은 지역 이전 실행이 있을 때만).
   [1021 · 단지 분석 /analysis/ai] 단지 분석 4종(종합 진단·시세 예측·임장 동선·매수 타이밍)의 **대표 그림(signature) 카드**.
   소유자 지시: "단지 분석 4종에 각각의 특징을 담은 디자인" → 시안(mock8/diag·pred·insp·timing-ai)대로.
   규칙: 숫자는 있는 것만(verdict·insight·scenario·series) · 새 계산 없음(지금 대비 % 만 scenario 두 값의 비율) ·
   설명문 없음 · 색은 토큰만 · 굵기 700 까지. ResultView(next/dynamic 청크)가 가져간다 — 본체 번들에 싣지 않는다. */

import Link from "next/link";
import type { ReactNode } from "react";
import type { Verdict } from "@/lib/ai/verdict";
import type { ComplexTradeSeries } from "@/lib/ai/result-series";
import { SCENARIO_RULE, scenarioAssumptionLine, signedPct, type PriceScenario, type ScenarioKey } from "@/lib/ai/price-scenarios";
import type { ScenarioBreakEven } from "@/lib/ai/scenario-breakeven";
import { radarAxisFollowUp } from "@/lib/ai/next-action-routing";
import { formatKrwWon } from "@/lib/format/krw";
import { pctChange } from "@/lib/format/delta";
import { ScoreRadar } from "@/app/components/viz/ScoreRadar";
import { ScenarioFanChart } from "@/app/components/viz/ScenarioFanChart";
import { Sparkline } from "@/app/analysis/Sparkline";
import { Won } from "@/app/components/num/Won";
import { Explain } from "@/app/components/explain/Explain";
import { ymLabel } from "./VerdictCard";
import type { Insight, PickedLite, Similar } from "./workbench-types";

const BAND_TEXT: Record<string, string> = { strong: "좋음", mixed: "보통", weak: "주의", thin: "자료 부족" };

export function SigCard({ children, label, className = "" }: { children: ReactNode; label: string; className?: string }) {
  return (
    <section className={`card cxw-sig rounded-2xl p-4 md:p-5 ${className}`} aria-label={label}>
      {children}
    </section>
  );
}

/* ── [1022] 한 줄 요약 세 토막 — 결론(headline) · 이유(bandReason) · 기준 시점. 세 카드가 같은 자리·같은 글자 ─────── */

export function SummaryLine({ verdict, asOf, fallback }: { verdict: Verdict | null; asOf: string | null; fallback: string }) {
  const headline = verdict?.headline ?? fallback;
  return (
    <p className="cxw-sum" data-testid="cxw-summary">
      <span className="cxw-sum-h t-body font-bold text-ink break-words" style={{ textWrap: "balance" }}>
        {headline}
      </span>
      {verdict?.bandReason && <span className="cxw-sum-r t-sub text-text-2 break-words">{verdict.bandReason}</span>}
      {asOf && <span className="cxw-sum-t t-caption tabular-nums text-text-3">기준 {asOf}</span>}
    </p>
  );
}

/* ── 종합 진단 — 레이더(크게) + 큰 점수 + 결론 알약 + 축별 점수 행 ───────────────────────── */

function scoreTone(score: number): string {
  return score >= 70 ? "text-success" : score < 50 ? "text-warning" : "text-ink";
}

export function DiagnosisSignature({
  verdict,
  radar,
  metricAside,
  asOf,
  complexId,
  historyLine,
}: {
  verdict: Verdict | null;
  radar: Insight["radar"];
  metricAside?: ReactNode;
  /** [1022] 기준 시점 라벨(ymLabel 결과) — 한 줄 요약의 세 번째 토막 */
  asOf?: string | null;
  /** [1022] 축별 "이어서 볼 도구" 딥링크의 단지 */
  complexId?: string | null;
  /** [1022] "지난번 N점(날짜) → 지금 M점" — history-store 에 이전 실행이 있을 때만 */
  historyLine?: string | null;
}) {
  const m = verdict?.metric ?? null;
  return (
    <SigCard label="5가지 항목 점수">
      <SummaryLine verdict={verdict} asOf={asOf ?? null} fallback="점수를 낼 자료가 아직 부족해요." />
      <div className="mt-3 grid grid-cols-1 items-center gap-4 md:grid-cols-[minmax(0,340px)_minmax(0,1fr)]">
        <div className="cxw-radar">{radar.length >= 3 ? <ScoreRadar items={radar} /> : null}</div>
        <div className="flex min-w-0 flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2.5">
            {m ? (
              <span className="flex items-baseline gap-0.5">
                <b className="cxw-score font-bold tabular-nums text-ink">{m.value}</b>
                <span className="t-body font-bold text-text-3">{m.unit ?? ""}</span>
                {metricAside}
              </span>
            ) : null}
            {verdict && (
              <span className="verdict-band inline-flex items-center rounded-full px-2.5 py-0.5 t-sub font-bold" data-band={verdict.band}>
                {BAND_TEXT[verdict.band] ?? verdict.bandLabel}
              </span>
            )}
          </div>
          {historyLine && <p className="t-caption tabular-nums text-text-3">{historyLine}</p>}
          {radar.length > 0 && (
            <ul className="mt-1 flex flex-col divide-y divide-line" data-tone="plain" aria-label="항목별 점수">
              {radar.map((a) => {
                const next = radarAxisFollowUp(a.key, a.score, complexId ?? null);
                return (
                  <li key={a.key} className="flex items-baseline justify-between gap-3 py-2">
                    <span className="min-w-0 t-sub text-text-2 break-words">
                      <b className="font-bold text-ink">{a.label}</b> {a.basis}
                      {next && (
                        <>
                          {" "}
                          <Link href={next.href} className="inline-flex min-h-[24px] items-center whitespace-nowrap t-caption font-bold text-primary no-underline">
                            {next.label} ›
                          </Link>
                        </>
                      )}
                    </span>
                    <b className={`shrink-0 t-body font-bold tabular-nums ${a.score != null ? scoreTone(a.score) : "text-text-3"}`}>
                      {a.score != null ? a.score : "—"}
                    </b>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </SigCard>
  );
}

/* ── 시세 예측 — 부채꼴 + N년 뒤 기본값 + 지금 대비 % + 기간 칩 · 해마다 표 · 가정 ───────────── */

const HORIZON_CHIPS: { months: string; years: number; label: string }[] = [
  { months: "12", years: 1, label: "1년" },
  { months: "36", years: 3, label: "3년" },
  { months: "60", years: 5, label: "5년" },
];

const FAN_KEYS: readonly ScenarioKey[] = ["opt", "base", "pess"];
const FAN_WORD: Record<ScenarioKey, string> = { opt: "낙관", base: "기본", pess: "비관" };
const FAN_DOT: Record<ScenarioKey, string> = { opt: "bg-success", base: "bg-primary", pess: "bg-warning" };

export function PredictionSignature({
  verdict,
  scenario,
  onHorizon,
  asOf,
  focus = null,
  onFocus,
  breakEven = null,
}: {
  verdict: Verdict | null;
  scenario: PriceScenario | null;
  /** 기간 칩 — TuningForm 의 horizonMonths(기존 입력)를 바꾸고 다시 계산한다. 없으면 칩을 그리지 않는다 */
  onHorizon?: ((months: string) => void) | null;
  /** [1022] 기준 시점 라벨 */
  asOf?: string | null;
  /** [1022] 강조한 시나리오(범례·선을 누른 것) — 해마다 표와 같은 상태 */
  focus?: ScenarioKey | null;
  onFocus?: ((k: ScenarioKey | null) => void) | null;
  /** [1022] 비용 포함 손익분기(lib/ai/scenario-breakeven) — 내 조건에 대출 비율·금리가 있을 때만 */
  breakEven?: ScenarioBreakEven | null;
}) {
  if (!scenario) {
    return (
      <SigCard label="시나리오">
        <SummaryLine verdict={verdict} asOf={asOf ?? null} fallback="시나리오를 그릴 자료가 없어요." />
      </SigCard>
    );
  }
  const last = scenario.path[scenario.path.length - 1];
  const vs = pctChange(last.base, scenario.startKrw);
  const short = (n: number) => formatKrwWon(n, { style: "short" });
  return (
    <SigCard label={`앞으로 ${scenario.years}년, 세 가지 시나리오`}>
      <SummaryLine verdict={verdict} asOf={asOf ?? null} fallback="시나리오를 그릴 자료가 없어요." />
      <div className="mt-3 flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <span className="t-caption text-text-3">기본 시나리오 · {scenario.years}년 뒤 · 가정 계산</span>
          <div className="flex flex-wrap items-center gap-2">
            <Won manwon={last.base / 10_000} unit="만" className="t-display text-ink" />
            {vs != null && (
              <span className="rounded-full bg-primary-soft px-2.5 py-0.5 t-sub font-bold tabular-nums text-primary">지금 대비 {signedPct(vs, 1)}</span>
            )}
            <span className="t-sub tabular-nums text-text-2">연평균 {signedPct(scenario.annual.base)}</span>
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="시나리오 강조">
          {FAN_KEYS.map((k) => {
            const on = focus === k;
            return (
              <button
                key={k}
                type="button"
                onClick={() => onFocus?.(on ? null : k)}
                aria-pressed={on}
                disabled={!onFocus}
                className={`chip press inline-flex min-h-[40px] items-center gap-1.5 border px-2.5 t-caption tabular-nums ${
                  on ? "border-primary bg-primary-soft text-primary" : "border-line bg-surface text-text-2"
                }`}
              >
                <i className={`h-2.5 w-2.5 rounded-sm ${FAN_DOT[k]}`} aria-hidden="true" />
                {FAN_WORD[k]} 연 {signedPct(scenario.annual[k])}
              </button>
            );
          })}
        </div>
      </div>
      <div className="mt-2">
        <ScenarioFanChart
          startKrw={scenario.startKrw}
          path={scenario.path}
          focus={focus}
          onFocus={onFocus ?? null}
          breakEven={breakEven ? { krw: breakEven.krw, label: `손익분기 ${short(breakEven.krw)}` } : null}
        />
      </div>
      {breakEven && (
        <p className="mt-1 t-caption tabular-nums text-text-3 break-words">
          비용 포함 손익분기 <b className="font-bold text-text-2">{short(breakEven.krw)}</b> = 출발 {short(scenario.startKrw)} + {breakEven.years}년 이자{" "}
          {short(breakEven.interestKrw)}(대출 {breakEven.loan.ltvPct}% · 금리 {breakEven.loan.ratePct}% · {breakEven.loan.termYears}년 원리금균등) ·{" "}
          {last.base >= breakEven.krw ? "기본 시나리오가 넘는다" : "기본 시나리오가 못 미친다"} · 세금·중개보수 제외
        </p>
      )}
      {onHorizon && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5" role="group" aria-label="내다볼 기간">
          {HORIZON_CHIPS.map((c) => {
            const on = c.years === scenario.years;
            return (
              <button
                key={c.months}
                type="button"
                onClick={() => onHorizon(c.months)}
                aria-pressed={on}
                className={`chip press min-h-[40px] border px-3 t-sub font-bold ${on ? "border-primary bg-primary-soft text-primary" : "border-line bg-surface text-text-1"}`}
              >
                {c.label}
              </button>
            );
          })}
        </div>
      )}
    </SigCard>
  );
}

export function ScenarioTables({ scenario, startLabel, focus = null }: { scenario: PriceScenario; startLabel: string | null; focus?: ScenarioKey | null }) {
  const fmt = (n: number) => formatKrwWon(n, { style: "short" });
  const anchor =
    scenario.anchorKind === "yoy"
      ? `지역 매매지수 지난 1년 ${signedPct(scenario.anchorPct)}의 절반`
      : `지역 매매지수 최근 한 달 변화×12 ${signedPct(scenario.anchorPct)}의 절반`;
  /* [1022] 강조한 시나리오의 열만 진하게 — 나머지 열은 흐리게(값은 그대로) */
  const col = (k: ScenarioKey) => (focus ? (focus === k ? "bg-primary-soft" : "opacity-40") : "");
  const TONE: Record<ScenarioKey, string> = { opt: "text-success", base: "text-primary", pess: "text-warning" };
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
      <section className="card rounded-2xl p-4" aria-label="해마다">
        <h3 className="t-body font-bold text-ink">해마다</h3>
        <table className="mt-2 w-full border-collapse t-sub">
          <thead>
            <tr className="t-caption text-text-3">
              <th scope="col" className="py-1 text-left font-medium">시점</th>
              {FAN_KEYS.map((k) => (
                <th key={k} scope="col" className={`py-1 px-1 text-right font-medium ${col(k)}`}>
                  {FAN_WORD[k]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {scenario.path.slice(1).map((p) => (
              <tr key={p.year} className="border-t border-line">
                <th scope="row" className="py-1.5 text-left font-bold text-ink">{p.year}년 뒤</th>
                {FAN_KEYS.map((k) => (
                  <td key={k} className={`py-1.5 px-1 text-right font-bold tabular-nums ${TONE[k]} ${col(k)}`}>
                    {fmt(p[k])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <section className="card rounded-2xl p-4" aria-label="가정">
        <h3 className="flex items-center gap-0.5 t-body font-bold text-ink">
          가정
          <Explain title="시나리오 가정" how={scenarioAssumptionLine(scenario)} source="공개 규칙 · 가정 계산" size={12} />
        </h3>
        <ul className="mt-2 flex flex-col divide-y divide-line" data-tone="plain">
          <li className="flex items-baseline justify-between gap-3 py-1.5 t-sub">
            <span className="text-text-1">출발점</span>
            <span className="text-right text-text-3 break-words">
              {scenario.startKind === "input" ? "내가 넣은 기준 가격" : `최근 실거래 평균${startLabel ? `(${startLabel})` : ""}`} {fmt(scenario.startKrw)}
              {scenario.startYm ? ` · ${ymLabel(scenario.startYm)}` : ""}
            </span>
          </li>
          <li className="flex items-baseline justify-between gap-3 py-1.5 t-sub">
            <span className="text-text-1">기본 속도</span>
            <span className="text-right text-text-3 break-words">{anchor} · 연 ±{SCENARIO_RULE.baseCapPct}% 이내</span>
          </li>
          <li className="flex items-baseline justify-between gap-3 py-1.5 t-sub">
            <span className="text-text-1">낙관 / 비관</span>
            <span className="text-right text-text-3">기본 ±{SCENARIO_RULE.spreadPct}%p</span>
          </li>
        </ul>
        <p className="mt-2 t-caption text-text-3">예측이 아니라 가정 계산</p>
      </section>
    </div>
  );
}

/* ── 임장 동선 — 순서 목록(번호 원 · 이름 · 있는 사실). 좌표가 없어 지도 카드는 그리지 않는다 ────── */

export function InspectionSignature({
  picked,
  similar,
  recent6,
  onPick,
}: {
  picked: PickedLite;
  similar: Similar[];
  /** 이 단지 최근 6개월 거래(result-series) — 없으면 줄을 비운다 */
  recent6: ComplexTradeSeries["recent6"] | null;
  onPick: (s: Similar) => void;
}) {
  const total = similar.length + 1;
  return (
    <SigCard label="하루 임장 순서">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <div>
          <span className="t-caption text-text-3">오늘 코스</span>
          <div className="t-section font-bold text-ink">{total}곳 · 같은 지역 · 최근 6개월 거래 많은 순</div>
        </div>
        <Link href={`/map?complexId=${encodeURIComponent(picked.id)}`} className="inline-flex min-h-[24px] items-center t-sub font-bold text-primary no-underline">
          지도에서 위치 보기 ›
        </Link>
      </div>
      <ol className="mt-3 flex flex-col divide-y divide-line" data-tone="plain">
        <li className="flex items-center gap-3 py-2.5">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-red t-sub font-bold text-white">1</span>
          <span className="flex min-w-0 flex-1 flex-col">
            <b className="break-words t-body font-bold text-ink">{picked.name}</b>
            <span className="t-caption text-text-3">
              출발{recent6 ? ` · 최근 6개월 ${recent6.count.toLocaleString("ko-KR")}건` : ""}
            </span>
          </span>
        </li>
        {similar.map((s, i) => (
          <li key={s.id} className="flex items-center gap-3 py-2.5">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-navy t-sub font-bold text-on-dark">{i + 2}</span>
            <span className="flex min-w-0 flex-1 flex-col">
              <b className="break-words t-body font-bold text-ink">{s.name}</b>
              <span className="t-caption tabular-nums text-text-3">최근 6개월 {s.txCount.toLocaleString("ko-KR")}건</span>
            </span>
            <button type="button" onClick={() => onPick(s)} className="btn-outline btn-md shrink-0 px-3 t-sub">
              이 단지 보기
            </button>
          </li>
        ))}
      </ol>
      {similar.length === 0 && <p className="mt-2 t-sub text-text-2">같은 지역에 함께 볼 거래 많은 단지가 아직 없어요.</p>}
    </SigCard>
  );
}

/* ── 매수 타이밍 — 종합 결론(점 3개 + headline + 알약) + 신호등 3개 카드 ────────────────────── */

type SignalState = Insight["signals"][number]["state"];
const SIG_WORD: Record<SignalState, string> = { green: "좋음", yellow: "보통", red: "주의", na: "자료 없음" };
const SIG_DOT: Record<SignalState, string> = { green: "bg-success", yellow: "bg-primary", red: "bg-warning", na: "bg-line" };
const SIG_PILL: Record<SignalState, string> = {
  green: "bg-success-soft text-success",
  yellow: "bg-primary-soft text-primary",
  red: "bg-warning-soft text-warning",
  na: "bg-bg text-text-3",
};
const SIG_TOP: Record<SignalState, string> = { green: "border-t-success", yellow: "border-t-primary", red: "border-t-warning", na: "border-t-line" };
const SIG_TEXT: Record<SignalState, string> = { green: "text-success", yellow: "text-primary", red: "text-warning", na: "text-text-3" };

/** [1022] 흐름선 창 — 12개월이 있으면 최근 12개월, 모자라면 있는 달 전부 */
export const SIGNAL_FLOW_MONTHS = 12;

/**
 * 신호마다 흐름선 재료 — 시계열이 있을 때만(result-series). 값이 2개 미만이면 그리지 않는다(Sparkline 규칙).
 * [1022] 달(ym)을 같이 돌려 마지막 값·기간 라벨을 적는다. 가격은 거래 없는 달(null)을 건너뛴다(빈 달을 지어내지 않는다).
 */
export function signalFlow(key: string, series: ComplexTradeSeries | null): { values: number[]; fromYm: string; toYm: string; lastLabel: string } | null {
  if (!series || series.months.length === 0) return null;
  const months = series.months.slice(-SIGNAL_FLOW_MONTHS);
  if (key === "price") {
    const pts = months.filter((m) => m.avgMan != null);
    if (pts.length < 2) return null;
    const last = pts[pts.length - 1];
    return { values: pts.map((m) => m.avgMan as number), fromYm: pts[0].ym, toYm: last.ym, lastLabel: formatKrwWon((last.avgMan as number) * 10_000, { style: "short" }) };
  }
  if (key === "volume") {
    if (months.length < 2) return null;
    const last = months[months.length - 1];
    return { values: months.map((m) => m.nAll), fromYm: months[0].ym, toYm: last.ym, lastLabel: `${last.nAll.toLocaleString("ko-KR")}건` };
  }
  return null;
}

export function TimingSignature({
  verdict,
  signals,
  series,
  asOf,
  historyLine,
}: {
  verdict: Verdict | null;
  signals: Insight["signals"];
  series: ComplexTradeSeries | null;
  /** [1022] 기준 시점 라벨 */
  asOf?: string | null;
  /** [1022] "지난번 좋음 2 : 주의 1(날짜)" — 같은 지역 이전 실행이 있을 때만 */
  historyLine?: string | null;
}) {
  return (
    <div className="flex flex-col gap-3">
      <SigCard label="종합 결론">
        <div className="flex flex-wrap items-start gap-x-4 gap-y-2">
          <span className="flex shrink-0 gap-1.5 pt-1" aria-hidden="true">
            {signals.map((s) => (
              <i key={s.key} className={`block h-5 w-5 rounded-full ${SIG_DOT[s.state]}`} />
            ))}
          </span>
          <div className="min-w-0 flex-1">
            <SummaryLine verdict={verdict} asOf={asOf ?? null} fallback="타이밍을 볼 자료가 아직 부족해요." />
            {historyLine && <p className="mt-1 t-caption tabular-nums text-text-3">{historyLine}</p>}
          </div>
          {verdict && (
            <span className="verdict-band inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 t-sub font-bold" data-band={verdict.band}>
              {BAND_TEXT[verdict.band] ?? verdict.bandLabel}
            </span>
          )}
        </div>
      </SigCard>
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-3" aria-label="신호등 3개">
        {signals.map((s) => {
          const flow = signalFlow(s.key, series);
          return (
            <li key={s.key} className={`card flex flex-col gap-2 rounded-2xl border-t-4 p-4 ${SIG_TOP[s.state]}`}>
              <div className="flex items-center justify-between gap-2">
                <b className="t-body font-bold text-ink">{s.label}</b>
                <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 t-caption font-bold ${SIG_PILL[s.state]}`}>
                  <i className={`h-1.5 w-1.5 rounded-full ${s.state === "na" ? "bg-text-3" : "bg-current"}`} aria-hidden="true" />
                  {SIG_WORD[s.state]}
                </span>
              </div>
              {flow && flow.values.length >= 2 && (
                <div className="cxw-flow">
                  <div className={`cxw-flow-line ${SIG_TEXT[s.state]}`}>
                    <Sparkline values={flow.values} width={320} height={56} className="h-14 w-full" />
                    <b className="cxw-flow-last t-caption font-bold tabular-nums">{flow.lastLabel}</b>
                  </div>
                  <span className="t-caption tabular-nums text-text-3">
                    {ymLabel(flow.fromYm)}~{ymLabel(flow.toYm)} · {flow.values.length}개월
                  </span>
                </div>
              )}
              <span className="t-caption text-text-2 break-words">{s.basis}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
